<?php
declare(strict_types=1);

/**
 * DepoSim – Case Manager (case.php)
 *
 * Features:
 * - Production-style UI: case list table + “New Case” modal
 * - Creates new case JSON files in ./cases/case_<uuid>.json
 * - Click a row to open a Case Details dialog
 * - Details dialog shows ElevenLabs post_call history (conversation list)
 * - Safe output escaping + basic CSRF protection
 *
 * Requirements:
 * - ./cases directory must be writable by the web user
 */

date_default_timezone_set('America/Denver');
session_start();

$baseDir  = __DIR__;
$casesDir = $baseDir . '/cases';

if (!is_dir($casesDir)) {
    @mkdir($casesDir, 0775, true);
}

function h(string $v): string {
    return htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function uuid_v4(): string {
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function is_uuid(string $s): bool {
    return (bool)preg_match(
        '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
        $s
    );
}

function read_case_file(string $file): ?array {
    $raw = @file_get_contents($file);
    if ($raw === false) return null;
    $d = json_decode($raw, true);
    return is_array($d) ? $d : null;
}

function safe_str(mixed $v): string {
    return is_string($v) ? $v : '';
}

function safe_arr(mixed $v): array {
    return is_array($v) ? $v : [];
}

function fmt_date(?string $iso): string {
    if (!$iso) return '';
    $ts = strtotime($iso);
    return $ts ? date('Y-m-d H:i', $ts) : $iso;
}

function csrf_token(): string {
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }
    return $_SESSION['csrf'];
}

function require_csrf(): void {
    $posted = $_POST['csrf'] ?? '';
    $sess   = $_SESSION['csrf'] ?? '';
    if (!$posted || !$sess || !hash_equals($sess, (string)$posted)) {
        http_response_code(403);
        echo "Forbidden (CSRF)";
        exit;
    }
}

// ---------- Handle create case (POST) ----------
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    require_csrf();

    $first_name  = trim((string)($_POST['first_name'] ?? ''));
    $last_name   = trim((string)($_POST['last_name'] ?? ''));
    $phone       = trim((string)($_POST['phone'] ?? ''));
    $case_number = trim((string)($_POST['case_number'] ?? ''));
    $description = trim((string)($_POST['description'] ?? ''));

    // Basic validation
    $errors = [];
    if ($first_name === '')  $errors[] = 'First name is required.';
    if ($last_name === '')   $errors[] = 'Last name is required.';
    if ($phone === '')       $errors[] = 'Phone number is required.';
    if ($case_number === '') $errors[] = 'Case number is required.';
    if ($description === '') $errors[] = 'Case description is required.';

    if ($errors) {
        // Render same page with error banner (no redirect)
        $create_error = implode(' ', $errors);
    } else {
        $phone_normalized = preg_replace('/(?!^\+)[^\d]/', '', $phone);

        $case_id = uuid_v4();
        $payload = [
            'case_id' => $case_id,
            'case_number' => $case_number,
            'person' => [
                'first_name' => $first_name,
                'last_name' => $last_name,
                'phone' => $phone,
                'phone_normalized' => $phone_normalized,
            ],
            'description' => $description,
            'meta' => [
                'created_at' => date('c'),
                'updated_at' => date('c'),
                'ip' => $_SERVER['REMOTE_ADDR'] ?? null,
                'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? null,
            ],
        ];

        $json = json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            $create_error = 'Failed to encode JSON.';
        } else {
            $file = $casesDir . '/case_' . $case_id . '.json';
            $tmp  = $file . '.tmp';

            if (@file_put_contents($tmp, $json . PHP_EOL, LOCK_EX) === false || !@rename($tmp, $file)) {
                @unlink($tmp);
                $create_error = 'Unable to write case file. Check permissions on ./cases.';
            } else {
                header('Location: case.php?created=' . urlencode($case_id));
                exit;
            }
        }
    }
}

// ---------- Load all cases ----------
$caseFiles = glob($casesDir . '/case_*.json') ?: [];
$cases = [];

foreach ($caseFiles as $file) {
    $c = read_case_file($file);
    if (!$c) continue;

    $cid  = safe_str($c['case_id'] ?? '');
    $cnum = safe_str($c['case_number'] ?? '');
    $p    = safe_arr($c['person'] ?? []);
    $meta = safe_arr($c['meta'] ?? []);
    $created_at = safe_str($meta['created_at'] ?? '');
    $updated_at = safe_str($meta['updated_at'] ?? '');

    $cases[] = [
        'case_id' => $cid,
        'case_number' => $cnum,
        'first_name' => safe_str($p['first_name'] ?? ''),
        'last_name' => safe_str($p['last_name'] ?? ''),
        'phone' => safe_str($p['phone'] ?? ''),
        'description' => safe_str($c['description'] ?? ''),
        'created_at' => $created_at,
        'updated_at' => $updated_at,
        'elevenlabs' => safe_arr($c['elevenlabs'] ?? []),
    ];
}

