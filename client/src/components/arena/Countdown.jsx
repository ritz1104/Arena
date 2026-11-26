import { useCountdown } from '../../hooks/useCountdown.js';

const KIND_LABEL = { buzz: 'BUZZ', answer: 'ANSWER', steal: 'STEAL' };

/** Circular server-synced countdown. Size in em so it scales with its container. */
export default function Countdown({ timer, size = 9, ticks = false, label }) {
  const { seconds, progress, running, kind, ms } = useCountdown(timer, { ticks });
  const r = 44;
  const circ = 2 * Math.PI * r;
  const danger = kind && seconds <= 3;
  const color = !kind ? 'var(--muted)' : danger ? 'var(--red)' : kind === 'buzz' ? 'var(--green)' : kind === 'steal' ? 'var(--orange)' : 'var(--blue)';
  const paused = kind && !running && ms > 0;
  return (
    <div style={{ position: 'relative', width: `${size}em`, height: `${size}em`, flexShrink: 0 }}>
      <svg viewBox="0 0 100 100" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)', overflow: 'visible' }}>
        <circle cx="50" cy="50" r={r} fill="rgba(16, 12, 13,.6)" stroke="rgba(255,255,255,.08)" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - (kind ? progress : 0))}
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: running ? 'none' : 'stroke-dashoffset .3s' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div
            className="num"
            style={{
              fontSize: `${size * 0.36}em`,
              fontWeight: 700,
              lineHeight: 1,
              color: kind ? '#FBF4EC' : 'var(--muted)',
              textShadow: danger ? '0 0 20px var(--red)' : 'none',
              animation: danger && running ? 'pulse .5s infinite' : 'none',
            }}
          >
            {kind ? seconds : '–'}
          </div>
          <div style={{ fontSize: `${size * 0.085}em`, letterSpacing: '.18em', color, fontWeight: 700, marginTop: '.3em' }}>
            {paused ? 'PAUSED' : label ?? KIND_LABEL[kind] ?? 'READY'}
          </div>
        </div>
      </div>
    </div>
  );
}
