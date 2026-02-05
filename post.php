<?php
declare(strict_types=1);

date_default_timezone_set('America/Denver');

$casesDir = '/var/www/deposim_com/demo/cases';

// Per your request:
$WEBHOOK_SECRET = 'wsec_c8a3ae7470e6b38ae2c71ec74b6cc1a48f1c8905921fada9476b1fc36629559a';

// Log files: $logDir = parent of $casesDir → /var/www/deposim_com/demo/webhook.log and webhook_errors.log
// If these stay empty: (1) request may not hit this script — check nginx/apache error_log for the 500.
// (2) Web user may not be able to write — chown/chmod $logDir and touch webhook.log; chown web_user webhook.log
$logDir       = dirname($casesDir);
$logFile      = $logDir . '/webhook.log';
$errorLogFile = $logDir . '/webhook_errors.log';

ini_set('log_errors', '1');
ini_set('error_log', $errorLogFile);

function log_line(string $path, string $msg): void {
    $line = '[' . date('c') . '] ' . $msg . "\n";
    $ok = @file_put_contents($path, $line, FILE_APPEND);
    if ($ok === false && function_exists('error_log')) {
        error_log('webhook log_line failed path=' . $path . ' msg=' . substr($msg, 0, 200));
    }
}

function log_webhook_error(string $path, Throwable $e): void {
    $msg = 'ERROR ' . $e->getMessage() . ' in ' . $e->getFile() . ':' . $e->getLine() . "\n" . $e->getTraceAsString();
    log_line($path, $msg);
}

// Catch fatal errors and log them (run at end of script or on fatal)
register_shutdown_function(function () use ($logFile, $errorLogFile) {
    $err = error_get_last();
    if ($err === null || !in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        return;
    }
    $msg = 'FATAL ' . ($err['message'] ?? '') . ' in ' . ($err['file'] ?? '') . ':' . ($err['line'] ?? '');
    log_line($logFile, $msg);
    log_line($errorLogFile, $msg);
});

// Bootstrap: prove this script ran. If webhook.log is still empty after a 500, the request isn't reaching this file.
log_line($logFile, 'post.php entered method=' . ($_SERVER['REQUEST_METHOD'] ?? '?') . ' uri=' . ($_SERVER['REQUEST_URI'] ?? '?'));

function send_json(int $code, array $body): never {
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function safe_read_json(string $raw): ?array {
    $d = json_decode($raw, true);
    return is_array($d) ? $d : null;
}

function is_uuid(string $s): bool {
    return (bool)preg_match(
        '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
        $s
    );
}

/**
 * Verify ElevenLabs HMAC signature.
 * Header format: "t=TIMESTAMP,v0=HEX_HMAC"
 * Signature commonly computed as HMAC_SHA256(secret, "t.rawBody")
 */
function verify_elevenlabs_signature(string $rawBody, string $signatureHeader, string $secret, int $maxSkewSeconds = 300): bool {
    if ($secret === '' || $signatureHeader === '') return false;

    $parts = array_map('trim', explode(',', $signatureHeader));
    $t = null;
    $v0 = null;

    foreach ($parts as $p) {
        if (str_starts_with($p, 't='))  $t  = substr($p, 2);
        if (str_starts_with($p, 'v0=')) $v0 = substr($p, 3);
    }

    if ($t === null || $v0 === null) return false;
    if (!ctype_digit($t)) return false;

    $ts = (int)$t;
    $now = time();

    // replay protection
    if (abs($now - $ts) > $maxSkewSeconds) return false;

    $signedPayload = $t . '.' . $rawBody;
    $calc = hash_hmac('sha256', $signedPayload, $secret);

    return hash_equals($calc, $v0);
}

/**
 * Pull dynamic variables from likely ElevenLabs locations.
 * Different webhook versions/events may place them differently.
 */
function extract_dynamic_variables(array $data): ?array {
    // 1) Common: data.dynamic_variables
    if (isset($data['dynamic_variables']) && is_array($data['dynamic_variables'])) {
        return $data['dynamic_variables'];
    }

    // 2) Also seen: data.conversation_initiation_client_data.dynamic_variables
    if (isset($data['conversation_initiation_client_data']['dynamic_variables'])
        && is_array($data['conversation_initiation_client_data']['dynamic_variables'])) {
        return $data['conversation_initiation_client_data']['dynamic_variables'];
    }

    // 3) Sometimes nested inside metadata-ish blocks (rare) – keep conservative
    if (isset($data['metadata']['dynamic_variables']) && is_array($data['metadata']['dynamic_variables'])) {
        return $data['metadata']['dynamic_variables'];
    }

    return null;
}

// ---------- Only allow POST ----------
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    send_json(405, ['error' => 'Method not allowed']);
}

