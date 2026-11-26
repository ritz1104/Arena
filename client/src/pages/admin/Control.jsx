import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { GitBranch, CheckCircle2, Crown, Trophy, Keyboard, RotateCcw } from 'lucide-react';
import { useLive } from '../../context/LiveContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useConfirm } from '../../context/ConfirmContext.jsx';
import { api } from '../../lib/api.js';
import SceneBar from './control/SceneBar.jsx';
import StartPanel from './control/StartPanel.jsx';
import DrawPanel from './control/DrawPanel.jsx';
import BattlePanel from './control/BattlePanel.jsx';
import RoundWizard from './control/RoundWizard.jsx';
import { PlayoffSetup, FinalSetup } from './control/PlayoffPanels.jsx';
import FinalConsole from './control/FinalConsole.jsx';
import ActivityFeed from './control/ActivityFeed.jsx';
import s from './Control.module.css';

function RoundStatus({ state }) {
  const { send, pending } = useLive();
  const confirm = useConfirm();
  const r = state.round;
  const name = (id) => state.teams[id]?.teamName;
  const complete = async () => {
    const ok = await confirm({ title: `Complete Round ${r.roundNumber}?`, message: `${r.qualified.length} team(s) qualify, ${r.eliminated.length} eliminated. You can then add wildcards and start the next round.`, confirmText: 'Complete round' });
    if (ok) send('round.complete', {}, { success: `Round ${r.roundNumber} complete` }).catch(() => {});
  };
  const groups = [
    ['Qualified', r.qualified, 'qualified'],
    ['Eliminated', r.eliminated, 'eliminated'],
  ];
  return (
    <div className="card">
      <div className="card-title">
        <h3>
          <GitBranch size={18} /> {r.kind === 'semifinal' ? 'Semifinal' : r.kind === 'final_video' ? 'Grand Final' : `Round ${r.roundNumber}`} {r.isFinal && <span className="badge champion">Final</span>}
        </h3>
        <span className={`badge ${r.status === 'completed' ? 'completed' : 'active'}`}>{r.status}</span>
      </div>
      <div className={s.miniStats}>
        <div>
          <b className="num">{r.participating.length}</b>
          <span>Teams</span>
        </div>
        <div>
          <b className="num">{state.roundBattles.filter((b) => b.status === 'completed').length}</b>
          <span>Battles done</span>
        </div>
        <div>
          <b className="num">{r.pool.length + r.pendingDraw.length}</b>
          <span>Undrawn</span>
        </div>
      </div>
      {groups.map(([label, ids, cls]) => (
        <div key={label} style={{ marginTop: 12 }}>
          <div className="tiny muted upper" style={{ marginBottom: 6 }}>
            {label} ({ids.length})
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {ids.map((id) => (
              <span key={id} className={`badge ${cls}`} style={{ textTransform: 'none', letterSpacing: 0, fontSize: 12 }}>
                {name(id)}
                {r.byes.includes(id) && ' (bye)'}
                {r.wildcards.includes(id) && ' ★'}
              </span>
            ))}
            {!ids.length && <span className="tiny muted">—</span>}
          </div>
        </div>
      ))}
      {r.status === 'active' && !r.isFinal && (
        <button className={`btn ${r.canComplete ? 'success' : ''}`} style={{ width: '100%', marginTop: 16 }} disabled={!r.canComplete || !!pending['round.complete']} onClick={complete}>
          <CheckCircle2 /> Complete round
        </button>
      )}
      {r.status === 'active' && !r.canComplete && !r.isFinal && <div className="tiny muted" style={{ marginTop: 6 }}>Available once every team has played or received a bye.</div>}
    </div>
  );
}

