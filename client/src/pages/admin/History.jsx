import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { History as HistoryIcon, ShieldAlert, Swords, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useLive } from '../../context/LiveContext.jsx';
import { PageHeader, Empty } from '../../components/ui/Bits.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { OUTCOME_LABEL, fmtTime } from '../../lib/format.js';

function BattleDetail({ id, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    api(`/battles/${id}`).then(setD).catch((e) => toast.error(e.message));
  }, [id]);
  const b = d?.battle;
  return (
    <Modal title={b ? `Battle #${b.battleNumber} · ${b.teamA?.teamName} vs ${b.teamB?.teamName}` : 'Battle'} size="wide" onClose={onClose}>
      {!d ? (
        <div className="spinner" />
      ) : (
        <div className="stack" style={{ gap: 16 }}>
          <div className="row wrap" style={{ gap: 20 }}>
            <span>Score <b className="num">{b.scoreA}–{b.scoreB}</b></span>
            <span>Winner <b>{b.winner?.teamName ?? '—'}</b></span>
            <span className="muted small">{b.isFinal ? 'Final' : `Round ${b.roundNumber}`} · {b.status} · created via {b.createdVia}</span>
            {b.winnerOverrideReason && <span className="badge pending">Host decision: {b.winnerOverrideReason}</span>}
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>#</th><th>Question</th><th>Answer</th><th>Outcome</th><th className="right">Pts A–B</th></tr>
              </thead>
              <tbody>
                {b.questions.map((q, i) => {
                  const r = b.questionResults.find((x) => x.index === i);
                  return (
                    <tr key={q._id}>
                      <td>{i + 1}</td>
                      <td style={{ maxWidth: 420 }}>{q.questionText}</td>
                      <td className="small">{q.correctAnswer}</td>
                      <td>{r ? OUTCOME_LABEL[r.outcome] ?? r.outcome : <span className="muted">—</span>}</td>
                      <td className="right num">{r ? `${r.pointsA}–${r.pointsB}` : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div>
            <h4 style={{ fontSize: 14, marginBottom: 8 }}>Scoring history</h4>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Time</th><th>Q</th><th>Type</th><th>Answered by</th><th>Result</th><th>Points to</th><th className="right">Pts</th><th>Note</th></tr>
                </thead>
                <tbody>
                  {d.attempts.map((a) => (
                    <tr key={a._id}>
                      <td className="small muted">{fmtTime(a.createdAt)}</td>
                      <td>{a.questionIndex != null ? a.questionIndex + 1 : '—'}</td>
                      <td><span className={`badge ${a.kind === 'adjustment' ? 'pending' : a.kind === 'steal' ? 'wildcard' : 'active'}`}>{a.kind}</span></td>
                      <td>{a.team?.teamName ?? '—'}</td>
                      <td style={{ color: a.isCorrect ? 'var(--green)' : a.kind === 'adjustment' ? 'var(--orange)' : 'var(--red)' }}>{a.answer}</td>
                      <td>{a.beneficiary?.teamName ?? '—'}</td>
                      <td className="right num">{a.pointsAwarded > 0 ? `+${a.pointsAwarded}` : a.pointsAwarded}</td>
                      <td className="small muted">{a.reason ?? (a.stage === 'hint' ? 'after hint' : '')}</td>
                    </tr>
                  ))}
                  {!d.attempts.length && (
                    <tr><td colSpan={8} className="muted small">No scoring events.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function History() {
  const { lbVersion } = useLive();
  const [tab, setTab] = useState('battles');
  const [battles, setBattles] = useState(null);
  const [events, setEvents] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api('/battles').then((d) => setBattles(d.battles)).catch(() => setBattles([]));
  }, [lbVersion]);
  useEffect(() => {
    api(`/events?limit=300${tab === 'audit' ? '&audit=1' : ''}`).then((d) => setEvents(d.events)).catch(() => setEvents([]));
  }, [tab, lbVersion]);

  return (
    <div>
      <PageHeader title="History & audit" subtitle="Every battle, score and host correction is recorded and can be reconstructed." />
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${tab === 'battles' ? 'on' : ''}`} onClick={() => setTab('battles')}><Swords /> Battles</button>
        <button className={`tab ${tab === 'events' ? 'on' : ''}`} onClick={() => setTab('events')}><HistoryIcon /> All events</button>
        <button className={`tab ${tab === 'audit' ? 'on' : ''}`} onClick={() => setTab('audit')}><ShieldAlert /> Corrections & overrides</button>
      </div>

      {tab === 'battles' && (
        <div className="card" style={{ padding: 0 }}>
          {battles && !battles.length ? (
            <Empty icon={Swords} title="No battles yet" />
          ) : (
            <div className="table-wrap" style={{ border: 0 }}>
              <table className="table">
                <thead>
                  <tr><th>#</th><th>Round</th><th>Team A</th><th className="right">Score</th><th>Team B</th><th>Winner</th><th>Status</th><th>Questions</th><th /></tr>
                </thead>
                <tbody>
                  {battles?.map((b) => (
                    <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(b.id)}>
                      <td className="num">{b.battleNumber}</td>
                      <td>{b.isFinal ? 'Final' : b.roundNumber}</td>
                      <td>{b.teamA}</td>
                      <td className="right num" style={{ fontWeight: 700 }}>{b.scoreA}–{b.scoreB}</td>
                      <td>{b.teamB}</td>
                      <td>{b.winner ?? '—'}</td>
                      <td><span className={`badge ${b.status === 'active' ? 'live dot' : b.status}`}>{b.status}</span></td>
                      <td className="num">{b.questions}</td>
                      <td><ChevronRight size={16} color="var(--muted)" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab !== 'battles' && (
        <div className="card">
          {events && !events.length && <Empty icon={HistoryIcon} title="Nothing recorded yet" />}
          <div className="stack" style={{ gap: 0 }}>
            {events?.map((e) => (
              <div key={e._id} className="row" style={{ padding: '9px 4px', borderBottom: '1px solid var(--line)', alignItems: 'flex-start' }}>
                <span className="tiny muted" style={{ width: 150, flexShrink: 0 }}>{new Date(e.createdAt).toLocaleString()}</span>
                <span className="badge" style={{ flexShrink: 0, '--c': e.audit ? 'var(--orange)' : 'var(--muted)' }}>{e.eventType.replace(/_/g, ' ')}</span>
                <span className="grow small">{e.message}</span>
                {e.actorName && <span className="tiny muted">by {e.actorName}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {open && <BattleDetail id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