// ---------- Read body ----------
$rawBody = file_get_contents('php://input');
if ($rawBody === false || trim($rawBody) === '') {
    log_line($logFile, '400 empty body');
    send_json(400, ['error' => 'Empty body']);
}

// ---------- Signature ----------
$signature = $_SERVER['HTTP_ELEVENLABS_SIGNATURE'] ?? '';
if ($signature === '') {
    log_line($logFile, '401 missing ElevenLabs-Signature header');
    send_json(401, ['error' => 'Missing ElevenLabs-Signature header']);
}

if (!verify_elevenlabs_signature($rawBody, $signature, $WEBHOOK_SECRET)) {
    log_line($logFile, '401 invalid signature');
    send_json(401, ['error' => 'Invalid signature']);
}

// ---------- Parse JSON ----------
$event = safe_read_json($rawBody);
if ($event === null) {
    log_line($logFile, '400 invalid JSON. body_prefix=' . substr($rawBody, 0, 180));
    send_json(400, ['error' => 'Invalid JSON']);
}

$type    = (string)($event['type'] ?? '');
$eventTs = $event['event_timestamp'] ?? null;
$data    = $event['data'] ?? null;

if (!is_array($data)) {
    log_line($logFile, '400 missing data object. type=' . $type);
    send_json(400, ['error' => 'Missing data object']);
}

// ---------- Extract dynamic vars + case_id ----------
$dyn = extract_dynamic_variables($data);

$caseId = '';
if (is_array($dyn)) {
    $caseId = (string)($dyn['case_id'] ?? '');
}

// If not found, log what keys existed (helps you debug quickly)
if ($caseId === '' || !is_uuid($caseId)) {
    $keys = implode(',', array_keys($data));
    log_line($logFile, '400 missing/invalid case_id. type=' . $type . ' data_keys=' . $keys . ' dyn_present=' . (is_array($dyn) ? 'yes' : 'no'));
    send_json(400, ['error' => 'Missing/invalid case_id']);
}

$caseFile = rtrim($casesDir, '/') . '/case_' . $caseId . '.json';
if (!is_file($caseFile)) {
    log_line($logFile, '404 case not found. case_id=' . $caseId);
    send_json(404, ['error' => 'Case not found', 'case_id' => $caseId]);
}

// ---------- Load case JSON ----------
$caseRaw = file_get_contents($caseFile);
if ($caseRaw === false) {
    log_line($logFile, '500 failed reading case file. case_id=' . $caseId);
    send_json(500, ['error' => 'Failed reading case file']);
}

$caseJson = safe_read_json($caseRaw);
if ($caseJson === null) {
    log_line($logFile, '500 invalid case JSON. case_id=' . $caseId);
    send_json(500, ['error' => 'Case JSON invalid']);
}

// Ensure structure
if (!isset($caseJson['elevenlabs']) || !is_array($caseJson['elevenlabs'])) $caseJson['elevenlabs'] = [];
if (!isset($caseJson['elevenlabs']['post_call']) || !is_array($caseJson['elevenlabs']['post_call'])) {
    $caseJson['elevenlabs']['post_call'] = [];
}

// ---------- Build record ----------
$record = [
    'received_at_unix'  => time(),
    'event_type'        => $type,
    'event_timestamp'   => $eventTs,
    'agent_id'          => $data['agent_id'] ?? null,
    'conversation_id'   => $data['conversation_id'] ?? null,
    'status'            => $data['status'] ?? null,
    'transcript'        => $data['transcript'] ?? null,
    'metadata'          => $data['metadata'] ?? null,
    'analysis'          => $data['analysis'] ?? null,
    'dynamic_variables' => $dyn,
];

