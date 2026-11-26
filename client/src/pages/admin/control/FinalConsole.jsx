import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Film, Eye, Pause, Play, Plus, Minus, Flag, Upload, Link2, Trash2, MonitorPlay, RotateCcw, Gavel, Crown, Save, Check, Maximize, Clock,
} from 'lucide-react';
import { useLive } from '../../../context/LiveContext.jsx';
import { useConfirm } from '../../../context/ConfirmContext.jsx';
import { api } from '../../../lib/api.js';
import { useWorkTimer, fmtClock } from '../../../hooks/useWorkTimer.js';
import Modal from '../../../components/ui/Modal.jsx';

const STEPS = [
  ['setup', 'Brief'],
  ['working', 'Build time'],
  ['showcase', 'Showcase'],
  ['judging', 'Judging'],
  ['results', 'Results'],
];

function Brief({ f }) {
  const { send } = useLive();
  const [title, setTitle] = useState(f.title);
  const [problem, setProblem] = useState(f.problem);
  const [duration, setDuration] = useState(f.durationMin);
  const dirty = title !== f.title || problem !== f.problem || duration !== f.durationMin;
  const editable = f.status === 'setup' || f.status === 'working';
  return (
    <div className="card">
      <div className="card-title">
        <h3><Film size={18} /> Problem statement</h3>
        <span className={`badge ${f.status === 'setup' ? 'pending' : 'qualified'}`}>{f.status === 'setup' ? 'Hidden from audience' : 'On screen'}</span>
      </div>
      <div className="stack">
        <div className="grid" style={{ gridTemplateColumns: '3fr 1fr' }}>
          <input className="input" value={title} disabled={!editable} onChange={(e) => setTitle(e.target.value)} />
          <input className="input" type="number" min={1} max={600} disabled={f.status !== 'setup'} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 1)} title="Minutes" />
        </div>
        <textarea className="textarea" style={{ minHeight: 120 }} value={problem} disabled={!editable} onChange={(e) => setProblem(e.target.value)} placeholder="Problem statement…" />
        {editable && (
          <button className="btn sm" style={{ alignSelf: 'flex-end' }} disabled={!dirty} onClick={() => send('final.updateBrief', { title, problem, durationMin: duration }, { success: 'Brief saved' }).catch(() => {})}>
            <Save /> Save brief
          </button>
        )}
      </div>
    </div>
  );
}

