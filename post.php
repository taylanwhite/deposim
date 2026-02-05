<?php
declare(strict_types=1);

date_default_timezone_set('America/Denver');

$casesDir = '/var/www/visyfy_com/deposim/cases';

// Per your request:
$WEBHOOK_SECRET = 'wsec_7a13e9f6814291732bf1d466179d2ff0a973a659c6b2f25295b9943515b2394b';

// Optional log file (ensure writable by web user if you want logs)
$logFile = '/var/www/visyfy_com/deposim/webhook.log';

function log_line(string $path, string $msg): void {
    @file_put_contents($path, '[' . date('c') . '] ' . $msg . "\n", FILE_APPEND);
}

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

// ---------- Run deposition win_ready analysis and write to /sims/ ----------
$simsDir = __DIR__ . '/sims';
if (!is_dir($simsDir)) {
    @mkdir($simsDir, 0775, true);
}
require_once __DIR__ . '/functions/chatcompletion.php';
$analysisResult = deposition_win_ready_analysis($record);
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

send_json(200, [
    'ok' => true,
    'case_id' => $caseId,
    'event_type' => $type,
    'conversation_id' => $incomingConversationId,
]);
