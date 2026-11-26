import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Plus, Upload, Search, Pencil, Trash2, History, Users, Lock, Swords } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useLive } from '../../context/LiveContext.jsx';
import { useConfirm } from '../../context/ConfirmContext.jsx';
import { PageHeader, StatusBadge, Empty, Initials } from '../../components/ui/Bits.jsx';
import Modal from '../../components/ui/Modal.jsx';
import ImportModal from './TeamImport.jsx';
import { SEGMENT_COLORS } from '../../lib/format.js';

const STATUSES = ['', 'active', 'qualified', 'eliminated', 'champion'];

function TeamForm({ team, onClose, onSaved }) {
  const [teamName, setName] = useState(team?.teamName ?? '');
  const [members, setMembers] = useState(() => {
    const m = (team?.members ?? []).map((x) => x.name);
    return [...m, '', '', '', ''].slice(0, 4);
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = { teamName: teamName.trim(), members: members.map((m) => m.trim()).filter(Boolean) };
      if (team) await api(`/teams/${team._id}`, { method: 'PUT', body });
      else await api('/teams', { method: 'POST', body });
      toast.success(team ? 'Team updated' : 'Team registered');
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={team ? `Edit ${team.teamName}` : 'Register a team'}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className={`btn primary ${busy ? 'loading' : ''}`} disabled={!teamName.trim() || busy} onClick={save}>
            {team ? 'Save changes' : 'Register team'}
          </button>
        </>
      }
    >
      <form className="stack" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <label className="field">
          <span>Team name *</span>
          <input className="input" value={teamName} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. Null Pointers" />
        </label>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {members.map((m, i) => (
            <label key={i} className="field">
              <span>Member {i + 1}</span>
              <input className="input" value={m} maxLength={60} onChange={(e) => setMembers((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))} />
            </label>
          ))}
        </div>
        <p className="tiny muted">Up to 4 members. Scores can never be edited here — they come only from the live battle engine.</p>
        {error && <div className="notice danger">{error}</div>}
        <button hidden type="submit" />
      </form>
    </Modal>
  );
}

