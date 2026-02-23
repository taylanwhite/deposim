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

const STAGE_SCORING_CONTEXT = {
  1: {
    name: 'Background & Employment',
    topics: 'Personal identification, family status, education, full employment history (10+ years), legal and financial background',
    expectedRange: '45–65 Q/A exchanges',
  },
  2: {
    name: 'Accident & Aftermath',
    topics: 'Incident details (time, location, speed, mechanism), scene description, police/first responders, ER visit and immediate symptoms',
    expectedRange: '52–67 Q/A exchanges',
  },
  3: {
    name: 'Medical History & Treatment Discovery',
    topics: 'Prior injuries/medical history, how providers were found (referral chains), clinic legitimacy, treatment timeline and gaps',
    expectedRange: '50–63 Q/A exchanges',
  },
  4: {
    name: 'Treatment Details & Current Condition',
    topics: 'Specific treatments received, current pain/condition, daily activity limitations, work/income impact, financial motive, social media activity',
    expectedRange: '83–102 Q/A exchanges',
  },
};

const SYSTEM_PROMPT = `You are evaluating a deposition practice simulation. You assess the plaintiff-deponent's testimony from the perspective of CASE RISK — how much ammunition did the deponent hand the opposing defense attorney?

You rate ONLY what is in the transcript. Never invent or hallucinate Q/A.

CRITICAL — You MUST score EVERY user (A:) message in turn_scores. Never return turn_scores: [] when there are A: lines.
Even brief responses ("I'm ready", "Yes", stating their name) get a turn_score entry.

===== SCORING METHODOLOGY =====

The score reflects TWO factors: COMPLETION and ANSWER QUALITY.

COMPLETION (how far the deponent made it):
- Count the deponent (A:) responses. The stage context (provided below) tells you how many Q/A exchanges a complete stage should have.
- A deponent who quit early, disconnected, or only answered a few questions is a liability. A real defense attorney does not let witnesses leave early.
- Fewer than 5 answers: score MUST be 0–10 regardless of quality.
- 5–15 answers: score CAPPED at 30. The deponent barely participated.
- 15–25 answers: score CAPPED at 50. Incomplete session.
- 25+ answers: full 0–100 range based on answer quality.
- If the deponent completed the entire stage (close to the expected range), completion does not penalize.

ANSWER QUALITY (how safe/disciplined the answers were):
Think like a defense attorney looking for ammunition. Every mistake is exploitable.

SAFE answers (score higher):
- Answers ONLY the question asked — nothing more
- Short and direct
- "I don't know" / "I don't recall" when genuinely uncertain
- Asks for clarification on ambiguous questions
- Calm, measured delivery

DANGEROUS answers (score lower):
- Volunteering information beyond the question (MAJOR — this is the #1 deposition mistake)
- Speculating: "I think…", "probably…", "maybe…", "I believe…"
- Absolutes: "always", "never", "every time"
- Narrative answers to yes/no questions
- Emotional, defensive, or argumentative responses
- INTERRUPTING the attorney (score that answer 1–30)
- Contradicting earlier testimony
- Legal conclusions or opinions about fault/liability
- Discussing attorney communications (privilege waiver)
- Guessing at specifics (dates, times, speeds, distances)

SCORING SCALE — be strict and realistic:
- 85–100: Excellent. Completed the stage, disciplined answers, gave defense nothing useful. Rare.
- 70–84: Good. Completed most of the stage with mostly safe answers. Minor slips only.
- 50–69: Mixed. Some safe answers but noticeable volunteering, speculation, or gaps.
- 30–49: Poor. Multiple dangerous answers, early termination, or significant quality problems.
- 10–29: Bad. Frequent problems OR barely participated. Defense has strong material.
- 0–9: Failed. Essentially no meaningful participation.

CRITICAL RULES:
- Do NOT inflate scores. A real attorney would exploit every mistake at trial.
- If the coach/agent labeled answers as RISKY or BAD in the transcript, that is strong evidence for a low score.
- Do NOT give high scores just because some answers were acceptable — evaluate the WHOLE performance.
- score_reason must be ONE clear sentence a non-lawyer would understand. Examples:
  "Completed the stage with disciplined, concise answers and minimal volunteering."
  "Only answered 8 questions before the session ended — insufficient preparation."
  "Volunteered accident details during background questions and speculated about fault on two occasions."
  "Good composure but gave narrative answers to several yes/no questions, giving opposing counsel extra material."`;

const STAGE_NAMES = {
  1: 'Background & Employment',
  2: 'Accident & Aftermath',
  3: 'Medical History & Treatment Discovery',
  4: 'Treatment Details & Current Condition',
};

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
 * @param {number|null} stageNum - Stage number (1-4) for context
 */
