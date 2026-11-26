import { AnimatePresence, motion } from 'framer-motion';
import { Crown, Medal, Sparkles } from 'lucide-react';
import AnimatedNumber from '../ui/AnimatedNumber.jsx';
import { STATUS_LABEL } from '../../lib/format.js';
import styles from './LeaderboardBoard.module.css';

const RANK_COLOR = { 1: '#E6B98F', 2: '#D6CEC3', 3: '#C98A63' };

/**
 * type="round"   → round points, battles, correct/wrong, round status
 * type="overall" → cumulative points, rounds, battles won, correct/wrong, status
 */
export default function LeaderboardBoard({ rows = [], type = 'round', big = false, limit }) {
  const list = limit ? rows.slice(0, limit) : rows;
  const cols =
    type === 'round'
      ? [['Rank'], ['Team'], ['Round pts', 'r'], ['Battles', 'r'], ['Correct', 'r'], ['Wrong', 'r'], ['Status']]
      : [['Rank'], ['Team'], ['Total pts', 'r'], ['Rounds', 'r'], ['Won', 'r'], ['Correct', 'r'], ['Wrong', 'r'], ['Status']];

  return (
    <div className={`${styles.board} ${big ? styles.big : ''} ${type === 'round' ? styles.round : styles.overall}`}>
      <div className={`${styles.row} ${styles.head}`}>
        {cols.map(([c, a]) => (
          <div key={c} className={a === 'r' ? styles.r : ''}>
            {c}
          </div>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {list.map((row) => {
          const status = type === 'round' ? row.roundStatus : row.team.status;
          const top = row.rank <= 3 && row.points > 0;
          return (
            <motion.div
              layout
              key={row.team.id}
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              className={`${styles.row} ${top ? styles.top : ''} ${status === 'eliminated' ? styles.out : ''}`}
              style={top ? { '--rc': RANK_COLOR[row.rank] } : undefined}
            >
              <div className={styles.rank}>
                {top ? row.rank === 1 ? <Crown /> : <Medal /> : null}
                <span className="num">{row.rank}</span>
              </div>
              <div className={styles.team}>
                <div className={styles.name}>
                  {row.team.teamName}
                  {(row.isWildcard || row.team.isWildcard) && (
                    <span className="badge wildcard" style={{ marginLeft: 8 }}>
                      <Sparkles size={11} /> WC
                    </span>
                  )}
                </div>
                <div className={styles.members}>{row.team.members?.join(' · ')}</div>
              </div>
              <div className={`${styles.r} ${styles.pts} num`}>
                <AnimatedNumber value={row.points} />
              </div>
              {type === 'round' ? (
                <div className={`${styles.r} num`}>{row.battlesPlayed}</div>
              ) : (
                <>
                  <div className={`${styles.r} num`}>{row.roundsParticipated}</div>
                  <div className={`${styles.r} num`}>{row.battlesWon}</div>
                </>
              )}
              <div className={`${styles.r} num`} style={{ color: 'var(--green)' }}>{row.correct}</div>
              <div className={`${styles.r} num`} style={{ color: 'var(--red)' }}>{row.wrong}</div>
              <div>
                <span className={`badge dot ${status}`}>{STATUS_LABEL[status] ?? status}</span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
      {!list.length && <div className={styles.empty}>No scores yet — the arena awaits.</div>}
    </div>
  );
}
