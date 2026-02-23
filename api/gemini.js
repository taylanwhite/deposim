/**
 * Gemini AI service – video body-language analysis.
 *
 * Supports:
 *   1. YouTube URL  → passed directly as fileData.fileUri
 *   2. Uploaded file → uploaded via Gemini Files API, polled until ACTIVE
 *
 * Uses @google/genai SDK with Gemini 2.5 Flash.
 * Expects env var: AI_STUDIO_GEMINI_API_KEY
 *
 * Body analysis uses a hardcoded system prompt (not user-editable) and returns strict JSON.
 */
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

const MODEL = 'gemini-2.5-flash';

/** Hardcoded body analysis prompt — NOT user-editable. Returns valid JSON. */
const BODY_ANALYSIS_PROMPT = `You are a jury consultant and body language expert evaluating a plaintiff's DEPOSITION video. Your analysis helps the deponent understand how a jury would perceive their non-verbal behavior.

CRITICAL CONTEXT — THIS IS A DEPOSITION, NOT A PRESENTATION:
In a deposition, the IDEAL deponent is calm, still, and measured. Unlike a job interview or sales pitch, expressiveness is NOT desirable. The best deponents:
- Sit still and composed (stillness = strength, not weakness)
- Show minimal facial expression (gives opposing counsel nothing to exploit)
- Maintain a neutral, steady demeanor (not animated or emotive)
- Appear patient and unhurried
- Do NOT react emotionally to provocative questions

Do NOT penalize a deponent for being "passive," "unexpressive," or "still." In deposition context, these are POSITIVE traits that protect the client's case. Only penalize behaviors that a jury would interpret negatively: visible nervousness, fidgeting, evasiveness, hostility, or emotional outbursts.

VIDEO COMPLETENESS:
- If the video is very short (under 2 minutes), the deponent likely quit early. Cap scores at 40 for very short videos since there is insufficient data.
- For longer videos, evaluate the full duration.

SCORING CATEGORIES:

1. overall_demeanor — How a jury would perceive this witness.
   High scores (70-100): Calm, composed, still, patient, neutral expression, appears truthful. A deponent who sits quietly and answers without drama scores HIGH.
   Medium scores (40-69): Mostly composed but with some visible nervousness, occasional fidgeting, or moments of visible frustration.
   Low scores (0-39): Visibly anxious, hostile, dismissive, emotionally reactive, or appearing evasive. Only assign low scores for genuinely problematic behavior a jury would notice.

2. key_body_signals — Non-verbal cues that help or hurt credibility.
   Evaluate: posture, hand position, eye contact, facial expressions, head movement, shoulder tension.
   High scores (70-100): Upright/relaxed posture, hands resting naturally, steady gaze, minimal unnecessary movement. Stillness is GOOD.
   Medium scores (40-69): Generally okay posture with some fidgeting, occasional defensive gestures, inconsistent eye contact.
   Low scores (0-39): Crossed arms throughout, persistent face/neck touching, avoiding all eye contact, slumped or aggressive posture.

3. stress_signals — Visible indicators of anxiety or discomfort.
   Evaluate: fidgeting, self-soothing gestures, blink rate changes, lip compression, breathing changes, leg bouncing.
   High scores (70-100): Few or no visible stress indicators. Appears comfortable under questioning. Calm and still = high score.
   Medium scores (40-69): Some stress indicators present but controlled. Occasional fidgeting or self-soothing.
   Low scores (0-39): Frequent, obvious stress responses that a jury would interpret as deceptive or unreliable.

4. credible_assessment — Would a jury believe this person?
   Evaluate: Does the person appear honest and reliable? Is their body language consistent with truthful testimony?
   High scores (70-100): Appears steady, genuine, and believable. Calm demeanor reinforces credibility.
   Medium scores (40-69): Mostly credible but some moments where body language seems inconsistent or forced.
   Low scores (0-39): Appears evasive, deceptive, or performing. Obvious disconnects between words and behavior.

5. timeline_of_notable_moments — Key behavioral shifts with timestamps.

CRITICAL — RETURN VALID JSON ONLY. No markdown, no extra text before or after.
Each category (overall_demeanor, key_body_signals, stress_signals, credible_assessment) MUST have:
- score: number 0-100
- score_reason: ONE clear sentence explaining the score
- summary: 1-2 sentence summary of observations

timeline_of_notable_moments MUST be an array of objects: { "moment": "description", "timestamp": "0:45" }

{
  "overall_demeanor": { "score": 75, "score_reason": "...", "summary": "..." },
  "key_body_signals": { "score": 70, "score_reason": "...", "summary": "..." },
  "stress_signals": { "score": 65, "score_reason": "...", "summary": "..." },
  "credible_assessment": { "score": 80, "score_reason": "...", "summary": "..." },
  "timeline_of_notable_moments": [{ "moment": "...", "timestamp": "0:45" }]
}

Remember: This is a DEPOSITION. Calm and still = GOOD. Expressive and animated = RISKY.`;