function ChampionPanel({ state }) {
  const { send } = useLive();
  const { user } = useAuth();
  const confirm = useConfirm();
  const t = state.tournament;
  const name = (id) => state.teams[id]?.teamName;
  const reset = async () => {
    const res = await confirm({
      title: 'Archive and start fresh?',
      message: 'The finished competition is archived (all history kept). Team statuses and scores reset so a new competition can start.',
      danger: true,
      confirmText: 'Archive competition',
      input: { label: 'Type RESET to confirm', match: 'RESET', required: true },
    });
    if (res) send('tournament.reset', { confirm: 'RESET' }, { success: 'Competition archived' }).catch(() => {});
  };
  return (
    <div className="card glow-border" style={{ textAlign: 'center', padding: 34 }}>
      <Crown size={54} color="var(--orange)" style={{ filter: 'drop-shadow(0 0 16px var(--orange))' }} />
      <div className="muted upper small" style={{ marginTop: 10, letterSpacing: '.3em' }}>Champions</div>
      <h2 style={{ fontSize: 38, margin: '6px 0' }}>{name(t.champion)}</h2>
      {t.runnerUp && <div className="muted">Runner-up: {name(t.runnerUp)}</div>}
      <div className="row wrap" style={{ justifyContent: 'center', marginTop: 22 }}>
        <button className="btn warn xl" onClick={() => send('tournament.announceChampion').catch(() => {})}>
          <Crown /> {t.championAnnouncedAt ? 'Replay celebration' : 'Announce champion'}
        </button>
        <button className="btn lg" onClick={() => send('scene.set', { scene: 'leaderboard_overall' }).catch(() => {})}>
          <Trophy /> Overall leaderboard
        </button>
        <Link className="btn lg" to="/admin/leaderboards">
          Final leaderboard
        </Link>
        {user?.role === 'admin' && (
          <button className="btn lg outline-danger" onClick={reset}>
            <RotateCcw /> New competition
          </button>
        )}
      </div>
    </div>
  );
}

const SHORTCUTS = [
  ['S', 'Spin wheel'],
  ['Q', 'Show question'],
  ['Space', 'Start / pause timer'],
  ['H', 'Reveal hint'],
  ['A / L', 'Buzz team A / B'],
  ['C', 'Correct'],
  ['X', 'Wrong'],
  ['O', 'No answer'],
  ['R', 'Reveal answer'],
  ['N', 'Next question'],
];

export default function Control() {
  const { state } = useLive();
  const [buzzerKey, setBuzzerKey] = useState(null);
  useEffect(() => {
    api('/settings').then((d) => setBuzzerKey(d.settings.buzzerKey)).catch(() => {});
  }, []);

  if (!state) return <div className="page-loading"><div className="spinner" /></div>;
  const t = state.tournament;
  if (!t) return <StartPanel state={state} />;

  const r = state.round;
  const battleLive = !!t.activeBattle && state.battle?.status === 'active';
  const showBattleResult = !battleLive && state.battle?.status === 'completed' && t.scene === 'battle';

  return (
    <div className="stack" style={{ gap: 16 }}>
      <SceneBar state={state} />
      <div className={s.layout}>
        <div className="stack" style={{ gap: 16, minWidth: 0 }}>
          {t.status === 'completed' && <ChampionPanel state={state} />}
          {t.status === 'active' && r?.status === 'completed' && r.kind === 'standard' && <RoundWizard state={state} />}
          {t.status === 'active' && r?.status === 'completed' && r.kind === 'standard' && <PlayoffSetup state={state} />}
          {t.status === 'active' && r?.status === 'completed' && r.kind === 'semifinal' && <FinalSetup state={state} />}
          {r?.kind === 'final_video' && state.final ? (
            <FinalConsole state={state} />
          ) : battleLive || showBattleResult ? (
            <BattlePanel state={state} buzzerKey={buzzerKey} />
          ) : (
            t.status === 'active' && r?.status === 'active' && <DrawPanel state={state} />
          )}
        </div>
        <div className="stack" style={{ gap: 16, minWidth: 0 }}>
          {r && <RoundStatus state={state} />}
          <ActivityFeed limit={30} height={360} />
          <div className="card tight">
            <div className="row small muted" style={{ marginBottom: 8 }}>
              <Keyboard size={15} /> Keyboard shortcuts
            </div>
            <div className={s.keys}>
              {SHORTCUTS.map(([k, l]) => (
                <div key={k} className="row small">
                  <span className="kbd">{k}</span>
                  <span className="muted">{l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
