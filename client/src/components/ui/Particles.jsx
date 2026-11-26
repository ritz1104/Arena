import { useEffect, useRef } from 'react';

/** Subtle drifting particle field (canvas). */
export default function Particles({ count = 60, style }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let w = 0;
    let h = 0;
    let raf;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const colors = ['204, 139, 101', '44, 122, 99', '111, 191, 156'];
    const parts = Array.from({ length: count }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: Math.random() * 1.8 + 0.4,
      vx: (Math.random() - 0.5) * 0.00012,
      vy: -Math.random() * 0.00025 - 0.00005,
      c: colors[Math.floor(Math.random() * colors.length)],
      a: Math.random() * 0.5 + 0.15,
      p: Math.random() * Math.PI * 2,
    }));
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const draw = (t) => {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        if (!reduce) {
          p.x += p.vx * 16;
          p.y += p.vy * 16;
          if (p.y < -0.02) p.y = 1.02;
          if (p.x < -0.02) p.x = 1.02;
          if (p.x > 1.02) p.x = -0.02;
        }
        const alpha = p.a * (0.6 + 0.4 * Math.sin(t / 900 + p.p));
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.c},${alpha})`;
        ctx.shadowColor = `rgba(${p.c},0.8)`;
        ctx.shadowBlur = 8;
        ctx.arc(p.x * w, p.y * h, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [count]);
  return <canvas ref={ref} aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }} />;
}
