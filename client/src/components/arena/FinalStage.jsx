import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Crown, Film, Gavel, Clock, Sparkles } from 'lucide-react';
import { useFx } from '../../context/LiveContext.jsx';
import { useWorkTimer, fmtClock, embedUrl } from '../../hooks/useWorkTimer.js';
import { burst } from '../../lib/fx.js';
import s from './FinalStage.module.css';

function Finalists({ f, teams, compact }) {
  return (
    <div className={`${s.finalists} ${compact ? s.compact : ''}`}>
      {f.finalists.map((id, i) => (
        <motion.div key={id} className={`${s.finalist} ${i % 2 ? s.sideB : ''}`} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.15 }}>
          <div className={s.fName}>{teams[id]?.teamName}</div>
          {!compact && <div className={s.fMembers}>{teams[id]?.members?.join(' · ')}</div>}
        </motion.div>
      ))}
    </div>
  );
}

function VideoPlayer({ sub }) {
  const ref = useRef(null);
  const wrap = useRef(null);
  const src = sub.url || sub.link;
  const embed = sub.url ? null : embedUrl(sub.link);

  useFx((e) => {
    if (e.type !== 'videoControl') return;
    const v = ref.current;
    if (e.action === 'fullscreen') {
      (wrap.current?.requestFullscreen?.() ?? Promise.resolve()).catch(() => {});
      return;
    }
    if (!v) return;
    if (e.action === 'play') v.play().catch(() => {});
    if (e.action === 'pause') v.pause();
    if (e.action === 'restart') {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
  });

  return (
    <div ref={wrap} className={s.player}>
      {embed ? (
        <iframe src={embed} title="Solution video" allow="autoplay; encrypted-media; fullscreen" allowFullScreen />
      ) : (
        <video ref={ref} src={src} controls playsInline preload="auto" />
      )}
    </div>
  );
}

function Results({ f, teams, champion }) {
  const max = Math.max(1, ...f.totals.map((t) => t.total));
  const [shown, setShown] = useState(0);
  useEffect(() => {
    // reveal from the lowest score up for drama
    setShown(0);
    const timers = f.totals.map((_, i) => setTimeout(() => setShown(i + 1), 900 + i * 1400));
    const done = setTimeout(() => burst({ particleCount: 200, spread: 120 }), 900 + f.totals.length * 1400);
    return () => [...timers, done].forEach(clearTimeout);
  }, [f.totals.length]);
  const order = [...f.totals].reverse(); // lowest first
  return (
    <div className={s.results}>
      <div className={s.kicker}><Gavel size="1em" /> THE JUDGES HAVE SPOKEN</div>
      <div className={s.bars}>
        {order.map((t, i) => {
          const visible = i < shown;
          const win = t.team === champion;
          return (
            <div key={t.team} className={`${s.barRow} ${visible && win ? s.win : ''}`}>
              <div className={s.barName}>
                {visible && win && <Crown size="1em" />} {teams[t.team]?.teamName}
              </div>
              <div className={s.barTrack}>
                <motion.div className={s.barFill} initial={{ width: 0 }} animate={{ width: visible ? `${(t.total / max) * 100}%` : 0 }} transition={{ duration: 1.1, ease: 'easeOut' }} />
              </div>
              <div className={`${s.barScore} num`}>{visible ? t.total : '?'}</div>
              {visible && (
                <div className={s.breakdown}>
                  {f.criteria.map((c) => (
                    <span key={c.key}>
                      {c.name}: <b className="num">{t.byCriterion[c.key]}</b>
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {shown >= f.totals.length && (
        <motion.div className={s.champLine} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 160 }}>
          <Crown size="1.1em" /> {teams[champion]?.teamName} — ULTIMATE CHAMPIONS
        </motion.div>
      )}
      {f.winnerOverrideReason && <div className={s.note}>Tie decided by the host: {f.winnerOverrideReason}</div>}
    </div>
  );
}

/** Audience view of the video-challenge Grand Final. */
export default function FinalStage({ state }) {
  const f = state.final;
  const teams = state.teams;
  const { ms, paused, total } = useWorkTimer(f);
  if (!f) return null;
  const showcaseSub = f.showcaseTeam ? f.submissions.find((x) => x.team === f.showcaseTeam) : null;
  const low = ms != null && ms <= 60000;

  return (
    <div className={s.stage}>
      <AnimatePresence mode="wait">
        {f.status === 'setup' && (
          <motion.div key="setup" className={s.center} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className={s.kicker}><Crown size="1em" /> THE GRAND FINAL</div>
            <h1 className={s.title}>Video Challenge</h1>
            <Finalists f={f} teams={teams} />
            <div className={s.sub}><Sparkles size="1em" /> The problem statement is about to be revealed…</div>
          </motion.div>
        )}

        {f.status === 'working' && (
          <motion.div key="working" className={s.working} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className={s.brief}>
              <div className={s.kicker}><Film size="1em" /> GRAND FINAL CHALLENGE</div>
              <h2 className={s.briefTitle}>{f.title}</h2>
              <div className={s.problem}>{f.problem}</div>
              <div className={s.sub}>Build your solution and record a video explaining it. The best video wins the championship.</div>
            </div>
            <div className={s.clockCol}>
              <div className={`${s.clock} ${low ? s.low : ''} ${paused ? s.paused : ''}`}>
                <Clock size="0.5em" />
                <span className="num">{fmtClock(ms)}</span>
              </div>
              <div className={s.clockLabel}>{paused ? 'PAUSED' : 'TIME REMAINING'}</div>
              <div className={s.progress}>
                <div style={{ width: `${total ? Math.max(0, Math.min(100, (ms / total) * 100)) : 0}%` }} />
              </div>
              <Finalists f={f} teams={teams} compact />
            </div>
          </motion.div>
        )}

        {f.status === 'showcase' && (
          <motion.div key={`show-${f.showcaseTeam}`} className={s.showcase} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {showcaseSub ? (
              <>
                <div className={s.nowShowing}>
                  <Film size="1em" /> NOW SHOWING · <b>{teams[f.showcaseTeam]?.teamName}</b>
                </div>
                <VideoPlayer sub={showcaseSub} />
              </>
            ) : (
              <div className={s.center}>
                <div className={s.kicker}><Film size="1em" /> VIDEO SHOWCASE</div>
                <h1 className={s.title}>Time’s up!</h1>
                <Finalists f={f} teams={teams} />
                <div className={s.sub}>The solution videos will now be played.</div>
              </div>
            )}
          </motion.div>
        )}

        {f.status === 'judging' && (
          <motion.div key="judging" className={s.center} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Gavel className={s.gavel} />
            <h1 className={s.title}>The judges are deliberating…</h1>
            <Finalists f={f} teams={teams} />
            <div className={s.criteria}>
              {f.criteria.map((c) => (
                <span key={c.key}>{c.name}</span>
              ))}
            </div>
          </motion.div>
        )}

        {f.status === 'results' && f.totals && (
          <motion.div key="results" className={s.center} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Results f={f} teams={teams} champion={state.tournament.champion} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
