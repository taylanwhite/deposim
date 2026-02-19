import { useState, useEffect, useRef, useCallback } from 'react';
import { Routes, Route, useNavigate, useParams, useLocation, useOutletContext, Navigate, Outlet, Link } from 'react-router-dom';
import { SignedIn, SignedOut, RedirectToSignIn, UserButton, useAuth } from '@clerk/clerk-react';
import './App.css';
import SimPage from './SimPage';
import { LanguageProvider, useT, useLangPrefix } from './i18n/LanguageContext';

const API = '/api';

/* ===== Access-level hook: calls /api/client/me to determine tier ===== */
function useAccessLevel() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [data, setData] = useState({ accessLevel: null, isAdmin: false, isSuper: false, locationIds: [], locations: [], organizations: [], language: 'en' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) { setLoading(false); return; }
    setLoading(true);
    (async () => {
      try {
        const token = await getToken();
        const headers = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        const r = await fetch(`${API}/client/me`, { credentials: 'include', headers });
        const d = r.ok ? await r.json() : null;
        setData({
          accessLevel: d?.accessLevel || null,
          isAdmin: d?.isAdmin || false,
          isSuper: d?.isSuper || false,
          locationIds: d?.locationIds || [],
          locations: d?.locations || [],
          organizations: d?.organizations || [],
          orgId: d?.orgId || null,
          language: d?.language || 'en',
        });
      } catch (_) { /* no-op */ }
      setLoading(false);
    })();
  }, [isLoaded, isSignedIn, getToken]);

  return { ...data, loading: loading || !isLoaded };
}

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
  transcript: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  body: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="6" r="3" />
      <path d="M4 20 Q12 12 20 20" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
};

/* Spring grass green for scores */
const SCORE_GREEN = '#16981c';

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
        <div className="feed-header-left">
          <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="header-logo" />
        </div>
        <h1 className="feed-header-title">Simulations</h1>
        <div className="feed-header-right" />
      </div>
      <div className="call-history-section">
        <h3 className="call-history-title">Simulation History</h3>
        {loading && <p className="call-history-empty">Loading…</p>}
        {!loading && sims.length === 0 && (
          <p className="call-history-empty">No simulations yet. Run a DepoSim from any case to see results here.</p>
        )}
        <div className="sim-grid">
          {sims.map(s => (
            <SimCard key={s.id} sim={s} caseData={s.case} onClick={() => goDetail('simulation', s)} />
          ))}
        </div>
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
const TYPE_LABELS = { system: 'System Prompt', first_message: 'First Message', score: 'Score Analysis' };

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

  const typeOrder = ['system', 'first_message', 'score'];

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

