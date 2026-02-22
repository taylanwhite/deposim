/**
 * ElevenLabs webhook handler.
 * HMAC verify, extract case_id, OpenAI analysis, upsert SimulationStage via Prisma.
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

  if (Math.abs(now - ts) > maxSkewSeconds) return false;

  const signedPayload = `${t}.${rawBody}`;
  const calc = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(v0, 'hex'));
}

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

function clampStage(stage) {
  return Math.max(1, Math.min(4, parseInt(stage, 10) || 1));
}

function computeBodyScoreFromAnalysis(bodyAnalysisText) {
  if (!bodyAnalysisText) return null;
  try {
    let raw = typeof bodyAnalysisText === 'string' ? bodyAnalysisText : JSON.stringify(bodyAnalysisText);
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const d = JSON.parse(raw);
    const cats = ['overall_demeanor', 'key_body_signals', 'stress_signals', 'credible_assessment'];
    const scores = cats.filter((k) => d[k] && typeof d[k].score === 'number').map((k) => d[k].score);
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  } catch { return null; }
}

async function computeSimScore(prisma, simulationId) {
  const rows = await prisma.simulationStage.findMany({ where: { simulationId } });
  const stageScores = [];
  for (const row of rows) {
    if (row.status !== 'completed') continue;
    const voice = row.score ?? null;
    const body = row.bodyScore ?? null;
    if (voice != null && body != null) stageScores.push(Math.round((voice + body) / 2));
    else if (voice != null) stageScores.push(voice);
    else if (body != null) stageScores.push(body);
  }
  const combined = stageScores.length > 0
    ? Math.round(stageScores.reduce((a, b) => a + b, 0) / stageScores.length)
    : null;
  await prisma.simulation.update({ where: { id: simulationId }, data: { score: combined } });
  return combined;
}

/**
 * Express route handler for POST /api/webhook/elevenlabs
 */
async function handleElevenLabsWebhook(req, res, prisma) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET || '';

  const rawBody = typeof req.body === 'string' ? req.body : req.body.toString('utf8');

  const signatureHeader = req.headers['elevenlabs-signature'] || '';
  if (!signatureHeader) {
    return res.status(401).json({ error: 'Missing ElevenLabs-Signature header' });
  }

  if (!verifySignature(rawBody, signatureHeader, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

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

  const dyn = extractDynamicVariables(data);
  const caseId = dyn?.case_id ? String(dyn.case_id) : '';

  if (!caseId) {
    return res.status(400).json({ error: 'Missing/invalid case_id' });
  }

  const caseRecord = await prisma.case.findUnique({ where: { id: caseId } });
  if (!caseRecord) {
    return res.status(404).json({ error: 'Case not found', case_id: caseId });
  }

  const conversationId = data.conversation_id ? String(data.conversation_id) : null;

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

  const stage = clampStage(dyn?.stage);
  const simulationId = dyn?.simulation_id ? String(dyn.simulation_id) : null;
  const clientId = dyn?.client_id ? String(dyn.client_id) : null;
  const personaId = dyn?.persona_id ? String(dyn.persona_id) : null;

  // ---------- Resolve or create the parent Simulation ----------
  let simulation = null;
  if (simulationId) {
    simulation = await prisma.simulation.findFirst({
      where: { id: simulationId, caseId },
    });
  }
  if (!simulation && conversationId) {
    const stageRow = await prisma.simulationStage.findFirst({ where: { conversationId } });
    if (stageRow) simulation = await prisma.simulation.findUnique({ where: { id: stageRow.simulationId } });
  }
  if (!simulation) {
    simulation = await prisma.simulation.findFirst({
      where: { caseId, ...(clientId ? { clientId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }
  if (!simulation) {
    simulation = await prisma.simulation.create({
      data: {
        caseId,
        clientId,
        selectedStage: stage,
      },
    });
  }

  // ---------- Upsert SimulationStage row ----------
  await prisma.simulationStage.upsert({
    where: { simulationId_stage: { simulationId: simulation.id, stage } },
    create: {
      simulationId: simulation.id,
      stage,
      conversationId,
      status: 'completed',
      score,
      scoreReason,
      fullAnalysis,
      turnScores: turnScores && Array.isArray(turnScores) ? turnScores : undefined,
      transcript: transcript || undefined,
      callDurationSecs: meta.call_duration_secs != null ? parseInt(meta.call_duration_secs, 10) || null : null,
      transcriptSummary: analysis.transcript_summary ? String(analysis.transcript_summary) : null,
      callSummaryTitle: analysis.call_summary_title ? String(analysis.call_summary_title) : null,
      ...(personaId && { personaId }),
    },
    update: {
      conversationId,
      status: 'completed',
      score,
      scoreReason,
      fullAnalysis,
      turnScores: turnScores && Array.isArray(turnScores) ? turnScores : undefined,
      transcript: transcript || undefined,
      callDurationSecs: meta.call_duration_secs != null ? parseInt(meta.call_duration_secs, 10) || null : null,
      transcriptSummary: analysis.transcript_summary ? String(analysis.transcript_summary) : null,
      callSummaryTitle: analysis.call_summary_title ? String(analysis.call_summary_title) : null,
      ...(personaId && { personaId }),
    },
  });

  // Recompute the combined simulation score
  await computeSimScore(prisma, simulation.id);

  console.log(`[webhook] SimulationStage upserted: sim=${simulation.id} case=${caseId} stage=${stage} score=${score}`);
  betterstack.info('[webhook] SimulationStage upserted', { simulationId: simulation.id, caseId, stage, score });

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
