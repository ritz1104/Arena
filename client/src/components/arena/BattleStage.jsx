import { AnimatePresence, motion } from 'framer-motion';
import { Lightbulb, CheckCircle2, Zap, Lock, Trophy, Skull, Sparkles, Hourglass } from 'lucide-react';
import AnimatedNumber from '../ui/AnimatedNumber.jsx';
import Countdown from './Countdown.jsx';
import { pad2 } from '../../lib/format.js';
import s from './BattleStage.module.css';

function teamState(b, id) {
  const l = b.live;
  if (b.status === 'completed') return b.winner === id ? 'winner' : 'loser';
  if (l.phase === 'answering' && l.answeringTeam === id) return 'answering';
  if (l.phase === 'steal' && l.answeringTeam === id) return 'steal';
  if ((l.phase === 'answering' || l.phase === 'steal') && l.answeringTeam !== id) return 'locked';
  if (l.phase === 'buzz_open') return 'open';
  return 'idle';
}

const TAG = {
  answering: { icon: Zap, text: 'BUZZED!' },
  steal: { icon: Sparkles, text: 'STEAL CHANCE' },
  locked: { icon: Lock, text: 'LOCKED' },
  open: { icon: Zap, text: 'BUZZ NOW' },
  winner: { icon: Trophy, text: 'WINNER' },
  loser: { icon: Skull, text: 'ELIMINATED' },
};

