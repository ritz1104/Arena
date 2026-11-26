import { MonitorPlay, Disc3, Swords, Gamepad2, BarChart3, Trophy, Crown, Moon, Film } from 'lucide-react';
import { useLive } from '../../../context/LiveContext.jsx';

const SCENES = [
  { id: 'standby', label: 'Standby', icon: Moon },
  { id: 'wheel', label: 'Wheel', icon: Disc3 },
  { id: 'versus', label: 'Versus', icon: Swords, needsBattle: true },
  { id: 'battle', label: 'Battle', icon: Gamepad2, needsBattle: true },
  { id: 'leaderboard_round', label: 'Round board', icon: BarChart3 },
  { id: 'leaderboard_overall', label: 'Overall board', icon: Trophy },
  { id: 'final', label: 'Grand Final', icon: Film, needsFinal: true },
  { id: 'champion', label: 'Champion', icon: Crown, needsChampion: true },
];

/** Switch what the projector / audience screen is showing. */
export default function SceneBar({ state }) {
  const { send, pending } = useLive();
  const t = state.tournament;
  const hasBattle = !!state.battle;
  return (
    <div className="card tight row wrap between" style={{ gap: 10 }}>
      <div className="row" style={{ gap: 8 }}>
        <MonitorPlay size={18} color="var(--green)" />
        <span className="small" style={{ fontWeight: 600 }}>Live screen:</span>
      </div>
      <div className="tabs grow" style={{ justifyContent: 'flex-start' }}>
        {SCENES.map(({ id, label, icon: Icon, needsBattle, needsChampion, needsFinal }) => {
          if (needsFinal && !state.final) return null;
          const disabled = (needsBattle && !hasBattle) || (needsChampion && !t.champion) || !!pending['scene.set'];
          const on = t.scene === id;
          return (
            <button
              key={id}
              className={`tab ${on ? 'on' : ''}`}
              disabled={disabled}
              style={disabled ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
              onClick={() => {
                if (on) return;
                if (id === 'champion') send('tournament.announceChampion');
                else if (id === 'versus' && state.battle && !t.activeBattle) send('scene.versus', { battleId: state.battle.id }, { key: 'scene.set' });
                else send('scene.set', { scene: id });
              }}
            >
              <Icon /> {label}
            </button>
          );
        })}
      </div>
      <a className="btn sm" href="/arena/live" target="_blank" rel="noreferrer">
        <MonitorPlay /> Open screen
      </a>
    </div>
  );
}