// Sort newest first by created_at (fallback to file mtime)
usort($cases, function($a, $b) use ($casesDir) {
    $ta = strtotime((string)$a['created_at']) ?: 0;
    $tb = strtotime((string)$b['created_at']) ?: 0;
    return $tb <=> $ta;
});

// Build compact payload for JS (case details)
$casesForJs = [];
foreach ($cases as $c) {
    // Keep only what we need to display
    $postCalls = safe_arr($c['elevenlabs']['post_call'] ?? []);
    // normalize minimal view + keep transcript if present
    $calls = [];
    foreach ($postCalls as $pc) {
        if (!is_array($pc)) continue;
        $meta = safe_arr($pc['metadata'] ?? []);
        $analysis = safe_arr($pc['analysis'] ?? []);
        $calls[] = [
            'received_at_unix' => $pc['received_at_unix'] ?? null,
            'event_timestamp' => $pc['event_timestamp'] ?? null,
            'conversation_id' => $pc['conversation_id'] ?? null,
            'status' => $pc['status'] ?? null,
            'call_duration_secs' => $meta['call_duration_secs'] ?? null,
            'termination_reason' => $meta['termination_reason'] ?? null,
            'transcript_summary' => $analysis['transcript_summary'] ?? null,
            'call_summary_title' => $analysis['call_summary_title'] ?? null,
            'transcript' => $pc['transcript'] ?? null,
            'analysis' => $analysis ?: null,
            'metadata' => $meta ?: null,
        ];
    }

    $casesForJs[] = [
        'case_id' => $c['case_id'],
        'case_number' => $c['case_number'],
        'first_name' => $c['first_name'],
        'last_name' => $c['last_name'],
        'phone' => $c['phone'],
        'description' => $c['description'],
        'created_at' => $c['created_at'],
        'updated_at' => $c['updated_at'],
        'calls' => $calls,
    ];
}

