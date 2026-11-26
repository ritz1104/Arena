import { useEffect, useState } from 'react';
import { Crown, Swords, Trophy, Film, Plus, Trash2, ArrowRight } from 'lucide-react';
import { useLive } from '../../../context/LiveContext.jsx';
import { useConfirm } from '../../../context/ConfirmContext.jsx';
import { api } from '../../../lib/api.js';

/** After a standard round: seed the top three and start the playoffs. */
export function PlayoffSetup({ state }) {
  const { send, pending } = useLive();
  const confirm = useConfirm();
  const [data, setData] = useState(null);
  const [seeds, setSeeds] = useState(['', '', '']);
  const [qpb, setQpb] = useState(state.round.questionsPerBattle);
  const name = (id) => state.teams[id]?.teamName;

  useEffect(() => {
    api('/rounds/playoff-seeds')
      .then((d) => {
        setData(d);
        setSeeds([d.seeds[0] ?? '', d.seeds[1] ?? '', d.seeds[2] ?? '']);
      })
      .catch(() => setData({ eligible: [], seeds: [] }));
  }, [state.round.id]);

  const valid = seeds.every(Boolean) && new Set(seeds).size === 3;
  const start = async () => {
    const ok = await confirm({
      title: 'Start the playoffs?',
      message: `#1 ${name(seeds[0])} goes straight to the Grand Final.\nSemifinal: #2 ${name(seeds[1])} vs #3 ${name(seeds[2])} (buzzer battle).\nAll other teams finish here.`,
      confirmText: 'Start playoffs',
    });
    if (ok) send('playoff.start', { seeds, questionsPerBattle: qpb }, { success: 'Playoffs started — semifinal is ready' }).catch(() => {});
  };

  const pts = (id) => data?.eligible.find((e) => e.id === id)?.points ?? 0;
  const labels = ['#1 · straight to the Grand Final', '#2 · semifinal', '#3 · semifinal'];

  return (
    <div className="card" style={{ borderColor: 'rgba(230, 185, 143,.45)' }}>
      <div className="card-title">
        <h3>
          <Trophy size={18} color="var(--orange)" /> Or start the playoffs (top 3 on points)
        </h3>
      </div>
      <p className="small muted" style={{ marginBottom: 12 }}>
        The top team qualifies directly for the Grand Final. #2 and #3 play a semifinal buzzer battle; the winner meets #1 in the video-challenge Grand Final. Seeds are pre-filled from total points — adjust if needed.
      </p>
      {!data ? (
        <div className="spinner" />
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {labels.map((label, i) => (
            <label key={label} className="field">
              <span>{label}</span>
              <select className="select" value={seeds[i]} onChange={(e) => setSeeds((s) => s.map((x, j) => (j === i ? e.target.value : x)))}>
                <option value="">Choose a team</option>
                {data.eligible.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.teamName} — {t.points} pts{t.stillIn ? '' : ' (eliminated)'}
                  </option>
                ))}
              </select>
              {seeds[i] && <span className="tiny muted">{pts(seeds[i])} total points</span>}
            </label>
          ))}
        </div>
      )}
      <div className="row wrap between" style={{ marginTop: 14 }}>
        <label className="row small">
          Semifinal questions
          <input className="input sm" type="number" min={1} max={30} value={qpb} style={{ width: 80 }} onChange={(e) => setQpb(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
        </label>
        <button className={`btn warn lg ${pending['playoff.start'] ? 'loading' : ''}`} disabled={!valid} onClick={start}>
          <Swords /> Start playoffs <ArrowRight />
        </button>
      </div>
    </div>
  );
}

/** After the semifinal: write the problem statement and create the video Grand Final. */
export function FinalSetup({ state }) {
  const { send, pending } = useLive();
  const r = state.round;
  const seed1 = r.seeds.find((s) => s.seed === 1)?.team;
  const finalists = [seed1, r.qualified[0]].filter(Boolean);
  const [title, setTitle] = useState('The Grand Final Challenge');
  const [problem, setProblem] = useState('');
  const [duration, setDuration] = useState(60);
  const [criteria, setCriteria] = useState(null);

  useEffect(() => {
    api('/final/default-criteria').then((d) => setCriteria(d.criteria)).catch(() => setCriteria([]));
  }, []);

  const name = (id) => state.teams[id]?.teamName;
  const create = () =>
    send(
      'final.create',
      { title, problem, durationMin: duration, criteria: criteria.map((c, i) => ({ ...c, key: c.key || `c${i + 1}` })) },
      { success: 'Grand Final created' }
    ).catch(() => {});

  return (
    <div className="card glow-border">
      <div className="card-title">
        <h3>
          <Film size={18} /> Set up the Grand Final — video challenge
        </h3>
      </div>
      <div className="row wrap" style={{ marginBottom: 14, gap: 10 }}>
        {finalists.map((id, i) => (
          <span key={id} className="chip on">
            {i === 0 ? <Crown size={14} /> : <Swords size={14} />} {name(id)} {i === 0 ? '· seed #1' : '· semifinal winner'}
          </span>
        ))}
      </div>
      <div className="stack">
        <div className="grid" style={{ gridTemplateColumns: '3fr 1fr' }}>
          <label className="field">
            <span>Challenge title</span>
            <input className="input" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field">
            <span>Time to build the video (minutes)</span>
            <input className="input" type="number" min={1} max={600} value={duration} onChange={(e) => setDuration(Math.max(1, Math.min(600, Number(e.target.value) || 1)))} />
          </label>
        </div>
        <label className="field">
          <span>Problem statement (hidden from the audience until you reveal it — can be edited later)</span>
          <textarea className="textarea" style={{ minHeight: 140 }} value={problem} maxLength={6000} onChange={(e) => setProblem(e.target.value)} placeholder="Describe the problem the finalists must solve and explain in their video…" />
        </label>
        <div>
          <div className="small muted" style={{ marginBottom: 8 }}>Judging criteria (each judge scores every video on these)</div>
          <div className="stack" style={{ gap: 6 }}>
            {criteria?.map((c, i) => (
              <div key={i} className="row">
                <input className="input sm grow" value={c.name} onChange={(e) => setCriteria((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value, key: x.key } : x)))} />
                <span className="small muted">max</span>
                <input className="input sm" type="number" min={1} max={100} style={{ width: 80 }} value={c.max} onChange={(e) => setCriteria((cs) => cs.map((x, j) => (j === i ? { ...x, max: Number(e.target.value) || 1 } : x)))} />
                <button className="btn ghost icon sm" disabled={criteria.length <= 1} onClick={() => setCriteria((cs) => cs.filter((_, j) => j !== i))}><Trash2 /></button>
              </div>
            ))}
            {criteria && criteria.length < 8 && (
              <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setCriteria((cs) => [...cs, { key: `c${Date.now() % 100000}`, name: 'New criterion', max: 10 }])}>
                <Plus /> Add criterion
              </button>
            )}
          </div>
        </div>
        <button className={`btn primary lg ${pending['final.create'] ? 'loading' : ''}`} style={{ alignSelf: 'flex-end' }} disabled={finalists.length < 2 || !criteria?.length} onClick={create}>
          <Film /> Create the Grand Final
        </button>
      </div>
    </div>
  );
}
