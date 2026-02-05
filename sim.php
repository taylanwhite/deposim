<?php
declare(strict_types=1);

date_default_timezone_set('America/Denver');

$casesDir          = '/var/www/deposim_com/demo/cases';
$promptDir         = '/var/www/deposim_com/demo/prompt_learning';
$firstMessageDir   = '/var/www/deposim_com/demo/prompt_learning/first_message';
$agentId           = 'agent_5901kgjwqbjsfxh8rjeas6778fxq';

function h(string $v): string {
    return htmlspecialchars($v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
function is_uuid(string $s): bool {
    return (bool)preg_match(
        '/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i',
        $s
    );
}
function page_error(string $title, string $msg, int $code = 400): never {
    http_response_code($code);
    echo "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>DepoSim</title></head>";
    echo "<body style='margin:0;background:#0b0c10;color:#fff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;display:grid;place-items:center;min-height:100vh;padding:24px;box-sizing:border-box;'>";
    echo "<div style='max-width:720px;width:100%;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.10);border-radius:16px;padding:22px;'>";
    echo "<h1 style='margin:0 0 10px;font-size:22px;'>" . h($title) . "</h1>";
    echo "<p style='margin:0;opacity:.85;line-height:1.5;white-space:pre-wrap;'>" . h($msg) . "</p>";
    echo "</div></body></html>";
    exit;
}

/**
 * Return contents of newest .txt in $dir, based on filemtime (last modified).
 * If none found, returns "".
 */
function latest_prompt_text(string $dir): string {
    $dir = rtrim($dir, '/');

    if (!is_dir($dir) || !is_readable($dir)) {
        return '';
    }

    // Avoid stale filesystem metadata after renames/edits
    clearstatcache(true, $dir);

    $latestPath = null;
    $latestTime = -1;

    try {
        foreach (new DirectoryIterator($dir) as $fileInfo) {
            if ($fileInfo->isDot() || !$fileInfo->isFile()) continue;

            $path = $fileInfo->getPathname();
            $ext  = strtolower((string)$fileInfo->getExtension());

            // Only .txt (case-insensitive)
            if ($ext !== 'txt') continue;

            // Must be readable by the PHP/web user
            if (!is_readable($path)) continue;

            $mtime = $fileInfo->getMTime();
            if ($mtime > $latestTime) {
                $latestTime = $mtime;
                $latestPath = $path;
            }
        }
    } catch (Throwable $e) {
        return '';
    }

    if ($latestPath === null) return '';

    $contents = @file_get_contents($latestPath);
    if ($contents === false) return '';

    return trim($contents);
}

// -------------------- load case --------------------

$caseId = trim((string)($_GET['case_id'] ?? ''));
if ($caseId === '') page_error('Missing case_id', 'Open this page as /deposim/?case_id=<uuid>.', 400);
if (!is_uuid($caseId)) page_error('Invalid case_id', 'case_id must be a UUID.', 400);

$caseFile = $casesDir . '/case_' . $caseId . '.json';
if (!is_file($caseFile)) {
    header('Location: /demo/');
    exit;
}

$raw = file_get_contents($caseFile);
if ($raw === false) page_error('Server error', 'Unable to read case file. Check permissions.', 500);

$case = json_decode($raw, true);
if (!is_array($case)) page_error('Server error', 'Case file JSON is invalid.', 500);

$first = (string)($case['person']['first_name'] ?? '');
$last  = (string)($case['person']['last_name'] ?? '');
$name  = trim($first . ' ' . $last);
$caseNumber = (string)($case['case_number'] ?? '');
$desc = (string)($case['description'] ?? '');
$phone = (string)($case['person']['phone'] ?? '');

// -------------------- load prompts --------------------

$depoPrompt = latest_prompt_text($promptDir);
if ($depoPrompt === '') {
    $depoPrompt = "No depo prompt found in {$promptDir}. Add a .txt file to configure the agent.";
}

$firstMessage = latest_prompt_text($firstMessageDir);
if ($firstMessage === '') {
    $firstMessage = "No first message found in {$firstMessageDir}. Add a .txt file to configure the agent's greeting.";
}

// -------------------- build dynamic vars --------------------

$caseInfo =
    "Case Number: {$caseNumber}\n" .
    "Deponent: {$name}\n" .
    "Phone: {$phone}\n" .
    "Description: {$desc}";

$dynamicVars = json_encode(
    [
        "depo_prompt"   => $depoPrompt,
        "first_message" => $firstMessage,
        "case_id"       => $caseId,
        "case_info"     => $caseInfo,
    ],
    JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
);

if ($dynamicVars === false) {
    page_error('Server error', 'Unable to encode dynamic variables.', 500);
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DepoSim</title>

  <style>
    html, body { height: 100%; margin: 0; background: #0b0c10; }

    /* Top-left case header */
    #case-header {
      position: fixed;
      top: 18px;
      left: 18px;
      z-index: 10000;
      color: #fff;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.10);
      border-radius: 14px;
      padding: 14px 16px;
      backdrop-filter: blur(10px);
      width: min(520px, calc(100vw - 36px));
      box-sizing: border-box;
    }
    #case-header .brand { font-weight: 800; letter-spacing: -0.02em; font-size: 16px; margin-bottom: 8px; opacity: 0.95; }
    #case-header .row { font-size: 13px; line-height: 1.35; opacity: 0.92; margin: 4px 0; }
    #case-header strong { font-weight: 700; }

    /* Centered widget frame */
    #widget-frame {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      z-index: 9999;

      width: min(900px, calc(100vw - 40px));
      height: min(760px, calc(100vh - 120px));
      box-sizing: border-box;

      display: grid;
      place-items: stretch;
    }

    #widget-frame elevenlabs-convai {
      width: 100% !important;
      height: 100% !important;
      display: block !important;
      position: relative !important;
      inset: auto !important;
      transform: none !important;
      margin: 0 !important;
    }

    @media (max-width: 640px) {
      #widget-frame { height: min(820px, calc(100vh - 110px)); }
    }
  </style>
</head>

<body>
  <div id="case-header">
    <div class="brand">DepoSim</div>
    <div class="row"><strong>Case #:</strong> <?php echo h($caseNumber !== '' ? $caseNumber : '(not provided)'); ?></div>
    <div class="row"><strong>Deponent:</strong> <?php echo h($name !== '' ? $name : '(not provided)'); ?></div>
  </div>

  <div id="widget-frame">
    <elevenlabs-convai
      id="convai"
      agent-id="<?php echo h($agentId); ?>"
      variant="expanded"
      dismissible="false"
      dynamic-variables='<?php echo h($dynamicVars); ?>'
    ></elevenlabs-convai>
  </div>

  <script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async type="text/javascript"></script>

  <script>
    // Keep the same "pin only injected wrappers" logic (and never touch #widget-frame).
    (function () {
      const frame = document.getElementById('widget-frame');

      function pinInjectedWrapperToFrame(wrapper) {
        const r = frame.getBoundingClientRect();
        wrapper.style.setProperty('position', 'fixed', 'important');
        wrapper.style.setProperty('left', r.left + 'px', 'important');
        wrapper.style.setProperty('top', r.top + 'px', 'important');
        wrapper.style.setProperty('right', 'auto', 'important');
        wrapper.style.setProperty('bottom', 'auto', 'important');
        wrapper.style.setProperty('width', r.width + 'px', 'important');
        wrapper.style.setProperty('height', r.height + 'px', 'important');
        wrapper.style.setProperty('transform', 'none', 'important');
        wrapper.style.setProperty('margin', '0', 'important');
        wrapper.style.setProperty('z-index', '9999', 'important');
      }

      function findInjectedWrappers() {
        const els = Array.from(document.querySelectorAll('body *'))
          .filter(el => el instanceof HTMLElement)
          .filter(el => el.id !== 'widget-frame') // critical: do not pin our centered frame
          .filter(el => el.id !== 'case-header')
          .filter(el => el.tagName.toLowerCase() !== 'elevenlabs-convai')
          .filter(el => getComputedStyle(el).position === 'fixed')
          .filter(el => el.querySelector && el.querySelector('elevenlabs-convai'));

        els.forEach(pinInjectedWrapperToFrame);
      }

      const obs = new MutationObserver(findInjectedWrappers);
      obs.observe(document.documentElement, { childList: true, subtree: true });

      setTimeout(findInjectedWrappers, 200);
      setTimeout(findInjectedWrappers, 700);
      setTimeout(findInjectedWrappers, 1400);
      window.addEventListener('resize', findInjectedWrappers);
    })();
  </script>
</body>
</html>
