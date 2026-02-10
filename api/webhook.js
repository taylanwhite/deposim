/**
 * ElevenLabs webhook handler.
 * Port of post.php — HMAC verify, extract case_id, OpenAI analysis, save Simulation via Prisma.
 *
 * Env: ELEVENLABS_WEBHOOK_SECRET, OPENAI_API_KEY
 */
const crypto = require('crypto');
const { analyzeDeposition } = require('./openai');

/**
 * Verify ElevenLabs HMAC-SHA256 webhook signature.
 * Header format: "t=TIMESTAMP,v0=HEX_HMAC"
 * signedPayload = "TIMESTAMP.rawBody"
 */
function verifySignature(rawBody, signatureHeader, secret, maxSkewSeconds = 300) {
  if (!secret || !signatureHeader) return false;

  const parts = signatureHeader.split(',').map(s => s.trim());
  let t = null;
  let v0 = null;

  for (const p of parts) {
    if (p.startsWith('t=')) t = p.slice(2);
    if (p.startsWith('v0=')) v0 = p.slice(3);
  }

  if (t === null || v0 === null) return false;
  if (!/^\d+$/.test(t)) return false;

  const ts = parseInt(t, 10);
  const now = Math.floor(Date.now() / 1000);

  // Replay protection
  if (Math.abs(now - ts) > maxSkewSeconds) return false;

  const signedPayload = `${t}.${rawBody}`;
  const calc = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(v0, 'hex'));
}

/**
 * Extract dynamic variables from the ElevenLabs payload.
 */
function extractDynamicVariables(data) {
  if (data.dynamic_variables && typeof data.dynamic_variables === 'object') {
    return data.dynamic_variables;
  }
  if (data.conversation_initiation_client_data?.dynamic_variables &&
      typeof data.conversation_initiation_client_data.dynamic_variables === 'object') {
    return data.conversation_initiation_client_data.dynamic_variables;
  }
  if (data.metadata?.dynamic_variables && typeof data.metadata.dynamic_variables === 'object') {
    return data.metadata.dynamic_variables;
  }
  return null;
}

/**
 * Express route handler for POST /api/webhook/elevenlabs
 *
 * IMPORTANT: This needs raw body access. The route must use express.raw() middleware
 * instead of express.json() so we can verify the HMAC on the raw bytes.
 */
async function handleElevenLabsWebhook(req, res, prisma) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET || '';

  // Raw body comes as Buffer when using express.raw()
  const rawBody = typeof req.body === 'string' ? req.body : req.body.toString('utf8');

  // ---------- Signature ----------
  const signatureHeader = req.headers['elevenlabs-signature'] || '';
  if (!signatureHeader) {
    return res.status(401).json({ error: 'Missing ElevenLabs-Signature header' });
  }

  if (!verifySignature(rawBody, signatureHeader, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // ---------- Parse JSON ----------
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const type = String(event.type || '');
  const data = event.data;

  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Missing data object' });
  }

  // ---------- Extract dynamic vars + case_id ----------
  const dyn = extractDynamicVariables(data);
  const caseId = dyn?.case_id ? String(dyn.case_id) : '';

  if (!caseId) {
    return res.status(400).json({ error: 'Missing/invalid case_id' });
  }

  // Verify case exists
  const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseRecord) {
    return res.status(404).json({ error: 'Case not found', case_id: caseId });
  }

  const conversationId = data.conversation_id ? String(data.conversation_id) : null;

  // ---------- Idempotency: skip if conversation_id already stored ----------
  if (conversationId) {
    const existing = await prisma.simulation.findFirst({
      where: { conversationId },
    });
    if (existing) {
      return res.json({ ok: true, duplicate: true, case_id: caseId, conversation_id: conversationId });
    }
  }

  // ---------- Run deposition win_ready analysis ----------
  const transcript = data.transcript || null;
  const meta = (typeof data.metadata === 'object' && data.metadata) || {};
  const analysis = (typeof data.analysis === 'object' && data.analysis) || {};

  let winReady = 0;
  let winReadyReason = '';
  let winReadyAnalysis = null;

  if (Array.isArray(transcript) && transcript.length > 0) {
    const result = await analyzeDeposition(transcript);
    if (result.success) {
      winReady = result.winReady;
      winReadyReason = result.winReadyReason;
      winReadyAnalysis = result.fullAnalysis;
    } else {
      console.error('[webhook] OpenAI analysis failed:', result.error);
    }
  }

  // ---------- Save Simulation ----------
  const simulation = await prisma.simulation.create({
    data: {
      caseId,
      conversationId,
      eventType: type || null,
      agentId: data.agent_id ? String(data.agent_id) : null,
      status: data.status ? String(data.status) : null,
      winReady,
      winReadyReason,
      winReadyAnalysis,
      transcript: transcript || undefined,
      callDurationSecs: meta.call_duration_secs != null ? parseInt(meta.call_duration_secs, 10) || null : null,
      transcriptSummary: analysis.transcript_summary ? String(analysis.transcript_summary) : null,
      callSummaryTitle: analysis.call_summary_title ? String(analysis.call_summary_title) : null,
    },
  });

  // Touch case updatedAt
  await prisma.case.update({
    where: { id: caseId },
    data: { updatedAt: new Date() },
  });

  console.log(`[webhook] Simulation saved: ${simulation.id} case=${caseId} winReady=${winReady}`);

  return res.json({
    ok: true,
    case_id: caseId,
    event_type: type,
    conversation_id: conversationId,
    simulation_id: simulation.id,
  });
}

module.exports = { handleElevenLabsWebhook, verifySignature };
