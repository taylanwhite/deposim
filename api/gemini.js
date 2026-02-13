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
const BODY_ANALYSIS_PROMPT = `You are an expert body language and behavioral analyst specializing in deposition video review. Analyze this video carefully.

For each of the following categories, provide:
1. overall_demeanor — General composure, confidence, emotional state
2. key_body_signals — Non-verbal cues (eye movement, posture, gestures, facial expressions, head tilts, lip compression, adaptors)
3. stress_signals — Discomfort, anxiety, deception (gaze aversion, blink rate, throat clearing, fidgeting, defensive posturing)
4. credible_assessment — Consistency between verbal and non-verbal signals
5. timeline_of_notable_moments — Significant behavioral changes with timestamps

CRITICAL — RETURN VALID JSON ONLY. No markdown, no extra text before or after.
Each category (overall_demeanor, key_body_signals, stress_signals, credible_assessment) MUST have:
- score: number 0-100
- score_reason: string explaining why that score
- summary: string brief summary

timeline_of_notable_moments MUST be an array of objects: { "moment": "description", "timestamp": "0:45" }

Example structure:
{
  "overall_demeanor": { "score": 75, "score_reason": "...", "summary": "..." },
  "key_body_signals": { "score": 70, "score_reason": "...", "summary": "..." },
  "stress_signals": { "score": 65, "score_reason": "...", "summary": "..." },
  "credible_assessment": { "score": 80, "score_reason": "...", "summary": "..." },
  "timeline_of_notable_moments": [{ "moment": "...", "timestamp": "0:45" }]
}

Every score must be 0-100. Every message/category must include score, score_reason, and summary.`;

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

/**
 * Analyze a YouTube video for body language.
 */
async function analyzeVideoUrl(youtubeUrl, promptText) {
  const ai = getAI();
  const start = Date.now();

  const response = await ai.models.generateContent({
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
  });

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

  // 3. Generate content using the uploaded file
  const response = await ai.models.generateContent({
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
  });

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
