import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Rocket, Users, HelpCircle, AlertTriangle } from 'lucide-react';
import { useLive } from '../../../context/LiveContext.jsx';
import { useConfirm } from '../../../context/ConfirmContext.jsx';
import { api } from '../../../lib/api.js';
import { Logo } from '../../../components/ui/Bits.jsx';

export default function StartPanel({ state }) {
  const { send, pending } = useLive();
  const confirm = useConfirm();
  const [name, setName] = useState('Buzz or Lose – The Arena');
  const [qpb, setQpb] = useState(5);
  const [qStats, setQStats] = useState(null);
  const teams = state?.registeredTeams ?? 0;

  useEffect(() => {
    api('/questions/stats').then(setQStats).catch(() => {});
    api('/settings').then((d) => setQpb(d.settings.questionsPerBattle)).catch(() => {});
  }, []);

  const needed = Math.ceil(teams / 2) * qpb;
  const start = async () => {
    const ok = await confirm({
      title: 'Start the competition?',
      message: `${teams} teams will enter Round 1. Team scores reset to zero for this competition. Previous competition records stay in history.`,
      confirmText: 'Start competition',
    });
    if (!ok) return;
    await send('tournament.start', { name, questionsPerBattle: qpb }, { success: 'Competition started — spin the wheel!' }).catch(() => {});
  };

  return (
    <motion.div className="card glow-border" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ padding: 32, maxWidth: 760, margin: '20px auto' }}>
      <div className="stack" style={{ gap: 22, alignItems: 'center', textAlign: 'center' }}>
        <Logo size="lg" />
        <p className="muted">Set up the competition and open the arena. Every registered team enters Round 1.</p>
        <div className="row wrap" style={{ justifyContent: 'center', gap: 28 }}>
          <div className="row">
            <Users color="var(--blue)" /> <b className="num" style={{ fontSize: 22 }}>{teams}</b> <span className="muted">teams</span>
          </div>
          <div className="row">
            <HelpCircle color="var(--green)" /> <b className="num" style={{ fontSize: 22 }}>{qStats?.active ?? '–'}</b> <span className="muted">active questions</span>
          </div>
        </div>
        <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', width: '100%', textAlign: 'left' }}>
          <label className="field">
            <span>Competition name</span>
            <input className="input" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Questions per battle (Round 1)</span>
            <input className="input" type="number" min={1} max={30} value={qpb} onChange={(e) => setQpb(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
          </label>
        </div>
        {teams < 2 && (
          <div className="notice danger" style={{ width: '100%' }}>
            <AlertTriangle /> Register at least two teams first. <Link to="/admin/teams" style={{ textDecoration: 'underline' }}>Go to Teams</Link>
          </div>
        )}
        {qStats && qStats.active < needed && teams >= 2 && (
          <div className="notice" style={{ width: '100%', textAlign: 'left' }}>
            <AlertTriangle /> Round 1 needs about {needed} questions ({Math.ceil(teams / 2)} battles × {qpb}) but only {qStats.active} are active. Questions are never repeated within a competition.
          </div>
        )}
        <button className={`btn primary xl ${pending['tournament.start'] ? 'loading' : ''}`} disabled={teams < 2 || !!pending['tournament.start']} onClick={start}>
          <Rocket /> START COMPETITION
        </button>
      </div>
    </motion.div>
  );
}