try {
    // ---------- Run deposition win_ready analysis and write to /sims/ ----------
    $simsDir = __DIR__ . '/sims';
    log_line($logFile, 'webhook: case_id=' . $caseId . ' type=' . $type . ' step=start');
    if (!is_dir($simsDir)) {
        @mkdir($simsDir, 0775, true);
    }
    require_once __DIR__ . '/functions/chatcompletion.php';
    log_line($logFile, 'webhook: case_id=' . $caseId . ' step=chatcompletion_required');
    $analysisResult = deposition_win_ready_analysis($record);
    log_line($logFile, 'webhook: case_id=' . $caseId . ' step=analysis_done success=' . (!empty($analysisResult['success']) ? '1' : '0'));
    if (!empty($analysisResult['success'])) {
    $meta = is_array($record['metadata'] ?? null) ? $record['metadata'] : [];
    $analysis = is_array($record['analysis'] ?? null) ? $record['analysis'] : [];

    $simPayload = [
        'case_id' => $caseId,
        'created_at_unix' => time(),
        'conversation_id' => $record['conversation_id'] ?? null,
        'win_ready' => max(0, min(100, (int) ($analysisResult['win_ready'] ?? 0))),
        'win_ready_reason' => isset($analysisResult['win_ready_reason']) ? (string) $analysisResult['win_ready_reason'] : '',
        'call' => [
            'received_at_unix' => $record['received_at_unix'] ?? null,
            'event_timestamp' => $record['event_timestamp'] ?? null,
            'event_type' => $record['event_type'] ?? null,
            'status' => $record['status'] ?? null,
            'agent_id' => $record['agent_id'] ?? null,
            'call_duration_secs' => $meta['call_duration_secs'] ?? null,
            'termination_reason' => $meta['termination_reason'] ?? null,
            'start_time_unix_secs' => $meta['start_time_unix_secs'] ?? null,
            'main_language' => $meta['main_language'] ?? null,
            'transcript_summary' => $analysis['transcript_summary'] ?? null,
            'call_summary_title' => $analysis['call_summary_title'] ?? null,
            'call_successful' => $analysis['call_successful'] ?? null,
            'transcript' => $record['transcript'] ?? null,
        ],
    ];
    if (!empty($analysisResult['full_analysis'])) {
        $simPayload['win_ready_analysis'] = (string) $analysisResult['full_analysis'];
    }
    $simFile = $simsDir . '/' . $caseId . '_' . time() . '.json';
    $simJson = json_encode($simPayload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($simJson !== false && @file_put_contents($simFile, $simJson . "\n", LOCK_EX) !== false) {
        // sim saved
    } else {
        log_line($logFile, 'Warning: could not write sim file. case_id=' . $caseId);
    }
    }

    // ---------- Idempotency: skip if conversation_id already stored ----------
    $incomingConversationId = (string)($record['conversation_id'] ?? '');
    if ($incomingConversationId !== '') {
        foreach ($caseJson['elevenlabs']['post_call'] as $entry) {
            if (!is_array($entry)) continue;
            if ((string)($entry['conversation_id'] ?? '') === $incomingConversationId) {
                send_json(200, [
                    'ok' => true,
                    'duplicate' => true,
                    'case_id' => $caseId,
                    'conversation_id' => $incomingConversationId,
                ]);
            }
        }
    }

    // ---------- Append + save ----------
    $caseJson['elevenlabs']['post_call'][] = $record;

    if (!isset($caseJson['meta']) || !is_array($caseJson['meta'])) $caseJson['meta'] = [];
    $caseJson['meta']['updated_at'] = date('c');

    $tmp = $caseFile . '.tmp';
    $out = json_encode($caseJson, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($out === false) {
        log_line($logFile, '500 failed encoding case JSON. case_id=' . $caseId);
        send_json(500, ['error' => 'Failed to encode updated case']);
    }

    if (file_put_contents($tmp, $out . PHP_EOL, LOCK_EX) === false) {
        log_line($logFile, '500 failed writing temp file. case_id=' . $caseId);
        send_json(500, ['error' => 'Failed writing temp case']);
    }

    if (!rename($tmp, $caseFile)) {
        @unlink($tmp);
        log_line($logFile, '500 failed renaming temp file. case_id=' . $caseId);
        send_json(500, ['error' => 'Failed replacing case file']);
    }

    log_line($logFile, 'webhook: case_id=' . $caseId . ' step=done ok');
    send_json(200, [
        'ok' => true,
        'case_id' => $caseId,
        'event_type' => $type,
        'conversation_id' => $incomingConversationId,
    ]);

} catch (Throwable $e) {
    log_webhook_error($logFile, $e);
    log_webhook_error($errorLogFile, $e);
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json');
        echo json_encode(['error' => 'Internal server error'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    }
    exit(1);
}
