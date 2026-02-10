import { useState, useEffect, useRef, useCallback } from 'react';
import WebcamRecorder from './WebcamRecorder';
import './App.css';

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
function CaseDetail({ caseData: d, tab, switchTab, goBack, goDetail, toast }) {
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
            <a className="btn btn-sm primary" href={`/api/sim/${d.id}`} target="_blank" rel="noopener">
              Start DepoSim
            </a>
          </div>

          {/* Call History */}
          <div style={{ marginTop: 28 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Call History</h3>
            {loadingSims && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Loading…</p>}
            {!loadingSims && sims.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>No simulations yet. Start a DepoSim to see results here.</p>}
            {sims.map(s => (
              <div key={s.id} className="sim-card" onClick={() => goDetail('simulation', s)}>
                <div className="sim-card-top">
                  <span className="sim-score" style={{ color: s.winReady >= 75 ? '#58c322' : s.winReady >= 50 ? '#ffab00' : '#ed4956' }}>
                    {s.winReady != null ? `${s.winReady}%` : '—'}
                  </span>
                  <span className="sim-title">{s.callSummaryTitle || s.eventType || 'Simulation'}</span>
                  <span className="sim-date">{new Date(s.createdAt).toLocaleDateString()}</span>
                </div>
                {s.winReadyReason && <div className="sim-reason">{s.winReadyReason}</div>}
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
export default function App() {
  const [tab, setTab] = useState('cases');
  const [detail, setDetail] = useState(null); // { type, data }
  const [cases, setCases] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState('dark');
  const [toast, setToast] = useState(null);

  // Filters
  const [caseSort, setCaseSort] = useState('newest');
  const [filterOpen, setFilterOpen] = useState(false);

  // Video analysis
  const [inputMode, setInputMode] = useState('record');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const fileInputRef = useRef(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState('');
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [pastAnalyses, setPastAnalyses] = useState([]);

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

  useEffect(() => {
    if (tab === 'sims') {
      fetch(API + '/video-analyses').then(r => r.ok ? r.json() : []).then(setPastAnalyses).catch(() => {});
    }
  }, [tab]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const handleThemeChange = (t) => {
    setTheme(t);
    document.documentElement.setAttribute('data-theme', t);
    fetch(API + '/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: t }) }).catch(() => {});
  };

  const goDetail = (type, data) => setDetail({ type, data });
  const goBack = () => setDetail(null);
  const switchTab = (t) => { setDetail(null); setTab(t); };

  // Sort cases
  const sortedCases = [...cases].sort((a, b) => {
    if (caseSort === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
    if (caseSort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
    if (caseSort === 'lastName') return (a.lastName || '').localeCompare(b.lastName || '');
    return 0;
  });

  /* ===== Video analysis handlers ===== */
  const uploadAndAnalyze = async (blob, filename) => {
    setAnalyzing(true); setAnalysisResult(null); setAnalysisError(null); setAnalyzeStatus('Uploading…');
    try {
      const fd = new FormData(); fd.append('video', blob, filename);
      const r = await fetch(API + '/analyze-video/upload', { method: 'POST', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Failed');
      setAnalysisResult(d); setPastAnalyses(p => [d, ...p]);
    } catch (e) { setAnalysisError(e.message); }
    finally { setAnalyzing(false); setAnalyzeStatus(''); }
  };
  const handleRecordingComplete = useCallback((b) => setRecordedBlob(b), []);
  const handleAnalyzeRecording = () => { if (recordedBlob) uploadAndAnalyze(recordedBlob, 'recording.webm'); };
  const handleAnalyzeUrl = async (e) => {
    e.preventDefault(); if (!youtubeUrl.trim()) return;
    setAnalyzing(true); setAnalysisResult(null); setAnalysisError(null); setAnalyzeStatus('Analyzing…');
    try {
      const r = await fetch(API + '/analyze-video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ youtubeUrl: youtubeUrl.trim() }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Failed');
      setAnalysisResult(d); setPastAnalyses(p => [d, ...p]);
    } catch (e) { setAnalysisError(e.message); }
    finally { setAnalyzing(false); setAnalyzeStatus(''); }
  };
  const handleAnalyzeUpload = async (e) => {
    e.preventDefault(); if (!videoFile) return;
    await uploadAndAnalyze(videoFile, videoFile.name);
    setVideoFile(null); if (fileInputRef.current) fileInputRef.current.value = '';
  };

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
      return <CaseDetail caseData={d} tab={tab} switchTab={switchTab} goBack={goBack} goDetail={goDetail} toast={toast} />;
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
      return (
        <div className="app-shell">
          <div className="detail-screen">
            <div className="detail-header">
              <button className="back-btn" onClick={goBack}>{Icons.back}</button>
              <h2>Simulation</h2>
            </div>
            <div className="detail-body">
              <div style={{ textAlign: 'center', margin: '20px 0' }}>
                <div style={{ fontSize: 48, fontWeight: 800, color: d.winReady >= 75 ? '#58c322' : d.winReady >= 50 ? '#ffab00' : '#ed4956' }}>
                  {d.winReady != null ? `${d.winReady}%` : '—'}
                </div>
                <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 2 }}>Win Ready Score</div>
              </div>
              <div className="kv">
                {d.callSummaryTitle && <><span className="k">Summary</span><span className="v">{d.callSummaryTitle}</span></>}
                {d.winReadyReason && <><span className="k">Reason</span><span className="v">{d.winReadyReason}</span></>}
                {d.transcriptSummary && <><span className="k">Transcript Summary</span><span className="v">{d.transcriptSummary}</span></>}
                {d.callDurationSecs != null && <><span className="k">Duration</span><span className="v">{Math.floor(d.callDurationSecs / 60)}m {d.callDurationSecs % 60}s</span></>}
                {d.status && <><span className="k">Status</span><span className="v">{d.status}</span></>}
                <span className="k">Date</span><span className="v">{new Date(d.createdAt).toLocaleString()}</span>
              </div>
              {d.winReadyAnalysis && (
                <div style={{ marginTop: 16 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Full Analysis</h3>
                  <pre className="analysis-text">{d.winReadyAnalysis}</pre>
                </div>
              )}
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
            <div className="profile-row">
              <div className="profile-avatar">D</div>
              <div className="profile-info">
                <div className="name">Cases</div>
                <div className="sub">{cases.length} case{cases.length !== 1 ? 's' : ''}</div>
              </div>
            </div>
            {/* Filter */}
            <div className="filter-bar">
              {['Newest','Oldest','Last Name'].map((label, i) => {
                const keys = ['newest','oldest','lastName'];
                return (
                  <button key={keys[i]} className={`filter-chip${caseSort === keys[i] ? ' active' : ''}`} onClick={() => setCaseSort(keys[i])}>
                    {label}
                  </button>
                );
              })}
              <button className="filter-chip" onClick={() => setFilterOpen(true)}>
                {Icons.filter} Filter
              </button>
            </div>
            {/* Tile grid */}
            <div className="tile-grid">
              {sortedCases.map((c) => {
                const accent = tileAccent(c.id);
                const isAuto = (c.description || '').toLowerCase().includes('car') || (c.description || '').toLowerCase().includes('vehicle') || (c.description || '').toLowerCase().includes('rear end');
                return (
                  <div key={c.id} className="tile" style={{ '--tile-accent': accent }} onClick={() => goDetail('case', c)}>
                    <div className="tile-icon">
                      {isAuto ? Icons.car : Icons.walking}
                    </div>
                    <div className="tile-label">#{c.caseNumber}</div>
                    <div className="tile-sublabel">{c.lastName}, {c.firstName}</div>
                  </div>
                );
              })}
            </div>
            {cases.length === 0 && <p style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 14 }}>No cases yet</p>}
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

        {/* ===== SIMS (Video Analysis) ===== */}
        {tab === 'sims' && (
          <>
            <div className="feed-header">
              <img src="/DepoSim-logo-wide-1200.png" alt="DepoSim" className="header-logo" />
              <h1 className="header-title">Simulations</h1>
            </div>
            <div className="card">
              <h3>Analyze Video (Gemini AI)</h3>
              <div className="input-mode-toggle" style={{ marginBottom: 10 }}>
                {[['record','Record'],['upload','Upload'],['url','YouTube']].map(([k,l]) => (
                  <button key={k} className={`mode-btn${inputMode === k ? ' active' : ''}`} onClick={() => { setInputMode(k); setRecordedBlob(null); }} disabled={analyzing}>{l}</button>
                ))}
              </div>

              {inputMode === 'record' && (
                <div>
                  <WebcamRecorder onRecordingComplete={handleRecordingComplete} disabled={analyzing} />
                  {recordedBlob && !analyzing && (
                    <button className="btn primary" style={{ marginTop: 8, width: '100%' }} onClick={handleAnalyzeRecording}>Analyze Recording</button>
                  )}
                </div>
              )}
              {inputMode === 'url' && (
                <form className="analyze-form" onSubmit={handleAnalyzeUrl}>
                  <input className="input" type="url" placeholder="https://youtube.com/watch?v=..." value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} required disabled={analyzing} />
                  <button className="btn primary" disabled={analyzing}>{analyzing ? '…' : 'Go'}</button>
                </form>
              )}
              {inputMode === 'upload' && (
                <form className="analyze-form upload-form" onSubmit={handleAnalyzeUpload}>
                  <label className="file-label">
                    <input ref={fileInputRef} type="file" accept="video/*" className="file-input" onChange={e => setVideoFile(e.target.files[0] || null)} disabled={analyzing} />
                    <span className="file-name">{videoFile ? videoFile.name : 'Choose a video…'}</span>
                  </label>
                  <button className="btn primary" disabled={analyzing || !videoFile}>{analyzing ? '…' : 'Analyze'}</button>
                </form>
              )}
              {analyzing && analyzeStatus && <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>{analyzeStatus}</p>}
              {analysisError && <p className="error-text" style={{ marginTop: 8 }}>{analysisError}</p>}
            </div>

            {analysisResult && (
              <div className="card">
                <h3>Result</h3>
                <div className="analysis-meta">{analysisResult.model} · {analysisResult.durationMs}ms</div>
                <pre className="analysis-text">{analysisResult.analysisText}</pre>
              </div>
            )}

            {pastAnalyses.length > 0 && (
              <>
                <div style={{ padding: '12px 16px 4px', fontSize: 15, fontWeight: 600 }}>History</div>
                <div className="tile-grid">
                  {pastAnalyses.map((a) => {
                    const accent = tileAccent(a.id);
                    const label = a.youtubeUrl.startsWith('upload://') ? a.youtubeUrl.replace('upload://', '') : 'YouTube';
                    return (
                      <div key={a.id} className="tile" style={{ '--tile-accent': accent }} onClick={() => goDetail('analysis', a)}>
                        <div className="tile-icon">{Icons.sims}</div>
                        <div className="tile-label" style={{ fontSize: 12 }}>{label}</div>
                        <div className="tile-sublabel">{new Date(a.createdAt).toLocaleDateString()}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
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
          </>
        )}
      </div>

      <BottomBar tab={tab} onTab={switchTab} />

      {toast && <div className="toast">{toast}</div>}

      {/* Filter popup */}
      {filterOpen && (
        <div className="filter-popup-overlay" onClick={() => setFilterOpen(false)}>
          <div className="filter-popup" onClick={e => e.stopPropagation()}>
            <h3>Sort & Filter</h3>
            {[['newest','Most Recent Case'],['oldest','Oldest Case'],['lastName','Last Name']].map(([k,l]) => (
              <button key={k} className={`filter-option${caseSort === k ? ' active' : ''}`} onClick={() => { setCaseSort(k); setFilterOpen(false); }}>{l}</button>
            ))}
            <button className="filter-option" onClick={() => setFilterOpen(false)} style={{ color: 'var(--muted)' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
