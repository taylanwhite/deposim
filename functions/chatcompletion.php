<?php
declare(strict_types=1);

/**
 * DepoSim – Chat completion for deposition conversation rating
 *
 * Takes ElevenLabs post_call data (transcript), sends it to OpenAI with the
 * deposition rater prompt, and returns win_ready (0–100) plus full analysis.
 * Uses OPENAI_API_KEY from .env (project root).
 */

/**
 * Load .env from project root into environment.
 * Lines: KEY=value (strip quotes), # comments and empty lines skipped.
 */
function chatcompletion_load_env(): void {
    $envPath = dirname(__DIR__) . '/.env';
    if (!is_file($envPath) || !is_readable($envPath)) {
        return;
    }
    $lines = @file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if ($lines === false) {
        return;
    }
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || strpos($line, '#') === 0) {
            continue;
        }
        $eq = strpos($line, '=');
        if ($eq === false) {
            continue;
        }
        $key = trim(substr($line, 0, $eq));
        $value = trim(substr($line, $eq + 1));
        if ($key === '') {
            continue;
        }
        if ((str_starts_with($value, '"') && str_ends_with($value, '"'))
            || (str_starts_with($value, "'") && str_ends_with($value, "'"))) {
            $value = substr($value, 1, -1);
        }
        $_ENV[$key] = $value;
        putenv($key . '=' . $value);
    }
}

/**
 * Extract conversation text from ElevenLabs transcript array.
 * Each turn: role (agent/user) and message or original_message.
 *
 * @param array<int, mixed> $transcript
 * @return string Q/A formatted transcript
 */
function chatcompletion_transcript_to_text(array $transcript): string {
    $out = [];
    foreach ($transcript as $t) {
        if (!is_array($t)) {
            continue;
        }
        $role = isset($t['role']) ? trim((string)$t['role']) : 'unknown';
        $msg = $t['message'] ?? $t['original_message'] ?? '';
        $msg = is_string($msg) ? trim($msg) : '';
        if ($msg === '') {
            continue;
        }
        $label = strtolower($role) === 'agent' ? 'Q' : 'A';
        $out[] = $label . ': ' . $msg;
    }
    return implode("\n\n", $out);
}

/**
 * Build the deposition rater prompt (instructions + transcript).
 */
function chatcompletion_build_messages(string $conversationText): array {
    $systemPrompt = <<<'PROMPT'
You are a deposition conversation rater.
I will paste a deposition transcript or practice convo (Q/A). Rate how safe and disciplined the answers were.
Rules:
- No legal advice. Communication coaching only.
- Be blunt. Flag anything that sounds like: volunteering, guessing/speculating, "always/never," motives/intent, legal conclusions, privilege/work-product.
Output:
1) Overall win_ready score (0–100)
2) Top 5 risky moments: quote the exact Q/A, label the risk, and give a safer rewrite.
3) 3 patterns to fix (e.g., rambling, adopting framing, guessing).
4) 3 "rules" to follow next time (short).
5) Give me 5 drill questions based on the risks you saw. After each of my answers: grade SAFE/RISKY/BAD + rewrite.
Then ask: "What are your 3 danger topics for the next depo?"

You MUST start your response with a JSON block on its own line, exactly in this form (no other text before it):
{"win_ready": <number 0-100>, "win_ready_reason": "<short explanation why the score is what it is>"}
After that JSON line, provide the full analysis (risky moments, patterns, rules, drill questions, and the closing question).
PROMPT;

    $userContent = "Rate this deposition practice conversation (Q = questioner/attorney, A = deponent/witness):\n\n" . $conversationText;

    return [
        ['role' => 'system', 'content' => $systemPrompt],
        ['role' => 'user', 'content' => $userContent],
    ];
}

/**
 * Call OpenAI Chat Completions API.
 *
 * @return array{success: bool, win_ready?: int, win_ready_reason?: string, full_analysis?: string, raw?: string, error?: string}
 */
