import { useEffect, useState } from 'react';
import { Sparkles, ArrowRight, Crown, CheckCircle2 } from 'lucide-react';
import { useLive } from '../../../context/LiveContext.jsx';
import { useConfirm } from '../../../context/ConfirmContext.jsx';
import { api } from '../../../lib/api.js';

/** Shown once a round is complete: review qualifiers, pick wildcards, start the next round. */
export default function RoundWizard({ state }) {
  const { send, pending } = useLive();
  const confirm = useConfirm();
  const [cands, setCands] = useState(null);
  const [picked, setPicked] = useState([]);
  const [qpb, setQpb] = useState(state.round.questionsPerBattle);
  const r = state.round;
  const name = (id) => state.teams[id]?.teamName;

  useEffect(() => {
    api('/rounds/wildcard-candidates').then((d) => setCands(d.candidates)).catch(() => setCands([]));
  }, [r.id]);

  const total = r.qualified.length + picked.length;
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const create = async () => {
    const wcNames = picked.map(name).join(', ');
    const ok = await confirm({
      title: `Start ${total === 2 ? 'THE FINAL' : `Round ${r.roundNumber + 1}`}?`,
      message: `${total} teams will compete${picked.length ? `, including wildcard${picked.length > 1 ? 's' : ''}: ${wcNames}` : ''}.${total % 2 ? '\nThe team count is odd — you can give a bye or add a wildcard during the round.' : ''}`,
      confirmText: 'Start round',
    });
    if (ok) send('round.create', { wildcards: picked, questionsPerBattle: qpb }, { success: 'New round started' }).catch(() => {});
  };

  const declare = async () => {
    const id = r.qualified[0];
    const ok = await confirm({ title: `Declare ${name(id)} champion?`, message: 'This completes the competition.', confirmText: 'Declare champion' });
    if (ok) send('tournament.declareChampion', { teamId: id }).catch(() => {});
  };

  return (
    <div className="card glow-border">
      <div className="card-title">
        <h3>
          <CheckCircle2 size={18} /> Round {r.roundNumber} complete — set up the next round
        </h3>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <div>
          <div className="small muted" style={{ marginBottom: 8 }}>Advancing automatically ({r.qualified.length})</div>
          <div className="row wrap" style={{ gap: 8 }}>
            {r.qualified.map((id) => (
              <span key={id} className="chip on">
                {name(id)} {r.byes.includes(id) && <span className="tiny">· bye</span>}
              </span>
            ))}
          </div>
        </div>
        <div>
          <div className="small muted" style={{ marginBottom: 8 }}>
            <Sparkles size={13} /> Wildcards — eliminated teams ranked by points this round (host confirms)
          </div>
          {!cands && <div className="spinner" />}
          <div className="stack" style={{ gap: 6, maxHeight: 260, overflow: 'auto' }}>
            {cands?.map((c) => (
              <label key={c.id} className="row small" style={{ cursor: 'pointer', padding: '6px 8px', borderRadius: 8, background: picked.includes(c.id) ? 'rgba(204, 139, 101,.14)' : 'transparent' }}>
                <input type="checkbox" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} style={{ accentColor: 'var(--purple)' }} />
                <span className="grow truncate">
                  {c.teamName} {c.suggested && <span className="badge wildcard">Suggested</span>}
                </span>
                <span className="num muted">{c.roundPoints} pts{!c.eliminatedThisRound && ' · earlier'}</span>
              </label>
            ))}
            {cands && !cands.length && <span className="muted small">No eliminated teams.</span>}
          </div>
        </div>
      </div>
      <div className="divider" />
      <div className="row wrap between">
        <label className="row small">
          Questions per battle
          <input className="input sm" type="number" min={1} max={30} value={qpb} style={{ width: 80 }} onChange={(e) => setQpb(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
        </label>
        <div className="row wrap">
          {r.qualified.length === 1 && !picked.length && (
            <button className="btn warn" onClick={declare}>
              <Crown /> Declare {name(r.qualified[0])} champion
            </button>
          )}
          <button className={`btn primary lg ${pending['round.create'] ? 'loading' : ''}`} disabled={total < 2} onClick={create}>
            Start {total === 2 ? 'the Final' : `Round ${r.roundNumber + 1}`} · {total} teams <ArrowRight />
          </button>
        </div>
      </div>
    </div>
  );
}