function buildMessages(conversationText, scorePrompt = null, stageNum = null) {
  const stageCtx = stageNum && STAGE_SCORING_CONTEXT[stageNum];
  const stagePrefix = stageCtx
    ? `STAGE CONTEXT: This is Stage ${stageNum} of 4 — "${stageCtx.name}". ` +
      `Expected topics: ${stageCtx.topics}. ` +
      `A complete stage typically involves ${stageCtx.expectedRange}.\n\n`
    : '';

  const aCount = (conversationText.match(/^A: /gm) || []).length;
  const userContent =
    stagePrefix +
    'Rate this deposition practice conversation (Q = questioner/attorney, A = deponent/witness). ' +
    `There are ${aCount} deponent (A:) responses. ` +
    'If any A: line answers a question, you MUST give score 1–100 and rate those answers. ' +
    'Only use score 0 when there are literally no A: lines. ' +
    'If the Q (coach) labels any A as RISKY or BAD, the score must be low.\n\n' +
    conversationText +
    (aCount > 0 ? `\n\n[There are ${aCount} deponent (A:) responses above. You MUST return exactly ${aCount} turn_scores objects.]` : '');

  const custom = scorePrompt && String(scorePrompt).trim();
  const systemContent = (custom || SYSTEM_PROMPT) + SCORE_OUTPUT_FORMAT;

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}

/**
 * Call OpenAI GPT-4o and parse score + analysis.
 *
 * @param {Array} transcript - ElevenLabs transcript array
 * @param {string|null} [scorePrompt] - Optional system prompt from DB. When provided, replaces the default prompt (allows dynamic scoring strictness).
 * @returns {{ success: boolean, score?: number, scoreReason?: string, fullAnalysis?: string, error?: string }}
 */
async function analyzeDeposition(transcript, scorePrompt = null, stageNum = null) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { success: false, error: 'OPENAI_API_KEY not set' };

  const conversationText = transcriptToText(transcript);
  if (!conversationText) return { success: false, error: 'Transcript is empty or has no readable Q/A turns.' };

  const messages = buildMessages(conversationText, scorePrompt, stageNum);

  let raw;
  try {
    raw = await withRetry(
      async () => {
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
        const data = await resp.json();
        if (data.error) throw new Error('OpenAI API error: ' + (data.error.message || JSON.stringify(data.error)));
        return data;
      },
      { maxRetries: 2, baseDelay: 2000, label: 'analyzeDeposition' },
    );
  } catch (err) {
    return { success: false, error: err.message || 'OpenAI request failed' };
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

/**
 * Retry wrapper with exponential backoff.
 */
async function withRetry(fn, { maxRetries = 2, baseDelay = 1500, label = '' } = {}) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = baseDelay * Math.pow(2, attempt);
      if (label) console.warn(`[${label}] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, err.message);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

/**
 * Generate an AI-written simulation summary for the Simulation.scoreReason field.
 * Replaces the old debug-style "Average of N stage(s): ..." string.
 *
 * @param {Array<{stage: number, name: string, score: number|null, bodyScore: number|null, scoreReason: string|null}>} stages
 * @returns {Promise<string|null>}
 */
async function generateSimulationSummary(stages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !stages || stages.length === 0) return null;

  const stageLines = stages.map((s) => {
    const transcript = s.score != null ? `${s.score}/100` : 'not scored';
    const body = s.bodyScore != null ? `${s.bodyScore}/100` : 'not scored';
    const avg =
      s.score != null && s.bodyScore != null
        ? Math.round((s.score + s.bodyScore) / 2)
        : s.score ?? s.bodyScore ?? null;
    return `Stage ${s.stage} (${s.name}): Transcript ${transcript}, Body Language ${body}, Combined ${avg != null ? avg + '/100' : '—'}${s.scoreReason ? ` — "${s.scoreReason}"` : ''}`;
  });

  const messages = [
    {
      role: 'system',
      content:
        'You are summarizing a deposition simulation performance for a plaintiff preparing for their real deposition. ' +
        'Write exactly 2–3 sentences that a non-lawyer client would understand. Be direct about strengths and weaknesses. ' +
        'Do not use legal jargon. Do not list every stage — synthesize the overall performance. ' +
        'If scores are low, be honest about what needs improvement. If scores are high, acknowledge strong performance. ' +
        'Return ONLY the summary text — no JSON, no formatting, no labels.',
    },
    {
      role: 'user',
      content: `Summarize this deponent's simulation performance:\n\n${stageLines.join('\n')}`,
    },
  ];

  try {
    const resp = await withRetry(
      async () => {
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: 250, temperature: 0.4 }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!r.ok) throw new Error(`OpenAI ${r.status}`);
        return r.json();
      },
      { maxRetries: 1, label: 'generateSimulationSummary' },
    );
    return resp.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.error('[generateSimulationSummary] Failed:', err.message);
    return null;
  }
}

module.exports = { transcriptToText, analyzeDeposition, getDefaultScorePrompt, generateSimulationSummary, withRetry, STAGE_NAMES };
