/**
 * OpenAI deposition transcript analysis.
 * Port of functions/chatcompletion.php.
 *
 * Env: OPENAI_API_KEY
 */

/**
 * Convert ElevenLabs transcript array to Q/A text.
 * Supports: role/message, role/original_message, speaker/text, role/content.
 */
function transcriptToText(transcript) {
  if (!Array.isArray(transcript)) return '';
  const lines = [];
  for (const t of transcript) {
    if (!t || typeof t !== 'object') continue;
    const role = String(t.role || t.speaker || 'unknown').trim().toLowerCase();
    const msg = String(t.message || t.original_message || t.text || t.content || '').trim();
    if (!msg) continue;
    const label = role === 'agent' || role === 'assistant' ? 'Q' : 'A';
    lines.push(`${label}: ${msg}`);
  }
  return lines.join('\n\n');
}

const SYSTEM_PROMPT = `You are a deposition conversation rater. You rate ONLY what is in the transcript. You never invent, assume, or hallucinate Q/A that is not there.

CRITICAL — You MUST score EVERY user (A:) message in turn_scores. Never return turn_scores: [] when there are any A: lines.
- "Substantive" includes: confirming readiness ("I'm ready"), acknowledging rules ("I understand", "I know"), giving name when asked, case type, role, any response to a Q. Even "Hi" or "Yes" gets a turn_score (rate how appropriate it was).
- score 0 overall ONLY when there are literally zero "A:" lines in the transcript.
- Do NOT return 0 claiming "partial Q/A" or "no full deponent answers" when the transcript clearly has A: lines answering questions. Rate what is there.

When there ARE deponent answers to rate:
- Be blunt. Flag volunteering, guessing/speculating, "always/never," motives/intent, legal conclusions, privilege/work-product.
- INTERRUPTING the questioner is a major error — score 1–30 for any answer that interrupts, talks over, or responds before the attorney finishes. Phrases like "I know we're all ready" or "we're good" when cutting off the attorney = low score.
- No legal advice. Communication coaching only.
- Quote only exact Q/A from the transcript for risky moments. If there are fewer than 5 risky moments, list only what exists.

SCORING — Be strict. score reflects how safe and disciplined the deponent's ACTUAL answers were.
- Do NOT inflate the score because the deponent "corrected later" or "improved." Rate the performance as a whole. Each bad answer counts.
- If the transcript shows the coach/agent labeling answers as RISKY or BAD, treat that as strong evidence; the score must be low.
- 75–100: Mostly safe, disciplined answers; at most minor slip-ups. Reserved for strong performance.
- 50–74: Some safe answers but several RISKY moments.
- 25–49: Multiple RISKY answers or at least one BAD answer; undisciplined.
- 1–24: Multiple BAD answers, or emotional/off-topic/volunteering to simple questions (e.g. "I'm mad at my boss" for case type, "I got rear-ended" for role) = score in the teens or low 20s. Do not give 75 when the deponent gave answers the coach called RISKY and BAD.

Output (when there is something to rate):
1) score (1–100). Use the scale above. Use 0 only when there are literally no substantive A: answers (see above).
2) Top 5 risky moments: quote the exact Q/A from the transcript only, label the risk, safer rewrite.
3) 3 patterns to fix.
4) 3 short rules to follow next time.
5) 5 drill questions based on risks you actually saw; then grade + rewrite for each. End with: "What are your 3 danger topics for the next depo?"

You MUST start your response with a JSON block on its own line. The JSON MUST include:
- "score": number 0-100
- "score_reason": string
- "turn_scores": array of objects for EACH user (A:) response. Pair each A: with the immediately preceding Q:.
  Each turn_scores item: { "question": "exact Q text", "response": "exact A text", "score": 0-100, "score_reason": "why this rating", "improvement": "what to do better" }
  Order matches transcript order. If no A: responses, turn_scores is [].

Example: {"score": 72, "score_reason": "Several risky moments", "turn_scores": [{"question": "What type of case?", "response": "Personal injury", "score": 85, "score_reason": "Brief, accurate", "improvement": "None needed"}]}

After the JSON line, provide the full analysis (do NOT repeat the score or score_reason). When score is 0 (only when no substantive A: lines), keep the analysis short.`;