function chatcompletion_call_openai(array $messages, string $apiKey): array {
    $url = 'https://api.openai.com/v1/chat/completions';
    $body = [
        'model' => 'gpt-4o',
        'messages' => $messages,
        'temperature' => 0.3,
        'max_tokens' => 4096,
    ];

    $ctx = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' =>
                "Content-Type: application/json\r\n" .
                "Authorization: Bearer " . $apiKey . "\r\n",
            'content' => json_encode($body, JSON_UNESCAPED_UNICODE),
            'ignore_errors' => true,
            'timeout' => 60,
        ],
    ]);

    $raw = @file_get_contents($url, false, $ctx);
    if ($raw === false) {
        return ['success' => false, 'error' => 'OpenAI request failed (network or timeout).'];
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return ['success' => false, 'error' => 'Invalid JSON from OpenAI.', 'raw' => $raw];
    }

    $err = $decoded['error'] ?? null;
    if (is_array($err)) {
        $msg = $err['message'] ?? json_encode($err);
        return ['success' => false, 'error' => 'OpenAI API error: ' . $msg];
    }

    $choices = $decoded['choices'] ?? [];
    $first = $choices[0] ?? null;
    if (!is_array($first)) {
        return ['success' => false, 'error' => 'No choices in OpenAI response.', 'raw' => $raw];
    }

    $message = $first['message'] ?? [];
    $content = is_array($message) ? ($message['content'] ?? '') : '';
    if (!is_string($content) || $content === '') {
        return ['success' => false, 'error' => 'Empty content in OpenAI response.', 'raw' => $raw];
    }

    $winReady = null;
    $winReadyReason = '';
    $fullAnalysis = $content;

    $lines = preg_split('/\r\n|\r|\n/', $content);
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] !== '{') {
            continue;
        }
        $parsed = json_decode($line, true);
        if (is_array($parsed) && isset($parsed['win_ready'])) {
            $winReady = max(0, min(100, (int) $parsed['win_ready']));
            if (isset($parsed['win_ready_reason']) && is_string($parsed['win_ready_reason'])) {
                $winReadyReason = $parsed['win_ready_reason'];
            }
            break;
        }
    }
    if ($winReady === null && preg_match('/"win_ready"\s*:\s*(\d+)/', $content, $m)) {
        $winReady = max(0, min(100, (int) $m[1]));
    }
    if ($winReadyReason === '' && preg_match('/"win_ready_reason"\s*:\s*"((?:[^"\\\\]|\\\\.)*)"/', $content, $m)) {
        $winReadyReason = stripcslashes($m[1]);
    }

    return [
        'success' => true,
        'win_ready' => $winReady ?? 0,
        'win_ready_reason' => $winReadyReason,
        'full_analysis' => $fullAnalysis,
        'raw' => $content,
    ];
}

/**
 * Analyze one ElevenLabs post_call record and return win_ready + analysis.
 *
 * @param array $elevenlabsCall One entry from elevenlabs.post_call (must have 'transcript' key)
 * @return array{success: bool, win_ready?: int, win_ready_reason?: string, full_analysis?: string, raw?: string, error?: string}
 */
function deposition_win_ready_analysis(array $elevenlabsCall): array {
    chatcompletion_load_env();
    $apiKey = $_ENV['OPENAI_API_KEY'] ?? getenv('OPENAI_API_KEY') ?: '';
    $apiKey = trim((string) $apiKey);
    if ($apiKey === '') {
        return ['success' => false, 'error' => 'OPENAI_API_KEY not set. Add it to .env in the project root.'];
    }

    $transcript = $elevenlabsCall['transcript'] ?? null;
    if (!is_array($transcript)) {
        return ['success' => false, 'error' => 'Missing or invalid transcript in ElevenLabs call data.'];
    }

    $conversationText = chatcompletion_transcript_to_text($transcript);
    if ($conversationText === '') {
        return [
            'success' => false,
            'error' => 'Transcript is empty or has no readable Q/A turns. Cannot rate.',
        ];
    }

    $messages = chatcompletion_build_messages($conversationText);
    return chatcompletion_call_openai($messages, $apiKey);
}
