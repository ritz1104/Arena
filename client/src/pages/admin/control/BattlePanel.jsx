import { useEffect, useRef, useState } from 'react';
import {
  Eye, Timer, Pause, Play, Lightbulb, Check, X, Clock, SkipForward, ChevronRight, Flag, Swords, Wrench, Zap, Ban, Crown, Disc3, BarChart3, CheckCircle2, Copy,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useLive } from '../../../context/LiveContext.jsx';
import { useConfirm } from '../../../context/ConfirmContext.jsx';
import Countdown from '../../../components/arena/Countdown.jsx';
import AnimatedNumber from '../../../components/ui/AnimatedNumber.jsx';
import Modal from '../../../components/ui/Modal.jsx';
import { PHASE_LABEL, OUTCOME_LABEL, pad2 } from '../../../lib/format.js';
import s from '../Control.module.css';

function Btn({ k, label, icon: Icon, onClick, enabled, tone = '', hot, pendingKey, pending }) {
  return (
    <button className={`btn ${tone} ${hot && enabled ? s.hotBtn : ''} ${pending?.[pendingKey] ? 'loading' : ''}`} disabled={!enabled || !!pending?.[pendingKey]} onClick={onClick}>
      <Icon /> {label} {k && <span className="kbd">{k}</span>}
    </button>
  );
}

