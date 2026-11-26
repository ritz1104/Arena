import { useState } from 'react';
import { BarChart3, Trophy, Crown, MonitorPlay, Medal } from 'lucide-react';
import { useLive } from '../../context/LiveContext.jsx';
import { useLeaderboard } from '../../hooks/useLeaderboard.js';
import { PageHeader, Empty } from '../../components/ui/Bits.jsx';
import LeaderboardBoard from '../../components/arena/LeaderboardBoard.jsx';

function FinalBoard() {
  const { data } = useLeaderboard('final');
  const { send } = useLive();
  if (!data) return <div className="spinner" />;
  if (!data.ready) return <Empty icon={Crown} title="The final has not started">The final leaderboard appears once only two teams remain.</Empty>;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {data.finalists.map((f) => {
          const isChamp = data.champion?.id === f.team.id;
          const isRunner = data.runnerUp?.id === f.team.id;
          return (
            <div key={f.team.id} className={`card ${isChamp ? 'glow-border' : ''}`} style={isChamp ? { background: 'radial-gradient(120% 120% at 50% 0%, rgba(230, 185, 143,.2), rgba(14, 32, 27,.7) 60%)' } : undefined}>
              <div className="row between">
                <span className={`badge ${isChamp ? 'champion' : isRunner ? 'active' : ''}`}>{isChamp ? 'Champion' : isRunner ? 'Runner-up' : 'Finalist'}</span>
                {isChamp ? <Crown color="var(--orange)" /> : <Medal color="#D6CEC3" />}
              </div>
              <h3 style={{ fontSize: 24, marginTop: 10 }}>{f.team.teamName}</h3>
              <div className="small muted">{f.team.members?.join(' · ')}</div>
              <div className="row" style={{ gap: 26, marginTop: 14 }}>
                <div><div className="num" style={{ fontSize: 30, fontWeight: 700 }}>{f.finalScore ?? '–'}</div><div className="tiny muted upper">Final battle</div></div>
                <div><div className="num" style={{ fontSize: 30, fontWeight: 700 }}>{f.totalScore}</div><div className="tiny muted upper">Total score</div></div>
                <div><div className="num" style={{ fontSize: 30, fontWeight: 700 }}>{f.battlesWon}</div><div className="tiny muted upper">Battles won</div></div>
              </div>
            </div>
          );
        })}
      </div>
      {data.champion && (
        <button className="btn warn lg" style={{ alignSelf: 'flex-start' }} onClick={() => send('tournament.announceChampion').catch(() => {})}>
          <Crown /> Show champion on the live screen
        </button>
      )}
      <div>
        <h3 style={{ fontSize: 15, marginBottom: 10 }}>Top of the overall standings</h3>
        <LeaderboardBoard rows={data.overallTop} type="overall" />
      </div>
    </div>
  );
}

export default function Leaderboards() {
  const [tab, setTab] = useState('round');
  const { send, state } = useLive();
  const [round, setRound] = useState('');
  const { data } = useLeaderboard(tab === 'final' ? 'overall' : tab, tab === 'round' ? round : undefined);
  const rounds = state?.rounds ?? [];

  return (
    <div>
      <PageHeader title="Leaderboards" subtitle="Round points and cumulative points are tracked separately.">
        {tab !== 'final' && (
          <button className="btn" disabled={!state?.tournament} onClick={() => send('scene.set', { scene: tab === 'round' ? 'leaderboard_round' : 'leaderboard_overall' }).catch(() => {})}>
            <MonitorPlay /> Show on live screen
          </button>
        )}
      </PageHeader>
      <div className="row wrap between" style={{ marginBottom: 16 }}>
        <div className="tabs">
          <button className={`tab ${tab === 'round' ? 'on' : ''}`} onClick={() => setTab('round')}><BarChart3 /> Current round</button>
          <button className={`tab ${tab === 'overall' ? 'on' : ''}`} onClick={() => setTab('overall')}><Trophy /> Overall</button>
          <button className={`tab ${tab === 'final' ? 'on' : ''}`} onClick={() => setTab('final')}><Crown /> Final</button>
        </div>
        {tab === 'round' && rounds.length > 1 && (
          <select className="select sm" style={{ width: 180 }} value={round} onChange={(e) => setRound(e.target.value)}>
            <option value="">Current round</option>
            {rounds.map((r) => (
              <option key={r.id} value={r.roundNumber}>{r.isFinal ? 'Final' : `Round ${r.roundNumber}`}</option>
            ))}
          </select>
        )}
      </div>
      <div className="card">
        {tab === 'final' ? (
          <FinalBoard />
        ) : !data ? (
          <div className="spinner" />
        ) : (
          <>
            {tab === 'round' && data.round && (
              <div className="small muted" style={{ marginBottom: 12 }}>
                {data.round.isFinal ? 'Final round' : `Round ${data.round.roundNumber}`} · {data.round.status}
              </div>
            )}
            <LeaderboardBoard rows={data.rows ?? []} type={tab} />
          </>
        )}
      </div>
    </div>
  );
}
