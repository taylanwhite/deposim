import { useState, useEffect, useRef } from 'react';
import { Routes, Route } from 'react-router-dom';
import './App.css';
import SimPage from './SimPage';

const API = '/api';


const DEFAULT_CASE_DESCRIPTION = `My client Mr. Steve Smith was injured when he was traveling North on State Road 441 in Boca Raton. While stopped at a light at the intersection of Clintmore road and 441, Mr. Smith was rear ended by Defendant Jane Doe. Mr. Smith was transported by ems to West Boca Regional Medial Center for neck and back pain. The property damage to his car was over $5,000. Since the accident Mr. Smith has treated with a chiropractor, had a mri which had positive findings and has a surgical recommendation. The policy limits of the defendant are $100k.`;

/* ===== Tile accent (purple gradient family to match marketing) ===== */
const TILE_ACCENTS = [
  'rgba(98, 54, 255, 0.5)', 'rgba(124, 77, 255, 0.5)', 'rgba(190, 41, 236, 0.5)',
  'rgba(98, 54, 255, 0.35)', 'rgba(190, 41, 236, 0.35)',
];
function tileAccent(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return TILE_ACCENTS[Math.abs(h) % TILE_ACCENTS.length];
}

/* ===== SVG Icons ===== */
const Icons = {
  cases: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    </svg>
  ),
  clients: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  sims: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
  car: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17h14M5 17a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1l2-3h8l2 3h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2M5 17a2 2 0 1 0 4 0m6 0a2 2 0 1 0 4 0m-10 0h6"/>
    </svg>
  ),
  walking: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="4" r="2"/><path d="M14 9l-2 7-3 3"/><path d="M10 9l-3 7"/><path d="M10 16l4 4"/><path d="M14 9l3 3"/>
    </svg>
  ),
  filter: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="10" y1="18" x2="14" y2="18"/>
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
};

