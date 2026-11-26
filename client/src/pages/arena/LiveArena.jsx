import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Maximize, Minimize, Volume2, VolumeX, WifiOff, Trophy, Users, Sparkles } from 'lucide-react';
import { useFx, useLive } from '../../context/LiveContext.jsx';
import { Logo } from '../../components/ui/Bits.jsx';
import Particles from '../../components/ui/Particles.jsx';
import Wheel from '../../components/arena/Wheel.jsx';
import BattleStage, { VersusStage } from '../../components/arena/BattleStage.jsx';
import LeaderboardBoard from '../../components/arena/LeaderboardBoard.jsx';
import ChampionStage from '../../components/arena/ChampionStage.jsx';
import FinalStage from '../../components/arena/FinalStage.jsx';
import { useWheelView } from '../../hooks/useWheelView.js';
import { useLeaderboard } from '../../hooks/useLeaderboard.js';
import { sound } from '../../lib/sound.js';
import { burst, shake, sideBurst, toggleFullscreen } from '../../lib/fx.js';
import s from './LiveArena.module.css';

function useSound() {
  return useSyncExternalStore((fn) => sound.subscribe(fn), () => `${sound.muted}|${sound.unlocked}`);
}

/* ------------------------------------------------------------------ */
function Header({ state, connected }) {
  const t = state?.tournament;
  const b = state?.battle;
  const [fs, setFs] = useState(!!document.fullscreenElement);
  useSound();
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const live = b?.status === 'active';
  return (
    <header className={s.header}>
      <Logo size="md" />
      <div className={s.headCenter}>
        {t && (
          <>
            <span>{state.round?.kind === 'final_video' ? 'THE GRAND FINAL' : state.round?.kind === 'semifinal' ? 'SEMIFINAL' : state.round?.isFinal ? 'THE FINAL' : `ROUND ${t.currentRound}`}</span>
            {b && t.scene === 'battle' && <span className={s.sep}>BATTLE #{b.battleNumber}</span>}
          </>
        )}
      </div>
      <div className={s.headRight}>
        {!connected && (
          <span className={s.offline}>
            <WifiOff size="1em" /> RECONNECTING
          </span>
        )}
        {live && <span className={s.live}>LIVE</span>}
        <button className={s.iconBtn} onClick={() => sound.setMuted(!sound.muted)} aria-label="Toggle sound">
          {sound.muted ? <VolumeX /> : <Volume2 />}
        </button>
        <button className={s.iconBtn} onClick={() => toggleFullscreen()} aria-label="Toggle full screen">
          {fs ? <Minimize /> : <Maximize />}
        </button>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
function StandbyScene({ state }) {
  const n = state?.registeredTeams ?? 0;
  return (
    <div className={s.standby}>
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 90 }}>
        <Logo size="xl" tagline />
      </motion.div>
      <div className={s.standbyMeta}>
        <span>
          <Users size="1em" /> {n} teams registered
        </span>
        {state?.tournament && <span>Round {state.tournament.currentRound}</span>}
      </div>
      <div className={s.getReady}>THE ARENA OPENS SOON</div>
    </div>
  );
}

function PickSlot({ label, team, side }) {
  return (
    <div className={`${s.slot} ${team ? s.slotOn : ''} ${side === 'B' ? s.slotB : ''}`}>
      <div className={s.slotLabel}>{label}</div>
      <AnimatePresence mode="wait">
        {team ? (
          <motion.div key={team.id} initial={{ opacity: 0, scale: 0.6, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 200, damping: 14 }}>
            <div className={s.slotName}>{team.teamName}</div>
            <div className={s.slotMembers}>{team.members.join(' · ')}</div>
          </motion.div>
        ) : (
          <motion.div key="empty" className={s.slotEmpty} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            ?
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function WheelScene({ state }) {
  const view = useWheelView(state);
  const size = 'min(68vh, 40vw)';
  const teams = state.teams;
  const revealTeam = view.reveal ? teams[view.reveal.teamId] : null;

  return (
    <div className={s.wheelScene}>
      <PickSlot label="CHALLENGER 1" team={view.pick1 ? teams[view.pick1] : null} side="A" />
      <div className={s.wheelCol}>
        <Wheel segments={view.segments} spin={view.spin} size={size} onLanded={view.onLanded} winnerId={view.landed ? view.reveal?.teamId : null} hubLabel={view.spinning ? '···' : 'SPIN'} />
        <div className={s.poolNote}>
          {view.segments.length ? `${view.poolCount} team${view.poolCount === 1 ? '' : 's'} left in the draw` : 'Every team has been drawn this round'}
        </div>
      </div>
      <PickSlot label="CHALLENGER 2" team={view.pick2 ? teams[view.pick2] : null} side="B" />

      <AnimatePresence>
        {revealTeam && (
          <motion.div key={view.reveal.teamId} className={s.reveal} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}>
            <div className={s.spotlight} />
            <motion.div className={s.revealKicker} initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}>
              <Sparkles size="1em" /> {view.reveal.slot === 1 ? 'FIRST CHALLENGER' : 'THE OPPONENT'}
            </motion.div>
            <motion.div className={s.revealName} initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 12, delay: 0.2 }}>
              {revealTeam.teamName}
            </motion.div>
            <motion.div className={s.revealMembers} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
              {revealTeam.members.join('  ·  ')}
            </motion.div>
            {view.reveal.slot === 2 && view.reveal.battle && (
              <motion.div className={s.revealVs} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.4 }}>
                <span>{teams[view.reveal.battle.teamA]?.teamName}</span>
                <b>VS</b>
                <span>{teams[view.reveal.battle.teamB]?.teamName}</span>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Scrollable box that also auto-scrolls when its content overflows (nobody scrolls a projector):
 * glide to the bottom, pause, return to the top, repeat. Manual wheel/touch scrolling pauses it.
 */
function useAutoScroll(ref, deps) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let raf;
    let dir = 1;
    let holdUntil = performance.now() + 3000;
    let last = performance.now();
    let pos = el.scrollTop;
    const pause = () => {
      holdUntil = performance.now() + 6000;
      pos = el.scrollTop;
    };
    el.addEventListener('wheel', pause, { passive: true });
    el.addEventListener('touchstart', pause, { passive: true });
    el.addEventListener('pointerdown', pause);
    const step = (now) => {
      const dt = now - last;
      last = now;
      const max = el.scrollHeight - el.clientHeight;
      if (max > 4 && now > holdUntil) {
        pos += dir * dt * (dir > 0 ? 0.04 : 0.4); // slow down, quick return
        if (pos >= max) {
          pos = max;
          dir = -1;
          holdUntil = now + 3500;
        } else if (pos <= 0) {
          pos = 0;
          dir = 1;
          holdUntil = now + 4000;
        }
        el.scrollTop = pos;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('wheel', pause);
      el.removeEventListener('touchstart', pause);
      el.removeEventListener('pointerdown', pause);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function LeaderboardScene({ type }) {
  const { data } = useLeaderboard(type === 'leaderboard_round' ? 'round' : 'overall');
  const isRound = type === 'leaderboard_round';
  const bodyRef = useRef(null);
  useAutoScroll(bodyRef, [type, data?.rows?.length]);
  return (
    <div className={s.lbScene}>
      <div className={s.lbHead}>
        <Trophy size="1.4em" />
        <h2>{isRound ? `${data?.round?.isFinal ? 'Final Round' : `Round ${data?.round?.roundNumber ?? ''}`} Leaderboard` : 'Overall Leaderboard'}</h2>
        <span>{isRound ? 'Points scored this round' : 'Cumulative points across all rounds'}</span>
      </div>
      <div className={s.lbBody} ref={bodyRef}>
        <LeaderboardBoard rows={data?.rows ?? []} type={isRound ? 'round' : 'overall'} big />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
const FX_OVERLAY = {
  correct: (fx, t) => ({ text: fx.steal ? 'STOLEN!' : 'CORRECT!', sub: `+1 ${t(fx.teamId)}`, tone: 'good' }),
  wrong: (fx, t) => ({
    text: fx.timeout ? "TIME'S UP!" : 'WRONG!',
    sub: fx.penaltyTo ? `+1 ${t(fx.penaltyTo)}${fx.steal ? ' · steal chance!' : ''}` : fx.stealFailed ? 'No extra points' : '',
    tone: 'bad',
  }),
  timeUp: () => ({ text: "TIME'S UP!", sub: 'Waiting for the host…', tone: 'warn' }),
  noBuzz: () => ({ text: 'NO BUZZ!', sub: 'A hint may be on its way…', tone: 'warn' }),
  skipped: () => ({ text: 'SKIPPED', sub: 'No points awarded', tone: 'warn' }),
  hint: () => ({ text: 'HINT!', sub: 'Buzzers open again', tone: 'warn', short: true }),
  tiebreaker: () => ({ text: 'TIEBREAKER!', sub: 'Sudden death question', tone: 'hot' }),
  roundStart: (fx) => ({ text: fx.label ?? (fx.isFinal ? 'THE FINAL' : `ROUND ${fx.roundNumber}`), sub: fx.label === 'THE GRAND FINAL' ? 'The video challenge' : 'Let the battles begin', tone: 'hot' }),
  finalStart: () => ({ text: 'GO!', sub: 'The clock is running', tone: 'good' }),
  finalTimeUp: () => ({ text: "TIME'S UP!", sub: 'Pens down — videos next', tone: 'warn' }),
  wildcard: (fx) => ({ text: 'WILDCARD!', sub: `${fx.name} is back in the arena`, tone: 'hot' }),
  battleEnd: (fx, t) => ({ text: fx.isFinal ? 'CHAMPIONS!' : `${t(fx.winner)} WIN!`, sub: fx.isFinal ? t(fx.winner) : `${t(fx.loser)} eliminated`, tone: 'good' }),
};

function FxOverlay({ state, stageRef }) {
  const [fx, setFx] = useState(null);
  const teamsRef = useRef(state?.teams);
  teamsRef.current = state?.teams;
  const battleRef = useRef(state?.battle);
  battleRef.current = state?.battle;
  const tName = (id) => teamsRef.current?.[id]?.teamName ?? '';

  useFx((e) => {
    const make = FX_OVERLAY[e.type];
    if (e.type === 'wrong') shake(stageRef.current);
    if (e.type === 'correct') sideBurst(e.side);
    if (e.type === 'battleEnd') burst({ particleCount: 200, spread: 110 });
    if (e.type === 'wildcard') burst({ particleCount: 90 });
    if (!make) return;
    const content = make(e, tName);
    const id = `${e.type}-${e.at}`;
    setFx({ ...content, id });
    setTimeout(() => setFx((cur) => (cur?.id === id ? null : cur)), content.short ? 1300 : 2200);
  });

  return (
    <AnimatePresence>
      {fx && (
        <motion.div key={fx.id} className={`${s.fx} ${s[`fx_${fx.tone}`]}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <motion.div className={s.fxText} initial={{ scale: 2.6, opacity: 0, rotate: -6 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} exit={{ scale: 0.8, opacity: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }}>
            {fx.text}
          </motion.div>
          {fx.sub && (
            <motion.div className={s.fxSub} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}>
              {fx.sub}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BattleIntro({ state }) {
  const [show, setShow] = useState(null);
  useFx((e) => {
    if (e.type !== 'battleStart') return;
    setShow(e.battleId);
    setTimeout(() => setShow(null), 3600);
  });
  if (!show || !state?.battle || state.battle.id !== show) return null;
  return (
    <motion.div className={s.intro} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <VersusStage state={state} />
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
export default function LiveArena() {
  const { state, connected, connError } = useLive();
  const stageRef = useRef(null);
  useSound();
  const scene = state?.tournament?.scene ?? 'standby';
  const hasBattle = !!state?.battle;
  const effective = (scene === 'battle' || scene === 'versus') && !hasBattle ? 'wheel' : scene;

  useEffect(() => {
    document.title = 'LIVE · Buzz or Lose – The Arena';
  }, []);

  let content;
  if (!state) content = <div className={s.loading}>{connError ? 'Connecting to the arena…' : 'Loading the arena…'}</div>;
  else if (!state.tournament || effective === 'standby') content = <StandbyScene state={state} />;
  else if (effective === 'wheel') content = state.round ? <WheelScene state={state} /> : <StandbyScene state={state} />;
  else if (effective === 'versus') content = <VersusStage state={state} />;
  else if (effective === 'battle') content = <BattleStage state={state} />;
  else if (effective === 'leaderboard_round' || effective === 'leaderboard_overall') content = <LeaderboardScene type={effective} />;
  else if (effective === 'final') content = state.final ? <FinalStage state={state} /> : <StandbyScene state={state} />;
  else if (effective === 'champion' || effective === 'leaderboard_final') content = <ChampionStage state={state} />;

  return (
    <div className={s.stage} ref={stageRef}>
      <div className={s.bg} />
      <Particles count={80} />
      <Header state={state} connected={connected} />
      <main className={s.body}>
        <AnimatePresence mode="wait">
          <motion.div key={effective + (effective === 'battle' ? state?.battle?.id : '')} className={s.scene} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.02 }} transition={{ duration: 0.4 }}>
            {content}
          </motion.div>
        </AnimatePresence>
      </main>
      <AnimatePresence>
        <BattleIntro state={state} />
      </AnimatePresence>
      <FxOverlay state={state} stageRef={stageRef} />
      {!sound.unlocked && (
        <button className={s.unlock} onClick={() => sound.unlock()}>
          <Volume2 /> Click anywhere to enable arena sound
        </button>
      )}
    </div>
  );
}