$createdId = (string)($_GET['created'] ?? '');
$csrf = csrf_token();
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DepoSim – Cases</title>

  <style>
    :root{
      --bg:#0b0c10;
      --card:rgba(255,255,255,.06);
      --border:rgba(255,255,255,.10);
      --text:rgba(255,255,255,.92);
      --muted:rgba(255,255,255,.72);
      --muted2:rgba(255,255,255,.55);
      --accent:#ffffff;
      --chip:rgba(255,255,255,.08);
      --danger:#ff5c5c;
      --ok:#64d2ff;
      --shadow: 0 18px 55px rgba(0,0,0,.55);
    }

    html,body{height:100%;margin:0;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;}
    *{box-sizing:border-box}

    .page{
      max-width:1200px;
      margin:0 auto;
      padding:26px 18px 40px;
    }

    .topbar{
      display:flex;
      align-items:flex-end;
      justify-content:space-between;
      gap:14px;
      margin-bottom:16px;
    }

    .brand h1{
      margin:0;
      font-size:26px;
      letter-spacing:-0.02em;
      font-weight:900;
    }
    .brand .sub{
      margin-top:6px;
      font-size:13px;
      color:var(--muted2);
      line-height:1.35;
    }

    .actions{
      display:flex;
      gap:10px;
      flex-wrap:wrap;
      justify-content:flex-end;
      align-items:center;
    }

    .btn{
      border:1px solid var(--border);
      background:rgba(255,255,255,.08);
      color:var(--text);
      padding:10px 14px;
      border-radius:999px;
      font-weight:700;
      cursor:pointer;
      user-select:none;
      transition: transform .06s ease, opacity .12s ease;
    }
    .btn:hover{opacity:.92}
    .btn:active{transform:scale(.98)}
    .btn.primary{
      background:rgba(255,255,255,.14);
      border-color:rgba(255,255,255,.18);
    }

    .card{
      background:var(--card);
      border:1px solid var(--border);
      border-radius:18px;
      box-shadow:var(--shadow);
      overflow:hidden;
    }

    .toolbar{
      display:flex;
      gap:12px;
      padding:14px 14px;
      border-bottom:1px solid var(--border);
      align-items:center;
      flex-wrap:wrap;
    }

    .search{
      flex:1;
      min-width:220px;
      display:flex;
      gap:10px;
      align-items:center;
      background:rgba(0,0,0,.25);
      border:1px solid rgba(255,255,255,.10);
      border-radius:14px;
      padding:10px 12px;
    }
    .search input{
      width:100%;
      border:none;
      outline:none;
      background:transparent;
      color:var(--text);
      font-size:14px;
    }
    .pill{
      padding:6px 10px;
      border-radius:999px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.06);
      font-size:12px;
      color:var(--muted);
      white-space:nowrap;
    }

    table{
      width:100%;
      border-collapse:collapse;
    }
    thead th{
      text-align:left;
      font-size:12px;
      letter-spacing:.06em;
      text-transform:uppercase;
      color:var(--muted2);
      padding:12px 14px;
      border-bottom:1px solid var(--border);
    }
    tbody td{
      padding:14px;
      border-bottom:1px solid rgba(255,255,255,.07);
      vertical-align:top;
      font-size:14px;
    }

    tbody tr{
      cursor:pointer;
      transition: background .12s ease;
    }
    tbody tr:hover{
      background:rgba(255,255,255,.05);
    }

    .name{
      font-weight:800;
      letter-spacing:-0.01em;
      margin-bottom:4px;
    }
    .muted{color:var(--muted2); font-size:12px; line-height:1.3}
    .desc{
      color:var(--muted);
      font-size:13px;
      line-height:1.35;
      display:-webkit-box;
      -webkit-line-clamp:2;
      -webkit-box-orient:vertical;
      overflow:hidden;
      max-width:520px;
    }

    .chip{
      display:inline-flex;
      align-items:center;
      gap:8px;
      padding:7px 10px;
      border-radius:999px;
      border:1px solid rgba(255,255,255,.10);
      background:var(--chip);
      font-size:12px;
      color:var(--muted);
      white-space:nowrap;
    }

    .toast{
      margin:10px 0 14px;
      padding:12px 14px;
      border-radius:14px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.06);
      color:var(--text);
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
    }
    .toast a{color:var(--ok); text-decoration:none; font-weight:700}

    /* Modal */
    .modal-backdrop{
      position:fixed; inset:0;
      background:rgba(0,0,0,.55);
      display:none;
      align-items:center;
      justify-content:center;
      padding:18px;
      z-index:99999;
    }
    .modal{
      width:min(980px, 100%);
      max-height:calc(100vh - 36px);
      overflow:auto;
      background:rgba(20,20,24,.96);
      border:1px solid rgba(255,255,255,.12);
      border-radius:18px;
      box-shadow: 0 26px 90px rgba(0,0,0,.7);
    }
    .modal .hd{
      padding:16px 18px;
      border-bottom:1px solid rgba(255,255,255,.10);
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:10px;
    }
    .modal .hd .title{
      font-weight:900;
      letter-spacing:-0.02em;
      font-size:16px;
      margin:0;
    }
    .iconbtn{
      border:none;
      background:transparent;
      color:var(--text);
      cursor:pointer;
      padding:8px 10px;
      border-radius:12px;
    }
    .iconbtn:hover{background:rgba(255,255,255,.06)}
    .modal .bd{ padding:16px 18px 18px; }

    .grid2{
      display:grid;
      grid-template-columns: 1.2fr .8fr;
      gap:14px;
    }
    @media (max-width: 860px){
      .grid2{grid-template-columns:1fr}
    }

    .panel{
      background:rgba(255,255,255,.05);
      border:1px solid rgba(255,255,255,.10);
      border-radius:16px;
      padding:14px;
    }
    .panel h3{
      margin:0 0 10px;
      font-size:13px;
      text-transform:uppercase;
      letter-spacing:.06em;
      color:var(--muted2);
    }
    .kv{
      display:grid;
      grid-template-columns: 140px 1fr;
      gap:8px 12px;
      font-size:13px;
      line-height:1.4;
    }
    .kv .k{color:var(--muted2)}
    .kv .v{color:var(--text); word-break:break-word}

    .call{
      padding:12px 12px;
      border-radius:14px;
      border:1px solid rgba(255,255,255,.10);
      background:rgba(0,0,0,.18);
      margin-bottom:10px;
    }
    .call .top{
      display:flex;
      justify-content:space-between;
      align-items:flex-start;
      gap:10px;
    }
    .call .title{
      font-weight:900;
      letter-spacing:-0.01em;
      font-size:14px;
      margin:0;
    }
    .call .meta{
      color:var(--muted2);
      font-size:12px;
      line-height:1.35;
      margin-top:4px;
    }
    .call .tag{
      display:inline-flex;
      padding:6px 10px;
      border-radius:999px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.06);
      font-size:12px;
      color:var(--muted);
      white-space:nowrap;
    }

    details{
      margin-top:10px;
    }
    details summary{
      cursor:pointer;
      color:var(--ok);
      font-weight:800;
      list-style:none;
    }
    details summary::-webkit-details-marker{display:none}
    .transcript{
      margin-top:10px;
      border-top:1px solid rgba(255,255,255,.08);
      padding-top:10px;
      display:flex;
      flex-direction:column;
      gap:8px;
    }
    .turn{
      padding:10px 10px;
      border-radius:14px;
      border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.04);
      font-size:13px;
      line-height:1.4;
    }
    .turn .r{
      font-weight:900;
      letter-spacing:-0.01em;
      font-size:12px;
      color:var(--muted2);
      text-transform:uppercase;
    }

    /* Form */
    .formgrid{
      display:grid;
      grid-template-columns: 1fr 1fr;
      gap:12px;
    }
    @media (max-width: 720px){
      .formgrid{grid-template-columns:1fr}
    }
    label{
      display:block;
      font-weight:800;
      font-size:12px;
      color:var(--muted2);
      text-transform:uppercase;
      letter-spacing:.06em;
      margin:0 0 7px;
    }
    input, textarea{
      width:100%;
      padding:12px 12px;
      border-radius:14px;
      border:1px solid rgba(255,255,255,.12);
      background:rgba(0,0,0,.22);
      color:var(--text);
      outline:none;
      font-size:14px;
    }
    textarea{min-height:130px; resize:vertical}
    .formactions{
      display:flex;
      justify-content:flex-end;
      gap:10px;
      margin-top:14px;
    }

    .banner{
      margin:12px 0 0;
      padding:12px 14px;
      border-radius:14px;
      border:1px solid rgba(255,92,92,.35);
      background:rgba(255,92,92,.10);
      color:rgba(255,255,255,.92);
      font-weight:700;
    }

    .empty{
      padding:24px 14px;
      color:var(--muted);
      text-align:center;
    }

    a.link{
      color:var(--ok);
      text-decoration:none;
      font-weight:800;
    }
  </style>
