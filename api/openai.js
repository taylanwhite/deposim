/**
 * OpenAI deposition transcript analysis.
 * Port of functions/chatcompletion.php.
 *
 * Env: OPENAI_API_KEY
 */

/**
 * Convert ElevenLabs transcript array to Q/A text.
 * Each turn has { role: 'agent'|'user', message } or { original_message }.
 */
function transcriptToText(transcript) {
  if (!Array.isArray(transcript)) return '';
  const lines = [];
  for (const t of transcript) {
    if (!t || typeof t !== 'object') continue;
    const role = String(t.role || 'unknown').trim().toLowerCase();
    const msg = String(t.message || t.original_message || '').trim();
    if (!msg) continue;
    const label = role === 'agent' ? 'Q' : 'A';
    lines.push(`${label}: ${msg}`);
  }
  return lines.join('\n\n');
}

const SYSTEM_PROMPT = `You are a deposition conversation rater. You rate ONLY what is in the transcript. You never invent, assume, or hallucinate Q/A that is not there.

CRITICAL — When to give win_ready 0 (and ONLY then):
- win_ready 0 ONLY when: (1) there are zero "A:" lines, OR (2) every "A:" line is purely a greeting with no deposition content (e.g. only "Hi", "Hello", "Hello?" and no Q/A about case type, role, danger topics, or any deposition question).
- If there is ANY "A:" line that answers a question (case type, role, facts, danger topics, or any deposition-style Q), you MUST rate the conversation. Give a score 1–100 and analyze. Short answers like "Injury." or "Personal injury" COUNT. Interrupted or rambling answers COUNT. "I was in an accident..." COUNTS. Even one substantive deponent answer means you MUST rate, not 0.
- Do NOT return 0 claiming "partial Q/A" or "no full deponent answers" when the transcript clearly has A: lines answering questions. Rate what is there.

When there ARE deponent answers to rate:
- Be blunt. Flag volunteering, guessing/speculating, "always/never," motives/intent, legal conclusions, privilege/work-product.
- No legal advice. Communication coaching only.
- Quote only exact Q/A from the transcript for risky moments. If there are fewer than 5 risky moments, list only what exists.

SCORING — Be strict. win_ready reflects how safe and disciplined the deponent's ACTUAL answers were.
- Do NOT inflate the score because the deponent "corrected later" or "improved." Rate the performance as a whole. Each bad answer counts.
- If the transcript shows the coach/agent labeling answers as RISKY or BAD, treat that as strong evidence; the score must be low.
- 75–100: Mostly safe, disciplined answers; at most minor slip-ups. Reserved for strong performance.
- 50–74: Some safe answers but several RISKY moments.
- 25–49: Multiple RISKY answers or at least one BAD answer; undisciplined.
- 1–24: Multiple BAD answers, or emotional/off-topic/volunteering to simple questions (e.g. "I'm mad at my boss" for case type, "I got rear-ended" for role) = score in the teens or low 20s. Do not give 75 when the deponent gave answers the coach called RISKY and BAD.

Output (when there is something to rate):
1) win_ready (1–100). Use the scale above. Use 0 only when there are literally no substantive A: answers (see above).
2) Top 5 risky moments: quote the exact Q/A from the transcript only, label the risk, safer rewrite.
3) 3 patterns to fix.
4) 3 short rules to follow next time.
5) 5 drill questions based on risks you actually saw; then grade + rewrite for each. End with: "What are your 3 danger topics for the next depo?"

You MUST start your response with a JSON block on its own line, exactly:
{"win_ready": <number 0-100>, "win_ready_reason": "<short explanation>"}
After the JSON line, provide the full analysis. When win_ready is 0 (only when no substantive A: lines), keep the analysis short.`;

/**
 * Build the messages array for OpenAI chat completion.
 */
function buildMessages(conversationText) {
  const userContent =
    'Rate this deposition practice conversation (Q = questioner/attorney, A = deponent/witness). ' +
    'Count the A: lines. If any A: line answers a question about the case, role, or facts, you MUST give win_ready 1–100 and rate those answers. ' +
    'Only use win_ready 0 when there are no A: lines or every A: is just a greeting like Hi/Hello. ' +
    'If the Q (coach) in the transcript labels any A as RISKY or BAD, the win_ready score must be low (typically 1–30); ' +
    'do not give 75 for performance that included RISKY and BAD answers.\n\n' +
    conversationText;

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent },
  ];
}

/**
 * Call OpenAI GPT-4o and parse win_ready + analysis.
 *
 * @param {Array} transcript - ElevenLabs transcript array
 * @returns {{ success: boolean, winReady?: number, winReadyReason?: string, fullAnalysis?: string, error?: string }}
 */
async function analyzeDeposition(transcript) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { success: false, error: 'OPENAI_API_KEY not set' };

  const conversationText = transcriptToText(transcript);
  if (!conversationText) return { success: false, error: 'Transcript is empty or has no readable Q/A turns.' };

  const messages = buildMessages(conversationText);

  let raw;
  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: 'gpt-4o', messages }),
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

  // Parse win_ready JSON line
  let winReady = null;
  let winReadyReason = '';

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed[0] !== '{') continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.win_ready === 'number') {
        winReady = Math.max(0, Math.min(100, Math.round(parsed.win_ready)));
        winReadyReason = String(parsed.win_ready_reason || '');
        break;
      }
    } catch { /* not JSON, skip */ }
  }

  // Fallback regex extraction
  if (winReady === null) {
    const m = content.match(/"win_ready"\s*:\s*(\d+)/);
    if (m) winReady = Math.max(0, Math.min(100, parseInt(m[1], 10)));
  }
  if (!winReadyReason) {
    const m = content.match(/"win_ready_reason"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) winReadyReason = m[1].replace(/\\(.)/g, '$1');
  }

  return {
    success: true,
    winReady: winReady ?? 0,
    winReadyReason,
    fullAnalysis: content,
  };
}

module.exports = { transcriptToText, analyzeDeposition };
