import { useEffect, useMemo, useRef } from 'react';
import gsap from 'gsap';
import { SEGMENT_COLORS } from '../../lib/format.js';
import { sound } from '../../lib/sound.js';
import { useLive } from '../../context/LiveContext.jsx';
import styles from './Wheel.module.css';

const hash = (s = '') => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
};
const polar = (c, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [c + r * Math.cos(a), c + r * Math.sin(a)];
};

/**
 * Spinning wheel. The server decides the winner (crypto-random) and sends
 * { spinId, segments, targetIndex, startedAt, duration }. Every screen animates
 * the same deterministic rotation and lands on the same segment.
 */
export default function Wheel({ segments = [], spin = null, size = 520, onLanded, onHubClick, hubLabel = 'SPIN', hubDisabled, winnerId }) {
  const { now } = useLive();
  const rotor = useRef(null);
  const pointer = useRef(null);
  const rot = useRef({ value: 0 });
  const doneSpin = useRef(null);
  const tween = useRef(null);
  const landedCb = useRef(onLanded);
  landedCb.current = onLanded;

  const n = Math.max(1, segments.length);
  const seg = 360 / n;
  const c = 250;
  const r = 236;

  const setRot = (v) => {
    rot.current.value = v;
    if (rotor.current) rotor.current.style.transform = `rotate(${v}deg)`;
  };

  useEffect(() => {
    if (!spin) {
      tween.current?.kill();
      doneSpin.current = null;
      setRot(0);
      return;
    }
    if (doneSpin.current === spin.spinId) return;
    doneSpin.current = spin.spinId;
    const count = spin.segments.length;
    const sAngle = 360 / count;
    const jitter = (hash(spin.spinId) - 0.5) * sAngle * 0.62;
    const targetMod = (((360 - (spin.targetIndex + 0.5) * sAngle + jitter) % 360) + 360) % 360;
    const final = 360 * 8 + targetMod;
    const elapsed = now() - spin.startedAt;

    if (elapsed >= spin.duration - 50) {
      setRot(targetMod);
      landedCb.current?.(spin, { instant: elapsed > spin.duration + 1500 });
      return;
    }
    const p0 = Math.max(0, elapsed / spin.duration);
    const start = final * (1 - (1 - p0) ** 4);
    const remaining = (spin.duration - Math.max(0, elapsed)) / 1000;
    setRot(start);
    sound.play('wheelSpin', { duration: remaining, clicks: Math.floor((final - start) / sAngle) });
    let lastIdx = -1;
    tween.current?.kill();
    tween.current = gsap.to(rot.current, {
      value: final,
      duration: remaining,
      ease: p0 < 0.05 ? 'power4.out' : 'power2.out',
      onUpdate: () => {
        const v = rot.current.value;
        if (rotor.current) rotor.current.style.transform = `rotate(${v}deg)`;
        const idx = Math.floor((((360 - (v % 360)) % 360) / sAngle) % count);
        if (idx !== lastIdx) {
          lastIdx = idx;
          pointer.current?.animate([{ transform: 'translateX(-50%) rotate(-24deg)' }, { transform: 'translateX(-50%) rotate(0deg)' }], { duration: 140, easing: 'ease-out' });
        }
      },
      onComplete: () => {
        setRot(targetMod);
        sound.play('wheelStop');
        setTimeout(() => sound.play('teamSelected'), 250);
        landedCb.current?.(spin, { instant: false });
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spin?.spinId]);

  useEffect(() => () => tween.current?.kill(), []);

  const paths = useMemo(
    () =>
      segments.map((s, i) => {
        const a0 = i * seg - 90;
        const a1 = (i + 1) * seg - 90;
        const [x0, y0] = polar(c, r, a0);
        const [x1, y1] = polar(c, r, a1);
        const large = seg > 180 ? 1 : 0;
        const d = n === 1 ? null : `M${c},${c} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`;
        const mid = a0 + seg / 2;
        const name = s.name.length > 18 ? `${s.name.slice(0, 17)}…` : s.name;
        return { d, mid, name, id: s.teamId, color: i % SEGMENT_COLORS.length };
      }),
    [segments, seg, n]
  );

  const font = n <= 4 ? 26 : n <= 8 ? 21 : n <= 12 ? 17 : n <= 18 ? 13 : 10;
  const lights = Array.from({ length: 28 }, (_, i) => polar(c, 246, (i * 360) / 28));

  return (
    <div className={styles.wrap} style={{ width: size }}>
      <div className={styles.halo} />
      <div ref={pointer} className={styles.pointer} aria-hidden>
        <svg viewBox="0 0 40 52" style={{ width: '100%', height: 'auto', display: 'block' }}>
          <defs>
            <linearGradient id="ptr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#FFFFFF" />
              <stop offset="1" stopColor="#E6B98F" />
            </linearGradient>
          </defs>
          <path d="M20 52 L4 14 A17 17 0 1 1 36 14 Z" fill="url(#ptr)" stroke="#fff" strokeWidth="2" />
          <circle cx="20" cy="16" r="6" fill="#100C0D" />
        </svg>
      </div>
      <svg viewBox="0 0 500 500" className={styles.svg} role="img" aria-label={`Wheel with ${segments.length} teams`}>
        <defs>
          {SEGMENT_COLORS.map(([a, b], i) => (
            <radialGradient key={i} id={`seg${i}`} cx="50%" cy="50%" r="50%">
              <stop offset="25%" stopColor={b} />
              <stop offset="100%" stopColor={a} />
            </radialGradient>
          ))}
          <radialGradient id="hub" cx="50%" cy="40%" r="60%">
            <stop offset="0" stopColor="#1F3530" />
            <stop offset="1" stopColor="#0C1613" />
          </radialGradient>
        </defs>
        <circle cx={c} cy={c} r={249} fill="#0C1613" stroke="rgba(204, 139, 101,.7)" strokeWidth="3" />
        <g ref={rotor} style={{ transformOrigin: '250px 250px', willChange: 'transform' }}>
          {segments.length === 0 && <circle cx={c} cy={c} r={r} fill="#12231E" />}
          {paths.map((p) =>
            p.d ? (
              <path key={p.id} d={p.d} fill={`url(#seg${p.color})`} stroke="rgba(16, 12, 13,.85)" strokeWidth="2" className={winnerId && winnerId === p.id ? styles.winSeg : ''} />
            ) : (
              <circle key={p.id} cx={c} cy={c} r={r} fill={`url(#seg${p.color})`} className={winnerId === p.id ? styles.winSeg : ''} />
            )
          )}
          {paths.map((p) => {
            // keep labels on the left half readable (not upside-down) when the wheel is at rest
            const norm = ((p.mid % 360) + 360) % 360;
            const flip = n > 1 && norm > 90 && norm < 270;
            return (
            <text
              key={`t${p.id}`}
              x={n === 1 ? c : flip ? c - r + 18 : c + r - 18}
              y={n === 1 ? c - 140 : c}
              transform={n === 1 ? undefined : `rotate(${flip ? p.mid + 180 : p.mid} ${c} ${c})`}
              textAnchor={n === 1 ? 'middle' : flip ? 'start' : 'end'}
              dominantBaseline="middle"
              className={styles.label}
              style={{ fontSize: font }}
            >
              {p.name}
            </text>
            );
          })}
        </g>
        {lights.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3.2" className={i % 2 ? styles.lightA : styles.lightB} />
        ))}
        <circle cx={c} cy={c} r="62" fill="url(#hub)" stroke="rgba(255,255,255,.18)" strokeWidth="2" />
        <circle cx={c} cy={c} r="54" fill="none" stroke="rgba(204, 139, 101,.55)" strokeWidth="2" strokeDasharray="4 6" className={styles.hubRing} />
      </svg>
      <button
        type="button"
        className={styles.hub}
        onClick={onHubClick}
        disabled={!onHubClick || hubDisabled}
        tabIndex={onHubClick ? 0 : -1}
      >
        {hubLabel}
      </button>
    </div>
  );
}
