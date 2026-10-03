import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

type Engine = 'mysql' | 'postgresql' | 'sqlite';
type Project = { id: string; name: string; engine: Engine; status: string; created_at: string; storage_bytes: number };

const demoProjects: Project[] = [
  { id: 'proj_demo_mysql', name: 'Storefront', engine: 'mysql', status: 'ready', created_at: new Date().toISOString(), storage_bytes: 184000000 },
  { id: 'proj_demo_pg', name: 'Analytics', engine: 'postgresql', status: 'ready', created_at: new Date().toISOString(), storage_bytes: 92000000 },
  { id: 'proj_demo_sqlite', name: 'Mobile Cache', engine: 'sqlite', status: 'ready', created_at: new Date().toISOString(), storage_bytes: 38000000 }
];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init);
  const data: T & { error?: string } = await r.json();
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB']; let n = bytes / 1024; let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 10 ? 0 : 1)} ${units[i]}`;
}

function App() {
  const [projects, setProjects] = useState<Project[]>(demoProjects);
  const [selected, setSelected] = useState<Project>(demoProjects[0]);
  const [sql, setSql] = useState('SELECT * FROM users;');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEngine, setNewEngine] = useState<Engine>('mysql');
  const [storage, setStorage] = useState({ bytes: 0, quotaBytes: 10 * 1024 ** 3, configured: false, objects: 0 });

  useEffect(() => {
    api<{ projects: Project[] }>('/api/projects').then(x => { if (x.projects.length) { setProjects(x.projects); setSelected(x.projects[0]); } }).catch(() => {});
    api<any>('/api/storage/usage').then(setStorage).catch(() => {});
  }, []);

  const storagePercent = Math.min(100, (storage.bytes / storage.quotaBytes) * 100);
  const engineLabel = selected.engine === 'postgresql' ? 'PostgreSQL' : selected.engine === 'mysql' ? 'MySQL' : 'SQLite';
  const rows = result?.rows || [];
  const columns = useMemo(() => result?.fields?.length ? result.fields : rows[0] ? Object.keys(rows[0]) : [], [result, rows]);

  async function runQuery() {
    setBusy(true); setNotice('');
    try {
      const data = await api<any>(`/api/projects/${selected.id}/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql }) });
      setResult(data.result);
      if (data.result?.mode === 'demo') setNotice('Demo mode is active. Your SQL editor is working, but no live database is connected yet.');
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Query failed'); }
    finally { setBusy(false); }
  }

  async function createProject() {
    if (!newName.trim()) return;
    try {
      const data = await api<{ project: Project }>('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName, engine: newEngine }) });
      setProjects(p => [data.project, ...p]); setSelected(data.project); setNewName(''); setShowCreate(false); setNotice('Database project created.');
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Could not create project'); }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">F</div><div><strong>ForgeDB</strong><span>Developer Cloud</span></div></div>
      <div className="workspace"><span className="workspace-dot"/> Demo Workspace <span className="chev">⌄</span></div>
      <nav>
        <button className="nav active"><span>⌂</span> Overview</button>
        <button className="nav"><span>◈</span> Databases</button>
        <button className="nav"><span>⌘</span> SQL Editor</button>
        <button className="nav"><span>◫</span> Storage</button>
        <button className="nav"><span>⚙</span> Settings</button>
      </nav>
      <div className="side-bottom"><div className="plan"><div className="plan-top"><span>Free plan</span><b>10 GB</b></div><div className="progress"><i style={{width: `${storagePercent}%`}}/></div><small>{formatBytes(storage.bytes)} used</small></div><div className="user-card"><div className="avatar">P</div><div><b>Programer</b><span>Developer account</span></div><span>•••</span></div></div>
    </aside>

    <main className="main">
      <header className="topbar"><div><span className="eyebrow">WORKSPACE / DATABASES</span><h1>Developer Console</h1></div><div className="top-actions"><div className="status"><span/> All systems operational</div><button className="icon-btn">?</button><button className="avatar small">P</button></div></header>

      <section className="hero"><div><div className="pill">✦ Edge-ready database platform</div><h2>Build, query and ship<br/><em>without the plumbing.</em></h2><p>Create MySQL, PostgreSQL and SQLite projects, run SQL in a fast editor, and keep files behind one unified storage API.</p><div className="hero-actions"><button className="primary" onClick={() => setShowCreate(true)}>+ Create database</button><button className="secondary" onClick={() => document.getElementById('sql')?.scrollIntoView({behavior:'smooth'})}>Open SQL editor ↘</button></div></div><div className="hero-art"><div className="orb orb-a"/><div className="orb orb-b"/><div className="terminal"><div className="term-head"><span/><span/><span/><b>query.sql</b></div><pre><code><i>SELECT</i> id, name, email{`\n`}<i>FROM</i> users{`\n`}<i>WHERE</i> status = <u>'active'</u>;</code></pre><div className="term-result">✓ 3 rows <span>18 ms</span></div></div></div></section>

      <section className="stats"><Stat label="Databases" value={projects.length.toString()} detail="Across 3 engines" icon="◈"/><Stat label="Storage" value={formatBytes(storage.bytes)} detail="of 10 GB free quota" icon="◫"/><Stat label="Queries today" value="128" detail="+18% this week" icon="⌘"/><Stat label="API status" value="Healthy" detail="Cloudflare edge" icon="✓"/></section>

      <section className="section-grid"><div className="panel projects"><div className="panel-head"><div><span className="label">YOUR DATABASES</span><h3>Projects</h3></div><button className="small-primary" onClick={() => setShowCreate(true)}>+ New</button></div><div className="project-list">{projects.map(p => <button key={p.id} className={`project ${selected.id === p.id ? 'selected' : ''}`} onClick={() => setSelected(p)}><div className={`engine ${p.engine}`}>{p.engine === 'mysql' ? '◆' : p.engine === 'postgresql' ? '◉' : '▣'}</div><div className="project-info"><b>{p.name}</b><span>{p.engine === 'postgresql' ? 'PostgreSQL' : p.engine === 'mysql' ? 'MySQL' : 'SQLite'} · {formatBytes(p.storage_bytes)}</span></div><span className="ready"><i/> Ready</span><span className="arrow">›</span></button>)}</div></div>
      <div className="panel storage-panel"><div className="panel-head"><div><span className="label">STORAGE</span><h3>10 GB free quota</h3></div><span className="hf-badge">● Hugging Face</span></div><div className="storage-ring" style={{['--p' as any]: storagePercent}}><div><strong>{formatBytes(storage.bytes)}</strong><span>used</span></div></div><div className="storage-lines"><div><span>Database server data</span><b>314 MB</b></div><div><span>Developer files</span><b>{formatBytes(Math.max(0, storage.bytes - 314000000))}</b></div><div><span>Remaining</span><b>{formatBytes(Math.max(0, storage.quotaBytes - storage.bytes))}</b></div></div><div className="storage-note">Your platform storage adapter keeps provider details behind the API. Provider disclosure should be included in your legal/privacy documentation.</div></div></section>

      <section id="sql" className="panel sql-panel"><div className="panel-head"><div><span className="label">QUERY WORKBENCH</span><h3>SQL Editor</h3></div><div className="editor-meta"><span className={`engine-dot ${selected.engine}`}/>{engineLabel}<span className="sep">·</span>{selected.name}<button className="secondary compact" onClick={() => setSql('SELECT * FROM users;')}>Reset</button></div></div><div className="editor-wrap"><textarea value={sql} onChange={e => setSql(e.target.value)} spellCheck={false}/><div className="editor-footer"><span>⌘ Enter to run · SQL is executed server-side</span><button className="run" onClick={runQuery} disabled={busy}>{busy ? 'Running…' : '▶ Run query'}</button></div></div>{notice && <div className="notice">{notice}</div>}<div className="results"><div className="results-head"><b>Results</b><span>{result ? `${result.rowCount ?? rows.length} rows · ${result.mode}` : 'Run a query to see results'}</span></div>{result && rows.length > 0 ? <div className="table-scroll"><table><thead><tr>{columns.map((c: string) => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.map((r: any, i: number) => <tr key={i}>{columns.map((c: string) => <td key={c}>{String(r[c] ?? '—')}</td>)}</tr>)}</tbody></table></div> : <div className="empty-result"><div>⌘</div><span>{result ? 'Query completed with no rows.' : 'Your query results will appear here.'}</span></div>}</div></section>

      <footer><span>ForgeDB starter</span><span>Cloudflare Workers + Vite + React</span><span>MySQL · PostgreSQL · SQLite · Hugging Face storage adapter</span></footer>
    </main>

    {showCreate && <div className="modal-backdrop" onClick={() => setShowCreate(false)}><div className="modal" onClick={e => e.stopPropagation()}><div className="modal-head"><div><span className="label">NEW PROJECT</span><h3>Create database</h3></div><button className="icon-btn" onClick={() => setShowCreate(false)}>×</button></div><label>Project name<input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. ecommerce" autoFocus/></label><label>Database engine<select value={newEngine} onChange={e => setNewEngine(e.target.value as Engine)}><option value="mysql">MySQL</option><option value="postgresql">PostgreSQL</option><option value="sqlite">SQLite</option></select></label><div className="engine-choice"><div className={`choice ${newEngine === 'mysql' ? 'on' : ''}`} onClick={() => setNewEngine('mysql')}><b>MySQL</b><span>Production workloads</span></div><div className={`choice ${newEngine === 'postgresql' ? 'on' : ''}`} onClick={() => setNewEngine('postgresql')}><b>PostgreSQL</b><span>Advanced SQL</span></div><div className={`choice ${newEngine === 'sqlite' ? 'on' : ''}`} onClick={() => setNewEngine('sqlite')}><b>SQLite</b><span>Lightweight apps</span></div></div><div className="modal-actions"><button className="secondary" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary" onClick={createProject}>Create project</button></div></div></div>}
  </div>
}

function Stat({label,value,detail,icon}:{label:string;value:string;detail:string;icon:string}) { return <div className="stat"><div className="stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div> }

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