/**
 * ALWAYS appended to whatever score prompt is in the database. Ensures valid JSON with per-answer scores.
 */
const SCORE_OUTPUT_FORMAT = `

CRITICAL OUTPUT FORMAT — Your response MUST be exactly one valid JSON object. Nothing else. No markdown, no code blocks, no extra text.

{
  "score": <0-100 overall>,
  "score_reason": "<string>",
  "turn_scores": [
    {
      "question": "<exact Q text from transcript>",
      "response": "<exact A text from transcript>",
      "score": <0-100 for THIS answer>,
      "score_reason": "<why this specific answer got this rating>",
      "improvement": "<what to do better>"
    }
  ],
  "full_analysis": "<markdown analysis: risky moments, patterns to fix, rules to follow, drill questions>"
}

Rules for turn_scores:
- Include exactly one object for EACH user (A:) response in the transcript.
- CRITICAL: "question" MUST be the exact text of the PRECEDING agent (Q:) message — i.e. the question the user was answering. NEVER use the agent's FOLLOW-UP (the message that comes AFTER the user's answer).
- Each "score" is 0–100: how well that specific answer addressed the preceding question (brief, on-point, no volunteering = higher).
- INTERRUPTING = very low score (1–30). If the deponent's response appears to interrupt the interviewer (e.g. answering before the Q is finished, or saying things like "I know we're all ready" / "we're good" when the attorney was mid-sentence or mid-explanation), score it 1–30. Never give 100% for an answer that interrupted the questioner.
- Order MUST match transcript order (first user reply → first turn_score, etc.).
- For "greetings" or minimal responses ("I'm ready", "Hi", "I understand"): still include a turn_score. NEVER return empty turn_scores when there are A: lines.`;

/**
 * Build the messages array for OpenAI chat completion.
 * @param {string} conversationText - Q/A transcript
 * @param {string|null} scorePrompt - Optional system prompt from DB; when provided, replaces the default
 */
function buildMessages(conversationText, scorePrompt = null) {
  const userContent =
    'Rate this deposition practice conversation (Q = questioner/attorney, A = deponent/witness). ' +
    'Count the A: lines. If any A: line answers a question about the case, role, or facts, you MUST give score 1–100 and rate those answers. ' +
    'Only use score 0 when there are no A: lines or every A: is just a greeting like Hi/Hello. ' +
    'If the Q (coach) in the transcript labels any A as RISKY or BAD, the score must be low (typically 1–30); ' +
    'do not give 75 for performance that included RISKY and BAD answers.\n\n' +
    conversationText;

  const custom = scorePrompt && String(scorePrompt).trim();
  // Always append strict JSON format so we reliably get turn_scores
  const systemContent = (custom || SYSTEM_PROMPT) + SCORE_OUTPUT_FORMAT;

  const aCount = (conversationText.match(/^A: /gm) || []).length;
  const userContentWithCount = userContent + (aCount > 0 ? `\n\n[There are ${aCount} deponent (A:) responses above. You MUST return exactly ${aCount} turn_scores objects.]` : '');

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContentWithCount },
  ];
}

/**
 * Call OpenAI GPT-4o and parse score + analysis.
 *
 * @param {Array} transcript - ElevenLabs transcript array
 * @param {string|null} [scorePrompt] - Optional system prompt from DB. When provided, replaces the default prompt (allows dynamic scoring strictness).
 * @returns {{ success: boolean, score?: number, scoreReason?: string, fullAnalysis?: string, error?: string }}
 */
