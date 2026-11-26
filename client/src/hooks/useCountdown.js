import { useEffect, useRef, useState } from 'react';
import { useLive } from '../context/LiveContext.jsx';
import { sound } from '../lib/sound.js';

/** Live remaining time of the server-authoritative battle timer. */
export function useCountdown(timer, { ticks = false } = {}) {
  const { now } = useLive();
  const calc = () => {
    if (!timer?.kind) return 0;
    if (timer.running && timer.endsAt) return Math.max(0, timer.endsAt - now());
    return timer.remainingMs ?? 0;
  };
  const [ms, setMs] = useState(calc);
  const lastSec = useRef(null);

  useEffect(() => {
    let raf;
    const loop = () => {
      const v = calc();
      setMs(v);
      if (ticks && timer?.running) {
        const s = Math.ceil(v / 1000);
        if (s !== lastSec.current && s <= 3 && s > 0) sound.play('tick');
        lastSec.current = s;
      }
      if (timer?.running) raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer?.kind, timer?.running, timer?.endsAt, timer?.remainingMs]);

  const duration = timer?.duration || 1;
  return { ms, seconds: Math.ceil(ms / 1000), progress: Math.min(1, ms / duration), running: !!timer?.running, kind: timer?.kind };
}