/** Get the hardcoded body analysis prompt (not from DB). */
function getBodyAnalysisPrompt() {
  return BODY_ANALYSIS_PROMPT;
}

let _ai = null;
function getAI() {
  if (!_ai) {
    const apiKey = process.env.AI_STUDIO_GEMINI_API_KEY;
    if (!apiKey) throw new Error('AI_STUDIO_GEMINI_API_KEY is not set');
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
}

async function withRetry(fn, { maxRetries = 2, baseDelay = 2000, label = '' } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = baseDelay * Math.pow(2, attempt);
      if (label) console.warn(`[${label}] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, err.message);
      await sleep(delay);
    }
  }
}

/**
 * Analyze a YouTube video for body language.
 */
async function analyzeVideoUrl(youtubeUrl, promptText) {
  const ai = getAI();
  const start = Date.now();

  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { text: promptText },
              { fileData: { fileUri: youtubeUrl } },
            ],
          },
        ],
      }),
    { maxRetries: 2, label: 'analyzeVideoUrl' },
  );

  const durationMs = Date.now() - start;
  const text = extractText(response);
  return { text, model: MODEL, durationMs };
}

/**
 * Upload a local video file to Gemini Files API, wait for ACTIVE, then analyze.
 *
 * @param {string} filePath – path to the (already-resized) video on disk
 * @param {string} mimeType – e.g. "video/mp4"
 * @param {string} promptText
 */
async function analyzeVideoFile(filePath, mimeType, promptText) {
  const ai = getAI();
  const start = Date.now();

  // 1. Upload to Gemini Files API
  let uploaded = await ai.files.upload({
    file: filePath,
    config: { mimeType },
  });

  // 2. Poll until ACTIVE (video processing can take a while)
  const maxWait = 5 * 60 * 1000; // 5 minutes
  const pollInterval = 5000;
  const deadline = Date.now() + maxWait;

  while (uploaded.state === 'PROCESSING' && Date.now() < deadline) {
    await sleep(pollInterval);
    uploaded = await ai.files.get({ name: uploaded.name });
  }

  if (uploaded.state === 'FAILED') {
    throw new Error('Gemini file processing failed');
  }
  if (uploaded.state !== 'ACTIVE') {
    throw new Error('Gemini file processing timed out (state: ' + uploaded.state + ')');
  }

  // 3. Generate content using the uploaded file (with retry)
  const response = await withRetry(
    () =>
      ai.models.generateContent({
        model: MODEL,
        contents: [
          {
            role: 'user',
            parts: [
              { text: promptText },
              { fileData: { fileUri: uploaded.uri, mimeType: uploaded.mimeType } },
            ],
          },
        ],
      }),
    { maxRetries: 2, label: 'analyzeVideoFile' },
  );

  const durationMs = Date.now() - start;
  const text = extractText(response);

  // 4. Clean up remote file (fire-and-forget)
  ai.files.delete({ name: uploaded.name }).catch(() => {});

  return { text, model: MODEL, durationMs };
}

function extractText(response) {
  return (
    response.text ||
    (response.candidates &&
      response.candidates[0] &&
      response.candidates[0].content &&
      response.candidates[0].content.parts &&
      response.candidates[0].content.parts.map((p) => p.text).join('')) ||
    ''
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { analyzeVideoUrl, analyzeVideoFile, getBodyAnalysisPrompt, MODEL };
