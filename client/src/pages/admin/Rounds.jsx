import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GitBranch, Trophy, Gamepad2, Sparkles, Award, Crown } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useLive } from '../../context/LiveContext.jsx';
import { PageHeader, Empty } from '../../components/ui/Bits.jsx';
import RoundWizard from './control/RoundWizard.jsx';

export default function Rounds() {
  const { state, lbVersion } = useLive();
  const [data, setData] = useState(null);

  useEffect(() => {
    api('/rounds').then(setData).catch(() => setData({ rounds: [] }));
  }, [lbVersion, state?.version]);

  const teams = state?.teams ?? {};
  const name = (id) => teams[id]?.teamName ?? '—';
  const t = state?.tournament;

  return (
    <div>
      <PageHeader title="Rounds & bracket" subtitle={data?.tournament ? data.tournament.name : 'No competition yet'}>
        <Link className="btn primary" to="/admin/control"><Gamepad2 /> Host Control</Link>
      </PageHeader>

      {t?.status === 'active' && state.round?.status === 'completed' && (
        <div style={{ marginBottom: 18 }}>
          <RoundWizard state={state} />
        </div>
      )}

      {data && !data.rounds.length && (
        <div className="card">
          <Empty icon={GitBranch} title="No rounds yet" action={<Link className="btn primary" to="/admin/control">Start the competition</Link>}>
            Round 1 is created automatically when you start the competition.
          </Empty>
        </div>
      )}

      <div className="row" style={{ alignItems: 'stretch', gap: 16, overflowX: 'auto', paddingBottom: 10 }}>
        {data?.rounds.map((r) => (
          <div key={r.id} className={`card ${r.status === 'active' ? 'glow-border' : ''}`} style={{ minWidth: 320, flex: '1 0 320px' }}>
            <div className="card-title">
              <h3>
                {r.isFinal ? <Crown size={18} /> : <GitBranch size={18} />} {r.kind === 'final_video' ? 'The Grand Final (video)' : r.kind === 'semifinal' ? 'Semifinal' : r.isFinal ? 'The Final' : `Round ${r.roundNumber}`}
              </h3>
              <span className={`badge ${r.status === 'completed' ? 'completed' : 'active'}`}>{r.status}</span>
            </div>
            <div className="small muted" style={{ marginBottom: 12 }}>
              {r.participating.length} teams{r.kind !== 'final_video' && ` · ${r.questionsPerBattle} questions per battle`}
            </div>
            <div className="stack" style={{ gap: 8 }}>
              {r.battles.map((b) => (
                <div key={b.id} className="card tight" style={{ padding: 10 }}>
                  <div className="tiny muted row between">
                    <span>BATTLE #{b.battleNumber} {b.createdVia === 'manual' && '· manual'}</span>
                    <span className={`badge ${b.status}`}>{b.status}</span>
                  </div>
                  {[['A', b.teamA, b.scoreA], ['B', b.teamB, b.scoreB]].map(([side, id, sc]) => (
                    <div key={side} className="row between" style={{ marginTop: 4, opacity: b.status === 'completed' && b.winner !== id ? 0.55 : 1 }}>
                      <span className="truncate" style={{ fontWeight: b.winner === id ? 700 : 500 }}>
                        {b.winner === id && <Trophy size={13} color="var(--orange)" />} {name(id)}
                      </span>
                      <span className="num" style={{ fontWeight: 700 }}>{sc}</span>
                    </div>
                  ))}
                  {b.winnerOverrideReason && <div className="tiny muted" style={{ marginTop: 4 }}>Host decision: {b.winnerOverrideReason}</div>}
                </div>
              ))}
              {!r.battles.length && <div className="muted small">No battles yet.</div>}
            </div>
            {(r.byes.length > 0 || r.wildcards.length > 0) && <div className="divider" />}
            {r.byes.map((id) => (
              <div key={id} className="row small"><Award size={14} color="var(--green)" /> {name(id)} — bye</div>
            ))}
            {r.wildcards.map((id) => (
              <div key={id} className="row small"><Sparkles size={14} color="var(--purple)" /> {name(id)} — wildcard</div>
            ))}
            <div className="divider" />
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <div className="tiny muted upper">Qualified ({r.qualified.length})</div>
                {r.qualified.map((id) => <div key={id} className="small" style={{ color: 'var(--green)' }}>{name(id)}</div>)}
              </div>
              <div>
                <div className="tiny muted upper">Eliminated ({r.eliminated.length})</div>
                {r.eliminated.map((id) => <div key={id} className="small" style={{ color: 'var(--red)' }}>{name(id)}</div>)}
              </div>
            </div>
          </div>
        ))}
        {data?.tournament?.champion && (
          <div className="card glow-border" style={{ minWidth: 260, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 8 }}>
            <Crown size={44} color="var(--orange)" />
            <div className="tiny upper muted">Champion</div>
            <h3 style={{ fontSize: 22 }}>{name(data.tournament.champion)}</h3>
            {data.tournament.runnerUp && <div className="small muted">Runner-up: {name(data.tournament.runnerUp)}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