async function analyzeDeposition(transcript, scorePrompt = null) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { success: false, error: 'OPENAI_API_KEY not set' };

  const conversationText = transcriptToText(transcript);
  if (!conversationText) return { success: false, error: 'Transcript is empty or has no readable Q/A turns.' };

  const messages = buildMessages(conversationText, scorePrompt);

  let raw;
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    raw = await resp.json();
  } catch (err) {
    return { success: false, error: 'OpenAI request failed: ' + err.message };
  }

  if (raw.error) {
    return { success: false, error: 'OpenAI API error: ' + (raw.error.message || JSON.stringify(raw.error)) };
  }

  const content = raw.choices?.[0]?.message?.content || '';
  if (!content) return { success: false, error: 'Empty content in OpenAI response.' };

  let score = null;
  let scoreReason = '';
  let fullAnalysisText = '';
  let turnScores = null;

  // With response_format: json_object, entire response is valid JSON
  try {
    const parsed = JSON.parse(content.trim());
    if (typeof parsed.score === 'number') {
      score = Math.max(0, Math.min(100, Math.round(parsed.score)));
      scoreReason = String(parsed.score_reason || '');
      fullAnalysisText = String(parsed.full_analysis || '');
      if (Array.isArray(parsed.turn_scores)) {
        turnScores = parsed.turn_scores.map((t) => ({
          question: t.question,
          response: t.response,
          score: typeof t.score === 'number' ? Math.max(0, Math.min(100, Math.round(t.score))) : 0,
          score_reason: t.score_reason,
          improvement: t.improvement,
        }));
      }
    }
  } catch {
    // Fallback: try to find JSON block (for older responses without json_object)
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed[0] !== '{') continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed.score === 'number') {
          score = Math.max(0, Math.min(100, Math.round(parsed.score)));
          scoreReason = String(parsed.score_reason || '');
          if (Array.isArray(parsed.turn_scores)) turnScores = parsed.turn_scores;
          const jsonLineEnd = content.indexOf(trimmed) + trimmed.length;
          fullAnalysisText = content.slice(jsonLineEnd).trim();
          break;
        }
      } catch { /* skip */ }
    }
  }

  // Retry for turn_scores only when AI returned empty but transcript has user messages
  const aCount = (conversationText.match(/^A: /gm) || []).length;
  if ((!turnScores || turnScores.length === 0) && aCount > 0) {
    const turnOnly = await fetchTurnScoresOnly(conversationText, aCount, apiKey);
    if (turnOnly && turnOnly.length > 0) turnScores = turnOnly;
  }

  return {
    success: true,
    score: score ?? 0,
    scoreReason,
    fullAnalysis: fullAnalysisText || content,
    turnScores: turnScores || [],
  };
}

/**
 * Second call: focused prompt that ONLY asks for turn_scores. Used when main call returns empty.
 */
async function fetchTurnScoresOnly(conversationText, expectedCount, apiKey) {
  const system = `You are a deposition rater. Return ONLY a JSON object with one key "turn_scores" (array).
For EACH "A:" line in the transcript, output exactly one object: { "question": "<preceding Q: text>", "response": "<A: text>", "score": 0-100, "score_reason": "<why>", "improvement": "<suggestion>" }.
The transcript has ${expectedCount} A: lines. You MUST return exactly ${expectedCount} objects. Empty array is invalid.`;

  const user = `Transcript:\n\n${conversationText}\n\nReturn JSON: { "turn_scores": [ ... ] }`;

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    const raw = await resp.json();
    if (raw.error) return null;
    const content = raw.choices?.[0]?.message?.content || '';
    const parsed = JSON.parse(content.trim());
    if (!Array.isArray(parsed.turn_scores)) return null;
    return parsed.turn_scores.map((t) => ({
      question: t.question,
      response: t.response,
      score: typeof t.score === 'number' ? Math.max(0, Math.min(100, Math.round(t.score))) : 0,
      score_reason: t.score_reason,
      improvement: t.improvement,
    }));
  } catch {
    return null;
  }
}

/** Default score analysis prompt (for creating first score prompt from UI) */
function getDefaultScorePrompt() {
  return SYSTEM_PROMPT;
}

module.exports = { transcriptToText, analyzeDeposition, getDefaultScorePrompt };