</head>

<body>
  <div class="page">
    <div class="topbar">
      <div class="brand">
        <h1>DepoSim</h1>
        <div class="sub">Case intake and conversation history. Click a case to view ElevenLabs post-call transcripts.</div>
      </div>

      <div class="actions">
        <button class="btn primary" id="btnNew">+ New Case</button>
      </div>
    </div>

    <?php if (!empty($create_error)): ?>
      <div class="banner"><?php echo h((string)$create_error); ?></div>
    <?php endif; ?>

    <?php if ($createdId && is_uuid($createdId)): ?>
      <div class="toast">
        <div>
          Case created: <span class="chip"><?php echo h($createdId); ?></span>
        </div>
        <div>
          <a class="link" href="index.php?case_id=<?php echo h($createdId); ?>">Open Practice</a>
        </div>
      </div>
    <?php endif; ?>

    <div class="card">
      <div class="toolbar">
        <div class="search">
          <span style="opacity:.65;">🔎</span>
          <input id="search" type="text" placeholder="Search case #, name, phone, description..." autocomplete="off" />
        </div>
        <span class="pill" id="countPill"><?php echo count($cases); ?> cases</span>
      </div>

      <?php if (count($cases) === 0): ?>
        <div class="empty">
          No cases yet. Click <strong>New Case</strong> to create your first one.
        </div>
      <?php else: ?>
        <table id="caseTable">
          <thead>
            <tr>
              <th>Case</th>
              <th>Deponent</th>
              <th>Phone</th>
              <th>Updated</th>
              <th>Calls</th>
            </tr>
          </thead>
          <tbody id="tbody">
            <?php foreach ($cases as $c):
              $calls = safe_arr($c['elevenlabs']['post_call'] ?? []);
              $callCount = count($calls);
              $updated = $c['updated_at'] ?: $c['created_at'];
              $fullName = trim($c['first_name'] . ' ' . $c['last_name']);
              $desc = $c['description'] ?: '';
            ?>
              <tr
                data-case-id="<?php echo h($c['case_id']); ?>"
                data-search="<?php echo h(strtolower(
                  ($c['case_number'] . ' ' . $fullName . ' ' . $c['phone'] . ' ' . $desc . ' ' . $c['case_id'])
                )); ?>"
              >
                <td>
                  <div class="name">Case #<?php echo h($c['case_number'] ?: '(none)'); ?></div>
                  <div class="muted"><?php echo h($c['case_id']); ?></div>
                </td>

                <td>
                  <div class="name"><?php echo h($fullName ?: '(none)'); ?></div>
                  <div class="desc"><?php echo h($desc); ?></div>
                </td>

                <td>
                  <span class="chip"><?php echo h($c['phone'] ?: '(none)'); ?></span>
                </td>

                <td>
                  <div class="muted"><?php echo h(fmt_date($updated)); ?></div>
                </td>

                <td>
                  <span class="chip"><?php echo (int)$callCount; ?> call<?php echo $callCount === 1 ? '' : 's'; ?></span>
                </td>
              </tr>
            <?php endforeach; ?>
          </tbody>
        </table>
      <?php endif; ?>
    </div>
  </div>

  <!-- New Case Modal -->
  <div class="modal-backdrop" id="newModal">
    <div class="modal" role="dialog" aria-modal="true" aria-label="New Case">
      <div class="hd">
        <div class="title">New Case</div>
        <button class="iconbtn" data-close="newModal">✕</button>
      </div>
      <div class="bd">
        <form method="post" action="case.php" id="newCaseForm">
          <input type="hidden" name="csrf" value="<?php echo h($csrf); ?>">

          <div class="formgrid">
            <div>
              <label>First Name</label>
              <input name="first_name" required>
            </div>
            <div>
              <label>Last Name</label>
              <input name="last_name" required>
            </div>
          </div>

          <div class="formgrid" style="margin-top:12px;">
            <div>
              <label>Phone Number</label>
              <input name="phone" required>
            </div>
            <div>
              <label>Case Number</label>
              <input name="case_number" required>
            </div>
          </div>

          <div style="margin-top:12px;">
            <label>Case Description</label>
            <textarea name="description" required></textarea>
          </div>

          <div class="formactions">
            <button type="button" class="btn" data-close="newModal">Cancel</button>
            <button type="submit" class="btn primary">Save Case</button>
          </div>
        </form>
      </div>
    </div>
  </div>

  <!-- Case Details Modal -->
  <div class="modal-backdrop" id="detailModal">
    <div class="modal" role="dialog" aria-modal="true" aria-label="Case Details">
      <div class="hd">
        <div class="title" id="detailTitle">Case Details</div>
        <button class="iconbtn" data-close="detailModal">✕</button>
      </div>
      <div class="bd">
        <div class="grid2">
          <div class="panel">
            <h3>Case</h3>
            <div class="kv" id="detailKv"></div>
            <div style="margin-top:12px;">
              <a class="link" id="practiceLink" href="#" target="_blank" rel="noopener">Open Practice (index.php)</a>
            </div>
          </div>

          <div class="panel">
            <h3>ElevenLabs History</h3>
            <div id="callsContainer"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