/* ===== Inline AI Coach for any prompt ===== */
function PromptCoachInline({ prompt, onPromptUpdated, showToast }) {
  const { id, type, name, content } = prompt || {};
  const typeLabel = TYPE_LABELS[type] || type;
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `I help you refine the **${name || typeLabel}** prompt. Describe what you want to change — e.g. "make it shorter", "add more detail", "be more strict" — and I'll suggest a revised version you can apply.` },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSuggested, setLastSuggested] = useState(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { setLastSuggested(null); }, [id]);

  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || !id) return;
    const userMsg = { role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setSending(true);
    setLastSuggested(null);
    try {
      const r = await fetch(API + '/chat/prompt-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated, promptId: id, promptType: type, promptContent: content, promptName: name }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
      if (data.suggestedPrompt) setLastSuggested(data.suggestedPrompt);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong: ' + err.message }]);
    } finally { setSending(false); }
  };

  const handleApply = async () => {
    if (!lastSuggested || !id) return;
    try {
      const r = await fetch(API + '/prompts/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: lastSuggested }),
      });
      if (!r.ok) throw new Error('Failed');
      setLastSuggested(null);
      showToast?.('Prompt updated');
      onPromptUpdated?.();
      window.dispatchEvent(new CustomEvent('deposim-prompts-updated'));
    } catch (e) {
      console.error('Apply failed:', e);
    }
  };

  if (!prompt) return null;
  return (
    <div className="prompt-coach-inline">
      <button type="button" className="prompt-coach-toggle" onClick={() => setCoachOpen(o => !o)}>
        <span>AI Coach</span>
        <span className={`prompt-chevron${coachOpen ? ' open' : ''}`}>›</span>
      </button>
      {coachOpen && (
        <div className="coach-chat coach-embedded">
          <div className="coach-messages">
            {messages.map((m, i) => (
              <div key={i} className={`coach-msg ${m.role}`}>
                <div className="coach-msg-bubble">{m.content}</div>
              </div>
            ))}
            {sending && <div className="coach-msg assistant"><div className="coach-msg-bubble coach-typing">Thinking…</div></div>}
            <div ref={chatEndRef} />
          </div>
          {lastSuggested && (
            <div className="coach-apply-bar">
              <button className="btn primary btn-sm" onClick={handleApply}>Apply to {name || typeLabel}</button>
            </div>
          )}
          <form className="coach-input-bar" onSubmit={handleSend}>
            <input className="coach-input" value={input} onChange={e => setInput(e.target.value)} placeholder={`Describe how you want to adjust this prompt…`} disabled={sending} />
            <button className="coach-send-btn" type="submit" disabled={sending || !input.trim()}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/* ===== Simulation Coach Chat (on simulation detail page) ===== */
function SimulationCoachChat({ simulationId, introMessage }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: introMessage || 'Ask me anything about this simulation — why the score was what it was, what to improve, or deposition strategy.' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    const userMsg = { role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setSending(true);
    try {
      const r = await fetch(API + '/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated, simulationId: simulationId || null }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong: ' + err.message }]);
    } finally { setSending(false); }
  };

  const quickQuestions = ['Why was the score low?', 'What should I improve?', 'Give me 3 tips', 'What did I do well?'];

  return (
    <div className="coach-chat coach-embedded">
      <div className="coach-messages">
        {messages.map((m, i) => (
          <div key={i} className={`coach-msg ${m.role}`}>
            <div className="coach-msg-bubble">{m.content}</div>
          </div>
        ))}
        {sending && <div className="coach-msg assistant"><div className="coach-msg-bubble coach-typing">Thinking…</div></div>}
        <div ref={chatEndRef} />
      </div>
      {messages.length <= 1 && simulationId && (
        <div className="coach-quick">
          {quickQuestions.map((q, i) => (
            <button key={i} className="coach-quick-btn" onClick={() => setInput(q)} disabled={sending}>{q}</button>
          ))}
        </div>
      )}
      <form className="coach-input-bar" onSubmit={handleSend}>
        <input className="coach-input" value={input} onChange={e => setInput(e.target.value)} placeholder="Ask about this simulation…" disabled={sending} />
        <button className="coach-send-btn" type="submit" disabled={sending || !input.trim()}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </form>
    </div>
  );
}

/* ===== Simulation Feed (Sims tab) ===== */
function SimsFeed({ goDetail }) {
  const [sims, setSims] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(API + '/simulations')
      .then(r => r.ok ? r.json() : [])
      .then(setSims)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <div className="feed-header">
        <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="header-logo" />
        <h1 className="header-title">Simulations</h1>
      </div>
      {loading && <p style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>Loading…</p>}
      {!loading && sims.length === 0 && (
        <div className="coach-intro" style={{ margin: '40px 16px' }}>
          <div className="coach-intro-icon">&#127916;</div>
          <h3>No Simulations Yet</h3>
          <p>Run a DepoSim from any case to see your simulation history and analysis here.</p>
        </div>
      )}
      <div className="sims-feed">
        {sims.map(s => {
          const scoreColor = s.score >= 75 ? '#58c322' : s.score >= 50 ? '#ffab00' : '#ed4956';
          const caseName = s.case ? `${s.case.firstName || ''} ${s.case.lastName || ''}`.trim() : '';
          return (
            <button key={s.id} className="sim-feed-item" onClick={() => goDetail('simulation', s)}>
              <div className="sim-feed-score" style={{ borderColor: scoreColor, color: scoreColor }}>
                {s.score != null ? s.score + '%' : '—'}
              </div>
              <div className="sim-feed-info">
                <div className="sim-feed-title">{s.callSummaryTitle || 'Simulation'}</div>
                {caseName && <div className="sim-feed-case">{caseName}{s.case?.caseNumber ? ` · #${s.case.caseNumber}` : ''}</div>}
                <div className="sim-feed-meta">
                  {new Date(s.createdAt).toLocaleDateString()}
                  {s.callDurationSecs ? ` · ${Math.floor(s.callDurationSecs / 60)}m ${s.callDurationSecs % 60}s` : ''}
                  {s.bodyAnalysis ? ' · Body analysis' : ''}
                </div>
              </div>
              <span className="sim-feed-arrow">›</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

/* ===== Language labels ===== */
const LANG_NAMES = {
  en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
  pt: 'Portuguese', 'pt-br': 'Portuguese (BR)', pl: 'Polish', nl: 'Dutch',
  ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', hi: 'Hindi',
  ar: 'Arabic', tr: 'Turkish', sv: 'Swedish', da: 'Danish', no: 'Norwegian',
  fi: 'Finnish', el: 'Greek', cs: 'Czech', ro: 'Romanian', hu: 'Hungarian',
  id: 'Indonesian', th: 'Thai', vi: 'Vietnamese', bg: 'Bulgarian', hr: 'Croatian',
  fil: 'Filipino', ms: 'Malay', sk: 'Slovak', ta: 'Tamil', uk: 'Ukrainian',
};
const TYPE_LABELS = { system: 'System Prompt', first_message: 'First Message', media_analysis: 'Media Analysis', score: 'Score Analysis' };

/* ===== Add Score Prompt (when none exists) ===== */
function AddScorePrompt({ onCreated }) {
  const [name, setName] = useState('Score Analysis');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(API + '/prompts/default-score')
      .then(r => r.ok ? r.json() : { content: '' })
      .then(d => setContent(d.content || ''))
      .catch(() => setContent(''))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    if (!name.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(API + '/prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'score', name: name.trim(), content: content.trim(), language: null }),
      });
      if (!r.ok) throw new Error(await r.text());
      onCreated();
    } catch (e) {
      console.error('Create score prompt failed:', e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="prompt-loading">Loading default…</p>;
  return (
    <div className="prompt-lang-group">
      <p className="prompt-add-hint">No score prompt yet. Create one to control how strict the scoring is (e.g. more/less aggressive).</p>
      <div className="prompt-edit">
        <input className="input prompt-edit-name" value={name} onChange={e => setName(e.target.value)} placeholder="Prompt name" />
        <textarea className="input textarea prompt-edit-content" value={content} onChange={e => setContent(e.target.value)} rows={12} placeholder="Scoring instructions for the AI…" />
        <div className="prompt-edit-actions">
          <button className="btn primary btn-sm" onClick={handleCreate} disabled={saving}>{saving ? 'Creating…' : 'Create Score Prompt'}</button>
        </div>
      </div>
    </div>
  );
}

/* ===== Prompt Manager (Settings) ===== */
function PromptManager({ showToast }) {
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedType, setExpandedType] = useState(null);
  const [editing, setEditing] = useState(null); // { id, content, name }
  const [saving, setSaving] = useState(false);
  const [historyFor, setHistoryFor] = useState(null); // prompt id
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [langSearch, setLangSearch] = useState('');
  const [showTranslateAll, setShowTranslateAll] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [expandedHistoryItem, setExpandedHistoryItem] = useState(null);

  const load = () => {
    fetch(API + '/prompts').then(r => r.ok ? r.json() : []).then(setPrompts).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('deposim-prompts-updated', handler);
    return () => window.removeEventListener('deposim-prompts-updated', handler);
  }, []);

  // Group by type, then by language
  const grouped = {};
  for (const p of prompts) {
    if (!grouped[p.type]) grouped[p.type] = {};
    const lang = p.language || '_global';
    if (!grouped[p.type][lang]) grouped[p.type][lang] = [];
    grouped[p.type][lang].push(p);
  }
  // For each type+lang group, sort so active ones first, newest first
  for (const type of Object.keys(grouped)) {
    for (const lang of Object.keys(grouped[type])) {
      grouped[type][lang].sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    }
  }

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/prompts/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editing.content, name: editing.name }),
      });
      if (!r.ok) throw new Error('Failed');
      showToast('New version saved');

      // Check if this was an English first_message — offer to translate all
      const editedPrompt = prompts.find(p => p.id === editing.id);
      if (editedPrompt && editedPrompt.type === 'first_message' && (editedPrompt.language === 'en' || editedPrompt.language === null)) {
        setShowTranslateAll(editing.content);
      }

      setEditing(null);
      load();
    } catch { showToast('Error saving'); }
    finally { setSaving(false); }
  };

  const handleTranslateAll = async () => {
    if (!showTranslateAll) return;
    setTranslating(true);
    try {
      const r = await fetch(`${API}/prompts/translate-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ englishContent: showTranslateAll }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      showToast(`Translated to ${data.languageCount} languages (${data.updated} updated, ${data.created} created)`);
      setShowTranslateAll(false);
      load();
    } catch (err) { showToast('Translation failed: ' + err.message); }
    finally { setTranslating(false); }
  };

  const loadHistory = async (promptId) => {
    if (historyFor === promptId) { setHistoryFor(null); return; }
    setHistoryFor(promptId);
    setHistoryLoading(true);
    setExpandedHistoryItem(null);
    try {
      const r = await fetch(`${API}/prompts/${promptId}/history`);
      const data = r.ok ? await r.json() : [];
      setHistory(data);
    } catch { setHistory([]); }
    finally { setHistoryLoading(false); }
  };

  if (loading) return <p className="prompt-loading">Loading prompts…</p>;

  const typeOrder = ['system', 'first_message', 'media_analysis', 'score'];

  return (
    <div className="prompt-manager">
      {typeOrder.map(type => {
        const group = grouped[type] || {};
        const hasAny = Object.keys(group).length > 0;
        if (!hasAny) {
          // Empty: show Add for score, placeholder for others
          const isOpen = expandedType === type;
          return (
            <div key={type} className="prompt-type-group">
              <button className="prompt-type-header" onClick={() => setExpandedType(isOpen ? null : type)}>
                <div>
                  <span className="prompt-type-label">{TYPE_LABELS[type] || type}</span>
                  <span className="prompt-type-count">0</span>
                </div>
                <span className={`prompt-chevron${isOpen ? ' open' : ''}`}>›</span>
              </button>
              {isOpen && (
                <div className="prompt-type-body">
                  {type === 'score' ? <AddScorePrompt onCreated={load} /> : <p className="prompt-loading">No {TYPE_LABELS[type] || type} configured yet.</p>}
                </div>
              )}
            </div>
          );
        }
        const isOpen = expandedType === type;
        const langs = Object.keys(group).sort((a, b) => a === '_global' ? -1 : a.localeCompare(b));
        const activeCount = Object.values(group).reduce((sum, arr) => sum + arr.filter(p => p.isActive).length, 0);
        const totalCount = Object.values(group).reduce((sum, arr) => sum + arr.length, 0);

        return (
          <div key={type} className="prompt-type-group">
            <button className="prompt-type-header" onClick={() => setExpandedType(isOpen ? null : type)}>
              <div>
                <span className="prompt-type-label">{TYPE_LABELS[type] || type}</span>
                <span className="prompt-type-count">{activeCount}</span>
              </div>
              <span className={`prompt-chevron${isOpen ? ' open' : ''}`}>›</span>
            </button>

            {isOpen && (
              <div className="prompt-type-body">
                {type === 'first_message' && showTranslateAll && (
                  <div className="translate-banner">
                    <div className="translate-banner-text">
                      English first message updated. Translate all other languages to match?
                    </div>
                    <div className="translate-banner-actions">
                      <button className="btn primary btn-sm" onClick={handleTranslateAll} disabled={translating}>
                        {translating ? 'Translating…' : 'Translate All Languages'}
                      </button>
                      <button className="btn secondary btn-sm" onClick={() => setShowTranslateAll(false)} disabled={translating}>Dismiss</button>
                    </div>
                  </div>
                )}
                {type === 'first_message' && langs.length > 5 && (
                  <input
                    className="input prompt-search"
                    placeholder="Search languages…"
                    value={langSearch}
                    onChange={e => setLangSearch(e.target.value)}
                  />
                )}
                {langs.filter(lang => {
                  if (type !== 'first_message' || !langSearch.trim()) return true;
                  const q = langSearch.toLowerCase();
                  const label = (LANG_NAMES[lang] || lang).toLowerCase();
                  return label.includes(q) || lang.toLowerCase().includes(q);
                }).map(lang => {
                  const items = group[lang];
                  const active = items.find(p => p.isActive);
                  const inactive = items.filter(p => !p.isActive);
                  const langLabel = lang === '_global' ? 'Global' : (LANG_NAMES[lang] || lang);

                  return (
                    <div key={lang} className="prompt-lang-group">
                      {type === 'first_message' && <div className="prompt-lang-label">{langLabel}</div>}

                      {/* Active prompt */}
                      {active && (
                        <div className="prompt-item active">
                          {editing && editing.id === active.id ? (
                            <div className="prompt-edit">
                              <input
                                className="input prompt-edit-name"
                                value={editing.name}
                                onChange={e => setEditing({ ...editing, name: e.target.value })}
                                placeholder="Prompt name"
                              />
                              <textarea
                                className="input textarea prompt-edit-content"
                                value={editing.content}
                                onChange={e => setEditing({ ...editing, content: e.target.value })}
                                rows={6}
                              />
                              <div className="prompt-edit-actions">
                                <button className="btn secondary btn-sm" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
                                <button className="btn primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save New Version'}</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="prompt-item-header">
                                <span className="prompt-item-name">{active.name}</span>
                                <span className="prompt-item-badge active">Active</span>
                              </div>
                              <div className="prompt-item-preview">{active.content.slice(0, 200)}{active.content.length > 200 ? '…' : ''}</div>
                              <div className="prompt-item-meta">
                                {new Date(active.createdAt).toLocaleDateString()} · {active.content.length} chars
                              </div>
                              <div className="prompt-item-actions">
                                <button className="btn-link" onClick={() => setEditing({ id: active.id, content: active.content, name: active.name })}>Edit</button>
                                <button className="btn-link" onClick={() => loadHistory(active.id)}>
                                  {historyFor === active.id ? 'Hide History' : 'History'}
                                </button>
                              </div>
                              <PromptCoachInline prompt={active} onPromptUpdated={load} showToast={showToast} />
                            </>
                          )}

                          {/* History drawer */}
                          {historyFor === active.id && (
                            <div className="prompt-history">
                              {historyLoading && <p className="prompt-loading">Loading…</p>}
                              {!historyLoading && history.length === 0 && <p className="prompt-loading">No history</p>}
                              {!historyLoading && history.filter(h => h.id !== active.id).map(h => {
                                const isExpanded = expandedHistoryItem === h.id;
                                return (
                                  <div key={h.id} className="prompt-history-item" onClick={() => setExpandedHistoryItem(isExpanded ? null : h.id)}>
                                    <div className="prompt-history-meta">
                                      <span>{new Date(h.createdAt).toLocaleString()}</span>
                                      <span className={`prompt-item-badge${h.isActive ? ' active' : ''}`}>{h.isActive ? 'Active' : 'Archived'}</span>
                                    </div>
                                    <div className={`prompt-history-content${isExpanded ? ' expanded' : ''}`}>{isExpanded ? h.content : h.content.slice(0, 100) + (h.content.length > 100 ? '…' : '')}</div>
                                    {h.content.length > 100 && <span className="prompt-history-toggle">{isExpanded ? 'Show less' : 'Show full'}</span>}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Inactive versions (collapsed count) */}
                      {inactive.length > 0 && !active && (
                        <div className="prompt-item inactive">
                          <div className="prompt-item-header">
                            <span className="prompt-item-name">{inactive[0].name}</span>
                            <span className="prompt-item-badge">Archived</span>
                          </div>
                          <div className="prompt-item-preview">{inactive[0].content.slice(0, 150)}…</div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ===== Collapsible Section (for Simulation detail) ===== */
function CollapsibleSection({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`sim-detail-section sim-detail-collapsible${open ? ' open' : ''}`}>
      <button type="button" className="sim-detail-section-header" onClick={() => setOpen((o) => !o)}>
        <span className="sim-detail-section-title">{title}</span>
        <span className="sim-detail-chevron">›</span>
      </button>
      {open && <div className="sim-detail-section-body">{children}</div>}
    </div>
  );
}

/* ===== Human-readable Analysis renderer ===== */
function AnalysisDisplay({ data }) {
  // Try to parse as JSON
  let parsed = null;
  if (typeof data === 'string') {
    try { parsed = JSON.parse(data); } catch { parsed = null; }
  } else if (typeof data === 'object' && data !== null) {
    parsed = data;
  }

  // If it's not JSON, just render as text
  if (!parsed || typeof parsed !== 'object') {
    return <div className="analysis-prose">{String(data)}</div>;
  }

  // Render object keys as sections
  const renderValue = (val, depth = 0) => {
    if (val == null) return <span className="analysis-empty">N/A</span>;
    if (typeof val === 'boolean') return <span>{val ? 'Yes' : 'No'}</span>;
    if (typeof val === 'number') return <span>{val}</span>;
    if (typeof val === 'string') return <span>{val}</span>;
    if (Array.isArray(val)) {
      if (val.length === 0) return <span className="analysis-empty">None</span>;
      return (
        <ul className="analysis-list">
          {val.map((item, i) => (
            <li key={i}>{typeof item === 'object' ? renderValue(item, depth + 1) : String(item)}</li>
          ))}
        </ul>
      );
    }
    if (typeof val === 'object') {
      return (
        <div className={depth > 0 ? 'analysis-nested' : ''}>
          {Object.entries(val).map(([k, v]) => (
            <div key={k} className="analysis-field">
              <div className="analysis-key">{formatKey(k)}</div>
              <div className="analysis-value">{renderValue(v, depth + 1)}</div>
            </div>
          ))}
        </div>
      );
    }
    return <span>{String(val)}</span>;
  };

  const formatKey = (key) =>
    key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase()).trim();

  return <div className="analysis-readable">{renderValue(parsed)}</div>;
}

/* ===== Bottom Tab Bar ===== */
function BottomBar({ tab, onTab }) {
  const tabs = [
    { key: 'cases', icon: Icons.cases, label: 'Cases' },
    { key: 'clients', icon: Icons.clients, label: 'Clients' },
    { key: 'sims', icon: Icons.sims, label: 'Sims' },
    { key: 'settings', icon: Icons.settings, label: 'Settings' },
  ];
  return (
    <nav className="bottom-bar">
      {tabs.map((t) => (
        <button key={t.key} className={`tab-btn${tab === t.key ? ' active' : ''}`} onClick={() => onTab(t.key)}>
          {t.icon}
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

/* ===== Create Case form ===== */
function CreateCaseForm({ goBack, onSuccess, showToast, tab, switchTab }) {
  const [caseNumber, setCaseNumber] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [description, setDescription] = useState(DEFAULT_CASE_DESCRIPTION);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!caseNumber.trim() || !firstName.trim() || !lastName.trim() || !phone.trim() || !description.trim()) {
      setError('Case number, first name, last name, phone, and description are required.');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(API + '/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseNumber: caseNumber.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          description: description.trim(),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed to create case');
      showToast(`Case #${caseNumber} created`);
      onSuccess(data);
      goBack();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-shell">
      <div className="detail-screen">
        <div className="detail-header">
          <button type="button" className="back-btn" onClick={goBack}>{Icons.back}</button>
          <h2>New Case</h2>
        </div>
        <div className="detail-body detail-body-with-actions">
          <form className="case-form" onSubmit={handleSubmit}>
            <label>
              <span className="label-text">Case Number</span>
              <input className="input" type="text" value={caseNumber} onChange={e => setCaseNumber(e.target.value)} placeholder="e.g. 2024123095" required />
            </label>
            <label>
              <span className="label-text">First Name</span>
              <input className="input" type="text" value={firstName} onChange={e => setFirstName(e.target.value)} required />
            </label>
            <label>
              <span className="label-text">Last Name</span>
              <input className="input" type="text" value={lastName} onChange={e => setLastName(e.target.value)} required />
            </label>
            <label>
              <span className="label-text">Phone</span>
              <input className="input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} required />
            </label>
            <label>
              <span className="label-text">Email (optional)</span>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="optional" />
            </label>
            <label>
              <span className="label-text">Description</span>
              <textarea className="input textarea" value={description} onChange={e => setDescription(e.target.value)} rows={6} required />
            </label>
            {error && <p className="error-text" style={{ marginBottom: 12 }}>{error}</p>}
            <div className="form-actions form-actions-sticky">
              <button type="button" className="btn secondary" onClick={goBack}>Cancel</button>
              <button type="submit" className="btn primary" disabled={saving}>{saving ? 'Creating…' : 'Create Case'}</button>
            </div>
          </form>
        </div>
      </div>
      <BottomBar tab={tab} onTab={switchTab} />
    </div>
  );
}

/* ===== Case Detail (with simulations) ===== */
function CaseDetail({ caseData: d, tab, switchTab, goBack, goDetail, toast, currentDetail }) {
  const [sims, setSims] = useState([]);
  const [loadingSims, setLoadingSims] = useState(true);

  useEffect(() => {
    fetch(`${API}/simulations?caseId=${d.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(setSims)
      .catch(() => {})
      .finally(() => setLoadingSims(false));
  }, [d.id]);

  return (
    <div className="app-shell">
      <div className="detail-screen">
        <div className="detail-header">
          <button className="back-btn" onClick={goBack}>{Icons.back}</button>
          <h2>#{d.caseNumber}</h2>
        </div>
        <div className="detail-body case-detail-body">
          <div className="case-detail-hero">
            <div className="case-detail-name">{d.lastName}, {d.firstName}</div>
            <div className="case-detail-number">#{d.caseNumber}</div>
          </div>
          <div className="kv">
            <span className="k">Phone</span><span className="v">{d.phone}</span>
            {d.email && <><span className="k">Email</span><span className="v">{d.email}</span></>}
            <span className="k">Description</span><span className="v">{d.description}</span>
            <span className="k">Created</span><span className="v">{new Date(d.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="case-detail-actions">
            <a className="btn btn-sm primary" href={`/sim/${d.id}`} target="_blank" rel="noopener">
              Start DepoSim
            </a>
          </div>

          {/* Call History */}
          <div style={{ marginTop: 28 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Call History</h3>
            {loadingSims && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</p>}
            {!loadingSims && sims.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No simulations yet. Start a DepoSim to see results here.</p>}
            {sims.map(s => (
              <div key={s.id} className="sim-card" onClick={() => goDetail('simulation', s, currentDetail)}>
                <div className="sim-card-top">
                  <span className="sim-score" style={{ color: s.score >= 75 ? '#58c322' : s.score >= 50 ? '#ffab00' : '#ed4956' }}>
                    {s.score != null ? `${s.score}%` : '—'}
                  </span>
                  <span className="sim-title">{s.callSummaryTitle || s.eventType || 'Simulation'}</span>
                  <span className="sim-date">{new Date(s.createdAt).toLocaleDateString()}</span>
                </div>
                {s.scoreReason && <div className="sim-reason">{s.scoreReason}</div>}
                {s.callDurationSecs != null && <div className="sim-duration">{Math.floor(s.callDurationSecs / 60)}m {s.callDurationSecs % 60}s</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
      <BottomBar tab={tab} onTab={switchTab} />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ===== Main App ===== */
function MainApp() {
  const [tab, setTab] = useState('cases');
  const [detail, setDetail] = useState(null); // { type, data }
  const [cases, setCases] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('dark');
  const [toast, setToast] = useState(null);

  // Filters
  const [caseSort, setCaseSort] = useState('newest');



  // Load theme
  useEffect(() => {
    fetch(API + '/settings')
      .then(r => r.ok ? r.json() : { theme: 'dark' })
      .then(d => {
        const t = d.theme === 'light' ? 'light' : 'dark';
        setTheme(t);
        document.documentElement.setAttribute('data-theme', t);
      })
      .catch(() => {});
  }, []);

  // Load data
  useEffect(() => {
    Promise.all([
      fetch(API + '/cases').then(r => r.ok ? r.json() : []),
      fetch(API + '/clients').then(r => r.ok ? r.json() : []),
    ]).then(([c, cl]) => {
      setCases(c);
      setClients(cl);
      // If ?open=<caseId> in URL, open that case detail
      const params = new URLSearchParams(window.location.search);
      const openId = params.get('open');
      if (openId) {
        const found = c.find(x => x.id === openId);
        if (found) { setTab('cases'); setDetail({ type: 'case', data: found }); }
        window.history.replaceState({}, '', window.location.pathname);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleThemeChange = (t) => {
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
    fetch(API + '/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: t }) }).catch(() => {});
  };

  const goDetail = (type, data, parentDetail) => setDetail({ type, data, parent: parentDetail || null });
  const goBack = () => { setDetail(detail?.parent || null); };
  const switchTab = (t) => { setDetail(null); setTab(t); };

  // Sort cases
  const sortedCases = [...cases].sort((a, b) => {
    if (caseSort === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
    if (caseSort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
    if (caseSort === 'lastName') return (a.lastName || '').localeCompare(b.lastName || '');
    return 0;
  });

  if (loading) return <div className="app-shell" style={{ display: 'grid', placeItems: 'center' }}><p style={{ color: 'var(--muted)' }}>Loading…</p></div>;

  /* ===== Detail screens ===== */
  if (detail) {
    const d = detail.data;
    if (detail.type === 'createCase') {
      return (
        <CreateCaseForm
          goBack={goBack}
          onSuccess={() => fetch(API + '/cases').then(r => r.ok ? r.json() : []).then(setCases)}
          showToast={showToast}
          tab={tab}
          switchTab={switchTab}
        />
      );
    }
    if (detail.type === 'case') {
      return <CaseDetail caseData={d} tab={tab} switchTab={switchTab} goBack={goBack} goDetail={goDetail} toast={toast} currentDetail={detail} />;
    }
    if (detail.type === 'client') {
      return (
        <div className="app-shell">
          <div className="detail-screen">
            <div className="detail-header">
              <button className="back-btn" onClick={goBack}>{Icons.back}</button>
              <h2>{d.name}</h2>
            </div>
            <div className="detail-body">
              <div style={{ textAlign: 'center', margin: '20px 0' }}>
                <div className="profile-avatar" style={{ margin: '0 auto 12px', background: 'var(--gradient)' }}>
                  {(d.name || '?')[0].toUpperCase()}
                </div>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{d.name}</div>
              </div>
              <div className="kv">
                {d.email && <><span className="k">Email</span><span className="v">{d.email}</span></>}
                {d.phone && <><span className="k">Phone</span><span className="v">{d.phone}</span></>}
                <span className="k">Camera Consent</span><span className="v">{d.consentCamera ? 'Yes' : 'No'}</span>
                <span className="k">Mic Consent</span><span className="v">{d.consentMicrophone ? 'Yes' : 'No'}</span>
                <span className="k">Created</span><span className="v">{new Date(d.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          <BottomBar tab={tab} onTab={switchTab} />
        </div>
      );
    }
    if (detail.type === 'simulation') {
      const scoreColor = d.score >= 75 ? '#58c322' : d.score >= 50 ? '#ffab00' : '#ed4956';
      return (
        <div className="app-shell">
          <div className="detail-screen">
            <div className="detail-header">
              <button className="back-btn" onClick={goBack}>{Icons.back}</button>
              <h2>Simulation</h2>
            </div>
            <div className="detail-body">
              <CollapsibleSection title="Summary" defaultOpen={true}>
                {d.callSummaryTitle && <div className="sim-detail-title">{d.callSummaryTitle}</div>}
                <div className="sim-detail-score-inner">
                  <div className="sim-detail-ring" style={{ '--score-color': scoreColor }}>
                    <span className="sim-detail-pct">{d.score != null ? `${d.score}%` : '—'}</span>
                  </div>
                  <div className="sim-detail-label">Score</div>
                  {d.scoreReason && <div className="sim-detail-reason">{d.scoreReason}</div>}
                </div>
                <div className="sim-detail-meta">
                  {d.callDurationSecs != null && <span className="sim-detail-meta-item"><span className="sim-detail-meta-label">Duration</span> {Math.floor(d.callDurationSecs / 60)}m {d.callDurationSecs % 60}s</span>}
                  <span className="sim-detail-meta-item"><span className="sim-detail-meta-label">Completed</span> {new Date(d.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(d.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
                </div>
                {d.transcriptSummary && (
                  <div className="sim-detail-transcript-wrap">
                    <div className="sim-detail-heading">Transcript Summary</div>
                    <p className="sim-detail-text">{d.transcriptSummary}</p>
                  </div>
                )}
              </CollapsibleSection>

              {d.fullAnalysis && (
                <CollapsibleSection title="Full Analysis" defaultOpen={true}>
                  <AnalysisDisplay data={d.fullAnalysis} />
                </CollapsibleSection>
              )}

              <CollapsibleSection title="Body Language Analysis" defaultOpen={false}>
                {d.bodyAnalysis ? (
                  <AnalysisDisplay data={d.bodyAnalysis} />
                ) : (
                  <p className="sim-detail-text" style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                    {d.bodyAnalysisModel ? 'Processing…' : 'No body language recording was captured for this simulation.'}
                  </p>
                )}
              </CollapsibleSection>

              <CollapsibleSection title="AI Coach" defaultOpen={false}>
                <SimulationCoachChat
                  simulationId={d.id}
                  introMessage={d.callSummaryTitle
                    ? `I've loaded **${d.callSummaryTitle}** (Score: ${d.score != null ? d.score + '%' : 'N/A'}). Ask me why the score was what it was, what to improve, or how to prepare better for your next deposition.`
                    : 'Ask me anything about this simulation — performance, improvements, or deposition strategy.'}
                />
              </CollapsibleSection>
            </div>
          </div>
          <BottomBar tab={tab} onTab={switchTab} />
        </div>
      );
    }
    if (detail.type === 'analysis') {
      return (
        <div className="app-shell">
          <div className="detail-screen">
            <div className="detail-header">
              <button className="back-btn" onClick={goBack}>{Icons.back}</button>
              <h2>Analysis</h2>
            </div>
            <div className="detail-body">
              <div className="analysis-meta">{d.model} · {d.durationMs}ms · {new Date(d.createdAt).toLocaleString()}</div>
              <pre className="analysis-text">{d.analysisText}</pre>
            </div>
          </div>
          <BottomBar tab={tab} onTab={switchTab} />
        </div>
      );
    }
  }

  /* ===== Feed screens ===== */
  return (
    <div className="app-shell">
      <div className="app-body">

        {/* ===== CASES ===== */}
        {tab === 'cases' && (
          <>
            <div className="feed-header">
              <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="header-logo" />
              <span className="spacer" />
              <button type="button" className="header-btn primary" onClick={() => setDetail({ type: 'createCase', data: null })} title="New Case">
                {Icons.plus}
                <span>New Case</span>
              </button>
            </div>
            <div className="cases-subheader">
              <span className="cases-count">{cases.length} case{cases.length !== 1 ? 's' : ''}</span>
              <div className="sort-pills">
                {[['newest','Recent'],['oldest','Oldest'],['lastName','Name']].map(([k,l]) => (
                  <button key={k} className={`sort-pill${caseSort === k ? ' active' : ''}`} onClick={() => setCaseSort(k)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="tile-grid">
              {sortedCases.map((c) => {
                const accent = tileAccent(c.id);
                const isAuto = (c.description || '').toLowerCase().includes('car') || (c.description || '').toLowerCase().includes('vehicle') || (c.description || '').toLowerCase().includes('rear end');
                return (
                  <div key={c.id} className="tile" style={{ '--tile-accent': accent }} onClick={() => goDetail('case', c)}>
                    <div className="tile-icon">{isAuto ? Icons.car : Icons.walking}</div>
                    <div className="tile-label">#{c.caseNumber}</div>
                    <div className="tile-sublabel">{c.lastName}, {c.firstName}</div>
                  </div>
                );
              })}
            </div>
            {cases.length === 0 && <p style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 14 }}>No cases yet. Tap + New Case to get started.</p>}
          </>
        )}

        {/* ===== CLIENTS ===== */}
        {tab === 'clients' && (
          <>
            <div className="feed-header">
              <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="header-logo" />
              <h1 className="header-title">Clients</h1>
            </div>
            <div className="profile-row">
              <div className="profile-avatar" style={{ background: '#5b51d8' }}>C</div>
              <div className="profile-info">
                <div className="name">Clients</div>
                <div className="sub">{clients.length} client{clients.length !== 1 ? 's' : ''}</div>
              </div>
            </div>
            <div className="tile-grid">
              {clients.map((c) => {
                const accent = tileAccent(c.id);
                return (
                  <div key={c.id} className="tile" style={{ '--tile-accent': accent }} onClick={() => goDetail('client', c)}>
                    <div className="tile-icon">{Icons.clients}</div>
                    <div className="tile-label">{c.name}</div>
                    {c.phone && <div className="tile-sublabel">{c.phone}</div>}
                  </div>
                );
              })}
            </div>
            {clients.length === 0 && <p style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 14 }}>No clients yet</p>}
          </>
        )}

        {/* ===== SIMS (Simulation Feed) ===== */}
        {tab === 'sims' && (
          <SimsFeed goDetail={goDetail} />
        )}

        {/* ===== SETTINGS ===== */}
        {tab === 'settings' && (
          <>
            <div className="feed-header">
              <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="header-logo" />
              <h1 className="header-title">Settings</h1>
            </div>
            <div className="card">
              <h3>Appearance</h3>
              <div className="theme-switch">
                <button className={`theme-btn${theme === 'dark' ? ' active' : ''}`} onClick={() => handleThemeChange('dark')}>Dark</button>
                <button className={`theme-btn${theme === 'light' ? ' active' : ''}`} onClick={() => handleThemeChange('light')}>Light</button>
              </div>
            </div>
            <div className="card">
              <h3>Prompts</h3>
              <PromptManager showToast={showToast} />
            </div>
          </>
        )}
      </div>

      <BottomBar tab={tab} onTab={switchTab} />

      {toast && <div className="toast">{toast}</div>}

    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/sim/:caseId" element={<SimPage />} />
      <Route path="*" element={<MainApp />} />
    </Routes>
  );
}
