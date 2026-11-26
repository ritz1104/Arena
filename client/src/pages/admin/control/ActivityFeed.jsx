import { useEffect, useState } from 'react';
import { Activity, ShieldAlert } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLive } from '../../../context/LiveContext.jsx';
import { api } from '../../../lib/api.js';
import { timeAgo } from '../../../lib/format.js';

const COLOR = {
  correct_answer: 'var(--green)',
  wrong_answer: 'var(--red)',
  buzzer_pressed: 'var(--blue)',
  team_eliminated: 'var(--red)',
  team_advanced: 'var(--green)',
  battle_started: 'var(--purple)',
  battle_completed: 'var(--orange)',
  champion_crowned: 'var(--orange)',
  hint_revealed: 'var(--orange)',
  wildcard_added: 'var(--purple)',
};

export default function ActivityFeed({ limit = 25, title = 'Live activity', height = 420 }) {
  const { activity } = useLive();
  const [initial, setInitial] = useState([]);
  const [, tick] = useState(0);
  useEffect(() => {
    api(`/events?limit=${limit}`).then((d) => setInitial(d.events)).catch(() => {});
    const t = setInterval(() => tick((x) => x + 1), 15000);
    return () => clearInterval(t);
  }, [limit]);

  const seen = new Set();
  const list = [...activity, ...initial].filter((e) => (seen.has(e._id) ? false : seen.add(e._id))).slice(0, limit);

  return (
    <div className="card">
      <div className="card-title">
        <h3>
          <Activity size={18} /> {title}
        </h3>
        <span className="badge live dot">Live</span>
      </div>
      <div className="stack" style={{ gap: 2, maxHeight: height, overflow: 'auto' }}>
        <AnimatePresence initial={false}>
          {list.map((e) => (
            <motion.div key={e._id} layout initial={{ opacity: 0, x: -12, backgroundColor: 'rgba(204, 139, 101,.15)' }} animate={{ opacity: 1, x: 0, backgroundColor: 'rgba(0,0,0,0)' }} transition={{ duration: 0.5 }} className="row" style={{ alignItems: 'flex-start', padding: '7px 6px', borderRadius: 8 }}>
              <span className="team-dot" style={{ background: COLOR[e.eventType] ?? 'var(--muted)', marginTop: 7, boxShadow: `0 0 8px ${COLOR[e.eventType] ?? 'transparent'}` }} />
              <div className="grow small">
                {e.message}
                {e.audit && (
                  <span className="badge pending" style={{ marginLeft: 6, height: 18 }}>
                    <ShieldAlert size={10} /> audit
                  </span>
                )}
              </div>
              <span className="tiny muted" style={{ whiteSpace: 'nowrap' }}>{timeAgo(e.createdAt)}</span>
            </motion.div>
          ))}
        </AnimatePresence>
        {!list.length && <div className="muted small">Nothing has happened yet.</div>}
      </div>
    </div>
  );
}
