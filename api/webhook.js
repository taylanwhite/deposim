/**
 * ElevenLabs webhook handler.
 * Port of post.php — HMAC verify, extract case_id, OpenAI analysis, save Simulation via Prisma.
 *
 * Env: ELEVENLABS_WEBHOOK_SECRET, OPENAI_API_KEY
 */
const crypto = require('crypto');
const { analyzeDeposition } = require('./openai');
const betterstack = require('./betterstack');

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

  // ---------- Idempotency: update existing if conversation_id already stored (e.g. stub from video upload) ----------
  let existing = null;
  if (conversationId) {
    existing = await prisma.simulation.findFirst({
      where: { conversationId },
    });
  }
  if (!existing && conversationId) {
    // Stub may have been created by video upload before conversationId was known - find recent case stub
    const cutoff = new Date(Date.now() - 5 * 60 * 1000);
    existing = await prisma.simulation.findFirst({
      where: {
        caseId,
        createdAt: { gte: cutoff },
        fullAnalysis: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---------- Run deposition score analysis ----------
  const transcript = data.transcript || null;
  const meta = (typeof data.metadata === 'object' && data.metadata) || {};
  const analysis = (typeof data.analysis === 'object' && data.analysis) || {};

  let score = 0;
  let scoreReason = '';
  let fullAnalysis = null;
  let turnScores = null;

  if (Array.isArray(transcript) && transcript.length > 0) {
    const scorePrompt = await prisma.prompt
      .findFirst({
        where: { type: 'score', isActive: true },
        orderBy: { updatedAt: 'desc' },
      })
      .then((p) => p?.content || null);
    const result = await analyzeDeposition(transcript, scorePrompt);
    if (result.success) {
      score = result.score;
      scoreReason = result.scoreReason;
      fullAnalysis = result.fullAnalysis;
      turnScores = result.turnScores;
    } else {
      console.error('[webhook] OpenAI analysis failed:', result.error);
      betterstack.error('[webhook] OpenAI analysis failed', { error_message: result.error });
    }
  }

  // Extract stage and clientId from dynamic variables (passed through from signed-url)
  const stageRaw = dyn?.stage ? parseInt(dyn.stage, 10) : null;
  const stage = stageRaw >= 1 && stageRaw <= 4 ? stageRaw : null;
  const clientId = dyn?.client_id ? String(dyn.client_id) : null;

  const simData = {
    caseId,
    clientId,
    conversationId,
    eventType: type || null,
    agentId: data.agent_id ? String(data.agent_id) : null,
    status: data.status ? String(data.status) : null,
    score,
    scoreReason,
    fullAnalysis,
    turnScores: turnScores && Array.isArray(turnScores) ? turnScores : undefined,
    transcript: transcript || undefined,
    callDurationSecs: meta.call_duration_secs != null ? parseInt(meta.call_duration_secs, 10) || null : null,
    transcriptSummary: analysis.transcript_summary ? String(analysis.transcript_summary) : null,
    callSummaryTitle: analysis.call_summary_title ? String(analysis.call_summary_title) : null,
    stage,
    stageStatus: stage ? 'completed' : undefined,
  };

  let simulation;
  if (existing) {
    simulation = await prisma.simulation.update({
      where: { id: existing.id },
      data: simData,
    });
    console.log(`[webhook] Simulation updated (stub): ${simulation.id} case=${caseId} score=${score}`);
    betterstack.info('[webhook] Simulation updated', { simulationId: simulation.id, caseId, score });
  } else {
    simulation = await prisma.simulation.create({
      data: simData,
    });
    console.log(`[webhook] Simulation saved: ${simulation.id} case=${caseId} score=${score}`);
    betterstack.info('[webhook] Simulation saved', { simulationId: simulation.id, caseId, score });
  }

  // Touch case updatedAt (non-fatal; main work is simulation save)
  try {
    await prisma.case.update({
      where: { id: caseId },
      data: { updatedAt: new Date() },
    });
  } catch (caseErr) {
    console.error('[webhook] Failed to touch case updatedAt:', caseErr.message, caseErr.code);
    betterstack.warn('[webhook] Failed to touch case updatedAt', { caseId, error_message: caseErr.message, code: caseErr.code });
  }

  return res.json({
    ok: true,
    case_id: caseId,
    event_type: type,
    conversation_id: conversationId,
    simulation_id: simulation.id,
  });
}

module.exports = { handleElevenLabsWebhook, verifySignature };