export function TeamPanel({ team, side, score, status, timer, isFinal }) {
  const tag = TAG[status];
  const Icon = tag?.icon;
  return (
    <motion.div
      className={`${s.team} ${s[`side${side}`]} ${s[status] ?? ''}`}
      initial={{ opacity: 0, x: side === 'A' ? -80 : 80 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 18 }}
    >
      <div className={s.teamTop}>
        <span className={s.sideTag}>{side === 'A' ? 'TEAM A' : 'TEAM B'}</span>
        <AnimatePresence mode="wait">
          {tag && (
            <motion.span key={status} className={s.tag} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.6, opacity: 0 }}>
              <Icon size="1em" /> {status === 'loser' && isFinal ? 'RUNNER-UP' : status === 'winner' && isFinal ? 'CHAMPIONS' : tag.text}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className={s.teamName}>{team?.teamName ?? 'Team'}</div>
      <div className={s.members}>
        {team?.members?.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <div className={s.scoreRow}>
        <div className={s.score}>
          <AnimatedNumber value={score} className="num" />
        </div>
        {(status === 'answering' || status === 'steal') && timer?.kind && (
          <div className={s.miniTimer}>
            <Countdown timer={timer} size={5.2} ticks label={status === 'steal' ? 'STEAL' : 'ANSWER'} />
          </div>
        )}
      </div>
      {status === 'loser' && <div className={s.stamp}>{isFinal ? 'RUNNER-UP' : 'ELIMINATED'}</div>}
    </motion.div>
  );
}

function phaseText(b, teams) {
  const l = b.live;
  const name = (id) => teams[id]?.teamName ?? 'Team';
  if (b.status === 'completed') return { text: `${name(b.winner)} ${b.isFinal ? 'ARE THE CHAMPIONS' : 'ADVANCE'}!`, tone: 'win' };
  if (l.timeUp) return { text: "TIME'S UP!", tone: 'bad' };
  switch (l.phase) {
    case 'ready':
      return { text: `GET READY · QUESTION ${l.qIndex + 1}`, tone: 'calm' };
    case 'question':
      return { text: 'READ CAREFULLY…', tone: 'calm' };
    case 'buzz_open':
      return { text: l.stage === 'hint' ? 'SECOND CHANCE — BUZZ NOW!' : 'BUZZERS OPEN!', tone: 'go' };
    case 'no_buzz':
      return { text: 'NO BUZZ… HINT INCOMING?', tone: 'warn' };
    case 'answering':
      return { text: `${name(l.answeringTeam)} IS ANSWERING`, tone: 'hot' };
    case 'steal':
      return { text: `${name(l.answeringTeam)} CAN STEAL!`, tone: 'warn' };
    case 'resolved': {
      const map = {
        correct: 'CORRECT ANSWER!',
        steal_correct: 'STOLEN!',
        steal_failed: 'NO EXTRA POINTS',
        wrong: 'WRONG ANSWER',
        skipped: 'QUESTION SKIPPED',
        skipped_no_buzz: 'NOBODY BUZZED — SKIPPED',
      };
      const good = l.outcome === 'correct' || l.outcome === 'steal_correct';
      return { text: map[l.outcome] ?? 'RESOLVED', tone: good ? 'win' : 'bad' };
    }
    default:
      return { text: '', tone: 'calm' };
  }
}

export function QuestionCard({ q, live }) {
  const shown = !!q?.text;
  return (
    <div className={s.qCard}>
      <div className={s.qHead}>
        <span className={s.qNum}>
          QUESTION <b className="num">{pad2((q?.index ?? live.qIndex) + 1)}</b> / <span className="num">{pad2(q?.total ?? live.total)}</span>
        </span>
        {q?.category && (
          <span className={s.cat} style={{ '--cc': q.category.color }}>
            {q.category.name}
          </span>
        )}
        {q?.difficulty && <span className={`${s.diff} ${s[q.difficulty]}`}>{q.difficulty}</span>}
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={`${live.qIndex}-${shown}`}
          className={`${s.qText} ${shown ? '' : s.qHidden}`}
          initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.45 }}
        >
          {shown ? `“${q.text}”` : 'The next question is coming up…'}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Progress({ b }) {
  const results = new Map((b.results ?? []).map((r) => [r.index, r]));
  return (
    <div className={s.progress}>
      {Array.from({ length: b.live.total }, (_, i) => {
        const r = results.get(i);
        const cls = !r ? '' : r.pointsA > r.pointsB ? s.pA : r.pointsB > r.pointsA ? s.pB : s.p0;
        return <span key={i} className={`${s.dot} ${cls} ${i === b.live.qIndex && b.status === 'active' ? s.cur : ''}`} />;
      })}
    </div>
  );
}

export default function BattleStage({ state }) {
  const b = state.battle;
  const teams = state.teams;
  if (!b) return null;
  if (b.status === 'pending') return <VersusStage state={state} />;
  const live = b.live;
  const q = b.question;
  const phase = phaseText(b, teams);
  const centerTimer = live.timer?.kind === 'buzz' ? live.timer : null;

  return (
    <div className={s.battle}>
      <div className={s.vsRow}>
        <TeamPanel team={teams[b.teamA]} side="A" score={b.scoreA} status={teamState(b, b.teamA)} timer={live.timer} isFinal={b.isFinal} />
        <div className={s.center}>
          <div className={s.vs}>VS</div>
          {b.status === 'completed' ? (
            <Trophy size="5em" className={s.trophy} />
          ) : (
            <Countdown timer={centerTimer} size={9.5} ticks label={centerTimer ? (live.stage === 'hint' ? 'HINT ROUND' : 'BUZZ') : undefined} />
          )}
          <Progress b={b} />
        </div>
        <TeamPanel team={teams[b.teamB]} side="B" score={b.scoreB} status={teamState(b, b.teamB)} timer={live.timer} isFinal={b.isFinal} />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={phase.text}
          className={`${s.banner} ${s[phase.tone]}`}
          initial={{ opacity: 0, scale: 0.85, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        >
          {phase.tone === 'warn' && live.phase === 'no_buzz' ? <Hourglass size="1em" /> : null}
          {phase.text}
        </motion.div>
      </AnimatePresence>

      {b.status !== 'completed' && <QuestionCard q={q} live={live} />}

      <div className={s.extras}>
        <AnimatePresence>
          {q?.hint && b.status !== 'completed' && (
            <motion.div key="hint" className={s.hint} initial={{ opacity: 0, x: -60, rotateX: 50 }} animate={{ opacity: 1, x: 0, rotateX: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 160, damping: 18 }}>
              <Lightbulb size="1.4em" />
              <div>
                <div className={s.xLabel}>HINT</div>
                <div className={s.xText}>{q.hint}</div>
              </div>
            </motion.div>
          )}
          {q?.answer && b.status !== 'completed' && (
            <motion.div key="ans" className={s.answer} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 16 }}>
              <CheckCircle2 size="1.4em" />
              <div>
                <div className={s.xLabel}>ANSWER</div>
                <div className={s.xText}>{q.answer}</div>
                {q.explanation && <div className={s.expl}>{q.explanation}</div>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {b.status === 'completed' && <ResultPanel b={b} teams={teams} />}
    </div>
  );
}

function ResultPanel({ b, teams }) {
  const w = teams[b.winner];
  const wScore = b.winner === b.teamA ? b.scoreA : b.scoreB;
  const lScore = b.winner === b.teamA ? b.scoreB : b.scoreA;
  return (
    <motion.div className={s.result} initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, type: 'spring' }}>
      <Trophy size="3em" className={s.trophy} />
      <div>
        <div className={s.xLabel}>{b.isFinal ? 'CHAMPIONS OF THE ARENA' : 'ADVANCES TO THE NEXT ROUND'}</div>
        <div className={s.resultName}>{w?.teamName}</div>
        <div className={s.resultScore}>
          Final score <b className="num">{wScore}</b> – <span className="num">{lScore}</span>
          {b.winnerOverrideReason && <span className={s.expl}> · Host decision: {b.winnerOverrideReason}</span>}
        </div>
      </div>
    </motion.div>
  );
}

export function VersusStage({ state, battleId }) {
  const b = battleId ? state.roundBattles.find((x) => x.id === battleId) : state.battle;
  if (!b) return null;
  const A = state.teams[b.teamA];
  const B = state.teams[b.teamB];
  return (
    <div className={s.versus}>
      <motion.div className={s.vsLabel} initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        {b.isFinal ? 'THE GRAND FINAL' : `ROUND ${b.roundNumber} · BATTLE #${b.battleNumber}`}
      </motion.div>
      <div className={s.vsGrid}>
        <motion.div className={`${s.vsTeam} ${s.sideA}`} initial={{ x: '-60vw', skewX: -12 }} animate={{ x: 0, skewX: 0 }} transition={{ type: 'spring', stiffness: 70, damping: 14 }}>
          <div className={s.vsName}>{A?.teamName}</div>
          <div className={s.vsMembers}>{A?.members?.join(' · ')}</div>
        </motion.div>
        <motion.div className={s.vsBig} initial={{ scale: 4, opacity: 0, rotate: -20 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ delay: 0.55, type: 'spring', stiffness: 200, damping: 12 }}>
          VS
        </motion.div>
        <motion.div className={`${s.vsTeam} ${s.sideB}`} initial={{ x: '60vw', skewX: 12 }} animate={{ x: 0, skewX: 0 }} transition={{ type: 'spring', stiffness: 70, damping: 14 }}>
          <div className={s.vsName}>{B?.teamName}</div>
          <div className={s.vsMembers}>{B?.members?.join(' · ')}</div>
        </motion.div>
      </div>
      <motion.div className={s.vsTag} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 }}>
        THINK FAST. BUZZ FIRST. WIN BIG.
      </motion.div>
    </div>
  );
}
