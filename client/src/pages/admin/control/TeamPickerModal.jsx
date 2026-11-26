import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import Modal from '../../../components/ui/Modal.jsx';
import { api } from '../../../lib/api.js';

/** Pick teams for manual pairing, swaps, and adding wildcards to the current round. */
export function ManualPairModal({ state, onClose, onSubmit }) {
  const r = state.round;
  const options = [...r.pendingDraw, ...r.pool];
  const [a, setA] = useState(r.pendingDraw[0] ?? options[0] ?? '');
  const [b, setB] = useState(options.find((x) => x !== (r.pendingDraw[0] ?? options[0])) ?? '');
  const [reason, setReason] = useState('');
  const name = (id) => state.teams[id]?.teamName;
  return (
    <Modal
      title="Pair two teams manually"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!a || !b || a === b || !reason.trim()} onClick={() => onSubmit({ teamA: a, teamB: b, reason })}>
            Create battle
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted small">Use this for a custom bracket or exceptional situations. The pairing is recorded in the audit log.</p>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {[['Team A', a, setA], ['Team B', b, setB]].map(([label, v, set]) => (
            <label key={label} className="field">
              <span>{label}</span>
              <select className="select" value={v} onChange={(e) => set(e.target.value)}>
                {options.map((id) => (
                  <option key={id} value={id}>{name(id)}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <label className="field">
          <span>Reason (required)</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Custom bracket agreed with teams" />
        </label>
      </div>
    </Modal>
  );
}

export function SwapModal({ state, battle, onClose, onSubmit }) {
  const [side, setSide] = useState('A');
  const [teamId, setTeamId] = useState(state.round.pool[0] ?? '');
  const [reason, setReason] = useState('');
  const name = (id) => state.teams[id]?.teamName;
  return (
    <Modal
      title={`Correct Battle #${battle.battleNumber}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn warn" disabled={!teamId || !reason.trim()} onClick={() => onSubmit({ battleId: battle.id, side, teamId, reason })}>
            Replace team
          </button>
        </>
      }
    >
      <div className="stack">
        {!state.round.pool.length && <div className="notice">No undrawn teams are available as a replacement.</div>}
        <label className="field">
          <span>Replace</span>
          <select className="select" value={side} onChange={(e) => setSide(e.target.value)}>
            <option value="A">{name(battle.teamA)} (Team A)</option>
            <option value="B">{name(battle.teamB)} (Team B)</option>
          </select>
        </label>
        <label className="field">
          <span>With</span>
          <select className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {state.round.pool.map((id) => (
              <option key={id} value={id}>{name(id)}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Reason (required — recorded in the audit log)</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

export function AddTeamModal({ state, onClose, onSubmit }) {
  const [cands, setCands] = useState(null);
  const [pick, setPick] = useState(null);
  const [reason, setReason] = useState('');
  useEffect(() => {
    api('/rounds/wildcard-candidates')
      .then((d) => setCands(d.candidates.filter((c) => !state.round.participating.includes(c.id))))
      .catch(() => setCands([]));
  }, [state.round.participating]);
  const others = useMemo(
    () => Object.values(state.teams).filter((t) => !state.round.participating.includes(t.id) && t.status !== 'eliminated' && t.status !== 'champion'),
    [state]
  );
  return (
    <Modal
      title="Add a team to this round"
      size="medium"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!pick} onClick={() => onSubmit({ teamId: pick, reason })}>
            <Sparkles /> Add to round
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted small">Bring back an eliminated team as a <b>wildcard</b> (ranked by points this round), or add a team that was registered after the competition started. Recorded in the audit log.</p>
        {!cands && <div className="spinner" />}
        <div className="stack" style={{ gap: 8, maxHeight: 360, overflow: 'auto' }}>
          {cands?.map((c) => (
            <label key={c.id} className={`card tight row ${pick === c.id ? 'glow-border' : ''}`} style={{ cursor: 'pointer', padding: 12 }}>
              <input type="radio" name="wc" checked={pick === c.id} onChange={() => setPick(c.id)} />
              <div className="grow">
                <div style={{ fontWeight: 600 }}>
                  {c.teamName} {c.suggested && <span className="badge wildcard" style={{ marginLeft: 6 }}>Suggested</span>}
                </div>
                <div className="tiny muted">{c.eliminatedThisRound ? 'Eliminated this round' : 'Eliminated earlier'}</div>
              </div>
              <div className="num small">{c.roundPoints} round · {c.totalScore} total</div>
            </label>
          ))}
          {others.map((t) => (
            <label key={t.id} className={`card tight row ${pick === t.id ? 'glow-border' : ''}`} style={{ cursor: 'pointer', padding: 12 }}>
              <input type="radio" name="wc" checked={pick === t.id} onChange={() => setPick(t.id)} />
              <div className="grow" style={{ fontWeight: 600 }}>{t.teamName}</div>
              <span className="tiny muted">Not yet in this competition</span>
            </label>
          ))}
          {cands && !cands.length && !others.length && <div className="muted small">No eligible teams to add.</div>}
        </div>
        <label className="field">
          <span>Reason (optional)</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Wildcard to balance the bracket" />
        </label>
      </div>
    </Modal>
  );
}
