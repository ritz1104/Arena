import { useEffect, useState } from 'react';
import { useLive } from '../context/LiveContext.jsx';

/** Remaining time of the Grand Final work period (server deadline, clock-synced). */
export function useWorkTimer(final) {
  const { now } = useLive();
  const calc = () => {
    if (!final || final.status !== 'working') return null;
    if (final.pausedRemainingMs != null) return final.pausedRemainingMs;
    return Math.max(0, (final.endsAt ?? 0) - now());
  };
  const [ms, setMs] = useState(calc);
  useEffect(() => {
    setMs(calc());
    if (!final || final.status !== 'working' || final.pausedRemainingMs != null) return undefined;
    const t = setInterval(() => setMs(calc()), 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [final?.status, final?.endsAt, final?.pausedRemainingMs]);
  return { ms, paused: final?.pausedRemainingMs != null, total: (final?.durationMin ?? 0) * 60000 };
}

export const fmtClock = (ms) => {
  if (ms == null) return '--:--';
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
};

/** Turns YouTube / Drive share links into embeddable URLs; returns null for direct files. */
export function embedUrl(link) {
  if (!link) return null;
  const yt = link.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/i);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1&rel=0`;
  const drive = link.match(/drive\.google\.com\/file\/d\/([\w-]+)/i);
  if (drive) return `https://drive.google.com/file/d/${drive[1]}/preview`;
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(link)) return null;
  return link;
}
