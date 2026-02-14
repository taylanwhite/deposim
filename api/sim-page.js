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

  // Load case (client has deponent info)
  const caseRecord = await prisma.case.findUnique({
    where: { id: caseId },
    include: { client: true },
  });
  if (!caseRecord) {
    return res.redirect('/');
  }

  const client = caseRecord.client;
  const firstName = client?.firstName || '';
  const lastName = client?.lastName || '';
  const name = `${firstName} ${lastName}`.trim() || 'Deponent';
  const caseNumber = caseRecord.caseNumber || '';
  const desc = caseRecord.description || '';
  const phone = client?.phone || '';

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
      where: {
        type: 'first_message',
        isActive: true,
        OR: [{ language: 'en' }, { language: null }],
      },
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

    /* ===== Consent / Pre-Sim Screen ===== */
    #consent-screen {
      position: fixed;
      inset: 0;
      z-index: 30000;
      background: linear-gradient(145deg, #0d0b1a 0%, #1a1333 50%, #0d0b1a 100%);
      color: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 24px;
      text-align: center;
      overflow-y: auto;
    }
    #consent-screen .consent-logo img {
      height: 36px;
      width: auto;
      margin-bottom: 28px;
    }
    #consent-screen h1 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 8px;
      line-height: 1.2;
    }
    #consent-screen .consent-subtitle {
      font-size: 14px;
      color: rgba(255,255,255,0.55);
      margin-bottom: 28px;
      max-width: 420px;
    }
    .consent-card {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 24px 20px;
      max-width: 420px;
      width: 100%;
      margin-bottom: 24px;
    }
    .consent-card h2 {
      font-size: 17px;
      font-weight: 600;
      margin-bottom: 14px;
    }
    .consent-features {
      list-style: none;
      text-align: left;
    }
    .consent-features li {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 14px;
      font-size: 14px;
      line-height: 1.45;
      color: rgba(255,255,255,0.85);
    }
    .consent-features li:last-child { margin-bottom: 0; }
    .consent-features .feat-icon {
      flex-shrink: 0;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(98, 54, 255, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }
    .consent-features .feat-text strong {
      color: #fff;
    }

    /* Camera preview (consent screen) */
    #camera-preview-wrap {
      display: none;
      width: 100%;
      max-width: 320px;
      aspect-ratio: 4/3;
      border-radius: 16px;
      overflow: hidden;
      border: 2px solid rgba(98, 54, 255, 0.5);
      background: #000;
      margin-bottom: 20px;
    }
    #camera-preview-wrap video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scaleX(-1);
    }

    /* Persistent PiP camera during call */
    #pip-camera {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 160px;
      height: 120px;
      border-radius: 12px;
      overflow: hidden;
      border: 3px solid rgba(98, 54, 255, 0.6);
      background: #000;
      box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      z-index: 10001;
      display: none;
    }
    #pip-camera video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scaleX(-1);
    }
    #pip-camera .pip-label {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 4px 8px;
      background: rgba(0,0,0,0.6);
      color: #fff;
      font-size: 11px;
      font-weight: 600;
    }
    .end-session-btn {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10002;
      padding: 12px 28px;
      border: none;
      border-radius: 12px;
      background: linear-gradient(135deg, #ed4956 0%, #c13584 100%);
      color: #fff;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
      display: none;
      box-shadow: 0 4px 20px rgba(237,73,86,0.4);
      -webkit-tap-highlight-color: transparent;
    }
    .end-session-btn:hover { opacity: 0.95; }
    .end-session-btn:active { transform: translateX(-50%) scale(0.98); }
    #camera-status {
      font-size: 13px;
      color: rgba(255,255,255,0.5);
      margin-bottom: 16px;
      min-height: 20px;
    }

    /* Buttons */
    .consent-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 14px 32px;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      transition: opacity 0.15s, transform 0.15s;
      min-width: 220px;
    }
    .consent-btn:active { transform: scale(0.97); }
    .consent-btn:disabled { opacity: 0.4; pointer-events: none; }
    .consent-btn-primary {
      background: linear-gradient(135deg, #6236ff 0%, #be29ec 100%);
      color: #fff;
    }
    .consent-btn-start {
      background: linear-gradient(135deg, #6236ff 0%, #be29ec 100%);
      color: #fff;
      padding: 16px 40px;
      font-size: 18px;
      border-radius: 14px;
      animation: glowPulse 2s ease-in-out infinite;
    }
    @keyframes glowPulse {
      0%, 100% { box-shadow: 0 0 20px rgba(98, 54, 255, 0.3); }
      50% { box-shadow: 0 0 30px rgba(190, 41, 236, 0.5); }
    }
    .consent-skip {
      background: none;
      border: 1px solid rgba(255,255,255,0.15);
      color: rgba(255,255,255,0.5);
      font-size: 13px;
      padding: 8px 20px;
      border-radius: 8px;
      cursor: pointer;
      margin-top: 12px;
    }
    .consent-skip:hover { color: rgba(255,255,255,0.7); border-color: rgba(255,255,255,0.25); }

    /* ===== Sim Header ===== */
    #case-header {
      position: fixed;
      top: 0; left: 0; right: 0;
      z-index: 10000;
      text-align: center;
      padding: 16px 16px 14px;
      background: #fff;
      border-bottom: 1px solid rgba(0,0,0,0.08);
      display: none;
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
      display: none;
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
      #consent-screen h1 { font-size: 20px; }
      #pip-camera { width: 120px; height: 90px; bottom: 80px; right: 16px; }
      .end-session-btn { bottom: 16px; font-size: 14px; padding: 10px 20px; }
    }
  </style>
</head>

<body>

  <!-- ===== STEP 1: Consent & Camera Permission Screen ===== -->
  <div id="consent-screen">
    <div class="consent-logo"><img src="${h(logoSrc)}" alt="DepoSim" /></div>
    <h1>Prepare for Your Simulation</h1>
    <p class="consent-subtitle">Before we begin, we need camera access to analyze your body language during the deposition — just like opposing counsel would in a real one.</p>

    <div class="consent-card">
      <h2>Why this matters</h2>
      <ul class="consent-features">
        <li>
          <span class="feat-icon">&#128373;</span>
          <span class="feat-text"><strong>Body Language Analysis</strong><br/>We monitor posture, gestures, and micro-expressions in real time to assess how you present under pressure.</span>
        </li>
        <li>
          <span class="feat-icon">&#128200;</span>
          <span class="feat-text"><strong>Post-Session Report</strong><br/>After the simulation, you receive a detailed breakdown of stress indicators, credibility signals, and areas to improve.</span>
        </li>
        <li>
          <span class="feat-icon">&#128274;</span>
          <span class="feat-text"><strong>Private &amp; Secure</strong><br/>Video is processed for analysis only and is not stored permanently. Your privacy is our priority.</span>
        </li>
      </ul>
    </div>

    <div id="camera-preview-wrap">
      <video id="camera-preview" autoplay muted playsinline></video>
    </div>
    <div id="camera-status"></div>

    <div id="consent-actions">
      <button id="btn-grant-camera" class="consent-btn consent-btn-primary" onclick="requestCamera()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
        Enable Camera
      </button>
    </div>

    <div id="start-actions" style="display:none;">
      <button id="btn-start-sim" class="consent-btn consent-btn-start" onclick="startSimulation()">
        Start Simulation
      </button>
    </div>

  </div>

  <!-- ===== STEP 2: Sim Header + Widget (hidden until consent) ===== -->
  <div id="case-header">
    <div class="logo"><a href="/?open=${encodeURIComponent(caseId)}"><img src="${h(logoSrc)}" alt="DepoSim" /></a></div>
    <div class="case-num">Case #${h(caseNumber || '—')}</div>
    <div class="deponent-name">${h(name)}</div>
    <div class="cta" id="call-cta">Tap Call Icon to Start</div>
    <div class="cta-sub" style="font-size:12px;color:rgba(0,0,0,0.5);margin-top:4px;">When finished, tap End Session below</div>
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

  <!-- Persistent camera during call (PiP) -->
  <div id="pip-camera">
    <video id="pip-video" autoplay muted playsinline></video>
    <span class="pip-label">You</span>
  </div>
  <button type="button" class="end-session-btn" id="btn-end-session" onclick="endSessionManually()">End Session &amp; Upload</button>

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
    /* ===== Config ===== */
    var CASE_ID = ${JSON.stringify(caseId)};
    var cameraStream = null;
    var sessionEnded = false;

    function requestCamera() {
      var btn = document.getElementById('btn-grant-camera');
      var status = document.getElementById('camera-status');
      btn.disabled = true;
      btn.textContent = 'Requesting…';
      status.textContent = '';

      navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: true })
        .then(function(stream) {
          cameraStream = stream;
          var preview = document.getElementById('camera-preview');
          var wrap = document.getElementById('camera-preview-wrap');
          preview.srcObject = stream;
          wrap.style.display = 'block';
          status.textContent = 'Camera active — you look great!';
          status.style.color = '#58c322';

          // Record that the client granted camera/mic consent
          fetch('/api/cases/' + encodeURIComponent(CASE_ID) + '/record-consent', { method: 'POST' }).catch(function() {});

          // Hide grant button, show start button
          document.getElementById('consent-actions').style.display = 'none';
          document.getElementById('start-actions').style.display = 'block';
        })
        .catch(function(err) {
          var isDenied = err.name === 'NotAllowedError' || err.message.toLowerCase().includes('denied');
          if (isDenied) {
            // Hide the button entirely, show a clean blocked card
            btn.style.display = 'none';
            status.style.color = '#fff';
            status.innerHTML =
              '<div style="background:rgba(237,73,86,0.12);border:1px solid rgba(237,73,86,0.25);border-radius:12px;padding:16px 20px;max-width:340px;margin:0 auto;text-align:left;">' +
                '<div style="font-size:15px;font-weight:600;color:#ed4956;margin-bottom:10px;">Camera Blocked</div>' +
                '<div style="font-size:13px;line-height:1.7;color:rgba(255,255,255,0.75);">' +
                  '1. Click the <strong style="color:#fff;">lock icon</strong> in your address bar<br>' +
                  '2. Set Camera to <strong style="color:#fff;">Allow</strong><br>' +
                  '3. Reload this page' +
                '</div>' +
                '<button onclick="location.reload()" style="margin-top:14px;padding:8px 20px;border:none;border-radius:8px;background:rgba(255,255,255,0.1);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Reload Page</button>' +
              '</div>';
          } else {
            status.textContent = 'Camera error: ' + err.message;
            status.style.color = '#ed4956';
            btn.disabled = false;
            btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg> Try Again';
          }
        });
    }

    /* ===== MediaRecorder for body-language capture ===== */
    var mediaRecorder = null;
    var recordedChunks = [];
    var isRecording = false;

    function startSimulation() {
      document.getElementById('consent-screen').style.display = 'none';
      document.getElementById('case-header').style.display = 'block';
      document.getElementById('widget-frame').style.display = 'grid';

      // Show persistent PiP camera and End Session button
      if (cameraStream) {
        var pipVideo = document.getElementById('pip-video');
        var pipWrap = document.getElementById('pip-camera');
        pipVideo.srcObject = cameraStream;
        pipWrap.style.display = 'block';
        document.getElementById('btn-end-session').style.display = 'block';
      }

      // Start recording if camera stream is available
      if (cameraStream) {
        try {
          var mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : MediaRecorder.isTypeSupported('video/webm')
              ? 'video/webm'
              : 'video/mp4';
          mediaRecorder = new MediaRecorder(cameraStream, { mimeType: mimeType });
          recordedChunks = [];

          mediaRecorder.ondataavailable = function(e) {
            if (e.data && e.data.size > 0) recordedChunks.push(e.data);
          };

          mediaRecorder.onstop = function() {
            isRecording = false;
            console.log('[DepoSim] Recording stopped, chunks:', recordedChunks.length);
          };

          mediaRecorder.start(5000); // collect in 5-second chunks
          isRecording = true;
          console.log('[DepoSim] Recording started (' + mimeType + ')');
        } catch (err) {
          console.warn('[DepoSim] Could not start MediaRecorder:', err);
        }
      }
    }

    function endSessionManually() {
      if (sessionEnded) return;
      handleConversationEnded({ conversationId: '', _manual: true });
    }

    function skipConsent() {
      document.getElementById('consent-screen').style.display = 'none';
      document.getElementById('case-header').style.display = 'block';
      document.getElementById('widget-frame').style.display = 'grid';
      document.getElementById('btn-end-session').style.display = 'block';
    }

    /* ===== ElevenLabs conversationEnded handler (also called by End Session button) ===== */
    function handleConversationEnded(detail) {
      if (sessionEnded) return;
      sessionEnded = true;
      console.log('[DepoSim] Conversation ended', detail);

      // Hide PiP camera and End Session button
      document.getElementById('pip-camera').style.display = 'none';
      document.getElementById('btn-end-session').style.display = 'none';

      // Stop recording
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
      }

      // Stop camera tracks
      if (cameraStream) {
        cameraStream.getTracks().forEach(function(t) { t.stop(); });
      }

      // Show post-call screen
      document.getElementById('case-header').style.display = 'none';
      document.getElementById('widget-frame').style.display = 'none';
      document.getElementById('post-call').style.display = 'block';
      var postBody = document.getElementById('post-call-body');

      var conversationId = detail?.conversationId || detail?.conversation_id || '';
      var useCaseId = !conversationId && CASE_ID;

      // Upload the video if we have recorded data (S3 multipart for large files)
      if (recordedChunks.length > 0 && (conversationId || useCaseId)) {
        function showUploading(msg) {
          postBody.innerHTML =
            '<div style="text-align:center;">' +
              '<div style="margin-bottom:12px;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#6236ff" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>' +
              '<p style="font-size:15px;font-weight:600;color:#111;">' + msg + '</p>' +
              '<p style="font-size:13px;color:rgba(0,0,0,0.45);margin-top:6px;">This may take a moment. You can close this page — results will appear in your simulation detail.</p>' +
            '</div>';
        }
        function showComplete() {
          postBody.innerHTML =
            '<div style="text-align:center;">' +
              '<div style="margin-bottom:12px;"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#58c322" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>' +
              '<p style="font-size:15px;font-weight:600;color:#111;">Body Language Analysis Complete</p>' +
              '<p style="font-size:13px;color:rgba(0,0,0,0.45);margin-top:6px;">View the full results in your simulation detail page.</p>' +
            '</div>';
        }
        function showError(errMsg) {
          postBody.innerHTML =
            '<div style="text-align:center;">' +
              '<p style="font-size:15px;font-weight:600;color:#111;">Session Complete</p>' +
              '<p style="font-size:13px;color:rgba(0,0,0,0.45);margin-top:6px;">Body language video could not be uploaded: ' + (errMsg || 'Unknown error') + '</p>' +
            '</div>';
        }

        var blob = new Blob(recordedChunks, { type: (mediaRecorder && mediaRecorder.mimeType) || 'video/webm' });
        var PART_SIZE = 10 * 1024 * 1024;
        var parts = [];
        for (var i = 0; i < blob.size; i += PART_SIZE) {
          parts.push(blob.slice(i, Math.min(i + PART_SIZE, blob.size)));
        }
        var partNumbers = parts.map(function(_, idx) { return idx + 1; });
        showUploading('Uploading video for body language analysis…');

        fetch('/api/simulations/video/upload-init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: conversationId || null, caseId: CASE_ID }),
        })
        .then(function(r) { return r.json(); })
        .then(function(initData) {
          if (!initData.ok) throw new Error(initData.error || 'Upload init failed');
          return initData;
        })
        .then(function(initData) {
          return fetch('/api/simulations/video/upload-urls', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uploadId: initData.uploadId, key: initData.key, partNumbers: partNumbers }),
          }).then(function(r) { return r.json(); }).then(function(urlsData) {
            if (!urlsData.ok) throw new Error(urlsData.error || 'Failed to get upload URLs');
            return { init: initData, urls: urlsData.urls };
          });
        })
        .then(function(data) {
          var uploadId = data.init.uploadId;
          var key = data.init.key;
          var urls = data.urls;
          var completedParts = [];
          var seq = Promise.resolve();
          for (var i = 0; i < parts.length; i++) {
            (function(partIdx) {
              seq = seq.then(function() {
                var partNum = partIdx + 1;
                var url = urls[partNum];
                if (!url) throw new Error('No URL for part ' + partNum);
                return fetch(url, { method: 'PUT', body: parts[partIdx] }).then(function(res) {
                  if (!res.ok) throw new Error('Part ' + partNum + ' upload failed');
                  var etag = res.headers.get('ETag');
                  if (!etag) throw new Error('Part ' + partNum + ' missing ETag');
                  completedParts.push({ partNumber: partNum, etag: etag });
                  var pct = Math.round(((partIdx + 1) / parts.length) * 100);
                  showUploading('Uploading video… ' + pct + '%');
                });
              });
            })(i);
          }
          return seq.then(function() {
            showUploading('Upload complete. Analyzing video…');
            return fetch('/api/simulations/video/upload-complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                uploadId: uploadId,
                key: key,
                parts: completedParts,
                conversationId: conversationId || null,
                caseId: CASE_ID,
              }),
            }).then(function(r) { return r.json(); });
          });
        })
        .then(function(data) {
          if (data.ok) showComplete();
          else showError(data.error || 'Upload complete failed');
        })
        .catch(function(err) {
          console.error('[DepoSim] Video upload failed:', err);
          showError(err.message || 'Upload failed');
        });
      } else {
        postBody.innerHTML =
          '<div style="text-align:center;">' +
            '<p style="font-size:15px;font-weight:600;color:#111;">Session Complete</p>' +
            '<p style="font-size:13px;color:rgba(0,0,0,0.45);margin-top:6px;">View your simulation results and AI analysis in the app.</p>' +
          '</div>';
      }
    }

    // Listen for conversationEnded from the ElevenLabs widget
    (function() {
      var widget = document.getElementById('convai');
      if (widget) {
        widget.addEventListener('elevenlabs-convai:call:ended', function(e) {
          handleConversationEnded(e.detail || {});
        });
        // Fallback event name
        widget.addEventListener('conversationEnded', function(e) {
          handleConversationEnded(e.detail || {});
        });
      }
      // Also listen on document in case events bubble
      document.addEventListener('elevenlabs-convai:call:ended', function(e) {
        if (!document.getElementById('post-call').style.display ||
            document.getElementById('post-call').style.display === 'none') {
          handleConversationEnded(e.detail || {});
        }
      });
    })();
  </script>

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
          .filter(el => el.id !== 'consent-screen')
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
