import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Users, UserRound, Zap, Skull, GitBranch, Swords, HelpCircle, Star, Crown, Rocket, Gamepad2, MonitorPlay, Upload, ListChecks } from 'lucide-react';
import { useLive } from '../../context/LiveContext.jsx';
import { api } from '../../lib/api.js';
import { StatCard, PageHeader } from '../../components/ui/Bits.jsx';
import ActivityFeed from './control/ActivityFeed.jsx';

export default function Dashboard() {
  const { lbVersion, activity, state } = useLive();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/stats')
      .then((d) => {
        setStats(d);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, [lbVersion, activity.length, state?.tournament?.status, state?.registeredTeams]);

  const t = stats?.tournament;
  const running = t?.status === 'active';
  const cards = stats
    ? [
        [Users, 'Registered teams', stats.totalTeams, 'var(--purple)'],
        [UserRound, 'Participants', stats.totalParticipants, 'var(--blue)'],
        [Zap, 'Active teams', stats.activeTeams, 'var(--green)', 'Active or qualified'],
        [Skull, 'Eliminated teams', stats.eliminatedTeams, 'var(--red)'],
        [GitBranch, 'Current round', stats.currentRound || '—', 'var(--orange)', t ? t.name : 'Not started'],
        [Swords, 'Battles completed', stats.battlesCompleted, 'var(--purple)'],
        [HelpCircle, 'Questions attempted', stats.questionsAttempted, 'var(--blue)', `${stats.questionBank} active in the bank`],
        [Star, 'Points awarded', stats.pointsAwarded, 'var(--green)'],
      ]
    : [];

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Your competition at a glance">
        <a className="btn" href="/arena/live" target="_blank" rel="noreferrer">
          <MonitorPlay /> Live screen
        </a>
      </PageHeader>
      {error && <div className="notice danger" style={{ marginBottom: 16 }}>{error}</div>}

      <motion.div
        className="card glow-border"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 22, flexWrap: 'wrap', padding: 24, background: 'linear-gradient(120deg, rgba(204, 139, 101,.18), rgba(44, 122, 99,.08) 50%, rgba(14, 32, 27,.7))' }}
      >
        <div className="grow" style={{ minWidth: 240 }}>
          <div className="upper tiny muted" style={{ letterSpacing: '.3em' }}>{running ? 'Competition live' : t?.status === 'completed' ? 'Competition complete' : 'Ready when you are'}</div>
          <h2 style={{ fontSize: 26, marginTop: 6 }}>{running ? `${t.name} · Round ${t.currentRound}` : t?.status === 'completed' ? 'We have a champion!' : 'Think fast. Buzz first. Win big.'}</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            {running ? 'Run the wheel, battles and rounds from Host Control.' : 'Register teams, load questions, then open the arena.'}
          </p>
        </div>
        {stats?.leader && (
          <div className="card tight row" style={{ gap: 12, borderColor: 'rgba(230, 185, 143,.4)' }}>
            <Crown color="var(--orange)" />
            <div>
              <div className="tiny muted upper">Current leader</div>
              <b>{stats.leader.team.teamName}</b> <span className="num muted">· {stats.leader.points} pts</span>
            </div>
          </div>
        )}
        <Link to="/admin/control" className="btn primary xl">
          {running || t?.status === 'completed' ? <Gamepad2 /> : <Rocket />} {running || t?.status === 'completed' ? 'HOST CONTROL' : 'START COMPETITION'}
        </Link>
      </motion.div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', marginBottom: 18 }}>
        {cards.map(([icon, label, value, color, sub], i) => (
          <StatCard key={label} icon={icon} label={label} value={value} color={color} sub={sub} delay={i * 0.04} />
        ))}
        {!stats && !error && Array.from({ length: 8 }, (_, i) => <div key={i} className="card tight" style={{ height: 80, opacity: 0.4 }} />)}
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
        <ActivityFeed limit={40} height={460} />
        <div className="card">
          <div className="card-title">
            <h3>
              <ListChecks size={18} /> Get set up
            </h3>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            {[
              ['/admin/teams', Upload, 'Register or import teams', `${stats?.totalTeams ?? 0} registered`],
              ['/admin/questions', HelpCircle, 'Prepare the question bank', `${stats?.questionBank ?? 0} active questions`],
              ['/admin/settings', Zap, 'Tune timers & sounds', '10s buzz · 5s answer by default'],
              ['/admin/control', Gamepad2, 'Run the live show', 'Wheel, battles, rounds'],
            ].map(([to, Icon, label, sub]) => (
              <Link key={to} to={to} className="row card tight" style={{ padding: 12 }}>
                <Icon size={18} color="var(--purple)" />
                <div className="grow">
                  <div style={{ fontWeight: 600 }}>{label}</div>
                  <div className="tiny muted">{sub}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