/* ===== Parse timestamp "M:SS" or "0:45" to seconds ===== */
function parseTimestamp(ts) {
  if (!ts || typeof ts !== 'string') return 0;
  const m = ts.trim().match(/^(\d+):(\d+)$/);
  if (!m) return 0;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/* ===== Moment popup with video player (seeks to timestamp) ===== */
function MomentVideoPopup({ moment, simulationId, onClose }) {
  const videoRef = useRef(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [loading, setLoading] = useState(!!simulationId);
  const [error, setError] = useState(null);
  const seekSeconds = parseTimestamp(moment?.timestamp);

  useEffect(() => {
    if (!simulationId) return;
    setLoading(true);
    setError(null);
    fetch(`${API}/simulations/${simulationId}/recording-url`)
      .then((r) => r.json())
      .then((d) => {
        if (d.url) setVideoUrl(d.url);
        else setError(d.error || 'No recording');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [simulationId]);

  const handleLoadedMetadata = useCallback(() => {
    const v = videoRef.current;
    if (v && seekSeconds > 0 && !isNaN(v.duration)) {
      v.currentTime = Math.min(seekSeconds, v.duration);
    }
  }, [seekSeconds]);

  return (
    <div className="sim-body-popup-overlay" onClick={onClose}>
      <div className="sim-body-popup sim-body-popup-video" onClick={(e) => e.stopPropagation()}>
        <div className="sim-body-popup-header">
          <span className="sim-body-popup-title">{moment?.timestamp || 'Moment'}</span>
          <button className="sim-body-popup-close" onClick={onClose}>×</button>
        </div>
        <div className="sim-body-popup-body">
          {loading && <p className="sim-moment-loading">Loading video…</p>}
          {error && <p className="sim-moment-error">{error}</p>}
          {videoUrl && !error && (
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              playsInline
              className="sim-moment-video"
              onLoadedMetadata={handleLoadedMetadata}
              onLoadedData={handleLoadedMetadata}
            />
          )}
          <p className="sim-moment-desc">{moment?.moment || ''}</p>
        </div>
      </div>
    </div>
  );
}

/* ===== Simulation Detail: Transcript bubbles + Body tab ===== */
function SimulationDetail({ d, tab, switchTab, goBack, centerAction, onCenterClick }) {
  const [simTab, setSimTab] = useState('transcript');
  const topRef = useRef(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [depoSimSentCaseId, setDepoSimSentCaseId] = useState(null);
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 150);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const [popupCategory, setPopupCategory] = useState(null);
  const [popupMoment, setPopupMoment] = useState(null);
  const [expandedTurn, setExpandedTurn] = useState(null);
  const [showScoreSummary, setShowScoreSummary] = useState(false);

  useEffect(() => {
    if (expandedTurn == null) return;
    const onDocClick = (e) => {
      if (!e.target.closest('.sim-turn-score-inline')) setExpandedTurn(null);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [expandedTurn]);

  const scoreColor = d.score >= 75 ? SCORE_GREEN : d.score >= 50 ? '#ffab00' : '#ed4956';
  const transcript = Array.isArray(d.transcript) ? d.transcript : [];
  const turnScores = Array.isArray(d.turnScores) ? d.turnScores : [];

  // Parse body analysis JSON (strip markdown code blocks if present)
  let bodyData = null;
  if (d.bodyAnalysis) {
    try {
      let raw = typeof d.bodyAnalysis === 'string' ? d.bodyAnalysis : JSON.stringify(d.bodyAnalysis);
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      bodyData = JSON.parse(raw);
    } catch { bodyData = null; }
  }

  const BODY_CATEGORIES = [
    { key: 'overall_demeanor', label: 'Overall Demeanor' },
    { key: 'key_body_signals', label: 'Key Body Signals' },
    { key: 'stress_signals', label: 'Stress Signals' },
    { key: 'credible_assessment', label: 'Credibility Assessment' },
  ];

  const clientFallback = d.case ? `${(d.case.client?.lastName || d.case?.lastName) || ''}, ${(d.case.client?.firstName || d.case?.firstName) || ''}`.trim() : '';
  const clientName = d.case?.name || clientFallback || d.callSummaryTitle || '';
  const caseNum = d.case?.caseNumber || '';

  return (
    <div className="app-shell">
      <div className="detail-screen">
        <div className="detail-header sim-detail-header" onClick={() => topRef.current?.scrollIntoView({ behavior: 'smooth' })}>
          <button className="back-btn" onClick={e => { e.stopPropagation(); goBack(); }}>{Icons.back}</button>
          <div className="sim-detail-header-title">
            <span className="sim-detail-header-name">{clientName || 'Simulation'}</span>
            {caseNum && <span className="sim-detail-header-case">#{caseNum}</span>}
          </div>
        </div>
        <div className="detail-body sim-detail-body">
          {/* Summary strip */}
          <div className="sim-detail-summary" ref={topRef}>
            <div className="sim-detail-summary-stack">
              <button
                type="button"
                className="sim-detail-ring sim-detail-ring-btn"
                style={{ '--score-color': scoreColor }}
                onClick={() => setShowScoreSummary(true)}
                title="View score summary"
              >
                <span className="sim-detail-pct">{d.score != null ? `${d.score}%` : '—'}</span>
              </button>
              <div className="sim-detail-summary-meta">
                <div className="sim-detail-meta">
                  {new Date(d.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  {'. '}
                  {new Date(d.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                  {d.callDurationSecs != null && <> . {Math.max(1, Math.round(d.callDurationSecs / 60))}m</>}
                </div>
              </div>
            </div>
          </div>

          {showScoreSummary && (
            <div className="sim-score-summary-overlay" onClick={() => setShowScoreSummary(false)}>
              <div className="sim-score-summary-modal" onClick={e => e.stopPropagation()}>
                <div className="sim-score-summary-header">
                  <h3>Summary</h3>
                  <button type="button" className="sim-score-summary-close" onClick={() => setShowScoreSummary(false)}>×</button>
                </div>
                <div className="sim-score-summary-body">
                  <div className="sim-score-summary-ring" style={{ '--score-color': scoreColor }}>
                    <span>{d.score != null ? `${d.score}%` : '—'}</span>
                  </div>
                  {d.scoreReason && (
                    <div className="sim-score-summary-reason">
                      <strong>Why:</strong> {d.scoreReason}
                    </div>
                  )}
                  {!d.scoreReason && (
                    <p className="sim-score-summary-empty">No score details available.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Instagram-style tabs */}
          <div className="sim-detail-tabs">
            <button className={`sim-detail-tab${simTab === 'transcript' ? ' active' : ''}`} onClick={() => setSimTab('transcript')}>
              {Icons.transcript}
              <span>Transcript</span>
            </button>
            <button className={`sim-detail-tab${simTab === 'body' ? ' active' : ''}`} onClick={() => setSimTab('body')}>
              {Icons.body}
              <span>Body Language</span>
            </button>
          </div>

          {simTab === 'transcript' && (
            <div className="sim-transcript-view">
              {transcript.length === 0 ? (
                <div className="sim-transcript-empty">
                  {d.transcriptSummary ? <p className="sim-detail-text">{d.transcriptSummary}</p> : <p>No transcript available.</p>}
                </div>
              ) : (
                <div className="sim-transcript-bubbles">
                  {transcript.map((t, i) => {
                    const role = (t.role || t.speaker || '').toLowerCase();
                    const msg = t.message || t.original_message || t.text || t.content || '';
                    const isUser = role === 'user';
                    const turnIdx = transcript.slice(0, i + 1).filter(x => {
                      const r = (x.role || x.speaker || '').toLowerCase();
                      return r === 'user' || (r !== 'agent' && r !== 'assistant');
                    }).length - 1;
                    const turnScore = turnIdx >= 0 && turnScores[turnIdx] ? turnScores[turnIdx] : null;

                    return (
                      <div key={i} className={`sim-transcript-row sim-transcript-row-${isUser ? 'user' : 'agent'}`}>
                        {!isUser && <div className="sim-turn-score-spacer" />}
                        {isUser && <div className="sim-turn-score-spacer sim-turn-score-spacer-left" />}
                        <div className={`sim-bubble sim-bubble-${isUser ? 'user' : 'agent'}`}>
                          <div className="sim-bubble-text">{msg}</div>
                        </div>
                        {isUser && (
                          <div className="sim-turn-score-inline">
                            {turnScore ? (
                              <>
                                <button
                                  type="button"
                                  className="sim-turn-score-btn sim-turn-score-circle"
                                  style={{ color: turnScore.score >= 75 ? SCORE_GREEN : turnScore.score >= 50 ? '#ffc107' : '#ed4956' }}
                                  onClick={() => setExpandedTurn(prev => prev === turnIdx ? null : turnIdx)}
                                >
                                  {turnScore.score}%
                                </button>
                                {expandedTurn === turnIdx && (
                                  <div className="sim-turn-score-popover" onClick={e => e.stopPropagation()}>
                                    {turnScore.question && <p><strong>Q:</strong> {turnScore.question}</p>}
                                    {turnScore.score_reason && <p><strong>Why:</strong> {turnScore.score_reason}</p>}
                                    {turnScore.improvement && <p><strong>Improve:</strong> {turnScore.improvement}</p>}
                                    <button type="button" className="sim-turn-score-close" onClick={() => setExpandedTurn(null)}>Close</button>
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="sim-turn-score-placeholder" title="Score not yet available">—</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                    {transcript.length > 0 && (
                    <div className="sim-transcript-call-ended">
                      Call Ended{d.endedBy ? ` — ${d.endedBy === 'user' ? 'You' : d.endedBy === 'agent' ? 'Counsel' : d.endedBy}` : ''}
                    </div>
                  )}
                </div>
              )}
              {transcript.length > 3 && showScrollTop && (
                <button
                  type="button"
                  className="sim-transcript-scroll-top"
                  onClick={() => topRef.current?.scrollIntoView({ behavior: 'smooth' })}
                  aria-label="Scroll to top"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"/></svg>
                </button>
              )}
              {/* Full Analysis — hidden for now
              {d.fullAnalysis && (
                <CollapsibleSection title="Full Analysis" defaultOpen={false}>
                  <AnalysisDisplay data={d.fullAnalysis} />
                </CollapsibleSection>
              )}
              */}
              {/* AI Coach — commented out for now
              <CollapsibleSection title="AI Coach" defaultOpen={false}>
                <SimulationCoachChat
                  simulationId={d.id}
                  introMessage={d.callSummaryTitle
                    ? `I've loaded **${d.callSummaryTitle}** (Score: ${d.score != null ? d.score + '%' : 'N/A'}). Ask me why the score was what it was, what to improve, or how to prepare better for your next deposition.`
                    : 'Ask me anything about this simulation — performance, improvements, or deposition strategy.'}
                />
              </CollapsibleSection>
              */}
            </div>
          )}

          {simTab === 'body' && (
            <div className="sim-body-view">
              {!d.bodyAnalysis ? (
                <p className="sim-body-empty">
                  {d.bodyAnalysisModel ? 'Processing body analysis…' : 'No body language recording was captured for this simulation.'}
                </p>
              ) : !bodyData ? (
                <AnalysisDisplay data={d.bodyAnalysis} />
              ) : (
                <>
                  <div className="sim-body-categories">
                    {BODY_CATEGORIES.map(({ key, label }) => {
                      const cat = bodyData[key];
                      const score = cat && typeof cat.score === 'number' ? cat.score : null;
                      const scoreColor = score >= 75 ? SCORE_GREEN : score >= 50 ? '#ffab00' : '#ed4956';
                      return (
                        <button
                          key={key}
                          className="sim-body-cat"
                          onClick={() => setPopupCategory(cat ? key : null)}
                          disabled={!cat}
                        >
                          <div className="sim-body-cat-ring" style={{ '--score-color': scoreColor }}>
                            <span className="sim-body-cat-pct">{score != null ? `${score}%` : '—'}</span>
                          </div>
                          <span className="sim-body-cat-label">{label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {bodyData.timeline_of_notable_moments && bodyData.timeline_of_notable_moments.length > 0 && (
                    <div className="sim-body-moments">
                      <div className="sim-body-moments-header sim-body-moments-inline">
                        <span className="sim-detail-heading">Memorable Moments</span>
                        <span className="sim-body-moment-play">Tap to Play</span>
                      </div>
                      <div className="sim-body-moments-list">
                        {bodyData.timeline_of_notable_moments.map((m, i) => (
                          <button key={i} className="sim-body-moment" onClick={() => setPopupMoment(m)}>
                            <span className="sim-body-moment-ts">{m.timestamp || ''}</span>
                            <span className="sim-body-moment-text">{m.moment || ''}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {popupCategory && bodyData?.[popupCategory] && (
        <div className="sim-body-popup-overlay" onClick={() => setPopupCategory(null)}>
          <div className="sim-body-popup" onClick={e => e.stopPropagation()}>
            <div className="sim-body-popup-header">
              <span className="sim-body-popup-title">
                {BODY_CATEGORIES.find(c => c.key === popupCategory)?.label || popupCategory}
              </span>
              <button className="sim-body-popup-close" onClick={() => setPopupCategory(null)}>×</button>
            </div>
            <div className="sim-body-popup-body">
              <p><strong>Score:</strong> {bodyData[popupCategory].score}%</p>
              {bodyData[popupCategory].score_reason && <p><strong>Why:</strong> {bodyData[popupCategory].score_reason}</p>}
              {bodyData[popupCategory].summary && <p><strong>Summary:</strong> {bodyData[popupCategory].summary}</p>}
            </div>
          </div>
        </div>
      )}

      {popupMoment && (
        <MomentVideoPopup
          moment={popupMoment}
          simulationId={d.id}
          onClose={() => setPopupMoment(null)}
        />
      )}

      <BottomBar tab={tab} onTab={switchTab} onCenterClick={onCenterClick} centerAction={centerAction} onStartDeposim={async (id) => { setDepoSimSentCaseId(id); const simUrl = typeof window !== 'undefined' ? `${window.location.origin}/sim/${id}` : ''; try { const r = await fetch(API + `/cases/${id}/notify-deposim-sent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ simUrl }) }); if (!r.ok) console.warn('[DepoSim] SMS notify:', r.status, await r.text()); } catch (e) { console.warn('[DepoSim] SMS notify failed:', e); } }} />
      {depoSimSentCaseId && <DepoSimSentToast caseId={depoSimSentCaseId} onDismiss={() => setDepoSimSentCaseId(null)} />}
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

/* ===== DepoSim Sent Toast (bottom popup with link + Okay) ===== */
function DepoSimSentToast({ caseId, onDismiss }) {
  const simUrl = typeof window !== 'undefined' ? `${window.location.origin}/sim/${caseId}` : '';
  const handleLinkClick = (e) => {
    e.preventDefault();
    if (simUrl) {
      navigator.clipboard?.writeText(simUrl).catch(() => {});
      window.open(simUrl, '_blank');
    }
  };
  return (
    <div className="deposim-sent-toast">
      <p className="deposim-sent-toast-message">The DepoSim has been prepared and sent to the client.</p>
      {simUrl && (
        <a href={simUrl} className="deposim-sent-toast-link" onClick={handleLinkClick}>
          {simUrl}
        </a>
      )}
      <button type="button" className="deposim-sent-toast-ok" onClick={onDismiss}>Okay</button>
    </div>
  );
}

// Client form validation: optional fields; if provided, must be valid format
function isValidClientEmail(value) {
  const s = (value || '').trim();
  if (!s) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
function isValidClientPhone(value) {
  const s = (value || '').trim();
  if (!s) return true;
  const digits = s.replace(/\D/g, '');
  return digits.length >= 10;
}

/* ===== Client Autocomplete (search, multi-select chips, inline create) ===== */
function ClientAutocomplete({ selectedClients = [], onChange, placeholder = 'Search clients…' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const wrapRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setShowCreate(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const doSearch = useCallback((q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    fetch(`${API}/clients?search=${encodeURIComponent(q.trim())}`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const selectedIds = new Set(selectedClients.map(c => c.id));
        setResults(data.filter(c => !selectedIds.has(c.id)));
      })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [selectedClients]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setOpen(true);
    setShowCreate(false);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 250);
  };

  const selectClient = (client) => {
    onChange([...selectedClients, client]);
    setQuery('');
    setResults([]);
    setOpen(false);
    setShowCreate(false);
  };

  const removeClient = (id) => {
    onChange(selectedClients.filter(c => c.id !== id));
  };

  const handleCreateNew = async () => {
    if (!newFirst.trim() || !newLast.trim()) return;
    setCreateError(null);
    if (!isValidClientEmail(newEmail)) {
      setCreateError('Please enter a valid email address.');
      return;
    }
    if (!isValidClientPhone(newPhone)) {
      setCreateError('Please enter a valid phone number (at least 10 digits).');
      return;
    }
    setCreating(true);
    try {
      const r = await fetch(`${API}/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: newFirst.trim(),
          lastName: newLast.trim(),
          phone: newPhone.trim() || null,
          email: newEmail.trim() || null,
        }),
      });
      if (!r.ok) throw new Error('Failed to create client');
      const client = await r.json();
      selectClient(client);
      setNewFirst(''); setNewLast(''); setNewPhone(''); setNewEmail('');
      setCreateError(null);
    } catch { setCreateError('Failed to create client.'); }
    finally { setCreating(false); }
  };

  return (
    <div className="client-autocomplete" ref={wrapRef}>
      {selectedClients.length > 0 && (
        <div className="client-chips">
          {selectedClients.map(c => (
            <span key={c.id} className="client-chip">
              {c.lastName}, {c.firstName}
              <button type="button" className="client-chip-x" onClick={() => removeClient(c.id)}>&times;</button>
            </span>
          ))}
        </div>
      )}
      <input
        className="input client-autocomplete-input"
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={() => { if (query.trim()) { setOpen(true); doSearch(query); } }}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && (
        <div className="client-autocomplete-dropdown">
          {loading && <div className="client-autocomplete-item client-autocomplete-loading">Searching…</div>}
          {!loading && results.length === 0 && query.trim() && !showCreate && (
            <div className="client-autocomplete-item client-autocomplete-empty">No clients found</div>
          )}
          {results.map(c => (
            <button key={c.id} type="button" className="client-autocomplete-item" onClick={() => selectClient(c)}>
              <span className="client-autocomplete-name">{c.lastName}, {c.firstName}</span>
              {c.phone && <span className="client-autocomplete-phone">{c.phone}</span>}
            </button>
          ))}
          {!showCreate && (
            <button type="button" className="client-autocomplete-item client-autocomplete-create-btn" onClick={() => { setShowCreate(true); setCreateError(null); }}>
              + Create new client
            </button>
          )}
          {showCreate && (
            <div className="client-autocomplete-create-form">
              <div className="client-autocomplete-create-row">
                <input className="input input-sm" placeholder="First Name *" value={newFirst} onChange={e => setNewFirst(e.target.value)} />
                <input className="input input-sm" placeholder="Last Name *" value={newLast} onChange={e => setNewLast(e.target.value)} />
              </div>
              <div className="client-autocomplete-create-row">
                <input className="input input-sm" type="tel" placeholder="Phone" value={newPhone} onChange={e => { setNewPhone(e.target.value); setCreateError(null); }} />
                <input className="input input-sm" type="email" placeholder="Email" value={newEmail} onChange={e => { setNewEmail(e.target.value); setCreateError(null); }} />
              </div>
              {createError && <p className="client-create-error" style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--error, #ed4956)' }}>{createError}</p>}
              <div className="client-autocomplete-create-actions">
                <button type="button" className="btn secondary btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
                <button type="button" className="btn primary btn-sm" onClick={handleCreateNew} disabled={creating || !newFirst.trim() || !newLast.trim()}>
                  {creating ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ===== Client Picker Modal (for selecting which client to send DepoSim to) ===== */
function ClientPickerModal({ clients, onSelect, onCancel }) {
  return (
    <div className="client-picker-overlay" onClick={onCancel}>
      <div className="client-picker-modal" onClick={e => e.stopPropagation()}>
        <h3 className="client-picker-title">Send DepoSim to…</h3>
        <div className="client-picker-list">
          {clients.map(cc => (
            <button key={cc.clientId || cc.client?.id} type="button" className="client-picker-item" onClick={() => onSelect(cc.client || cc)}>
              <span className="client-picker-name">{cc.client?.lastName || cc.lastName}, {cc.client?.firstName || cc.firstName}</span>
              {(cc.client?.phone || cc.phone) && <span className="client-picker-phone">{cc.client?.phone || cc.phone}</span>}
            </button>
          ))}
        </div>
        <button type="button" className="btn secondary client-picker-cancel" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/* ===== Bottom Tab Bar (Instagram-style: Cases | + | Settings) ===== */
function BottomBar({ tab, onTab, onCenterClick, centerAction, onStartDeposim }) {
  const prefix = useLangPrefix();
  const nav = useNavigate();
  const { t } = useT();
  const handleCenter = () => {
    if (centerAction?.type === 'startDeposim' && centerAction.caseId) {
      onStartDeposim?.(centerAction.caseId);
    } else if (onCenterClick) {
      onCenterClick();
    } else {
      nav(`${prefix}/cases/new`);
    }
  };
  const handleTab = (tabName) => {
    if (onTab) { onTab(tabName); return; }
    if (tabName === 'cases') nav(`${prefix}/cases`);
    if (tabName === 'settings') nav(`${prefix}/settings`);
  };
  return (
    <nav className="bottom-bar bottom-bar-centered">
      <button className={`tab-btn${tab === 'cases' ? ' active' : ''}`} onClick={() => handleTab('cases')}>
        {Icons.cases}
        <span>{t('nav.cases')}</span>
      </button>
      <button type="button" className="tab-btn tab-btn-plus" onClick={handleCenter} title={centerAction?.type === 'startDeposim' ? 'Start DepoSim' : t('nav.newCase')}>
        {Icons.plus}
      </button>
      <button className={`tab-btn${tab === 'settings' ? ' active' : ''}`} onClick={() => handleTab('settings')}>
        {Icons.settings}
        <span>{t('nav.settings')}</span>
      </button>
    </nav>
  );
}

/* ===== Create Case form ===== */
function CreateCaseForm({ goBack, onSuccess, showToast, tab, switchTab }) {
  const [caseName, setCaseName] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [selectedClients, setSelectedClients] = useState([]);
  const [description, setDescription] = useState(DEFAULT_CASE_DESCRIPTION);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationId, setLocationId] = useState('');

  useEffect(() => {
    setLocationsLoading(true);
    fetch(API + '/locations').then(r => r.ok ? r.json() : []).then(locs => {
      setLocations(locs);
      if (locs.length === 1) setLocationId(locs[0].id);
    }).catch(() => {}).finally(() => setLocationsLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!caseNumber.trim() || !description.trim()) {
      setError('Case number and description are required.');
      return;
    }
    if (!locationId) {
      setError('A location is required.');
      return;
    }
    if (selectedClients.length === 0) {
      setError('At least one client (deponent) is required.');
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(API + '/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: caseName.trim() || null,
          caseNumber: caseNumber.trim(),
          description: description.trim(),
          locationId: locationId || null,
          clients: selectedClients.map(c => ({ clientId: c.id })),
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
              <span className="label-text">Case Name</span>
              <input className="input" type="text" value={caseName} onChange={e => setCaseName(e.target.value)} placeholder="e.g. Smith v. Doe" />
            </label>
            <label>
              <span className="label-text">Case Number</span>
              <input className="input" type="text" value={caseNumber} onChange={e => setCaseNumber(e.target.value)} placeholder="e.g. 2024123095" required />
            </label>
            {locationsLoading && (
              <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading locations…</p>
            )}
            {!locationsLoading && locations.length === 0 && (
              <p className="error-text">No locations available. An admin must create a location first.</p>
            )}
            {!locationsLoading && locations.length > 1 && (
              <label>
                <span className="label-text">Location</span>
                <select className="input" value={locationId} onChange={e => setLocationId(e.target.value)} required>
                  <option value="">Select a location...</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            )}
            <div className="form-section-label">Client(s) — deponent(s)</div>
            <ClientAutocomplete selectedClients={selectedClients} onChange={setSelectedClients} placeholder="Search or create client…" />
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
      <BottomBar tab={tab} onTab={switchTab} onCenterClick={() => {}} />
    </div>
  );
}

/* ===== Description accordion (truncated preview, chevron to expand, editable) ===== */
const DESCRIPTION_TRUNCATE_LEN = 100;

function DescriptionAccordion({ description, onUpdate, caseId, showToast }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description || '');
  const [saving, setSaving] = useState(false);
  const canEdit = !!onUpdate && !!caseId;
  useEffect(() => { setDraft(description || ''); }, [description]);
  if (!canEdit && !description) return null;
  const displayDesc = description || '';
  const truncated = displayDesc.length <= DESCRIPTION_TRUNCATE_LEN
    ? displayDesc
    : displayDesc.slice(0, DESCRIPTION_TRUNCATE_LEN).trim() + '…';

  const handleSave = async () => {
    if (!caseId || !onUpdate) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: draft.trim() }),
      });
      if (!r.ok) throw new Error('Failed');
      onUpdate(draft.trim());
      setEditing(false);
      showToast?.('Description updated');
    } catch { showToast?.('Error saving'); }
    finally { setSaving(false); }
  };

  return (
    <div className={`description-accordion${open ? ' open' : ''}`}>
      <button type="button" className="description-accordion-header" onClick={() => !editing && setOpen(o => !o)}>
        <div className="description-accordion-content">
          <span className="description-accordion-label">Description</span>
          {!editing && <span className="description-accordion-preview">{open ? '' : truncated}</span>}
        </div>
        <span className={`description-accordion-chevron${open ? ' open' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="description-accordion-body">
          {editing ? (
            <>
              <textarea className="input textarea" value={draft} onChange={e => setDraft(e.target.value)} rows={6} />
              <div className="description-accordion-actions">
                <button type="button" className="btn secondary btn-sm" onClick={() => { setEditing(false); setDraft(description || ''); }} disabled={saving}>Cancel</button>
                <button type="button" className="btn primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </>
          ) : (
            <>
              <div className="description-accordion-text">{displayDesc}</div>
              {canEdit && (
                <button type="button" className="btn-link description-accordion-edit" onClick={() => setEditing(true)}>Edit description</button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ===== Case name accordion (same pattern as description: preview, expand, edit) ===== */
const CASE_NAME_TRUNCATE_LEN = 100;

function CaseNameAccordion({ name, onUpdate, caseId, showToast }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name || '');
  const [saving, setSaving] = useState(false);
  const canEdit = !!onUpdate && !!caseId;
  useEffect(() => { setDraft(name || ''); }, [name]);
  const displayName = name || '';
  const truncated = displayName.length <= CASE_NAME_TRUNCATE_LEN
    ? displayName
    : displayName.slice(0, CASE_NAME_TRUNCATE_LEN).trim() + '…';

  const handleSave = async () => {
    if (!caseId || !onUpdate) return;
    setSaving(true);
    try {
      const r = await fetch(`${API}/cases/${caseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.trim() || null }),
      });
      if (!r.ok) throw new Error('Failed');
      onUpdate(draft.trim() || null);
      setEditing(false);
      showToast?.('Case name updated');
    } catch { showToast?.('Error saving'); }
    finally { setSaving(false); }
  };

  return (
    <div className={`description-accordion${open ? ' open' : ''}`}>
      <button type="button" className="description-accordion-header" onClick={() => !editing && setOpen(o => !o)}>
        <div className="description-accordion-content">
          <span className="description-accordion-label">Case name</span>
          {!editing && <span className="description-accordion-preview">{open ? '' : (truncated || '—')}</span>}
        </div>
        <span className={`description-accordion-chevron${open ? ' open' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="description-accordion-body">
          {editing ? (
            <>
              <input className="input" type="text" value={draft} onChange={e => setDraft(e.target.value)} placeholder="e.g. Smith v. Doe" autoFocus />
              <div className="description-accordion-actions">
                <button type="button" className="btn secondary btn-sm" onClick={() => { setEditing(false); setDraft(name || ''); }} disabled={saving}>Cancel</button>
                <button type="button" className="btn primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              </div>
            </>
          ) : (
            <>
              <div className="description-accordion-text">{displayName || '—'}</div>
              {canEdit && (
                <button type="button" className="btn-link description-accordion-edit" onClick={() => setEditing(true)}>Edit case name</button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ===== Sim card: Score/Body | Name | Date (gradient) | Duration ===== */
function getBodyScore(s) {
  if (!s.bodyAnalysis) return null;
  try {
    let raw = typeof s.bodyAnalysis === 'string' ? s.bodyAnalysis : JSON.stringify(s.bodyAnalysis);
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const d = JSON.parse(raw);
    const cats = ['overall_demeanor', 'key_body_signals', 'stress_signals', 'credible_assessment'];
    const scores = cats.filter(k => d[k] && typeof d[k].score === 'number').map(k => d[k].score);
    if (scores.length === 0) return null;
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  } catch { return null; }
}

/** Combined score from voice + body (average when both exist). 0-100. */
function getCombinedScore(s) {
  const voice = s.score != null ? s.score : null;
  const body = getBodyScore(s);
  if (voice != null && body != null) return Math.round((voice + body) / 2);
  if (voice != null) return voice;
  if (body != null) return body;
  return null;
}

/** Gradient for 0% (red) → orange → yellow → green (100%) */
function getScoreGradient(percent) {
  if (percent == null) return 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)';
  const p = Math.max(0, Math.min(100, percent)) / 100;
  let r, g, b;
  if (p < 0.33) {
    const t = p / 0.33;
    r = Math.round(237 + t * (249 - 237));
    g = Math.round(73 + t * (115 - 73));
    b = Math.round(86 + t * (22 - 86));
  } else if (p < 0.66) {
    const t = (p - 0.33) / 0.33;
    r = Math.round(249 + t * (234 - 249));
    g = Math.round(115 + t * (179 - 115));
    b = Math.round(22 + t * (8 - 22));
  } else {
    const t = (p - 0.66) / 0.34;
    r = Math.round(234 + t * (22 - 234));
    g = Math.round(179 + t * (152 - 179));
    b = Math.round(8 + t * (28 - 8));
  }
  const darken = (v) => Math.max(0, Math.floor(v * 0.85));
  const r2 = darken(r), g2 = darken(g), b2 = darken(b);
  return `linear-gradient(135deg, rgb(${r},${g},${b}) 0%, rgb(${r2},${g2},${b2}) 100%)`;
}

const STAGE_NAMES_SHORT = ['Background', 'Accident', 'Medical', 'Treatment'];

function SimCard({ sim: s, caseData, onClick }) {
  const bodyScore = getBodyScore(s);
  const combined = getCombinedScore(s);
  const gradient = getScoreGradient(combined);
  const client = caseData?.client || caseData;
  const clientFallback = client ? `${client.lastName || ''}, ${client.firstName || ''}`.trim() : '';
  const name = caseData?.name || clientFallback || s.callSummaryTitle || s.eventType || 'Simulation';
  const dateStr = new Date(s.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  const duration = s.callDurationSecs != null ? `${Math.max(1, Math.round(s.callDurationSecs / 60))}m` : '—';

  return (
    <button type="button" className="sim-post-card" onClick={onClick} style={{ background: gradient }}>
      {s.stage != null && (
        <div className="sim-post-stage-badge">
          Stage {s.stage}: {STAGE_NAMES_SHORT[s.stage - 1] || 'Unknown'}
        </div>
      )}
      <div className="sim-post-scores">
        <span className="sim-post-score" style={{ color: '#fff' }}>
          {s.score != null ? `${s.score}%` : '—'}
        </span>
        {bodyScore != null && (
          <span className="sim-post-body">Body Language Score: {bodyScore}%</span>
        )}
      </div>
      <div className="sim-post-name">{name}</div>
      <div className="sim-post-meta">
        <span className="sim-post-date">{dateStr}</span>
        <span className="sim-post-duration">{duration !== '—' ? ` · ${duration}` : ''}</span>
      </div>
    </button>
  );
}

/* ===== Case Detail (with simulations) ===== */
function CaseDetail({ caseData: d, tab, switchTab, goBack, goDetail, toast, currentDetail, showToast, onCaseUpdate }) {
  const [sims, setSims] = useState([]);
  const [loadingSims, setLoadingSims] = useState(true);
  const [caseData, setCaseData] = useState(d);
  const [simSort, setSimSort] = useState('newest');
  const [simSearch, setSimSearch] = useState('');
  const [simSearchExpanded, setSimSearchExpanded] = useState(false);
  const [depoSimSentCaseId, setDepoSimSentCaseId] = useState(null);
  const [stageData, setStageData] = useState(null);
  const [caseClients, setCaseClients] = useState(d.caseClients || []);
  const [showAddClient, setShowAddClient] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);

  useEffect(() => { setCaseData(d); setCaseClients(d.caseClients || []); }, [d]);

  useEffect(() => {
    fetch(`${API}/simulations?caseId=${d.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(setSims)
      .catch(() => {})
      .finally(() => setLoadingSims(false));
  }, [d.id]);

  useEffect(() => {
    fetch(`${API}/cases/${d.id}/stages`)
      .then(r => r.ok ? r.json() : null)
      .then(setStageData)
      .catch(() => {});
  }, [d.id]);

  const handleCaseUpdate = (updates) => {
    setCaseData(prev => ({ ...prev, ...updates }));
    onCaseUpdate?.(caseData.id, updates);
  };

  const addClientToCase = async (client) => {
    try {
      const r = await fetch(`${API}/cases/${caseData.id}/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id }),
      });
      if (!r.ok) throw new Error('Failed to add client');
      const cc = await r.json();
      setCaseClients(prev => [...prev, cc]);
      setShowAddClient(false);
      showToast(`${client.lastName}, ${client.firstName} added`);
    } catch { showToast?.('Error adding client'); }
  };

  const removeClientFromCase = async (clientId) => {
    try {
      const r = await fetch(`${API}/cases/${caseData.id}/clients/${clientId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed');
      setCaseClients(prev => prev.filter(cc => cc.clientId !== clientId));
      showToast('Client removed');
    } catch { showToast?.('Error removing client'); }
  };

  const handleStartDeposim = async (targetClient) => {
    const id = caseData.id;
    setDepoSimSentCaseId(id);
    setShowClientPicker(false);
    const simUrl = typeof window !== 'undefined' ? `${window.location.origin}/sim/${id}` : '';
    try {
      const r = await fetch(API + `/cases/${id}/notify-deposim-sent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simUrl, clientId: targetClient?.id || null }),
      });
      if (!r.ok) console.warn('[DepoSim] SMS notify:', r.status, await r.text());
    } catch (e) {
      console.warn('[DepoSim] SMS notify failed:', e);
    }
  };

  const handleCenterAction = () => {
    if (caseClients.length > 1) {
      setShowClientPicker(true);
    } else {
      handleStartDeposim(caseClients[0]?.client || caseData.client);
    }
  };

  const sortedSims = [...sims]
    .filter(s => {
      if (!simSearch.trim()) return true;
      const q = simSearch.toLowerCase();
      const caseName = (caseData?.name || '').toLowerCase();
      const clientName = caseData?.client ? `${(caseData.client.lastName || '')} ${(caseData.client.firstName || '')}`.toLowerCase() : '';
      const num = (caseData?.caseNumber || '').toLowerCase();
      return caseName.includes(q) || clientName.includes(q) || num.includes(q);
    })
    .sort((a, b) => {
      if (simSort === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
      if (simSort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      if (simSort === 'score') return (b.score ?? 0) - (a.score ?? 0);
      return 0;
    });

  const caseDisplayName = caseData.name || (caseData.client ? `${caseData.client.lastName || ''}, ${caseData.client.firstName || ''}`.trim() : '—');
  const alreadyLinkedIds = new Set(caseClients.map(cc => cc.clientId));
  return (
    <div className="app-shell">
      <div className="detail-screen">
        <div className="detail-header case-detail-header">
          <button className="back-btn" onClick={goBack}>{Icons.back}</button>
          <div className="case-detail-header-title">
            <span className="sim-detail-header-name">{caseDisplayName}</span>
            <span className="sim-detail-header-case">#{caseData.caseNumber}</span>
          </div>
        </div>
        <div className="detail-body case-detail-body">
          {stageData && (
            <StageProgressDonuts
              stages={stageData.stages}
              currentStage={stageData.currentStage}
            />
          )}

          <div className="case-clients-section">
            <div className="case-clients-header">
              <span className="case-clients-label">Clients</span>
              <button type="button" className="case-clients-add-btn" onClick={() => setShowAddClient(x => !x)} title="Add client">+</button>
            </div>
            <div className="case-clients-list">
              {caseClients.map(cc => (
                <div key={cc.id || cc.clientId} className="case-client-row">
                  <span className="case-client-name">{cc.client?.lastName}, {cc.client?.firstName}</span>
                  {cc.client?.phone && <span className="case-client-phone">{cc.client.phone}</span>}
                  <span className="case-client-role">{cc.role}</span>
                  {caseClients.length > 1 && (
                    <button type="button" className="case-client-remove" onClick={() => removeClientFromCase(cc.clientId)} title="Remove">&times;</button>
                  )}
                </div>
              ))}
            </div>
            {showAddClient && (
              <div className="case-clients-add-area">
                <ClientAutocomplete
                  selectedClients={[]}
                  onChange={(clients) => {
                    const newClient = clients[clients.length - 1];
                    if (newClient && !alreadyLinkedIds.has(newClient.id)) addClientToCase(newClient);
                  }}
                  placeholder="Search or create client…"
                />
              </div>
            )}
          </div>

          <CaseNameAccordion name={caseData.name} onUpdate={(name) => handleCaseUpdate({ name })} caseId={caseData.id} showToast={showToast} />
          <DescriptionAccordion description={caseData.description} onUpdate={(desc) => handleCaseUpdate({ description: desc })} caseId={caseData.id} showToast={showToast} />

          <div className="call-history-section">
            <div className="cases-subheader">
              <div className={`cases-search-wrap${simSearchExpanded ? ' expanded' : ''}`}>
                <button type="button" className="cases-search-toggle" onClick={() => setSimSearchExpanded(x => !x)} aria-label="Search">
                  {Icons.search}
                </button>
                {simSearchExpanded && (
                  <input type="search" className="cases-search-input" placeholder="Search…" value={simSearch} onChange={e => setSimSearch(e.target.value)} autoFocus />
                )}
              </div>
              <div className="sort-pills">
                {[['newest','Recent'],['oldest','Oldest'],['score','Score']].map(([k,l]) => (
                  <button key={k} className={`sort-pill${simSort === k ? ' active' : ''}`} onClick={() => setSimSort(k)}>{l}</button>
                ))}
              </div>
            </div>
            {loadingSims && <p className="call-history-empty">Loading…</p>}
            {!loadingSims && sims.length === 0 && <p className="call-history-empty">No simulations yet. Start a DepoSim to see results here.</p>}
            <div className="sim-grid">
              {sortedSims.map(s => (
                <SimCard key={s.id} sim={s} caseData={caseData} onClick={() => goDetail('simulation', s, currentDetail)} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <BottomBar tab={tab} onTab={switchTab} onCenterClick={handleCenterAction} centerAction={{ type: 'startDeposim', caseId: caseData.id }} onStartDeposim={handleCenterAction} />
      {toast && <div className="toast">{toast}</div>}
      {depoSimSentCaseId && <DepoSimSentToast caseId={depoSimSentCaseId} onDismiss={() => setDepoSimSentCaseId(null)} />}
      {showClientPicker && (
        <ClientPickerModal
          clients={caseClients}
          onSelect={(client) => handleStartDeposim(client)}
          onCancel={() => setShowClientPicker(false)}
        />
      )}
    </div>
  );
}

/* ===== Stage Progress Donuts (shared between SimPage and CaseDetail) ===== */
function StageProgressDonuts({ stages, currentStage, onStageClick }) {
  const { t } = useT();
  const stageNames = [
    t('sim.stage.name1'),
    t('sim.stage.name2'),
    t('sim.stage.name3'),
    t('sim.stage.name4'),
  ];

  return (
    <div className="stage-progress">
      {[1, 2, 3, 4].map((n, i) => {
        const stage = stages?.find((s) => s.stage === n);
        const status = stage?.status || (n === 1 ? 'available' : 'locked');
        const isCurrent = n === currentStage;
        const isCompleted = status === 'completed';
        const isRetake = stage?.retakeRecommended;
        const isLocked = status === 'locked';

        let stateClass = 'stage-donut-locked';
        if (isCompleted && isRetake) stateClass = 'stage-donut-retake';
        else if (isCompleted) stateClass = 'stage-donut-completed';
        else if (isCurrent || status === 'available') stateClass = 'stage-donut-active';

        return (
          <div key={n} className="stage-donut-wrap">
            {i > 0 && <div className={`stage-connector${n <= currentStage ? ' stage-connector-active' : ''}`} />}
            <button
              type="button"
              className={`stage-donut ${stateClass}`}
              disabled={isLocked && !onStageClick}
              onClick={() => onStageClick?.(n)}
              title={stageNames[n - 1]}
            >
              {isCompleted && !isRetake ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="stage-donut-check">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <span className="stage-donut-num">{n}</span>
              )}
            </button>
            <span className="stage-label">{t(`sim.stage.short${n}`)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ===== Shared AppLayout (theme, toast, outlet) ===== */
function AppLayout() {
  const [theme, setTheme] = useState('dark');
  const [toast, setToast] = useState(null);
  const location = useLocation();
  const nav = useNavigate();
  const access = useAccessLevel();

  useEffect(() => {
    fetch(API + '/settings')
      .then((r) => (r.ok ? r.json() : { theme: 'dark' }))
      .then((d) => {
        const t = d.theme === 'light' ? 'light' : 'dark';
        setTheme(t);
        document.documentElement.setAttribute('data-theme', t);
      })
      .catch(() => {});
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleThemeChange = (t) => {
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
    fetch(API + '/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: t }),
    }).catch(() => {});
  };

  const handleLanguageChange = (lang) => {
    fetch(API + '/client/me/language', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: lang }),
    }).catch(() => {});

    const currentPath = location.pathname;
    const isSpanish = currentPath.startsWith('/es/') || currentPath === '/es';
    const basePath = isSpanish ? currentPath.replace(/^\/es/, '') || '/' : currentPath;
    const newPath = lang === 'es' ? `/es${basePath === '/' ? '' : basePath}` : basePath;
    nav(newPath, { replace: true });
  };

  const activeTab = location.pathname.includes('/settings') ? 'settings' : 'cases';

  return (
    <Outlet context={{ theme, handleThemeChange, handleLanguageChange, toast, showToast, activeTab, access }} />
  );
}

function useAppContext() {
  try {
    return useOutletContext() || {};
  } catch {
    return {};
  }
}

/* ===== Admin-aware UserButton ===== */
function AdminUserButton() {
  return <UserButton />;
}

/* ===== Searchable Select (compact dropdown with type-to-filter) ===== */
function SearchableSelect({ value, onChange, options, placeholder }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const selectedLabel = options.find(o => o.value === value)?.label || '';

  const handleSelect = (v) => {
    onChange(v);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 0); }}
        className={`sort-pill${value ? ' active' : ''}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        {value ? selectedLabel : placeholder}
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ opacity: 0.5 }}><path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 60, marginTop: 4, minWidth: 180, maxHeight: 240, border: '1px solid rgba(128,128,128,0.25)', borderRadius: 10, background: 'var(--card-bg, #1a1a2e)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '6px 8px', borderBottom: '1px solid rgba(128,128,128,0.12)' }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('search.placeholder')}
              style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', color: 'inherit', fontSize: 12, padding: '2px 0' }}
            />
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 200 }}>
            <div
              onClick={() => handleSelect('')}
              style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: !value ? 'var(--accent, #6236ff)' : 'inherit', fontWeight: !value ? 600 : 400, transition: 'background 0.1s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(128,128,128,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              {placeholder}
            </div>
            {filtered.map(o => (
              <div
                key={o.value}
                onClick={() => handleSelect(o.value)}
                style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', color: o.value === value ? 'var(--accent, #6236ff)' : 'inherit', fontWeight: o.value === value ? 600 : 400, transition: 'background 0.1s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(128,128,128,0.08)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                {o.label}
              </div>
            ))}
            {filtered.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--muted)' }}>{t('search.noMatches')}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== Cases List Page ===== */
function CasesListPage() {
  const { theme, handleThemeChange, toast, showToast, activeTab, access } = useAppContext();
  const { t } = useT();
  const prefix = useLangPrefix();
  const nav = useNavigate();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [caseSort, setCaseSort] = useState('newest');
  const [caseSearch, setCaseSearch] = useState('');
  const [caseSearchExpanded, setCaseSearchExpanded] = useState(false);
  const [depoSimSentCaseId, setDepoSimSentCaseId] = useState(null);
  const [filterOrgId, setFilterOrgId] = useState('');
  const [filterLocationId, setFilterLocationId] = useState('');

  const allLocations = access?.locations || [];
  const allOrgs = access?.organizations || [];
  const showOrgFilter = allOrgs.length > 1;
  const showLocationFilter = allLocations.length > 1 || filterOrgId;

  const filteredLocations = filterOrgId
    ? allLocations.filter(l => l.organizationId === filterOrgId)
    : allLocations;

  const [caseScores, setCaseScores] = useState({});
  useEffect(() => {
    fetch(API + '/simulations')
      .then((r) => (r.ok ? r.json() : []))
      .then((sims) => {
        const byCase = {};
        for (const s of sims) {
          if (!s.caseId) continue;
          if (byCase[s.caseId] != null) continue;
          byCase[s.caseId] = getCombinedScore(s) ?? s.score ?? 0;
        }
        setCaseScores(byCase);
      })
      .catch(() => {});
  }, [cases.length]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filterOrgId) params.set('organizationId', filterOrgId);
    if (filterLocationId) params.set('locationId', filterLocationId);
    const qs = params.toString() ? `?${params}` : '';
    setLoading(true);
    fetch(API + '/cases' + qs)
      .then((r) => (r.ok ? r.json() : []))
      .then(setCases)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterOrgId, filterLocationId]);

  // Reset location filter when org filter changes
  useEffect(() => {
    if (filterOrgId && filterLocationId) {
      const loc = allLocations.find(l => l.id === filterLocationId);
      if (loc && loc.organizationId !== filterOrgId) setFilterLocationId('');
    }
  }, [filterOrgId]);

  const sortedCases = [...cases]
    .filter((c) => {
      if (!caseSearch.trim()) return true;
      const q = caseSearch.toLowerCase().trim();
      try {
        return JSON.stringify(c).toLowerCase().includes(q);
      } catch {
        return false;
      }
    })
    .sort((a, b) => {
      if (caseSort === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
      if (caseSort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
      if (caseSort === 'lastName') return (a.name || a.client?.lastName || '').localeCompare(b.name || b.client?.lastName || '');
      return 0;
    });

  if (loading)
    return (
      <div className="app-shell" style={{ display: 'grid', placeItems: 'center' }}>
        <p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p>
      </div>
    );

  return (
    <div className="app-shell">
      <div className="app-body">
        <div className="app-container">
          <div className="feed-header">
            <div className="feed-header-left">
              <a href="https://deposim.com" target="_blank" rel="noopener noreferrer" className="header-logo-link">
                <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="header-logo" />
              </a>
            </div>
            <h1 className="feed-header-title">{t('cases.title')}</h1>
            <div className="feed-header-right">
              <AdminUserButton />
            </div>
          </div>
          <div className="cases-subheader">
            <div className={`cases-search-wrap${caseSearchExpanded ? ' expanded' : ''}`}>
              <button type="button" className="cases-search-toggle" onClick={() => setCaseSearchExpanded((x) => !x)} aria-label="Search">
                {Icons.search}
              </button>
              {caseSearchExpanded && (
                <input type="search" className="cases-search-input" placeholder={t('cases.search')} value={caseSearch} onChange={(e) => setCaseSearch(e.target.value)} autoFocus />
              )}
            </div>
            <div className="cases-subheader-row" style={{ flexWrap: 'wrap' }}>
              <span className="cases-count">
                {t('cases.count', { count: sortedCases.length, s: sortedCases.length !== 1 ? 's' : '' })}
              </span>
              <div className="sort-pills">
                {[
                  ['newest', t('cases.sort.recent')],
                  ['oldest', t('cases.sort.oldest')],
                  ['lastName', t('cases.sort.name')],
                ].map(([k, l]) => (
                  <button key={k} className={`sort-pill${caseSort === k ? ' active' : ''}`} onClick={() => setCaseSort(k)}>
                    {l}
                  </button>
                ))}
              </div>
              {showOrgFilter && (
                <SearchableSelect
                  value={filterOrgId}
                  onChange={v => { setFilterOrgId(v); setFilterLocationId(''); }}
                  options={allOrgs.map(o => ({ value: o.id, label: o.name }))}
                  placeholder={t('cases.filter.allOrgs')}
                />
              )}
              {showLocationFilter && (
                <SearchableSelect
                  value={filterLocationId}
                  onChange={v => setFilterLocationId(v)}
                  options={filteredLocations.map(l => ({ value: l.id, label: l.name }))}
                  placeholder={t('cases.filter.allLocations')}
                />
              )}
            </div>
          </div>
          <div className="tile-grid">
            {sortedCases.map((c) => {
              const score = caseScores[c.id] ?? 0;
              const gradient = getScoreGradient(score);
              const isAuto = (c.description || '').toLowerCase().includes('car') || (c.description || '').toLowerCase().includes('vehicle') || (c.description || '').toLowerCase().includes('rear end');
              return (
                <div key={c.id} className="tile tile-score-bg" style={{ background: gradient }} onClick={() => nav(`${prefix}/cases/${c.id}`)}>
                  <div className="tile-icon">{isAuto ? Icons.car : Icons.walking}</div>
                  <div className="tile-label">#{c.caseNumber}</div>
                  <div className="tile-sublabel">{c.name || (c.client ? `${c.client.lastName || ''}, ${c.client.firstName || ''}`.trim() : '—')}</div>
                </div>
              );
            })}
          </div>
          {sortedCases.length === 0 && (
            <p style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 14 }}>{caseSearch.trim() ? t('cases.noMatch') : t('cases.empty')}</p>
          )}
        </div>
      </div>
      <BottomBar tab="cases" centerAction={null} />
      {toast && <div className="toast">{toast}</div>}
      {depoSimSentCaseId && <DepoSimSentToast caseId={depoSimSentCaseId} onDismiss={() => setDepoSimSentCaseId(null)} />}
    </div>
  );
}

/* ===== Case Detail Page (URL-routed wrapper) ===== */
function CaseDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const prefix = useLangPrefix();
  const { toast, showToast } = useAppContext();
  const [caseData, setCaseData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/cases/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setCaseData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading)
    return (
      <div className="app-shell" style={{ display: 'grid', placeItems: 'center' }}>
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    );
  if (!caseData)
    return (
      <div className="app-shell" style={{ display: 'grid', placeItems: 'center' }}>
        <p style={{ color: 'var(--muted)' }}>Case not found.</p>
      </div>
    );

  const goBack = () => nav(`${prefix}/cases`);
  const goDetail = (type, data) => {
    if (type === 'simulation') nav(`${prefix}/cases/${id}/sim/${data.id}`);
  };
  const handleCaseUpdate = (_caseId, updates) => setCaseData((prev) => ({ ...prev, ...updates }));

  return (
    <CaseDetail
      caseData={caseData}
      tab="cases"
      switchTab={(t) => nav(`${prefix}/${t === 'settings' ? 'settings' : 'cases'}`)}
      goBack={goBack}
      goDetail={goDetail}
      toast={toast}
      currentDetail={{ type: 'case', data: caseData }}
      showToast={showToast}
      onCaseUpdate={handleCaseUpdate}
    />
  );
}

/* ===== Simulation Detail Page (URL-routed wrapper) ===== */
function SimulationDetailPage() {
  const { id, simId } = useParams();
  const nav = useNavigate();
  const prefix = useLangPrefix();
  const { toast, showToast } = useAppContext();
  const [sim, setSim] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/simulations/${simId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setSim)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [simId]);

  if (loading)
    return (
      <div className="app-shell" style={{ display: 'grid', placeItems: 'center' }}>
        <p style={{ color: 'var(--muted)' }}>Loading…</p>
      </div>
    );
  if (!sim)
    return (
      <div className="app-shell" style={{ display: 'grid', placeItems: 'center' }}>
        <p style={{ color: 'var(--muted)' }}>Simulation not found.</p>
      </div>
    );

  const goBack = () => nav(`${prefix}/cases/${id}`);

  return (
    <SimulationDetail
      d={sim}
      tab="cases"
      switchTab={(t) => nav(`${prefix}/${t === 'settings' ? 'settings' : 'cases'}`)}
      goBack={goBack}
      centerAction={sim.case?.id ? { type: 'startDeposim', caseId: sim.case.id } : undefined}
    />
  );
}

/* ===== Create Case Page (URL-routed wrapper) ===== */
function CreateCasePage() {
  const nav = useNavigate();
  const prefix = useLangPrefix();
  const { showToast } = useAppContext();

  return (
    <CreateCaseForm
      goBack={() => nav(`${prefix}/cases`)}
      onSuccess={() => nav(`${prefix}/cases`)}
      showToast={showToast}
      tab="cases"
      switchTab={(t) => nav(`${prefix}/${t === 'settings' ? 'settings' : 'cases'}`)}
    />
  );
}

/* ===== Organization Manager (super-only) ===== */
function OrgManager({ showToast, onOrgChange }) {
  const { t } = useT();
  const [orgs, setOrgs] = useState([]);
  const [unassignedUsers, setUnassignedUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newOrgName, setNewOrgName] = useState('');
  const [creating, setCreating] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [orgUsers, setOrgUsers] = useState([]);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRole, setAssignRole] = useState('admin');
  const [assigning, setAssigning] = useState(false);

  const loadOrgs = () => {
    fetch(API + '/organizations').then(r => r.ok ? r.json() : []).then(setOrgs).catch(() => {}).finally(() => setLoading(false));
  };
  const loadUnassigned = () => {
    const url = selectedOrg
      ? `${API}/users?unassigned=true&assignableToOrg=${encodeURIComponent(selectedOrg)}`
      : `${API}/users?unassigned=true`;
    fetch(url).then(r => r.ok ? r.json() : []).then(setUnassignedUsers).catch(() => {});
  };
  useEffect(() => { loadOrgs(); loadUnassigned(); }, []);
  useEffect(() => { loadUnassigned(); }, [selectedOrg]);

  const loadOrgUsers = (orgId) => {
    fetch(API + `/users?organizationId=${orgId}`).then(r => r.ok ? r.json() : []).then(setOrgUsers).catch(() => {});
  };
  useEffect(() => { if (selectedOrg) loadOrgUsers(selectedOrg); else setOrgUsers([]); }, [selectedOrg]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newOrgName.trim() || creating) return;
    setCreating(true);
    try {
      const r = await fetch(API + '/organizations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newOrgName.trim() }) });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      setNewOrgName('');
      loadOrgs();
      onOrgChange?.();
      showToast(t('org.created'));
    } catch (err) { showToast(t('common.error', { msg: err.message })); }
    finally { setCreating(false); }
  };

  const handleDelete = async (orgId) => {
    if (!window.confirm(t('org.confirmDelete'))) return;
    try {
      const r = await fetch(API + `/organizations/${orgId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed');
      if (selectedOrg === orgId) setSelectedOrg(null);
      loadOrgs();
      onOrgChange?.();
      showToast(t('org.deleted'));
    } catch (err) { showToast(t('common.error', { msg: err.message })); }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!assignUserId || !selectedOrg || assigning) return;
    setAssigning(true);
    try {
      const r = await fetch(API + `/users/${assignUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: selectedOrg, role: assignRole }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      setAssignUserId('');
      loadOrgUsers(selectedOrg);
      loadUnassigned();
      showToast(t('org.assigned'));
    } catch (err) { showToast(t('common.error', { msg: err.message })); }
    finally { setAssigning(false); }
  };

  const handleRemoveFromOrg = async (userId, name) => {
    if (!window.confirm(t('org.confirmRemove', { name }))) return;
    try {
      const r = await fetch(API + `/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: null }),
      });
      if (!r.ok) throw new Error('Failed');
      loadOrgUsers(selectedOrg);
      loadUnassigned();
      showToast(t('org.removed'));
    } catch (err) { showToast(t('common.error', { msg: err.message })); }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      const r = await fetch(API + `/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!r.ok) throw new Error('Failed');
      loadOrgUsers(selectedOrg);
      showToast(t('org.roleUpdated'));
    } catch (err) { showToast(t('common.error', { msg: err.message })); }
  };

  if (loading) return <p style={{ color: 'var(--muted)', padding: 12 }}>{t('org.loading')}</p>;

  const selectedOrgObj = orgs.find(o => o.id === selectedOrg);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Create org */}
      <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8 }}>
        <input className="input" value={newOrgName} onChange={e => setNewOrgName(e.target.value)} placeholder={t('org.newPlaceholder')} style={{ flex: 1 }} />
        <button type="submit" className="btn btn-primary" disabled={creating || !newOrgName.trim()}>{creating ? t('org.creating') : t('org.create')}</button>
      </form>

      {/* Org list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {orgs.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t('org.noOrgs')}</p>}
        {orgs.map(org => (
          <div key={org.id}
            onClick={() => setSelectedOrg(selectedOrg === org.id ? null : org.id)}
            style={{
              padding: '12px 14px', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              background: selectedOrg === org.id ? 'var(--accent-bg, rgba(98,54,255,0.15))' : 'var(--card-bg, rgba(255,255,255,0.04))',
              border: selectedOrg === org.id ? '1px solid var(--accent, #6236ff)' : '1px solid transparent',
              transition: 'all 0.15s',
            }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#6236ff', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
              {(org.name || '?')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{org.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                {t('org.stats', { users: org._count?.users || 0, locations: org._count?.locations || 0, cases: org._count?.cases || 0 })}
              </div>
            </div>
            <button onClick={(e) => { e.stopPropagation(); handleDelete(org.id); }}
              style={{ background: 'none', border: 'none', color: '#ed4956', cursor: 'pointer', fontSize: 12, fontWeight: 500, opacity: 0.7, padding: '2px 6px' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }} onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; }}>
              {t('org.delete')}
            </button>
          </div>
        ))}
      </div>

      {/* Selected org: users */}
      {selectedOrg && selectedOrgObj && (
        <div style={{ padding: '14px 0', borderTop: '1px solid rgba(128,128,128,0.15)' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 15 }}>{t('org.usersIn', { name: selectedOrgObj.name })}</h4>

          {/* Current org users */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {orgUsers.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t('org.noUsers')}</p>}
            {orgUsers.filter(u => u.role !== 'super').map(u => {
              const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id;
              return (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                  {u.imageUrl ? (
                    <img src={u.imageUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#6236ff', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 12, fontWeight: 600 }}>
                      {(name[0] || '?').toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
                    {u.email && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{u.email}</div>}
                  </div>
                  <select
                    value={u.role}
                    onChange={e => handleRoleChange(u.id, e.target.value)}
                    style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(128,128,128,0.25)', background: 'transparent', color: 'inherit' }}
                  >
                    <option value="admin">{t('role.admin')}</option>
                    <option value="user">{t('role.user')}</option>
                  </select>
                  <button onClick={() => handleRemoveFromOrg(u.id, name)}
                    style={{ background: 'none', border: 'none', color: '#ed4956', cursor: 'pointer', fontSize: 12, fontWeight: 500, opacity: 0.7, padding: '2px 6px' }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }} onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; }}>
                    {t('org.remove')}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Assign unassigned user */}
          {unassignedUsers.length > 0 ? (
            <form onSubmit={handleAssign} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="input" value={assignUserId} onChange={e => setAssignUserId(e.target.value)} style={{ flex: 1 }}>
                <option value="">{t('org.selectUser')}</option>
                {unassignedUsers.filter(u => u.role !== 'super').map(u => (
                  <option key={u.id} value={u.id}>{[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id}</option>
                ))}
              </select>
              <select className="input" value={assignRole} onChange={e => setAssignRole(e.target.value)} style={{ width: 'auto' }}>
                <option value="admin">{t('role.admin')}</option>
                <option value="user">{t('role.user')}</option>
              </select>
              <button type="submit" className="btn btn-primary" disabled={assigning || !assignUserId}>{assigning ? t('org.assigning') : t('org.assign')}</button>
            </form>
          ) : (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t('org.noUnassigned')}</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ===== Team & Invites Manager (admin-only) ===== */
function MultiSelectAutocomplete({ options, selected, onChange, placeholder }) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const grouped = {};
  for (const o of filtered) {
    if (!grouped[o.group]) grouped[o.group] = [];
    grouped[o.group].push(o);
  }

  const toggle = (item) => {
    const exists = selected.find(s => s.id === item.id && s.type === item.type);
    if (exists) onChange(selected.filter(s => !(s.id === item.id && s.type === item.type)));
    else onChange([...selected, item]);
  };

  const isSelected = (item) => selected.some(s => s.id === item.id && s.type === item.type);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 8px', border: '1px solid rgba(128,128,128,0.25)', borderRadius: 8, background: 'var(--input-bg, transparent)', minHeight: 34, alignItems: 'center', cursor: 'text' }} onClick={() => setOpen(true)}>
        {selected.map(s => (
          <span key={s.type + ':' + s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 5, fontSize: 12, fontWeight: 500, background: s.type === 'org' ? 'rgba(98,54,255,0.12)' : 'rgba(128,128,128,0.12)', color: 'inherit', border: s.type === 'org' ? '1px solid rgba(98,54,255,0.3)' : '1px solid rgba(128,128,128,0.2)' }}>
            <span style={{ fontSize: 9, opacity: 0.6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.type === 'org' ? t('chip.org') : t('chip.loc')}</span>
            {s.label}
            <span onClick={(e) => { e.stopPropagation(); toggle(s); }} style={{ cursor: 'pointer', marginLeft: 2, opacity: 0.5, fontSize: 14, lineHeight: 1 }}>&times;</span>
          </span>
        ))}
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? (placeholder || t('team.searchPlaceholder')) : ''}
          style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, minWidth: 80, fontSize: 13, color: 'inherit', padding: '2px 0' }}
        />
      </div>
      {open && Object.keys(grouped).length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4, maxHeight: 220, overflowY: 'auto', border: '1px solid rgba(128,128,128,0.25)', borderRadius: 8, background: 'var(--dropdown-bg, var(--card-bg, #1a1a2e))', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: 'var(--muted)', borderBottom: '1px solid rgba(128,128,128,0.1)' }}>{group}</div>
              {items.map(item => (
                <div
                  key={item.type + ':' + item.id}
                  onClick={() => toggle(item)}
                  style={{ padding: '7px 12px', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, background: isSelected(item) ? 'rgba(98,54,255,0.1)' : 'transparent', transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (!isSelected(item)) e.currentTarget.style.background = 'rgba(128,128,128,0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isSelected(item) ? 'rgba(98,54,255,0.1)' : 'transparent'; }}
                >
                  <span style={{ width: 16, height: 16, borderRadius: 4, border: isSelected(item) ? '2px solid var(--accent, #6236ff)' : '2px solid rgba(128,128,128,0.3)', display: 'grid', placeItems: 'center', fontSize: 10, color: '#fff', background: isSelected(item) ? 'var(--accent, #6236ff)' : 'transparent', flexShrink: 0, transition: 'all 0.1s' }}>
                    {isSelected(item) && '✓'}
                  </span>
                  {item.label}
                  {item.sublabel && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>{item.sublabel}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {open && Object.keys(grouped).length === 0 && query.trim() && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4, padding: '12px', border: '1px solid rgba(128,128,128,0.25)', borderRadius: 8, background: 'var(--dropdown-bg, var(--card-bg, #1a1a2e))', boxShadow: '0 8px 24px rgba(0,0,0,0.3)', fontSize: 13, color: 'var(--muted)' }}>
          {t('multiSelect.noMatches')}
        </div>
      )}
    </div>
  );
}

function MemberManager({ showToast, orgRefresh }) {
  const { t } = useT();
  const { access } = useAppContext();
  const isSuper = access?.isSuper;
  const [orgs, setOrgs] = useState([]);
  const [allLocations, setAllLocations] = useState([]);
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('user');
  const [inviteSelections, setInviteSelections] = useState([]);
  const [inviting, setInviting] = useState(false);
  const [changingRole, setChangingRole] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [revoking, setRevoking] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const loadAll = () => {
    const fetches = [
      fetch(API + '/users').then(r => r.ok ? r.json() : []),
      fetch(API + '/invites').then(r => r.ok ? r.json() : []),
      fetch(API + '/locations').then(r => r.ok ? r.json() : []),
    ];
    if (isSuper) {
      fetches.push(fetch(API + '/organizations').then(r => r.ok ? r.json() : []));
    }
    Promise.all(fetches).then(([u, inv, locs, orgList]) => {
      setUsers(u);
      setInvites(inv);
      setAllLocations(locs);
      if (orgList) setOrgs(orgList);
    }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { loadAll(); }, [orgRefresh]);

  // Build autocomplete options: locations + organizations
  const autocompleteOptions = [
    ...allLocations.map(loc => {
      const orgName = orgs.find(o => o.id === loc.organizationId)?.name;
      return { id: loc.id, type: 'location', label: loc.name, sublabel: orgName || '', group: t('group.locations') };
    }),
    ...orgs.map(o => ({ id: o.id, type: 'org', label: o.name, sublabel: t('multiSelect.locationCount', { count: allLocations.filter(l => l.organizationId === o.id).length }), group: t('group.organizations') })),
  ];

  // Resolve selections into locationIds + organizationId for the invite
  const resolveInvitePayload = () => {
    const selectedLocIds = new Set();
    const selectedOrgIds = [];
    for (const s of inviteSelections) {
      if (s.type === 'location') {
        selectedLocIds.add(s.id);
      } else if (s.type === 'org') {
        selectedOrgIds.push(s.id);
        for (const loc of allLocations) {
          if (loc.organizationId === s.id) selectedLocIds.add(loc.id);
        }
      }
    }
    return { locationIds: [...selectedLocIds], organizationIds: selectedOrgIds };
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (inviting) return;
    const { locationIds, organizationIds } = resolveInvitePayload();
    if (locationIds.length === 0 && organizationIds.length === 0) {
      showToast(t('team.selectRequired'));
      return;
    }
    setInviting(true);
    try {
      const body = {
        email: inviteEmail.trim() || null,
        role: inviteRole,
        locationIds,
      };
      if (organizationIds.length > 0 && locationIds.length === 0) {
        body.organizationId = organizationIds[0];
      }
      const r = await fetch(API + '/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      setInviteEmail('');
      setInviteSelections([]);
      loadAll();
      showToast(t('team.inviteCreated'));
    } catch (err) { showToast(t('common.error', { msg: err.message })); }
    finally { setInviting(false); }
  };

  const handleRoleChange = async (userId, newRole) => {
    setChangingRole(userId);
    try {
      const r = await fetch(API + `/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      loadAll();
      showToast(t('team.roleUpdated'));
    } catch (err) { showToast(t('common.error', { msg: err.message })); }
    finally { setChangingRole(null); }
  };

  const handleRemoveUser = async (userId, name) => {
    if (!window.confirm(t('team.confirmRemove', { name }))) return;
    setRemoving(userId);
    try {
      const r = await fetch(API + `/users/${userId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed');
      loadAll();
      showToast(t('team.userRemoved'));
    } catch (err) { showToast(t('common.error', { msg: err.message })); }
    finally { setRemoving(null); }
  };

  const handleRevokeInvite = async (inviteId) => {
    setRevoking(inviteId);
    try {
      const r = await fetch(API + `/invites/${inviteId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed');
      loadAll();
      showToast(t('team.inviteRevoked'));
    } catch (err) { showToast(t('common.error', { msg: err.message })); }
    finally { setRevoking(null); }
  };

  const copyInviteLink = (code) => {
    const url = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(code);
      setTimeout(() => setCopiedId(null), 2000);
      showToast(t('team.linkCopied'));
    });
  };

  if (loading) return <p style={{ color: 'var(--muted)', padding: 12 }}>{t('team.loading')}</p>;

  const pendingInvites = invites.filter(i => !i.usedBy);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Invite form */}
      <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            type="email"
            placeholder={t('team.emailPlaceholder')}
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            style={{ flex: 1, minWidth: 140 }}
          />
          <select className="input" value={inviteRole} onChange={e => { setInviteRole(e.target.value); setInviteSelections([]); }} style={{ width: 'auto' }}>
            <option value="admin">{t('role.admin')}</option>
            <option value="user">{t('role.user')}</option>
          </select>
          <button type="submit" className="btn btn-primary" disabled={inviting}>
            {inviting ? t('team.creating') : t('team.createInvite')}
          </button>
        </div>

        <MultiSelectAutocomplete
          options={autocompleteOptions}
          selected={inviteSelections}
          onChange={setInviteSelections}
          placeholder={t('team.searchPlaceholder')}
        />
      </form>

      {/* Current members */}
      {users.filter(u => u.role !== 'super').length > 0 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{t('team.members')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {users.filter(u => u.role !== 'super').map(u => {
              const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || t('team.unknown');
              const userLocs = (u.userLocations || []).map(ul => {
                const loc = allLocations.find(l => l.id === (ul.locationId || ul));
                return loc?.name;
              }).filter(Boolean);
              return (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                  {u.imageUrl ? (
                    <img src={u.imageUrl} alt="" style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#6236ff', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 13, fontWeight: 600 }}>
                      {name[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                    {u.email && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{u.email}</div>}
                    {userLocs.length > 0 && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{userLocs.join(', ')}</div>}
                  </div>
                  <select
                    value={u.role}
                    onChange={e => handleRoleChange(u.id, e.target.value)}
                    disabled={changingRole === u.id}
                    style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: '1px solid rgba(128,128,128,0.25)', background: 'transparent', color: 'inherit' }}
                  >
                    <option value="admin">{t('role.admin')}</option>
                    <option value="user">{t('role.user')}</option>
                  </select>
                  <button
                    onClick={() => handleRemoveUser(u.id, name)}
                    disabled={removing === u.id}
                    style={{ background: 'none', border: 'none', color: '#ed4956', cursor: 'pointer', fontSize: 12, fontWeight: 500, opacity: 0.7, padding: '2px 6px' }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; }}
                  >
                    {t('team.remove')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending invites */}
      {pendingInvites.length > 0 && (
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{t('team.pendingInvites')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pendingInvites.map(inv => {
              const invLocs = (inv.locationIds || []).map(lid => allLocations.find(l => l.id === lid)?.name).filter(Boolean);
              return (
                <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(128,128,128,0.15)', display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 13, fontWeight: 600 }}>
                    {(inv.email || '?')[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{inv.email || t('team.noEmail')}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {t(`role.${inv.role}`) || inv.role} · {new Date(inv.createdAt).toLocaleDateString()}
                      {invLocs.length > 0 && ` · ${invLocs.join(', ')}`}
                    </div>
                  </div>
                  <button
                    onClick={() => copyInviteLink(inv.code)}
                    style={{ background: 'none', border: '1px solid rgba(128,128,128,0.25)', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 500, padding: '3px 8px', color: 'inherit' }}
                  >
                    {copiedId === inv.code ? t('team.copied') : t('team.copyLink')}
                  </button>
                  <button
                    onClick={() => handleRevokeInvite(inv.id)}
                    disabled={revoking === inv.id}
                    style={{ background: 'none', border: 'none', color: '#ed4956', cursor: 'pointer', fontSize: 12, fontWeight: 500, opacity: 0.7, padding: '2px 6px' }}
                    onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                    onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; }}
                  >
                    {t('team.revoke')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {users.filter(u => u.role !== 'super').length === 0 && pendingInvites.length === 0 && (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t('team.empty')}</p>
      )}
    </div>
  );
}

/* ===== Location Manager (admin-only) ===== */
function LocationManager({ showToast, orgRefresh }) {
  const { t } = useT();
  const { access } = useAppContext();
  const isSuper = access?.isSuper;
  const [orgs, setOrgs] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState(access?.orgId || '');
  const [locations, setLocations] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedLoc, setSelectedLoc] = useState(null);
  const [locUsers, setLocUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newLocName, setNewLocName] = useState('');
  const [creating, setCreating] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (isSuper) {
      fetch(API + '/organizations').then(r => r.ok ? r.json() : []).then(list => {
        setOrgs(list);
        if (!selectedOrgId && list.length > 0) setSelectedOrgId(list[0].id);
      }).catch(() => {});
    }
  }, [isSuper, orgRefresh]);

  const effectiveOrgId = isSuper ? selectedOrgId : access?.orgId;

  const loadLocations = () => {
    const qs = effectiveOrgId ? `?organizationId=${effectiveOrgId}` : '';
    fetch(API + '/locations' + qs).then(r => r.ok ? r.json() : []).then(setLocations).catch(() => {}).finally(() => setLoading(false));
  };
  const loadUsers = () => {
    fetch(API + '/users').then(r => r.ok ? r.json() : []).then(setUsers).catch(() => {});
  };
  useEffect(() => { setSelectedLoc(null); loadLocations(); loadUsers(); }, [effectiveOrgId]);

  const loadLocUsers = (locId) => {
    fetch(API + `/locations/${locId}/users`).then(r => r.ok ? r.json() : []).then(setLocUsers).catch(() => {});
  };

  useEffect(() => { if (selectedLoc) loadLocUsers(selectedLoc); else setLocUsers([]); }, [selectedLoc]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newLocName.trim() || creating || !effectiveOrgId) return;
    setCreating(true);
    try {
      const r = await fetch(API + '/locations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newLocName.trim(), organizationId: effectiveOrgId }) });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      setNewLocName('');
      loadLocations();
      showToast(t('loc.created'));
    } catch (err) { showToast(t('common.error', { msg: err.message })); }
    finally { setCreating(false); }
  };

  const handleDelete = async (locId) => {
    if (!window.confirm(t('loc.confirmDelete'))) return;
    try {
      const r = await fetch(API + `/locations/${locId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed');
      if (selectedLoc === locId) setSelectedLoc(null);
      loadLocations();
      showToast(t('loc.deleted'));
    } catch (err) { showToast(t('common.error', { msg: err.message })); }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!assignUserId || !selectedLoc || assigning) return;
    setAssigning(true);
    try {
      const r = await fetch(API + `/locations/${selectedLoc}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: assignUserId }) });
      if (!r.ok) throw new Error((await r.json()).error || 'Failed');
      setAssignUserId('');
      loadLocUsers(selectedLoc);
      showToast(t('loc.assigned'));
    } catch (err) { showToast(t('common.error', { msg: err.message })); }
    finally { setAssigning(false); }
  };

  const handleRemoveUser = async (userId) => {
    if (!selectedLoc) return;
    try {
      const r = await fetch(API + `/locations/${selectedLoc}/users/${userId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed');
      loadLocUsers(selectedLoc);
      showToast(t('loc.removedUser'));
    } catch (err) { showToast(t('common.error', { msg: err.message })); }
  };

  if (loading) return <p style={{ color: 'var(--muted)', padding: 12 }}>{t('loc.loading')}</p>;

  const assignedUserIds = new Set(locUsers.map(u => u.id));
  const unassignedUsers = users.filter(u => !assignedUserIds.has(u.id));
  const selectedLocObj = locations.find(l => l.id === selectedLoc);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Org picker for super users */}
      {isSuper && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>{t('loc.modifyingFor')}</p>
          <select className="input" value={selectedOrgId} onChange={e => setSelectedOrgId(e.target.value)}>
            <option value="">{t('loc.selectOrg')}</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}

      {/* Create location */}
      {effectiveOrgId && (
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 8 }}>
          <input className="input" value={newLocName} onChange={e => setNewLocName(e.target.value)} placeholder={t('loc.newPlaceholder')} style={{ flex: 1 }} />
          <button type="submit" className="btn btn-primary" disabled={creating || !newLocName.trim()}>{creating ? t('loc.creating') : t('loc.addLocation')}</button>
        </form>
      )}

      {/* Location list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {locations.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t('loc.noLocations')}</p>}
        {locations.map(loc => (
          <div key={loc.id}
            onClick={() => setSelectedLoc(selectedLoc === loc.id ? null : loc.id)}
            style={{
              padding: '10px 14px', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
              background: selectedLoc === loc.id ? 'var(--accent-bg, rgba(98,54,255,0.15))' : 'var(--card-bg, rgba(255,255,255,0.04))',
              border: selectedLoc === loc.id ? '1px solid var(--accent, #6236ff)' : '1px solid transparent',
              transition: 'all 0.15s',
            }}>
            <span style={{ flex: 1, fontWeight: 500, fontSize: 14 }}>{loc.name}</span>
            <button onClick={(e) => { e.stopPropagation(); handleDelete(loc.id); }}
              style={{ background: 'none', border: 'none', color: '#ed4956', cursor: 'pointer', fontSize: 12, fontWeight: 500, opacity: 0.7, padding: '2px 6px' }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }} onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; }}>
              {t('loc.delete')}
            </button>
          </div>
        ))}
      </div>

      {/* Selected location: user assignments */}
      {selectedLoc && selectedLocObj && (
        <div style={{ padding: '14px 0', borderTop: '1px solid rgba(128,128,128,0.15)' }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 15 }}>{t('loc.membersIn', { name: selectedLocObj.name })}</h4>

          {/* Assigned users */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {locUsers.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t('loc.noMembers')}</p>}
            {locUsers.map(u => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                {u.imageUrl ? (
                  <img src={u.imageUrl} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#6236ff', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 12, fontWeight: 600 }}>
                    {(u.firstName || u.email || '?')[0].toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || t('team.unknown')}</div>
                  {u.email && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{u.email}</div>}
                </div>
                <button onClick={() => handleRemoveUser(u.id)}
                  style={{ background: 'none', border: 'none', color: '#ed4956', cursor: 'pointer', fontSize: 12, fontWeight: 500, opacity: 0.7, padding: '2px 6px' }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }} onMouseLeave={e => { e.currentTarget.style.opacity = '0.7'; }}>
                  {t('loc.remove')}
                </button>
              </div>
            ))}
          </div>

          {/* Assign user */}
          {unassignedUsers.length > 0 ? (
            <form onSubmit={handleAssign} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select className="input" value={assignUserId} onChange={e => setAssignUserId(e.target.value)} style={{ flex: 1 }}>
                <option value="">{t('loc.selectMember')}</option>
                {unassignedUsers.map(u => (
                  <option key={u.id} value={u.id}>{[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u.id}</option>
                ))}
              </select>
              <button type="submit" className="btn btn-primary" disabled={assigning || !assignUserId}>{assigning ? t('loc.assigning') : t('loc.assign')}</button>
            </form>
          ) : (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>
              {users.length === 0
                ? t('loc.noMembersAvail')
                : t('loc.allAssigned')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ===== Invite Claim Page ===== */
function InviteClaimPage() {
  const { t } = useT();
  const { code } = useParams();
  const { isSignedIn, isLoaded } = useAuth();
  const nav = useNavigate();
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) return;
    if (status !== 'idle') return;

    setStatus('claiming');
    fetch(API + '/invites/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ code }),
    })
      .then(async r => {
        if (r.ok) {
          setStatus('success');
          setTimeout(() => nav('/cases', { replace: true }), 1500);
        } else {
          const d = await r.json().catch(() => ({}));
          setError(d.error || t('invite.failed'));
          setStatus('error');
        }
      })
      .catch(() => {
        setError(t('invite.networkError'));
        setStatus('error');
      });
  }, [isLoaded, isSignedIn, code, status, nav]);

  if (!isLoaded) return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: '#888' }}>{t('invite.loading')}</div>;

  if (!isSignedIn) {
    return <RedirectToSignIn afterSignInUrl={`/invite/${code}`} afterSignUpUrl={`/invite/${code}`} />;
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', fontFamily: 'inherit' }}>
      <div style={{ textAlign: 'center', maxWidth: 400, padding: 32 }}>
        <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" style={{ width: 200, marginBottom: 24 }} />
        {status === 'claiming' && <p style={{ color: '#888', fontSize: 15 }}>{t('invite.joining')}</p>}
        {status === 'success' && <p style={{ color: '#16981c', fontSize: 15, fontWeight: 500 }}>{t('invite.success')}</p>}
        {status === 'error' && (
          <div>
            <p style={{ color: '#ed4956', fontSize: 15, fontWeight: 500 }}>{error}</p>
            <button
              onClick={() => nav('/cases', { replace: true })}
              className="btn btn-primary"
              style={{ marginTop: 16 }}
            >
              {t('invite.goToDashboard')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===== Settings Page ===== */
function SettingsPage() {
  const { theme, handleThemeChange, handleLanguageChange, toast, showToast, access } = useAppContext();
  const { t, lang } = useT();
  const [showPrompts, setShowPrompts] = useState(false);
  const [orgRefresh, setOrgRefresh] = useState(0);
  const bumpOrgRefresh = useCallback(() => setOrgRefresh(n => n + 1), []);

  useEffect(() => {
    let buf = '';
    const handler = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = (e.key || '').toLowerCase();
      if (key.length === 1 && /[a-z]/.test(key)) {
        buf = (buf + key).slice(-20);
        if (buf.includes('prompts')) setShowPrompts(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="app-shell">
      <div className="app-body">
        <div className="app-container">
          <div className="feed-header">
            <div className="feed-header-left">
              <a href="https://deposim.com" target="_blank" rel="noopener noreferrer" className="header-logo-link">
                <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="header-logo" />
              </a>
            </div>
            <h1 className="feed-header-title">{t('settings.title')}</h1>
            <div className="feed-header-right">
              <AdminUserButton />
            </div>
          </div>
          <div className="card">
            <h3>{t('settings.appearance')}</h3>
            <div className="theme-switch">
              <button className={`theme-btn${theme === 'dark' ? ' active' : ''}`} onClick={() => handleThemeChange('dark')}>
                {t('settings.dark')}
              </button>
              <button className={`theme-btn${theme === 'light' ? ' active' : ''}`} onClick={() => handleThemeChange('light')}>
                {t('settings.light')}
              </button>
            </div>
            <div style={{ marginTop: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{t('settings.language')}</h4>
              <div className="theme-switch">
                <button className={`theme-btn${lang === 'en' ? ' active' : ''}`} onClick={() => handleLanguageChange('en')}>
                  {t('settings.lang.en')}
                </button>
                <button className={`theme-btn${lang === 'es' ? ' active' : ''}`} onClick={() => handleLanguageChange('es')}>
                  {t('settings.lang.es')}
                </button>
              </div>
            </div>
          </div>
          <div className="card">
            <h3>{t('settings.integration')}</h3>
            <div className="integration-fields">
              <label>
                <span className="label-text">Filevine URL</span>
                <input type="text" className="input" placeholder="https://app.filevine.com" />
              </label>
              <label>
                <span className="label-text">User ID</span>
                <input type="text" className="input" placeholder="User ID" />
              </label>
              <label>
                <span className="label-text">Access Token</span>
                <input type="password" className="input" placeholder="Access Token" />
              </label>
            </div>
          </div>
          {access?.isAdmin && (
            <div className="card">
              <h3>{t('settings.teamInvites')}</h3>
              <MemberManager showToast={showToast} orgRefresh={orgRefresh} />
            </div>
          )}
          {access?.isSuper && (
            <div className="card">
              <h3>{t('settings.organizations')}</h3>
              <OrgManager showToast={showToast} onOrgChange={bumpOrgRefresh} />
            </div>
          )}
          {access?.isAdmin && (
            <div className="card">
              <h3>{t('settings.locations')}</h3>
              <LocationManager showToast={showToast} orgRefresh={orgRefresh} />
            </div>
          )}
          {showPrompts && (
            <div className="card">
              <h3>{t('settings.prompts')}</h3>
              <PromptManager showToast={showToast} />
            </div>
          )}
        </div>
      </div>
      <BottomBar tab="settings" />
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ===== Client Portal: Cases List ===== */
function ClientCasesPage() {
  const { t } = useT();
  const nav = useNavigate();
  const prefix = useLangPrefix();
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/client/cases`)
      .then(r => r.ok ? r.json() : [])
      .then(setCases)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="app-shell" style={{ display: 'grid', placeItems: 'center' }}>
      <p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p>
    </div>
  );

  return (
    <div className="app-shell">
      <div className="app-body">
        <div className="app-container">
          <div className="feed-header">
            <div className="feed-header-left">
              <a href="https://deposim.com" target="_blank" rel="noopener noreferrer" className="header-logo-link">
                <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="header-logo" />
              </a>
            </div>
            <h1 className="feed-header-title">{t('client.title')}</h1>
            <div className="feed-header-right">
              <UserButton />
            </div>
          </div>
          {cases.length === 0 ? (
            <div className="client-empty-state">
              <p className="client-empty-msg">{t('client.noCases')}</p>
              <p className="client-empty-hint">{t('client.noCasesHint')}</p>
            </div>
          ) : (
            <div className="tile-grid">
              {cases.map(c => {
                const score = c.simulations?.[0]?.score ?? null;
                const gradient = getScoreGradient(score);
                return (
                  <div key={c.id} className="tile tile-score-bg" style={{ background: gradient }} onClick={() => nav(`${prefix}/client/cases/${c.id}`)}>
                    <div className="tile-icon">{Icons.cases}</div>
                    <div className="tile-label">#{c.caseNumber}</div>
                    <div className="tile-sublabel">{c.name || (c.client ? `${c.client.lastName || ''}, ${c.client.firstName || ''}`.trim() : '—')}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===== Client Portal: Case Detail ===== */
function ClientCaseDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const prefix = useLangPrefix();
  const { t } = useT();
  const [caseData, setCaseData] = useState(null);
  const [sims, setSims] = useState([]);
  const [stageData, setStageData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/client/cases/${id}`).then(r => r.ok ? r.json() : null),
      fetch(`${API}/client/cases/${id}/simulations`).then(r => r.ok ? r.json() : []),
      fetch(`${API}/client/cases/${id}/stages`).then(r => r.ok ? r.json() : null),
    ])
      .then(([c, s, st]) => { setCaseData(c); setSims(s); setStageData(st); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="app-shell" style={{ display: 'grid', placeItems: 'center' }}>
      <p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p>
    </div>
  );
  if (!caseData) return (
    <div className="app-shell" style={{ display: 'grid', placeItems: 'center' }}>
      <p style={{ color: 'var(--muted)' }}>Case not found.</p>
    </div>
  );

  const caseDisplayName = caseData.name || (caseData.client ? `${caseData.client.lastName || ''}, ${caseData.client.firstName || ''}`.trim() : '—');
  const currentStageNum = stageData?.currentStage ?? 1;

  return (
    <div className="app-shell">
      <div className="detail-screen">
        <div className="detail-header case-detail-header">
          <button className="back-btn" onClick={() => nav(`${prefix}/client`)}>{Icons.back}</button>
          <div className="case-detail-header-title">
            <span className="sim-detail-header-name">{caseDisplayName}</span>
            <span className="sim-detail-header-case">#{caseData.caseNumber}</span>
          </div>
        </div>
        <div className="detail-body case-detail-body">
          {stageData && (
            <StageProgressDonuts stages={stageData.stages} currentStage={stageData.currentStage} />
          )}

          <div className="client-action-bar">
            <button
              className="primary-btn"
              onClick={() => nav(`${prefix}/sim/${id}/stage/${currentStageNum}`)}
            >
              {t('client.startSim')}
            </button>
          </div>

          <div className="call-history-section">
            <h3 className="call-history-title">{t('client.simHistory')}</h3>
            {sims.length === 0 && <p className="call-history-empty">{t('client.noSims')}</p>}
            <div className="sim-grid">
              {sims.map(s => (
                <SimCard
                  key={s.id}
                  sim={s}
                  caseData={caseData}
                  onClick={() => nav(`${prefix}/client/cases/${id}/sim/${s.id}`)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Client Portal: Simulation Detail ===== */
function ClientSimDetailPage() {
  const { id, simId } = useParams();
  const nav = useNavigate();
  const prefix = useLangPrefix();
  const { t } = useT();
  const [sim, setSim] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/client/simulations/${simId}`)
      .then(r => r.ok ? r.json() : null)
      .then(setSim)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [simId]);

  if (loading) return (
    <div className="app-shell" style={{ display: 'grid', placeItems: 'center' }}>
      <p style={{ color: 'var(--muted)' }}>{t('common.loading')}</p>
    </div>
  );
  if (!sim) return (
    <div className="app-shell" style={{ display: 'grid', placeItems: 'center' }}>
      <p style={{ color: 'var(--muted)' }}>Simulation not found.</p>
    </div>
  );

  return (
    <SimulationDetail
      d={sim}
      tab="cases"
      switchTab={() => {}}
      goBack={() => nav(`${prefix}/client/cases/${id}`)}
    />
  );
}

/* ===== Client Portal Layout (auth gate for clients) ===== */
function ClientLayout() {
  return (
    <>
      <SignedIn><Outlet /></SignedIn>
      <SignedOut><RedirectToSignIn /></SignedOut>
    </>
  );
}

/* ===== Spanish Routes Wrapper ===== */
function SpanishRoutes() {
  return (
    <LanguageProvider lang="es">
      <Routes>
        <Route path="/" element={<AuthRedirect />} />
        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route path="cases" element={<CasesListPage />} />
          <Route path="cases/new" element={<CreateCasePage />} />
          <Route path="cases/:id" element={<CaseDetailPage />} />
          <Route path="cases/:id/sim/:simId" element={<SimulationDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        {/* Client portal (auth required, no org) */}
        <Route element={<ClientLayout />}>
          <Route path="client" element={<ClientCasesPage />} />
          <Route path="client/cases/:id" element={<ClientCaseDetailPage />} />
          <Route path="client/cases/:id/sim/:simId" element={<ClientSimDetailPage />} />
        </Route>
        <Route path="invite/:code" element={<InviteClaimPage />} />
        <Route path="sim/:caseId" element={<Navigate to="stage/1" replace />} />
        <Route path="sim/:caseId/stage/:stage" element={<SimPage />} />
      </Routes>
    </LanguageProvider>
  );
}

/* ===== Root App ===== */

/* ===== No Access Page: shown when signed in but no org/client link ===== */
function NoAccessPage() {
  const { t } = useT();
  const { signOut } = useAuth();
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', fontFamily: 'inherit' }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: 32 }}>
        <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" style={{ width: 200, marginBottom: 24 }} />
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{t('noAccess.title')}</h2>
        <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6 }}>
          {t('noAccess.message')}
        </p>
        <button
          onClick={() => signOut()}
          className="btn"
          style={{ marginTop: 20, padding: '10px 24px', fontSize: 14 }}
        >
          {t('noAccess.signOut')}
        </button>
      </div>
    </div>
  );
}

/* ===== Auth Redirect: admin/user to /cases, clients to /client ===== */
function AuthRedirect() {
  const { isSignedIn, isLoaded } = useAuth();
  const { accessLevel, language, loading } = useAccessLevel();
  const contextPrefix = useLangPrefix();

  if (!isLoaded || loading) return (
    <div className="app-shell" style={{ display: 'grid', placeItems: 'center' }}>
      <p style={{ color: 'var(--muted)' }}>Loading…</p>
    </div>
  );
  if (!isSignedIn) return <RedirectToSignIn />;

  const prefix = (language && language !== 'en') ? `/${language}` : contextPrefix;

  if (accessLevel === 'super' || accessLevel === 'org' || accessLevel === 'user') return <Navigate to={`${prefix}/cases`} replace />;
  if (accessLevel === 'client') return <Navigate to={`${prefix}/client`} replace />;

  return <NoAccessPage />;
}

/* ===== Auth gate: require sign-in + org or user access for staff routes ===== */
function RequireAuth({ children }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { accessLevel, loading } = useAccessLevel();
  const prefix = useLangPrefix();

  if (!isLoaded || loading) return (
    <div className="app-shell" style={{ display: 'grid', placeItems: 'center' }}>
      <p style={{ color: 'var(--muted)' }}>Loading…</p>
    </div>
  );

  if (!isSignedIn) return <RedirectToSignIn />;
  if (accessLevel === 'client') return <Navigate to={`${prefix}/client`} replace />;
  if (!accessLevel) return <NoAccessPage />;

  return children;
}

export default function App() {
  return (
    <LanguageProvider lang="en">
      <Routes>
        <Route path="/" element={<AuthRedirect />} />
        <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route path="/cases" element={<CasesListPage />} />
          <Route path="/cases/new" element={<CreateCasePage />} />
          <Route path="/cases/:id" element={<CaseDetailPage />} />
          <Route path="/cases/:id/sim/:simId" element={<SimulationDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        {/* Client portal (auth required, no org) */}
        <Route element={<ClientLayout />}>
          <Route path="/client" element={<ClientCasesPage />} />
          <Route path="/client/cases/:id" element={<ClientCaseDetailPage />} />
          <Route path="/client/cases/:id/sim/:simId" element={<ClientSimDetailPage />} />
        </Route>
        {/* Invite claim */}
        <Route path="/invite/:code" element={<InviteClaimPage />} />
        {/* Public: deponent simulation routes (no sign-in required) */}
        <Route path="/sim/:caseId" element={<Navigate to="stage/1" replace />} />
        <Route path="/sim/:caseId/stage/:stage" element={<SimPage />} />
        <Route path="/es/*" element={<SpanishRoutes />} />
      </Routes>
    </LanguageProvider>
  );
}
