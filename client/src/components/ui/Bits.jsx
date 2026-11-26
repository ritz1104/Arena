import { motion } from 'framer-motion';
import { Inbox } from 'lucide-react';
import AnimatedNumber from './AnimatedNumber.jsx';
import { STATUS_LABEL } from '../../lib/format.js';

export function Logo({ size = 'md', tagline = false }) {
  const s = { sm: 18, md: 22, lg: 44, xl: 76 }[size] ?? 22;
  return (
    <div className="logo" style={{ display: 'inline-flex', flexDirection: 'column', alignItems: size === 'xl' ? 'center' : 'flex-start', lineHeight: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: s * 0.4 }}>
        <svg width={s * 1.5} height={s * 1.5} viewBox="0 0 64 64" aria-hidden>
          <defs>
            <linearGradient id={`lg-${size}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#CC8B65" />
              <stop offset="1" stopColor="#2C7A63" />
            </linearGradient>
          </defs>
          <circle cx="32" cy="32" r="26" fill="none" stroke={`url(#lg-${size})`} strokeWidth="6" />
          <path d="M35 10 22 36h10l-4 18 15-28H33z" fill="#6FBF9C" />
        </svg>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 25, letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
          BUZZ <span className="gradient-text">OR</span> LOSE
        </span>
      </div>
      {tagline && (
        <span className="upper" style={{ fontSize: Math.max(10, s * 0.26), color: 'var(--muted)', marginTop: s * 0.3, letterSpacing: '0.32em' }}>
          {size === 'xl' ? 'THINK FAST. BUZZ FIRST. WIN BIG.' : 'THE ARENA'}
        </span>
      )}
    </div>
  );
}

export function StatusBadge({ status, wildcard }) {
  return (
    <span className="row" style={{ gap: 6, display: 'inline-flex' }}>
      <span className={`badge dot ${status}`}>{STATUS_LABEL[status] ?? status}</span>
      {wildcard && <span className="badge wildcard">Wildcard</span>}
    </span>
  );
}

export function Empty({ icon: Icon = Inbox, title, children, action }) {
  return (
    <div className="empty">
      <Icon />
      {title && <h4>{title}</h4>}
      {children && <div className="small">{children}</div>}
      {action}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, color = 'var(--purple)', sub, delay = 0 }) {
  return (
    <motion.div
      className="card tight"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      style={{ display: 'flex', gap: 14, alignItems: 'center', overflow: 'hidden', position: 'relative' }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 13,
          display: 'grid',
          placeItems: 'center',
          background: `color-mix(in srgb, ${color} 16%, transparent)`,
          color,
          boxShadow: `0 0 24px color-mix(in srgb, ${color} 30%, transparent)`,
          flexShrink: 0,
        }}
      >
        {Icon && <Icon size={22} />}
      </div>
      <div className="grow">
        <div className="small muted truncate">{label}</div>
        <div className="num" style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.15 }}>
          {typeof value === 'number' ? <AnimatedNumber value={value} pop={false} /> : value}
        </div>
        {sub && <div className="tiny muted truncate">{sub}</div>}
      </div>
      <div
        style={{
          position: 'absolute',
          right: -30,
          top: -30,
          width: 100,
          height: 100,
          borderRadius: '50%',
          background: `radial-gradient(circle, color-mix(in srgb, ${color} 22%, transparent), transparent 70%)`,
          pointerEvents: 'none',
        }}
      />
    </motion.div>
  );
}

export function Initials({ name = '', color = 'var(--purple)', size = 36 }) {
  const ini = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.32,
        display: 'inline-grid',
        placeItems: 'center',
        fontWeight: 700,
        fontFamily: 'var(--font-display)',
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, color-mix(in srgb, ${color} 60%, #000), ${color})`,
        flexShrink: 0,
      }}
    >
      {ini || '?'}
    </span>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="row between wrap" style={{ marginBottom: 22, gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 26 }}>{title}</h1>
        {subtitle && <p className="muted" style={{ marginTop: 4 }}>{subtitle}</p>}
      </div>
      <div className="row wrap">{children}</div>
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" />;
}
