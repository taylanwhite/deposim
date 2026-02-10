/**
 * Server-rendered ElevenLabs widget page.
 * Port of sim.php — loads case from Prisma, loads prompts from DB, renders HTML.
 *
 * Env: ELEVENLABS_AGENT_ID (default: agent_4901kgr2443mem1t7s9gnrbmhaq1)
 */

const fs = require('fs');
const path = require('path');

/** Resolve logo as base64 data URL so it always loads when sim page is served from API. */
function getLogoDataUrl() {
  const candidates = [
    path.join(process.cwd(), 'client', 'public', 'DepoSim-logo-wide-1200.png'),
    path.join(process.cwd(), 'public', 'DepoSim-logo-wide-1200.png'),
    path.join(__dirname, '..', 'client', 'public', 'DepoSim-logo-wide-1200.png'),
    path.join(__dirname, '..', 'public', 'DepoSim-logo-wide-1200.png'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        return 'data:image/png;base64,' + buf.toString('base64');
      }
    } catch (_) {}
  }
  return null;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Express route handler: GET /api/sim/:caseId
 */
async function handleSimPage(req, res, prisma) {
  const caseId = req.params.caseId || '';

  if (!caseId) {
    return res.redirect('/');
  }

  // Load case
  const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseRecord) {
    return res.redirect('/');
  }

  const firstName = caseRecord.firstName || '';
  const lastName = caseRecord.lastName || '';
  const name = `${firstName} ${lastName}`.trim() || 'Deponent';
  const caseNumber = caseRecord.caseNumber || '';
  const desc = caseRecord.description || '';
  const phone = caseRecord.phone || '';

  // Load prompts from DB
  let depoPrompt = '';
  let firstMessage = '';
  let primerMensaje = '';

  try {
    // System prompt (depo_prompt)
    const sysPrompt = await prisma.prompt.findFirst({
      where: { type: 'system', isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    depoPrompt = sysPrompt?.content || 'No system prompt configured. Add one in Settings → Prompts.';

    // First message (English) - for dynamic variable "first_message"
    const fmPrompt = await prisma.prompt.findFirst({
      where: { type: 'first_message', isActive: true, language: { in: ['en', null] } },
      orderBy: { updatedAt: 'desc' },
    });
    firstMessage = fmPrompt?.content || 'Hello, I will be conducting your deposition practice today.';

    // First message (Spanish) - for dynamic variable "primer_mensaje" (ElevenLabs override)
    const fmSpanish = await prisma.prompt.findFirst({
      where: { type: 'first_message', isActive: true, language: 'es' },
      orderBy: { updatedAt: 'desc' },
    });
    primerMensaje = fmSpanish?.content || '';
  } catch (err) {
    console.error('[sim-page] Error loading prompts:', err.message);
  }

  const agentId = process.env.ELEVENLABS_AGENT_ID || 'agent_4901kgr2443mem1t7s9gnrbmhaq1';

  // Build dynamic variables
  const caseInfo = `Case Number: ${caseNumber}\nDeponent: ${name}\nPhone: ${phone}\nDescription: ${desc}`;

  const dynamicVars = JSON.stringify({
    depo_prompt: depoPrompt,
    first_message: firstMessage,
    primer_mensaje: primerMensaje,
    case_id: caseId,
    case_info: caseInfo,
  });

  const h = escapeHtml;
  const logoSrc = getLogoDataUrl() || '/DepoSim-logo-wide-1200.png';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DepoSim</title>

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      height: 100%;
      background: #fff;
      color: #111;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    #case-header {
      position: fixed;
      top: 0; left: 0; right: 0;
      z-index: 10000;
      text-align: center;
      padding: 16px 16px 14px;
      background: #fff;
      border-bottom: 1px solid rgba(0,0,0,0.08);
    }
    #case-header .logo {
      margin-bottom: 6px;
    }
    #case-header .logo a {
      display: inline-block;
      text-decoration: none;
    }
    #case-header .logo img {
      height: 32px;
      width: auto;
      display: block;
      vertical-align: middle;
    }
    #case-header .case-num {
      font-size: 13px;
      color: rgba(0,0,0,0.45);
      margin-bottom: 2px;
    }
    #case-header .deponent-name {
      font-size: 28px;
      font-weight: 700;
      line-height: 1.15;
    }
    #case-header .cta {
      margin-top: 10px;
      font-size: 15px;
      font-weight: 600;
      color: #0095f6;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

    #widget-frame {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -48%);
      z-index: 9999;
      width: min(900px, calc(100vw - 20px));
      height: min(700px, calc(100vh - 180px));
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
      #case-header .deponent-name { font-size: 22px; }
      #widget-frame { height: min(700px, calc(100vh - 170px)); top: 52%; }
    }
  </style>
</head>

<body>
  <div id="case-header">
    <div class="logo"><a href="/?open=${encodeURIComponent(caseId)}"><img src="${h(logoSrc)}" alt="DepoSim" /></a></div>
    <div class="case-num">Case #${h(caseNumber || '—')}</div>
    <div class="deponent-name">${h(name)}</div>
    <div class="cta" id="call-cta">Tap Call Icon to Start</div>
  </div>

  <div id="widget-frame">
    <elevenlabs-convai
      id="convai"
      agent-id="${h(agentId)}"
      variant="expanded"
      dismissible="false"
      dynamic-variables='${h(dynamicVars)}'
    ></elevenlabs-convai>
  </div>

  <script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async type="text/javascript"></script>

  <!-- Post-call analysis screen (hidden until call ends) -->
  <div id="post-call" style="display:none; position:fixed; inset:0; z-index:20000; background:#fff; overflow-y:auto; padding:20px 16px 40px;">
    <div style="text-align:center; padding:20px 0;">
      <div class="logo" style="margin-bottom:8px;"><img src="${h(logoSrc)}" alt="DepoSim" style="height:28px; width:auto; display:inline-block; vertical-align:middle;" /></div>
      <div style="font-size:13px; color:rgba(0,0,0,0.45);">Case #${h(caseNumber)}</div>
      <div style="font-size:24px; font-weight:700; margin-top:4px;">${h(name)}</div>
      <div style="margin-top:16px; font-size:16px; font-weight:600; color:#0095f6;">Session Complete</div>
    </div>
    <div id="post-call-body" style="max-width:600px; margin:0 auto;">
      <p style="text-align:center; color:rgba(0,0,0,0.45); font-size:14px;">Analysis will appear here when ready…</p>
    </div>
    <div style="text-align:center; margin-top:24px;">
      <a href="/?open=${encodeURIComponent(caseId)}" style="display:inline-block; padding:12px 28px; background:#0095f6; color:#fff; border-radius:10px; text-decoration:none; font-weight:600; font-size:15px;">Back to Cases</a>
    </div>
  </div>

  <script>
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
          .filter(el => el.id !== 'widget-frame')
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
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
}

module.exports = { handleSimPage };