export default function BattlePanel({ state, buzzerKey }) {
  const { send, pending } = useLive();
  const confirm = useConfirm();
  const [adjust, setAdjust] = useState(false);
  const [pickWinner, setPickWinner] = useState(false);
  const b = state.battle;
  const live = b.live;
  const q = b.question;
  const teams = state.teams;
  const A = teams[b.teamA];
  const B = teams[b.teamB];
  const name = (id) => teams[id]?.teamName ?? '—';
  const ph = live.phase;
  const isActive = b.status === 'active';
  const last = live.qIndex >= live.total - 1;
  const tied = b.scoreA === b.scoreB;
  const tm = live.timer;
  const busy = Object.keys(pending).some((k) => k.startsWith('battle.'));

  const run = (type, payload, opts) => send(type, payload, opts).catch(() => {});
  const can = {
    show: isActive && ph === 'ready',
    start: isActive && ph === 'question',
    pause: isActive && tm?.running,
    resume: isActive && !tm?.running && tm?.kind && tm?.remainingMs > 0 && !live.timeUp,
    hint: isActive && ph === 'no_buzz' && live.stage === 'initial',
    buzz: isActive && ph === 'buzz_open',
    mark: isActive && (ph === 'answering' || ph === 'steal'),
    skip: isActive && !['resolved', 'finished'].includes(ph),
    reveal: isActive && ph === 'resolved' && !live.answerRevealed,
    next: isActive && ph === 'resolved' && !last,
    tiebreak: isActive && ph === 'resolved' && last && tied,
    end: isActive && ph === 'resolved' && last && !tied,
  };

  const skip = async () => {
    const res = await confirm({ title: 'Skip this question?', message: 'No points are awarded for a skipped question.', confirmText: 'Skip question', input: { label: 'Reason (optional)' } });
    if (res) run('battle.skip', { reason: res.value });
  };
  const endEarly = async () => {
    const res = await confirm({
      title: 'End the battle early?',
      message: `Current score ${name(b.teamA)} ${b.scoreA} – ${b.scoreB} ${name(b.teamB)}. Remaining questions will not be played.`,
      confirmText: 'End battle now',
      danger: true,
    });
    if (!res) return;
    if (tied) setPickWinner('early');
    else run('battle.end', { early: true });
  };
  const abort = async () => {
    const res = await confirm({
      title: 'Stop and reset this battle?',
      message: 'Only possible before any point is recorded. The battle returns to the upcoming list and its questions are released.',
      confirmText: 'Stop battle',
      danger: true,
      input: { label: 'Reason', required: true },
    });
    if (res) run('battle.abort', { reason: res.value });
  };

  const keyRef = useRef();
  keyRef.current = (e) => {
    if (e.target?.closest?.('input, textarea, select, [role=dialog]') || e.metaKey || e.ctrlKey || e.altKey || busy) return;
    const k = e.key.toLowerCase();
    const act = {
      q: () => can.show && run('battle.showQuestion'),
      ' ': () => (can.start ? run('battle.startTimer') : can.pause ? run('battle.pauseTimer') : can.resume ? run('battle.resumeTimer') : null),
      t: () => can.start && run('battle.startTimer'),
      h: () => can.hint && run('battle.revealHint'),
      a: () => can.buzz && run('battle.buzz', { side: 'A' }),
      arrowleft: () => can.buzz && run('battle.buzz', { side: 'A' }),
      l: () => can.buzz && run('battle.buzz', { side: 'B' }),
      arrowright: () => can.buzz && run('battle.buzz', { side: 'B' }),
      c: () => can.mark && run('battle.mark', { result: 'correct' }),
      x: () => can.mark && run('battle.mark', { result: 'wrong' }),
      o: () => can.mark && run('battle.mark', { result: 'timeout' }),
      r: () => can.reveal && run('battle.revealAnswer'),
      s: () => can.skip && skip(),
      n: () => can.next && run('battle.next'),
      enter: () => (can.next ? run('battle.next') : null),
    }[k];
    if (act) {
      e.preventDefault();
      act();
    }
  };
  useEffect(() => {
    const on = (e) => keyRef.current(e);
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);

  const answering = live.answeringTeam;
  const sideState = (id) => {
    if (b.status === 'completed') return b.winner === id ? s.win : s.lose;
    if ((ph === 'answering' || ph === 'steal') && answering === id) return ph === 'steal' ? s.stealing : s.answering;
    if (ph === 'buzz_open') return s.open;
    return '';
  };

  const buzzerUrl = (side) => `${window.location.origin}/buzz/${side === 'A' ? 'left' : 'right'}?key=${buzzerKey}`;

  const TeamBox = ({ id, side, score, team }) => (
    <div className={`${s.teamBox} ${side === 'B' ? s.sideB : ''} ${sideState(id)}`}>
      <div className="row between">
        <span className="tiny upper" style={{ color: side === 'A' ? 'var(--side-a)' : 'var(--side-b)', fontWeight: 700 }}>Team {side}</span>
        {(ph === 'answering' || ph === 'steal') && answering === id && <span className="badge live dot">{ph === 'steal' ? 'Stealing' : 'Answering'}</span>}
        {b.status === 'completed' && <span className={`badge ${b.winner === id ? 'qualified' : 'eliminated'}`}>{b.winner === id ? (b.isFinal ? 'Champion' : 'Advances') : 'Eliminated'}</span>}
      </div>
      <div className={s.teamBoxName}>{team?.teamName}</div>
      <div className="tiny muted truncate">{team?.members.join(' · ')}</div>
      <div className="row between" style={{ marginTop: 8 }}>
        <span className={s.teamBoxScore}>
          <AnimatedNumber value={score} className="num" />
        </span>
        <button className={`btn ${can.buzz ? 'primary' : ''} lg`} disabled={!can.buzz || !!pending['battle.buzz']} onClick={() => run('battle.buzz', { side })} style={side === 'B' && can.buzz ? { background: 'linear-gradient(135deg,#F1EAE0,#CFC5B7)' } : undefined}>
          <Zap /> Buzz <span className="kbd">{side === 'A' ? 'A / ←' : 'L / →'}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card">
        <div className="card-title">
          <h3>
            <Swords size={18} /> Battle #{b.battleNumber} {b.isFinal && <span className="badge champion">Final</span>}
            <span className={`badge ${isActive ? 'live dot' : 'completed'}`}>{isActive ? 'Live' : 'Completed'}</span>
          </h3>
          <div className="row small muted">
            Phase: <b style={{ color: 'var(--text)' }}>{live.timeUp ? "Time's up" : PHASE_LABEL[ph]}</b>
            {live.stage === 'hint' && isActive && <span className="badge pending">Hint round</span>}
          </div>
        </div>
        <div className={s.vsGrid}>
          <TeamBox id={b.teamA} side="A" score={b.scoreA} team={A} />
          <div className={s.vsCenter}>
            <Countdown timer={tm} size={7.5} />
            <div className={s.dots}>
              {Array.from({ length: live.total }, (_, i) => {
                const r = b.results.find((x) => x.index === i);
                const cls = !r ? '' : r.pointsA > r.pointsB ? s.dA : r.pointsB > r.pointsA ? s.dB : s.d0;
                return <span key={i} className={`${s.dot} ${cls} ${i === live.qIndex && isActive ? s.dCur : ''}`} title={r ? OUTCOME_LABEL[r.outcome] : `Q${i + 1}`} />;
              })}
            </div>
          </div>
          <TeamBox id={b.teamB} side="B" score={b.scoreB} team={B} />
        </div>
      </div>

      {isActive && (
        <div className={`card ${s.qPanel}`}>
          <div className="row between wrap" style={{ marginBottom: 10 }}>
            <div className="row" style={{ gap: 8 }}>
              <span className="upper small muted">
                Question <b className="num" style={{ color: 'var(--text)' }}>{pad2(live.qIndex + 1)}</b> / {pad2(live.total)}
              </span>
              {q?.category && <span className="badge" style={{ '--c': q.category.color }}>{q.category.name}</span>}
              {q?.difficulty && <span className="badge">{q.difficulty}</span>}
            </div>
            <span className={`badge ${q?.shown ? 'qualified' : 'pending'}`}>{q?.shown ? 'On screen' : 'Hidden from audience'}</span>
          </div>
          <div className={s.qText}>{q?.text}</div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 14 }}>
            <div className={s.secret}>
              <span className="tiny upper muted">Hint {live.hintRevealed ? '· revealed' : '· hidden'}</span>
              <div>{q?.hint || <i className="muted">No hint for this question</i>}</div>
            </div>
            <div className={`${s.secret} ${s.answerBox}`}>
              <span className="tiny upper muted">Answer (host only{live.answerRevealed ? ' · revealed' : ''})</span>
              <div style={{ fontWeight: 700 }}>{q?.answer}</div>
              {q?.explanation && <div className="tiny muted">{q.explanation}</div>}
            </div>
          </div>
        </div>
      )}

      {isActive && (
        <div className={`card ${s.controls}`}>
          <div className={s.ctlGroup}>
            <span className={s.ctlLabel}>Question</span>
            <Btn k="Q" label="Show question" icon={Eye} enabled={can.show} hot onClick={() => run('battle.showQuestion')} pending={pending} pendingKey="battle.showQuestion" />
            <Btn k="Space" label="Start timer" icon={Timer} enabled={can.start} hot tone="success" onClick={() => run('battle.startTimer')} pending={pending} pendingKey="battle.startTimer" />
            {can.pause ? (
              <Btn k="Space" label="Pause" icon={Pause} enabled onClick={() => run('battle.pauseTimer')} pending={pending} pendingKey="battle.pauseTimer" />
            ) : (
              <Btn k="Space" label="Resume" icon={Play} enabled={can.resume} onClick={() => run('battle.resumeTimer')} pending={pending} pendingKey="battle.resumeTimer" />
            )}
            <Btn k="H" label="Reveal hint" icon={Lightbulb} enabled={can.hint} hot tone="warn" onClick={() => run('battle.revealHint')} pending={pending} pendingKey="battle.revealHint" />
          </div>
          <div className={s.ctlGroup}>
            <span className={s.ctlLabel}>
              Result {answering && can.mark && <>— <b style={{ color: 'var(--text)' }}>{name(answering)}</b>{ph === 'steal' ? ' (steal)' : ''}</>}
            </span>
            <Btn k="C" label="Correct" icon={Check} enabled={can.mark} tone="success" hot onClick={() => run('battle.mark', { result: 'correct' }, { key: 'battle.mark' })} pending={pending} pendingKey="battle.mark" />
            <Btn k="X" label="Wrong" icon={X} enabled={can.mark} tone="danger" onClick={() => run('battle.mark', { result: 'wrong' }, { key: 'battle.mark' })} pending={pending} pendingKey="battle.mark" />
            <Btn k="O" label="No answer" icon={Clock} enabled={can.mark} tone={live.timeUp ? 'warn' : ''} hot={live.timeUp} onClick={() => run('battle.mark', { result: 'timeout' }, { key: 'battle.mark' })} pending={pending} pendingKey="battle.mark" />
          </div>
          <div className={s.ctlGroup}>
            <span className={s.ctlLabel}>Next</span>
            <Btn k="R" label="Reveal answer" icon={CheckCircle2} enabled={can.reveal} hot onClick={() => run('battle.revealAnswer')} pending={pending} pendingKey="battle.revealAnswer" />
            <Btn k="N" label="Next question" icon={ChevronRight} enabled={can.next} tone="primary" onClick={() => run('battle.next')} pending={pending} pendingKey="battle.next" />
            {can.tiebreak && <Btn label="Tiebreaker question" icon={Swords} enabled tone="warn" hot onClick={() => run('battle.tiebreaker')} pending={pending} pendingKey="battle.tiebreaker" />}
            {can.tiebreak && <Btn label="Choose winner…" icon={Crown} enabled onClick={() => setPickWinner('tie')} />}
            {last && !can.tiebreak && (
              <Btn label="End battle" icon={Flag} enabled={can.end} tone="primary" hot onClick={() => run('battle.end')} pending={pending} pendingKey="battle.end" />
            )}
          </div>
          <div className={s.hintLine}>
            {ph === 'ready' && 'Press Show question when the teams are ready.'}
            {ph === 'question' && 'Start the timer to open the buzzers.'}
            {ph === 'buzz_open' && 'Buzzers open — press the buzzing team (A / L) or use the podium buzzers.'}
            {ph === 'no_buzz' && (live.stage === 'initial' ? 'Nobody buzzed. Reveal the hint for a second chance, or skip.' : '')}
            {ph === 'answering' && (live.timeUp ? "Time's up — mark No answer (opposition gets +1 and a steal chance)." : 'Listen to the answer, then mark it.')}
            {ph === 'steal' && (live.timeUp ? "Steal time's up — mark No answer." : 'Opposition is answering on the steal.')}
            {ph === 'resolved' && (last ? (tied ? 'Scores are tied — play a tiebreaker or choose a winner.' : 'Last question done — end the battle.') : 'Reveal the answer if you like, then move to the next question.')}
          </div>
        </div>
      )}

      {isActive && (
        <div className="row wrap" style={{ gap: 8 }}>
          <span className="small muted row" style={{ gap: 6 }}>
            <Wrench size={15} /> Tools:
          </span>
          <button className="btn sm" disabled={!can.skip} onClick={skip}>
            <SkipForward /> Skip question <span className="kbd">S</span>
          </button>
          <button className="btn sm" onClick={() => setAdjust(true)}>
            <Wrench /> Score correction
          </button>
          <button className="btn sm" disabled={!(ph === 'resolved' || ph === 'ready') || can.end} onClick={endEarly}>
            <Flag /> End early
          </button>
          <button className="btn sm outline-danger" disabled={b.scoreA + b.scoreB > 0 || b.results.length > 0} onClick={abort}>
            <Ban /> Stop & reset
          </button>
          {buzzerKey && (
            <span className="row" style={{ gap: 6, marginLeft: 'auto' }}>
              <span className="small muted">Podium buzzers:</span>
              {['A', 'B'].map((side) => (
                <button
                  key={side}
                  className="btn sm ghost"
                  onClick={() => {
                    navigator.clipboard?.writeText(buzzerUrl(side));
                    toast.success(`${side === 'A' ? 'Left' : 'Right'} buzzer link copied`);
                  }}
                >
                  <Copy /> {side === 'A' ? 'Left (A)' : 'Right (B)'}
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      {b.status === 'completed' && (
        <div className="card row wrap between" style={{ borderColor: 'rgba(230, 185, 143,.45)' }}>
          <div>
            <div className="small muted">Battle finished · {b.scoreA}–{b.scoreB}</div>
            <h3 style={{ fontSize: 20 }}>
              {name(b.winner)} {b.isFinal ? 'are the CHAMPIONS!' : 'advance'}
            </h3>
            {b.winnerOverrideReason && <div className="tiny muted">Host decision: {b.winnerOverrideReason}</div>}
          </div>
          <div className="row wrap">
            {b.isFinal ? (
              <button className="btn warn lg" onClick={() => run('tournament.announceChampion')}>
                <Crown /> Announce champion
              </button>
            ) : (
              <>
                <button className="btn" onClick={() => run('scene.set', { scene: 'leaderboard_round' })}>
                  <BarChart3 /> Round leaderboard
                </button>
                <button className="btn primary" onClick={() => run('scene.set', { scene: 'wheel' })}>
                  <Disc3 /> Back to the wheel
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {adjust && <AdjustModal b={b} name={name} onClose={() => setAdjust(false)} onSubmit={(p) => send('battle.adjust', p, { success: 'Score corrected' }).then(() => setAdjust(false)).catch(() => {})} />}
      {pickWinner && (
        <WinnerModal
          b={b}
          name={name}
          onClose={() => setPickWinner(false)}
          onSubmit={(p) => send('battle.end', { ...p, early: pickWinner === 'early' || !last }).then(() => setPickWinner(false)).catch(() => {})}
        />
      )}
    </div>
  );
}

function AdjustModal({ b, name, onClose, onSubmit }) {
  const [teamId, setTeamId] = useState(b.teamA);
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState('');
  return (
    <Modal
      title="Score correction"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn warn" disabled={!reason.trim() || !delta} onClick={() => onSubmit({ teamId, delta, reason })}>
            Apply {delta > 0 ? `+${delta}` : delta}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="notice info">For exceptional situations only (e.g. a judge review). Corrections are stored as separate audited entries — history is never overwritten.</div>
        <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
          <label className="field">
            <span>Team</span>
            <select className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value={b.teamA}>{name(b.teamA)} (now {b.scoreA})</option>
              <option value={b.teamB}>{name(b.teamB)} (now {b.scoreB})</option>
            </select>
          </label>
          <label className="field">
            <span>Points (±5)</span>
            <input className="input" type="number" min={-5} max={5} value={delta} onChange={(e) => setDelta(Math.max(-5, Math.min(5, Number.parseInt(e.target.value, 10) || 0)))} />
          </label>
        </div>
        <label className="field">
          <span>Reason (required)</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Answer accepted after judge review" />
        </label>
      </div>
    </Modal>
  );
}

function WinnerModal({ b, name, onClose, onSubmit }) {
  const [winnerId, setWinner] = useState('');
  const [reason, setReason] = useState('');
  return (
    <Modal
      title="Choose the winner"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!winnerId || !reason.trim()} onClick={() => onSubmit({ winnerId, reason })}>
            Confirm winner
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted small">The scores are tied {b.scoreA}–{b.scoreB}. The host decision and reason are recorded in the audit log.</p>
        <div className="row">
          {[b.teamA, b.teamB].map((id) => (
            <button key={id} className={`btn grow ${winnerId === id ? 'primary' : ''}`} onClick={() => setWinner(id)}>
              <Crown /> {name(id)}
            </button>
          ))}
        </div>
        <label className="field">
          <span>Reason (required)</span>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Faster correct answers overall" />
        </label>
      </div>
    </Modal>
  );
}
