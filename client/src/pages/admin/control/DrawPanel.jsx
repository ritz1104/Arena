import { useEffect, useState } from 'react';
import { Disc3, Play, Swords, X, Shuffle, Undo2, UserPlus, Award, Replace, Trophy, CheckCircle2 } from 'lucide-react';
import { useLive } from '../../../context/LiveContext.jsx';
import { useConfirm } from '../../../context/ConfirmContext.jsx';
import Wheel from '../../../components/arena/Wheel.jsx';
import { useWheelView } from '../../../hooks/useWheelView.js';
import { ManualPairModal, SwapModal, AddTeamModal } from './TeamPickerModal.jsx';
import s from '../Control.module.css';

export default function DrawPanel({ state, wheelSize = 400 }) {
  const { send, pending } = useLive();
  const confirm = useConfirm();
  const view = useWheelView(state);
  const [modal, setModal] = useState(null);
  const r = state.round;
  const teams = state.teams;
  const name = (id) => teams[id]?.teamName ?? '—';
  const pendingBattles = state.roundBattles.filter((b) => b.status === 'pending');
  const completed = state.roundBattles.filter((b) => b.status === 'completed');
  const active = r.status === 'active';
  const canSpin = active && !state.tournament.activeBattle && !view.spinning && !pending['wheel.spin'] && (r.pendingDraw.length ? r.pool.length >= 1 : r.pool.length >= 2);
  const oneLeft = active && r.pendingDraw.length === 0 && r.pool.length === 1;
  const lastDone = state.battle?.status === 'completed' ? state.battle : null;

  const spin = () => canSpin && send('wheel.spin').catch(() => {});

  useEffect(() => {
    const onKey = (e) => {
      if (e.target?.closest?.('input, textarea, select') || e.metaKey || e.ctrlKey) return;
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        spin();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const startBattle = async (b) => {
    await send('battle.start', { battleId: b.id }, { key: `start-${b.id}` }).catch(() => {});
  };
  const cancelBattle = async (b) => {
    const res = await confirm({
      title: `Cancel Battle #${b.battleNumber}?`,
      message: `${name(b.teamA)} and ${name(b.teamB)} go back into the wheel. This is recorded in the audit log.`,
      confirmText: 'Cancel battle',
      danger: true,
      input: { label: 'Reason', required: true },
    });
    if (res) send('battle.cancel', { battleId: b.id, reason: res.value }).catch(() => {});
  };
  const bye = async (id) => {
    const res = await confirm({
      title: `Give ${name(id)} a bye?`,
      message: 'The team advances to the next round without playing a battle. Recorded in the audit log.',
      confirmText: 'Give bye',
      input: { label: 'Reason (optional)', placeholder: 'e.g. Odd number of teams' },
    });
    if (res) send('round.bye', { teamId: id, reason: res.value }, { success: `${name(id)} advances with a bye` }).catch(() => {});
  };
  const resetDraw = async () => {
    const res = await confirm({
      title: 'Reset the pending selection?',
      message: `${name(r.pendingDraw[0])} returns to the wheel. Use only for exceptional situations — recorded in the audit log.`,
      confirmText: 'Reset selection',
      danger: true,
      input: { label: 'Reason', required: true },
    });
    if (res) send('wheel.resetDraw', { reason: res.value }).catch(() => {});
  };

  return (
    <div className={s.drawGrid}>
      {r.kind === 'semifinal' ? (
        <div className="card glow-border" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card-title"><h3><Swords size={18} /> Semifinal · playoffs</h3></div>
          {[...r.seeds].sort((a, b) => a.seed - b.seed).map((sd) => (
            <div key={sd.team} className="row" style={{ padding: 12, borderRadius: 12, border: '1px solid var(--line)', background: sd.seed === 1 ? 'rgba(230, 185, 143,.08)' : 'rgba(255,255,255,.02)' }}>
              <span className="badge champion">#{sd.seed}</span>
              <b className="grow">{name(sd.team)}</b>
              <span className="small muted">{sd.points} pts · {sd.seed === 1 ? 'waits in the Grand Final' : 'semifinal'}</span>
            </div>
          ))}
          <p className="small muted">Start the semifinal battle on the right. When it ends, complete the round and set up the video Grand Final.</p>
        </div>
      ) : (
      <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <div className="card-title" style={{ width: '100%' }}>
          <h3>
            <Disc3 size={18} /> Wheel draw · Round {r.roundNumber}
            {r.isFinal && <span className="badge champion">Final</span>}
          </h3>
          <span className="small muted">{r.pool.length} in pool</span>
        </div>
        <Wheel
          segments={view.segments}
          spin={view.spin}
          size={wheelSize}
          onLanded={view.onLanded}
          winnerId={view.landed ? view.reveal?.teamId : null}
          onHubClick={canSpin ? spin : undefined}
          hubDisabled={!canSpin}
          hubLabel={view.spinning ? '···' : 'SPIN'}
        />
        <div className={s.picks}>
          <div className={`${s.pick} ${view.pick1 ? s.pickOn : ''}`}>
            <span className="tiny muted upper">Pick 1</span>
            <b>{view.pick1 ? name(view.pick1) : view.spinning && view.spin?.slot === 1 ? 'Spinning…' : '—'}</b>
          </div>
          <Swords size={20} color="var(--muted)" />
          <div className={`${s.pick} ${view.pick2 ? s.pickOn : ''}`} style={{ '--pc': 'var(--side-b)' }}>
            <span className="tiny muted upper">Pick 2</span>
            <b>{view.pick2 ? name(view.pick2) : view.spinning && view.spin?.slot === 2 ? 'Spinning…' : '—'}</b>
          </div>
        </div>
        <button className={`btn primary xl ${pending['wheel.spin'] ? 'loading' : ''}`} onClick={spin} disabled={!canSpin} style={{ width: '100%' }}>
          <Shuffle /> {view.spinning ? 'SPINNING…' : r.pendingDraw.length ? 'SPIN FOR OPPONENT' : 'SPIN THE WHEEL'} <span className="kbd">S</span>
        </button>
        <div className="row wrap" style={{ justifyContent: 'center' }}>
          <button className="btn sm" disabled={!active || r.pool.length + r.pendingDraw.length < 2} onClick={() => setModal('pair')}>
            <Swords /> Manual pair
          </button>
          <button className="btn sm" disabled={!active} onClick={() => setModal('add')}>
            <UserPlus /> Add team / wildcard
          </button>
          <button className="btn sm" disabled={!r.pendingDraw.length || view.spinning} onClick={resetDraw}>
            <Undo2 /> Reset selection
          </button>
        </div>
      </div>
      )}

      <div className="stack" style={{ gap: 16 }}>
        {lastDone && (
          <div className="card tight" style={{ borderColor: 'rgba(230, 185, 143,.4)' }}>
            <div className="row">
              <Trophy color="var(--orange)" />
              <div className="grow">
                <div className="small muted">Battle #{lastDone.battleNumber} result</div>
                <b>{name(lastDone.winner)}</b> beat {name(lastDone.loser)}{' '}
                <span className="num muted">
                  {Math.max(lastDone.scoreA, lastDone.scoreB)}–{Math.min(lastDone.scoreA, lastDone.scoreB)}
                </span>
              </div>
              {state.tournament.scene === 'battle' && (
                <button className="btn sm" onClick={() => send('scene.set', { scene: 'wheel' })}>
                  <Disc3 /> Back to wheel
                </button>
              )}
            </div>
          </div>
        )}

        {oneLeft && (
          <div className="notice">
            <Award />
            <div className="grow">
              <b>{name(r.pool[0])}</b> is the only team left in the draw. Choose how to continue — a team is never eliminated just because the count is odd.
              <div className="row wrap" style={{ marginTop: 10 }}>
                <button className="btn sm success" onClick={() => bye(r.pool[0])}>
                  <Award /> Give a bye
                </button>
                <button className="btn sm" onClick={() => setModal('add')}>
                  <UserPlus /> Add wildcard opponent
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-title">
            <h3>
              <Swords size={18} /> Upcoming battles
            </h3>
          </div>
          {!pendingBattles.length && <div className="muted small">Spin the wheel twice to create a battle.</div>}
          <div className="stack" style={{ gap: 10 }}>
            {pendingBattles.map((b) => (
              <div key={b.id} className={s.battleRow}>
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="tiny muted">
                    BATTLE #{b.battleNumber} {b.createdVia === 'manual' && '· manual'} {b.isFinal && '· FINAL'}
                  </div>
                  <div className="truncate" style={{ fontWeight: 600 }}>
                    <span style={{ color: 'var(--side-a)' }}>{name(b.teamA)}</span> <span className="muted">vs</span> <span style={{ color: 'var(--side-b)' }}>{name(b.teamB)}</span>
                  </div>
                </div>
                <button className="btn sm ghost" title="Show versus screen" onClick={() => send('scene.versus', { battleId: b.id }).catch(() => {})}>
                  <Swords />
                </button>
                <button className="btn sm ghost" title="Correct a team" onClick={() => setModal({ swap: b })}>
                  <Replace />
                </button>
                <button className="btn sm ghost" title="Cancel battle" onClick={() => cancelBattle(b)}>
                  <X />
                </button>
                <button className={`btn sm success ${pending[`start-${b.id}`] ? 'loading' : ''}`} disabled={!!state.tournament.activeBattle} onClick={() => startBattle(b)}>
                  <Play /> Start
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            <h3>
              <Disc3 size={18} /> Still in the draw ({r.pool.length + r.pendingDraw.length})
            </h3>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {r.pendingDraw.map((id) => (
              <span key={id} className="chip on">
                {name(id)} · picked
              </span>
            ))}
            {r.pool.map((id) => (
              <span key={id} className="chip" onClick={() => bye(id)} title="Click to give a bye">
                {name(id)}
              </span>
            ))}
            {!r.pool.length && !r.pendingDraw.length && <span className="muted small">Everyone has been drawn.</span>}
          </div>
          {!!completed.length && (
            <>
              <div className="divider" />
              <div className="small muted" style={{ marginBottom: 8 }}>Completed this round</div>
              <div className="stack" style={{ gap: 6 }}>
                {completed.map((b) => (
                  <div key={b.id} className="row small">
                    <CheckCircle2 size={15} color="var(--green)" />
                    <span className="grow truncate">
                      <b>{name(b.winner)}</b> beat {name(b.loser)}
                    </span>
                    <span className="num muted">
                      {b.scoreA}–{b.scoreB}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {modal === 'pair' && (
        <ManualPairModal state={state} onClose={() => setModal(null)} onSubmit={(p) => send('round.manualPair', p, { success: 'Battle created' }).then(() => setModal(null)).catch(() => {})} />
      )}
      {modal === 'add' && (
        <AddTeamModal state={state} onClose={() => setModal(null)} onSubmit={(p) => send('round.addTeam', p, { success: 'Team added to the round' }).then(() => setModal(null)).catch(() => {})} />
      )}
      {modal?.swap && (
        <SwapModal state={state} battle={modal.swap} onClose={() => setModal(null)} onSubmit={(p) => send('battle.swapTeam', p, { success: 'Battle corrected' }).then(() => setModal(null)).catch(() => {})} />
      )}
    </div>
  );
}
