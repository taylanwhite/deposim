import { useState, useEffect } from 'react';
import './App.css';

const API_BASE = '/api';

export default function App() {
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(API_BASE + '/cases')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load'))))
      .then(setCases)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="page">Loading…</div>;
  if (error) return <div className="page">Error: {error}</div>;

  return (
    <div className="page">
      <header className="header">
        <h1>DepoSim</h1>
        <p className="muted">Cases from Express API + Neon (Prisma)</p>
      </header>
      <section className="card">
        <h2>Cases</h2>
        {cases.length === 0 ? (
          <p className="muted">No cases yet. Use the API to create one.</p>
        ) : (
          <ul className="case-list">
            {cases.map((c) => (
              <li key={c.id} className="case-item">
                <strong>{c.caseNumber}</strong> – {c.firstName} {c.lastName}
                <span className="muted"> · {c.phone}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