<script>
  const CASES = <?php echo json_encode($casesForJs, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?>;

  function $(id){ return document.getElementById(id); }

  function openModal(id){
    const el = $(id);
    if (!el) return;
    el.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeModal(id){
    const el = $(id);
    if (!el) return;
    el.style.display = 'none';
    document.body.style.overflow = '';
  }

  document.addEventListener('click', (e) => {
    const tgt = e.target;

    // Close buttons
    if (tgt && tgt.dataset && tgt.dataset.close) {
      closeModal(tgt.dataset.close);
      return;
    }

    // Click backdrop to close
    if (tgt.classList && tgt.classList.contains('modal-backdrop')) {
      tgt.style.display = 'none';
      document.body.style.overflow = '';
      return;
    }
  });

  // New case
  $('btnNew')?.addEventListener('click', () => openModal('newModal'));

  // Search filter
  const search = $('search');
  const tbody = $('tbody');
  const countPill = $('countPill');

  function applyFilter(){
    const q = (search?.value || '').trim().toLowerCase();
    if (!tbody) return;

    let shown = 0;
    [...tbody.querySelectorAll('tr')].forEach(tr => {
      const hay = (tr.dataset.search || '');
      const ok = q === '' || hay.includes(q);
      tr.style.display = ok ? '' : 'none';
      if (ok) shown++;
    });

    if (countPill) countPill.textContent = `${shown} case${shown === 1 ? '' : 's'}`;
  }

  search?.addEventListener('input', applyFilter);

  // Row click -> Details
  function safe(v){
    return (v === null || v === undefined || v === '') ? '(none)' : String(v);
  }

  function fmtUnix(u){
    if (!u) return '';
    const d = new Date(Number(u) * 1000);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString();
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'","&#039;");
  }

  function renderDetails(caseId){
    const c = CASES.find(x => x.case_id === caseId);
    if (!c) return;

    $('detailTitle').textContent = `Case #${safe(c.case_number)} — ${safe(c.first_name)} ${safe(c.last_name)}`;

    // KV
    const kv = $('detailKv');
    kv.innerHTML = `
      <div class="k">Case ID</div><div class="v">${escapeHtml(safe(c.case_id))}</div>
      <div class="k">Case #</div><div class="v">${escapeHtml(safe(c.case_number))}</div>
      <div class="k">Deponent</div><div class="v">${escapeHtml(`${safe(c.first_name)} ${safe(c.last_name)}`.trim())}</div>
      <div class="k">Phone</div><div class="v">${escapeHtml(safe(c.phone))}</div>
      <div class="k">Created</div><div class="v">${escapeHtml(safe(c.created_at))}</div>
      <div class="k">Updated</div><div class="v">${escapeHtml(safe(c.updated_at))}</div>
      <div class="k">Description</div><div class="v">${escapeHtml(safe(c.description))}</div>
    `;

    // practice link
    const pl = $('practiceLink');
    pl.href = `index.php?case_id=${encodeURIComponent(c.case_id)}`;

    // Calls
    const container = $('callsContainer');
    const calls = Array.isArray(c.calls) ? c.calls : [];

    if (calls.length === 0) {
      container.innerHTML = `<div class="muted">No ElevenLabs calls yet for this case.</div>`;
    } else {
      // newest first by event_timestamp/received
      calls.sort((a,b) => (Number(b.event_timestamp||0) - Number(a.event_timestamp||0)));

      container.innerHTML = calls.map((call, idx) => {
        const title = call.call_summary_title || `Call ${calls.length - idx}`;
        const summary = call.transcript_summary || '';
        const dur = call.call_duration_secs ? `${call.call_duration_secs}s` : '';
        const when = call.event_timestamp ? fmtUnix(call.event_timestamp) : (call.received_at_unix ? fmtUnix(call.received_at_unix) : '');
        const convo = call.conversation_id ? String(call.conversation_id) : '';
        const status = call.status ? String(call.status) : '';
        const term = call.termination_reason ? String(call.termination_reason) : '';

        const transcript = Array.isArray(call.transcript) ? call.transcript : [];
        const transcriptHtml = transcript.map(t => {
          const role = t && t.role ? String(t.role) : 'unknown';
          const msg = t && t.message ? String(t.message) : (t && t.original_message ? String(t.original_message) : '');
          return `
            <div class="turn">
              <div class="r">${escapeHtml(role)}</div>
              <div>${escapeHtml(msg)}</div>
            </div>
          `;
        }).join('');

        const hasTranscript = transcript.length > 0;

        return `
          <div class="call">
            <div class="top">
              <div>
                <div class="title">${escapeHtml(title)}</div>
                <div class="meta">
                  ${escapeHtml(when)} ${dur ? `• ${escapeHtml(dur)}` : ''} ${status ? `• ${escapeHtml(status)}` : ''}
                  ${term ? `<div>${escapeHtml(term)}</div>` : ''}
                  ${convo ? `<div>Conversation: <span class="muted">${escapeHtml(convo)}</span></div>` : ''}
                </div>
              </div>
              <div class="tag">${escapeHtml(hasTranscript ? 'Transcript' : 'No transcript')}</div>
            </div>

            ${summary ? `<div class="muted" style="margin-top:8px;">${escapeHtml(summary)}</div>` : ''}

            ${hasTranscript ? `
              <details>
                <summary>View transcript</summary>
                <div class="transcript">${transcriptHtml}</div>
              </details>
            ` : ''}
          </div>
        `;
      }).join('');
    }

    openModal('detailModal');
  }

  document.querySelectorAll('#caseTable tbody tr').forEach(tr => {
    tr.addEventListener('click', () => {
      const cid = tr.getAttribute('data-case-id');
      if (cid) renderDetails(cid);
    });
  });

  // Nice: on load, if create failed, reopen New Case modal so user can fix quickly
  <?php if (!empty($create_error)): ?>
    openModal('newModal');
  <?php endif; ?>
</script>
</body>
</html>
