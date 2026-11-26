import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LiveProvider, useLive } from '../../context/LiveContext.jsx';
import { Logo } from '../../components/ui/Bits.jsx';
import { sound } from '../../lib/sound.js';
import s from './Buzzer.module.css';

function BuzzerPad({ side }) {
  const { state, connected, connError, socket } = useLive();
  const [team, setTeam] = useState(null);
  const [flash, setFlash] = useState(null);
  const b = state?.battle;
  const live = b?.live;
  const myId = b ? (side === 'A' ? b.teamA : b.teamB) : null;

  useEffect(() => {
    if (!connected) return;
    socket.current?.emit('buzzer:hello', (r) => setTeam(r?.team ?? null));
  }, [connected, b?.id, socket]);

  let mode = 'wait';
  let label = 'WAITING FOR THE HOST';
  if (!b || b.status !== 'active') {
    mode = 'idle';
    label = 'NO BATTLE LIVE';
  } else if (live.phase === 'buzz_open') {
    mode = 'open';
    label = 'BUZZ!';
  } else if ((live.phase === 'answering' || live.phase === 'steal') && live.answeringTeam === myId) {
    mode = 'mine';
    label = live.phase === 'steal' ? 'STEAL — ANSWER NOW!' : 'YOU BUZZED — ANSWER!';
  } else if (live.phase === 'answering' || live.phase === 'steal') {
    mode = 'locked';
    label = 'LOCKED';
  }

  const press = useCallback(() => {
    if (mode !== 'open') return;
    navigator.vibrate?.(80);
    socket.current?.emit('buzzer:press', (r) => {
      setFlash(r?.accepted ? 'win' : 'lose');
      if (r?.accepted) sound.preview({ source: 'builtin', preset: 'buzzer' });
      setTimeout(() => setFlash(null), 900);
    });
  }, [mode, socket]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        press();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  if (connError === 'invalid_buzzer_key') {
    return (
      <div className={s.page}>
        <Logo />
        <div className={s.error}>This buzzer link is invalid or has been reset. Ask the host for the current link.</div>
      </div>
    );
  }

  const name = team?.teamName ?? (myId ? state?.teams?.[myId]?.teamName : null);
  return (
    <div className={`${s.page} ${side === 'B' ? s.right : s.left}`}>
      <div className={s.top}>
        <Logo size="sm" />
        <span className={s.side}>{side === 'A' ? 'LEFT PODIUM · TEAM A' : 'RIGHT PODIUM · TEAM B'}</span>
      </div>
      <div className={s.team}>{name ?? 'Waiting for teams…'}</div>
      <motion.button
        className={`${s.buzz} ${s[mode]} ${flash ? s[flash] : ''}`}
        whileTap={mode === 'open' ? { scale: 0.92 } : undefined}
        onPointerDown={press}
        disabled={mode !== 'open'}
        aria-label="Buzz"
      >
        <span>{label}</span>
      </motion.button>
      <div className={s.foot}>{connected ? 'Connected' : 'Reconnecting…'} · Press the button, Space or Enter</div>
    </div>
  );
}

export default function Buzzer() {
  const { side: raw } = useParams();
  const [params] = useSearchParams();
  const side = raw?.toLowerCase() === 'right' || raw === 'B' ? 'B' : 'A';
  const key = params.get('key') || '';
  return (
    <LiveProvider role="buzzer" buzzer={{ key, side }}>
      <BuzzerPad side={side} />
    </LiveProvider>
  );
}