function HistoryModal({ team, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api(`/teams/${team._id}/history`).then(setData).catch((e) => toast.error(e.message));
  }, [team._id]);
  return (
    <Modal title={`${team.teamName} · history`} size="medium" onClose={onClose}>
      {!data ? (
        <div className="spinner" />
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {[['Total score', data.team.totalScore], ['Points earned', data.stats.pointsEarned], ['Correct', data.stats.correct], ['Wrong', data.stats.wrong]].map(([l, v]) => (
              <div key={l} className="card tight" style={{ textAlign: 'center' }}>
                <div className="num" style={{ fontSize: 24, fontWeight: 700 }}>{v}</div>
                <div className="tiny muted">{l}</div>
              </div>
            ))}
          </div>
          <div>
            <h4 style={{ fontSize: 14, marginBottom: 8 }}>Battles</h4>
            {!data.battles.length && <div className="muted small">No battles yet.</div>}
            <div className="table-wrap">
              {!!data.battles.length && (
                <table className="table">
                  <thead>
                    <tr><th>Round</th><th>Battle</th><th>Opponent</th><th className="right">Score</th><th>Result</th></tr>
                  </thead>
                  <tbody>
                    {data.battles.map((b) => (
                      <tr key={b.id}>
                        <td>{b.isFinal ? 'Final' : b.roundNumber}</td>
                        <td>#{b.battleNumber}</td>
                        <td>{b.opponent}</td>
                        <td className="right num">{b.score}–{b.opponentScore}</td>
                        <td><span className={`badge ${b.result === 'won' ? 'qualified' : b.result === 'lost' ? 'eliminated' : 'pending'}`}>{b.result}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <div>
            <h4 style={{ fontSize: 14, marginBottom: 8 }}>Timeline</h4>
            <div className="stack" style={{ gap: 4 }}>
              {data.events.map((e) => (
                <div key={e._id} className="row small">
                  <span className="tiny muted" style={{ width: 120 }}>{new Date(e.createdAt).toLocaleString()}</span>
                  <span>{e.message}</span>
                </div>
              ))}
              {!data.events.length && <div className="muted small">No events.</div>}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function Teams() {
  const confirm = useConfirm();
  const { state } = useLive();
  const [teams, setTeams] = useState(null);
  const [competitionLive, setLive] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [modal, setModal] = useState(null);

  const load = useCallback(() => {
    api(`/teams?status=${status}&search=${encodeURIComponent(search)}`)
      .then((d) => {
        setTeams(d.teams);
        setLive(d.competitionLive);
      })
      .catch((e) => toast.error(e.message));
  }, [status, search]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load, state?.version]);

  const remove = async (team) => {
    const ok = await confirm({ title: `Delete ${team.teamName}?`, message: 'This cannot be undone. Teams with competition history cannot be deleted.', danger: true, confirmText: 'Delete team' });
    if (!ok) return;
    try {
      await api(`/teams/${team._id}`, { method: 'DELETE' });
      toast.success('Team deleted');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const totalMembers = useMemo(() => (teams ?? []).reduce((s, t) => s + t.members.length, 0), [teams]);

  return (
    <div>
      <PageHeader title="Teams" subtitle={teams ? `${teams.length} teams · ${totalMembers} participants` : 'Loading…'}>
        <button className="btn" onClick={() => setModal({ type: 'import' })}>
          <Upload /> Import PDF / CSV / Excel
        </button>
        <button className="btn primary" onClick={() => setModal({ type: 'form' })}>
          <Plus /> Add team
        </button>
      </PageHeader>

      {competitionLive && (
        <div className="notice info" style={{ marginBottom: 16 }}>
          <Lock /> A competition is running. Team scores are protected and only change through the live battle engine. Teams with history cannot be deleted. New teams can be added to the current round from Host Control.
        </div>
      )}

      <div className="row wrap" style={{ marginBottom: 16 }}>
        <div className="search grow" style={{ maxWidth: 360 }}>
          <Search />
          <input className="input" placeholder="Search teams…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {STATUSES.map((st) => (
            <button key={st || 'all'} className={`chip ${status === st ? 'on' : ''}`} onClick={() => setStatus(st)}>
              {st ? st[0].toUpperCase() + st.slice(1) : 'All'}
            </button>
          ))}
        </div>
      </div>

      {teams && !teams.length && (
        <div className="card">
          <Empty icon={Users} title={search || status ? 'No teams match' : 'No teams yet'} action={!search && !status && <button className="btn primary" onClick={() => setModal({ type: 'form' })}><Plus /> Add the first team</button>}>
            {search || status ? 'Try a different search or filter.' : 'Add teams manually or import them from a file.'}
          </Empty>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))' }}>
        {teams?.map((t, i) => (
          <motion.div key={t._id} className="card tight" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="row">
              <Initials name={t.teamName} color={SEGMENT_COLORS[i % SEGMENT_COLORS.length][0]} size={42} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="truncate" style={{ fontWeight: 700, fontFamily: 'var(--font-display)' }}>{t.teamName}</div>
                <StatusBadge status={t.status} wildcard={t.isWildcard} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="num" style={{ fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{t.totalScore}</div>
                <div className="tiny muted">pts</div>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              {t.members.map((m) => (
                <span key={m.name} className="badge" style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12, '--c': '#D6CEC3' }}>{m.name}</span>
              ))}
              {!t.members.length && <span className="tiny muted">No members listed</span>}
            </div>
            <div className="row between">
              <span className="tiny muted row" style={{ gap: 5 }}>
                <Swords size={13} /> {t.currentRound ? `Round ${t.currentRound}` : 'Not entered'}
                {t.locked && <Lock size={12} />}
              </span>
              <div className="row" style={{ gap: 4 }}>
                <button className="btn ghost icon sm" title="History" onClick={() => setModal({ type: 'history', team: t })}><History /></button>
                <button className="btn ghost icon sm" title="Edit" onClick={() => setModal({ type: 'form', team: t })}><Pencil /></button>
                <button className="btn ghost icon sm" title={t.locked ? 'Has competition history' : 'Delete'} disabled={t.locked} onClick={() => remove(t)}><Trash2 /></button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {modal?.type === 'form' && <TeamForm team={modal.team} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
      {modal?.type === 'history' && <HistoryModal team={modal.team} onClose={() => setModal(null)} />}
      {modal?.type === 'import' && <ImportModal onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
    </div>
  );
}
