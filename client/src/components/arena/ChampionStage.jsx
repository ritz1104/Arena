import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Trophy, Medal, Star } from 'lucide-react';
import { useLeaderboard } from '../../hooks/useLeaderboard.js';
import { celebrate, burst } from '../../lib/fx.js';
import s from './ChampionStage.module.css';

/** Final championship screen: champion card, runner-up, final scoreboard. */
export default function ChampionStage({ state, celebrateOnMount = true }) {
  const { data } = useLeaderboard('final');
  const champ = data?.champion;

  useEffect(() => {
    if (!celebrateOnMount || !champ) return undefined;
    burst({ particleCount: 220, spread: 120, origin: { y: 0.4 } });
    const stop = celebrate(9000);
    const again = setInterval(() => burst({ particleCount: 90, spread: 100, origin: { x: Math.random() * 0.6 + 0.2, y: 0.3 } }), 4500);
    return () => {
      stop();
      clearInterval(again);
    };
  }, [champ?.id, celebrateOnMount]);

  if (!data) return null;
  if (!champ) {
    return (
      <div className={s.wrap}>
        <Trophy className={s.bigTrophy} />
        <h2 className={s.title}>The championship awaits…</h2>
      </div>
    );
  }
  const runner = data.runnerUp;
  const fb = data.finalBattle;
  const isVideo = data.format === 'video';
  const champFinal = isVideo ? data.finalists.find((x) => x.team.id === champ.id)?.finalScore ?? null : fb ? (fb.teamA === champ.id ? fb.scoreA : fb.scoreB) : null;
  const runnerFinal = !runner ? null : isVideo ? data.finalists.find((x) => x.team.id === runner.id)?.finalScore ?? null : fb ? (fb.teamA === runner.id ? fb.scoreA : fb.scoreB) : null;
  const runnerTotal = data.finalists.find((f) => f.team.id === runner?.id)?.totalScore;

  return (
    <div className={s.wrap}>
      <div className={s.rays} aria-hidden />
      <motion.div className={s.kicker} initial={{ opacity: 0, letterSpacing: '1em' }} animate={{ opacity: 1, letterSpacing: '0.4em' }} transition={{ duration: 1.2 }}>
        {state?.tournament?.name ?? data.tournament?.name}
      </motion.div>
      <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 10, delay: 0.3 }}>
        <Trophy className={s.bigTrophy} strokeWidth={1.4} />
      </motion.div>
      <motion.div className={s.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
        CHAMPIONS
      </motion.div>
      <motion.div className={s.champCard} initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.1, type: 'spring', stiffness: 140 }}>
        <div className={s.champName}>{champ.teamName}</div>
        <div className={s.champMembers}>
          {champ.members?.map((m) => (
            <span key={m}>
              <Star size="0.8em" /> {m}
            </span>
          ))}
        </div>
        <div className={s.stats}>
          {champFinal != null && (
            <div>
              <b className="num">{champFinal}</b>
              <span>{isVideo ? 'Judges’ score' : 'Final battle'}</span>
            </div>
          )}
          <div>
            <b className="num">{data.championTotal ?? 0}</b>
            <span>Total points</span>
          </div>
        </div>
      </motion.div>
      {runner && (
        <motion.div className={s.runner} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.8 }}>
          <Medal size="1.3em" />
          <span className={s.runnerLabel}>RUNNER-UP</span>
          <b>{runner.teamName}</b>
          {runnerFinal != null && <span className="num muted">{isVideo ? 'Judges' : 'Final'} {champFinal}–{runnerFinal}</span>}
          {runnerTotal != null && <span className="num muted">· {runnerTotal} total pts</span>}
        </motion.div>
      )}
    </div>
  );
}
