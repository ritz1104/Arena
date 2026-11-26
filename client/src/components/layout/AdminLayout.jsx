import { useEffect, useState, useSyncExternalStore } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Gamepad2, Disc3, Users, HelpCircle, GitBranch, Trophy, History, Settings, LogOut, Volume2, VolumeX, MonitorPlay, Menu, X, Wifi, WifiOff,
} from 'lucide-react';
import { Logo } from '../ui/Bits.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useLive } from '../../context/LiveContext.jsx';
import { sound } from '../../lib/sound.js';
import styles from './AdminLayout.module.css';

const NAV = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/control', icon: Gamepad2, label: 'Host Control', hot: true },
  { to: '/admin/wheel', icon: Disc3, label: 'Wheel Arena' },
  { to: '/admin/teams', icon: Users, label: 'Teams' },
  { to: '/admin/questions', icon: HelpCircle, label: 'Questions' },
  { to: '/admin/rounds', icon: GitBranch, label: 'Rounds' },
  { to: '/admin/leaderboards', icon: Trophy, label: 'Leaderboards' },
  { to: '/admin/history', icon: History, label: 'History & Audit' },
  { to: '/admin/settings', icon: Settings, label: 'Settings & Sound' },
];

export function useSoundState() {
  return useSyncExternalStore(
    (fn) => sound.subscribe(fn),
    () => `${sound.muted}|${sound.unlocked}|${sound.config.enabled}`
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { state, connected } = useLive();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useSoundState();
  useEffect(() => setOpen(false), [loc.pathname]);

  const t = state?.tournament;
  const live = !!t?.activeBattle;

  return (
    <div className={styles.shell}>
      <aside className={`${styles.sidebar} ${open ? styles.open : ''}`}>
        <div className={styles.brand}>
          <Logo size="sm" tagline />
          <button className={`btn ghost icon sm ${styles.closeBtn}`} onClick={() => setOpen(false)} aria-label="Close menu">
            <X />
          </button>
        </div>
        <nav className={styles.nav}>
          {NAV.map(({ to, icon: Icon, label, end, hot }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}>
              <Icon size={18} />
              <span>{label}</span>
              {hot && live && <span className="badge live dot" style={{ marginLeft: 'auto', height: 18, fontSize: 9.5 }}>Live</span>}
            </NavLink>
          ))}
        </nav>
        <a className={styles.liveLink} href="/arena/live" target="_blank" rel="noreferrer">
          <MonitorPlay size={18} />
          <div>
            <div style={{ fontWeight: 600 }}>Open Live Screen</div>
            <div className="tiny muted">Projector / audience view</div>
          </div>
        </a>
        <div className={styles.user}>
          <div className="grow">
            <div className="small" style={{ fontWeight: 600 }}>{user?.name}</div>
            <div className="tiny muted upper">{user?.role}</div>
          </div>
          <button className="btn ghost icon sm" onClick={logout} title="Sign out" aria-label="Sign out">
            <LogOut />
          </button>
        </div>
      </aside>
      {open && <div className={styles.scrim} onClick={() => setOpen(false)} />}

      <div className={styles.main}>
        <header className={styles.topbar}>
          <button className={`btn ghost icon ${styles.menuBtn}`} onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </button>
          <div className="row grow" style={{ gap: 10, minWidth: 0 }}>
            {t ? (
              <>
                <span className="truncate" style={{ fontWeight: 600 }}>{t.name}</span>
                <span className={`badge ${t.status === 'completed' ? 'champion' : 'active'}`}>
                  {t.status === 'completed' ? 'Completed' : state.round?.kind === 'semifinal' ? 'Semifinal' : state.round?.kind === 'final_video' ? 'Grand Final' : `Round ${t.currentRound}`}
                </span>
                {live && <span className="badge live dot">Battle live</span>}
              </>
            ) : (
              <span className="muted small">No competition running</span>
            )}
          </div>
          <span className={`${styles.conn} ${connected ? styles.ok : styles.bad}`} title={connected ? 'Realtime connected' : 'Reconnecting…'}>
            {connected ? <Wifi size={15} /> : <WifiOff size={15} />}
            <span className="hide-sm">{connected ? 'Live sync' : 'Reconnecting'}</span>
          </span>
          <button
            className="btn ghost icon"
            onClick={() => {
              sound.unlock();
              sound.setMuted(!sound.muted);
            }}
            title={sound.muted ? 'Unmute' : 'Mute all sounds'}
            aria-label="Toggle sound"
          >
            {sound.muted ? <VolumeX /> : <Volume2 />}
          </button>
        </header>
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