function Submissions({ f, teams }) {
  const { send } = useLive();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState(0);
  const inputs = useRef({});

  const upload = (teamId, file) => {
    if (!file) return;
    setBusy(teamId);
    setProgress(0);
    // XHR so large videos show upload progress
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('teamId', teamId);
    form.append('file', file);
    xhr.open('POST', '/api/final/video');
    const token = localStorage.getItem('arena_token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setBusy(null);
      if (xhr.status < 300) toast.success('Video uploaded');
      else toast.error(JSON.parse(xhr.responseText || '{}').error || 'Upload failed');
    };
    xhr.onerror = () => {
      setBusy(null);
      toast.error('Upload failed — check the connection.');
    };
    xhr.send(form);
  };

  const addLink = async (teamId) => {
    const res = await confirm({ title: 'Video link', message: 'Paste a YouTube, Google Drive or direct video link.', confirmText: 'Save link', input: { label: 'Link', required: true, placeholder: 'https://…' } });
    if (res) send('final.submission', { teamId, link: res.value }, { success: 'Link saved' }).catch(() => {});
  };

  return (
    <div className="card">
      <div className="card-title">
        <h3><Upload size={18} /> Video submissions</h3>
        <span className="small muted">{f.submissions.filter((s) => s.url || s.link).length}/{f.finalists.length} received</span>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        {f.finalists.map((id) => {
          const sub = f.submissions.find((s) => s.team === id) ?? {};
          const has = sub.url || sub.link;
          return (
            <div key={id} className="row wrap" style={{ padding: 12, borderRadius: 12, border: '1px solid var(--line)', background: 'rgba(255,255,255,.02)' }}>
              <div className="grow" style={{ minWidth: 180 }}>
                <b>{teams[id]?.teamName}</b>
                <div className="tiny muted truncate">
                  {sub.url ? `File: ${sub.fileName || 'uploaded video'}` : sub.link ? `Link: ${sub.link}` : 'No video yet'}
                </div>
              </div>
              {busy === id ? (
                <span className="small num">Uploading {progress}%</span>
              ) : (
                <>
                  <input ref={(el) => (inputs.current[id] = el)} type="file" accept="video/*" hidden onChange={(e) => { upload(id, e.target.files?.[0]); e.target.value = ''; }} />
                  <button className="btn sm" disabled={f.status === 'results'} onClick={() => inputs.current[id]?.click()}><Upload /> {sub.url ? 'Replace file' : 'Upload video'}</button>
                  <button className="btn sm" disabled={f.status === 'results'} onClick={() => addLink(id)}><Link2 /> {sub.link ? 'Change link' : 'Add link'}</button>
                  {has && f.status !== 'results' && (
                    <button className="btn sm ghost icon" title="Remove video" onClick={() => send('final.submission', { teamId: id, url: '', link: '' }).catch(() => {})}><Trash2 /></button>
                  )}
                  {has && <span className="badge qualified"><Check size={11} /> Ready</span>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Showcase({ f, teams }) {
  const { send } = useLive();
  return (
    <div className="card">
      <div className="card-title">
        <h3><MonitorPlay size={18} /> Showcase on the live screen</h3>
      </div>
      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        {f.finalists.map((id) => {
          const sub = f.submissions.find((s) => s.team === id) ?? {};
          const on = f.showcaseTeam === id;
          return (
            <button key={id} className={`btn ${on ? 'primary' : ''}`} disabled={!(sub.url || sub.link)} onClick={() => send('final.showcase', { teamId: id }).catch(() => {})}>
              <Film /> {on ? 'Showing: ' : 'Show '} {teams[id]?.teamName}
            </button>
          );
        })}
        {f.showcaseTeam && <button className="btn ghost" onClick={() => send('final.showcase', { teamId: null }).catch(() => {})}>Hide video</button>}
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="small muted">Projector playback:</span>
        <button className="btn sm" disabled={!f.showcaseTeam} onClick={() => send('final.video', { action: 'play' }).catch(() => {})}><Play /> Play</button>
        <button className="btn sm" disabled={!f.showcaseTeam} onClick={() => send('final.video', { action: 'pause' }).catch(() => {})}><Pause /> Pause</button>
        <button className="btn sm" disabled={!f.showcaseTeam} onClick={() => send('final.video', { action: 'restart' }).catch(() => {})}><RotateCcw /> Restart</button>
        <button className="btn sm" disabled={!f.showcaseTeam} onClick={() => send('final.video', { action: 'fullscreen' }).catch(() => {})}><Maximize /> Fullscreen</button>
      </div>
      <p className="tiny muted" style={{ marginTop: 8 }}>Playback controls work for uploaded files and direct video links. YouTube/Drive links play in an embedded player — control them on the projector.</p>
    </div>
  );
}

function Judging({ f, teams }) {
  const { send, pending } = useLive();
  const confirm = useConfirm();
  const [judge, setJudge] = useState('');
  const [vals, setVals] = useState({});
  const [pickWinner, setPickWinner] = useState(false);

  // load the current judge's saved scores when the name matches
  useEffect(() => {
    const mine = f.scores.filter((s) => s.judge.toLowerCase() === judge.trim().toLowerCase());
    setVals(Object.fromEntries(mine.map((s) => [s.team, s.values])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [judge, f.scores.length]);

  const setV = (team, key, v) => setVals((x) => ({ ...x, [team]: { ...(x[team] ?? {}), [key]: v } }));
  const saveAll = async () => {
    for (const id of f.finalists) {
      const values = Object.fromEntries(f.criteria.map((c) => [c.key, Number(vals[id]?.[c.key] ?? 0)]));
      try {
        await send('final.score', { judge: judge.trim(), teamId: id, values }, { key: 'final.score' });
      } catch {
        return;
      }
    }
    toast.success(`Scores saved for ${judge.trim()}`);
    setJudge('');
  };
  const removeJudge = async (j) => {
    if (await confirm({ title: `Remove all scores from ${j}?`, danger: true, confirmText: 'Remove', message: 'Recorded in the audit log.' })) send('final.removeJudge', { judge: j }).catch(() => {});
  };
  const reveal = async () => {
    const ok = await confirm({ title: 'Reveal the results?', message: 'The judges’ totals are shown on the live screen and the champion is decided. This is final.', confirmText: 'Reveal results' });
    if (!ok) return;
    try {
      await send('final.reveal', {}, { silent: true });
    } catch (e) {
      if (/tied/i.test(e.message)) setPickWinner(true);
      else toast.error(e.message);
    }
  };

  const canScore = f.status === 'showcase' || f.status === 'judging';
  return (
    <div className="card">
      <div className="card-title">
        <h3><Gavel size={18} /> Judges’ scores</h3>
        <span className="small muted">{f.judges.length} judge(s) · hidden from audience until the reveal</span>
      </div>
      {canScore && (
        <div className="stack" style={{ marginBottom: 16 }}>
          <label className="field" style={{ maxWidth: 320 }}>
            <span>Judge name</span>
            <input className="input" value={judge} onChange={(e) => setJudge(e.target.value)} placeholder="e.g. Judge 1 / Priya" list="judge-names" />
            <datalist id="judge-names">{f.judges.map((j) => <option key={j} value={j} />)}</datalist>
          </label>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Criterion</th>
                  {f.finalists.map((id) => <th key={id}>{teams[id]?.teamName}</th>)}
                </tr>
              </thead>
              <tbody>
                {f.criteria.map((c) => (
                  <tr key={c.key}>
                    <td>{c.name} <span className="tiny muted">/ {c.max}</span></td>
                    {f.finalists.map((id) => (
                      <td key={id}>
                        <input className="input sm" type="number" min={0} max={c.max} step={0.5} style={{ width: 90 }} value={vals[id]?.[c.key] ?? ''} onChange={(e) => setV(id, c.key, e.target.value)} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className={`btn primary ${pending['final.score'] ? 'loading' : ''}`} style={{ alignSelf: 'flex-start' }} disabled={!judge.trim()} onClick={saveAll}>
            <Save /> Save this judge’s scores
          </button>
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Judge</th>
              {f.finalists.map((id) => <th key={id} className="right">{teams[id]?.teamName}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {f.judges.map((j) => (
              <tr key={j}>
                <td>{j}</td>
                {f.finalists.map((id) => {
                  const s = f.scores.find((x) => x.judge === j && x.team === id);
                  return <td key={id} className="right num">{s ? s.total : <span className="muted">—</span>}</td>;
                })}
                <td className="right">{f.status !== 'results' && <button className="btn ghost icon sm" onClick={() => removeJudge(j)}><Trash2 /></button>}</td>
              </tr>
            ))}
            <tr>
              <td><b>Total</b></td>
              {f.finalists.map((id) => <td key={id} className="right num"><b>{f.totals.find((t) => t.team === id)?.total ?? 0}</b></td>)}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {f.status === 'judging' && (
        <button className={`btn warn lg ${pending['final.reveal'] ? 'loading' : ''}`} style={{ marginTop: 14 }} disabled={!f.judges.length} onClick={reveal}>
          <Crown /> Reveal results &amp; crown the champion
        </button>
      )}
      {pickWinner && (
        <TieModal f={f} teams={teams} onClose={() => setPickWinner(false)} onSubmit={(p) => send('final.reveal', p).then(() => setPickWinner(false)).catch(() => {})} />
      )}
    </div>
  );
}

function TieModal({ f, teams, onClose, onSubmit }) {
  const top = f.totals[0]?.total;
  const tied = f.totals.filter((t) => t.total === top).map((t) => t.team);
  const [winnerId, setWinner] = useState('');
  const [reason, setReason] = useState('');
  return (
    <Modal
      title="The judges’ totals are tied"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!winnerId || !reason.trim()} onClick={() => onSubmit({ winnerId, reason })}>Confirm champion</button>
        </>
      }
    >
      <div className="stack">
        <p className="muted small">Choose the champion. The decision and reason are recorded in the audit log.</p>
        <div className="row">
          {tied.map((id) => (
            <button key={id} className={`btn grow ${winnerId === id ? 'primary' : ''}`} onClick={() => setWinner(id)}><Crown /> {teams[id]?.teamName}</button>
          ))}
        </div>
        <label className="field">
          <span>Reason (required)</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Head judge’s casting vote" />
        </label>
      </div>
    </Modal>
  );
}

export default function FinalConsole({ state }) {
  const { send, pending } = useLive();
  const confirm = useConfirm();
  const f = state.final;
  const teams = state.teams;
  const { ms, paused } = useWorkTimer(f);
  if (!f) return null;
  const stepIdx = STEPS.findIndex(([k]) => k === f.status);

  const startWork = async () => {
    if (!f.problem.trim()) return toast.error('Write and save the problem statement first.');
    const ok = await confirm({ title: 'Reveal the problem and start the clock?', message: `The problem statement appears on the live screen and a ${f.durationMin}-minute countdown starts.`, confirmText: 'Reveal & start' });
    if (ok) send('final.startWork').catch(() => {});
  };
  const endWork = async () => {
    const ok = await confirm({ title: 'End the build time?', message: 'Moves on to the video showcase.', confirmText: 'End build time' });
    if (ok) send('final.endWork').catch(() => {});
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card">
        <div className="card-title">
          <h3><Crown size={18} color="var(--orange)" /> The Grand Final · {f.title}</h3>
          <span className="small muted">{f.finalists.map((id) => teams[id]?.teamName).join(' vs ')}</span>
        </div>
        <div className="tabs" style={{ marginBottom: 14 }}>
          {STEPS.map(([k, label], i) => (
            <span key={k} className={`tab ${i === stepIdx ? 'on' : ''}`} style={{ cursor: 'default', opacity: i > stepIdx ? 0.45 : 1 }}>
              {i < stepIdx ? <Check /> : null} {i + 1}. {label}
            </span>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          {f.status === 'setup' && (
            <button className="btn primary lg" onClick={startWork} disabled={!!pending['final.startWork']}><Eye /> Reveal problem &amp; start {f.durationMin}-min clock</button>
          )}
          {f.status === 'working' && (
            <>
              <div className="row" style={{ gap: 8, marginRight: 8 }}>
                <Clock color={paused ? 'var(--orange)' : 'var(--green)'} />
                <span className="num" style={{ fontSize: 30, fontWeight: 700 }}>{fmtClock(ms)}</span>
                {paused && <span className="badge pending">Paused</span>}
              </div>
              <button className="btn" onClick={() => send('final.pauseWork').catch(() => {})}>{paused ? <><Play /> Resume</> : <><Pause /> Pause</>}</button>
              <button className="btn" onClick={() => send('final.adjustTime', { minutes: 5 }).catch(() => {})}><Plus /> 5 min</button>
              <button className="btn" onClick={() => send('final.adjustTime', { minutes: -5 }).catch(() => {})}><Minus /> 5 min</button>
              <button className="btn warn" onClick={endWork}><Flag /> End build time</button>
            </>
          )}
          {f.status === 'showcase' && (
            <button className="btn primary" onClick={() => send('final.startJudging').catch(() => {})}><Gavel /> All videos shown — start judging</button>
          )}
          {f.status === 'results' && (
            <>
              <span className="badge champion">Champion: {teams[state.tournament.champion]?.teamName}</span>
              <button className="btn warn lg" onClick={() => send('tournament.announceChampion').catch(() => {})}><Crown /> Announce champion</button>
              <button className="btn" onClick={() => send('scene.set', { scene: 'final' }).catch(() => {})}><MonitorPlay /> Show judges’ scores</button>
            </>
          )}
          {state.tournament.scene !== 'final' && f.status !== 'results' && (
            <button className="btn ghost" onClick={() => send('scene.set', { scene: 'final' }).catch(() => {})}><MonitorPlay /> Put the final on screen</button>
          )}
        </div>
      </div>
      <Brief f={f} key={`${f.status}-${f.title}`} />
      {f.status !== 'setup' && <Submissions f={f} teams={teams} />}
      {(f.status === 'showcase' || f.status === 'judging') && <Showcase f={f} teams={teams} />}
      {f.status !== 'setup' && f.status !== 'working' && <Judging f={f} teams={teams} />}
      {f.status === 'working' && <p className="small muted">Tip: you can upload videos as soon as teams hand them in — judging opens after the showcase starts.</p>}
    </div>
  );
}
