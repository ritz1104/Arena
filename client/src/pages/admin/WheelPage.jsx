import { Link } from 'react-router-dom';
import { Disc3, Gamepad2 } from 'lucide-react';
import { useLive } from '../../context/LiveContext.jsx';
import { PageHeader, Empty } from '../../components/ui/Bits.jsx';
import DrawPanel from './control/DrawPanel.jsx';
import SceneBar from './control/SceneBar.jsx';

export default function WheelPage() {
  const { state } = useLive();
  const t = state?.tournament;
  const r = state?.round;
  return (
    <div className="stack" style={{ gap: 16 }}>
      <PageHeader title="Wheel Arena" subtitle="Randomly draw the next battle. Selected teams leave the wheel for the rest of the round.">
        <Link className="btn" to="/admin/control"><Gamepad2 /> Host Control</Link>
      </PageHeader>
      {!t || t.status !== 'active' || !r ? (
        <div className="card"><Empty icon={Disc3} title="No active round" action={<Link className="btn primary" to="/admin/control">Go to Host Control</Link>}>Start the competition to use the wheel.</Empty></div>
      ) : t.activeBattle ? (
        <div className="card"><Empty icon={Gamepad2} title="A battle is live" action={<Link className="btn primary" to="/admin/control">Open the battle console</Link>}>Finish the live battle before drawing the next one.</Empty></div>
      ) : r.status !== 'active' ? (
        <div className="card"><Empty icon={Disc3} title={`Round ${r.roundNumber} is complete`} action={<Link className="btn primary" to="/admin/rounds">Set up the next round</Link>} /></div>
      ) : (
        <>
          <SceneBar state={state} />
          <DrawPanel state={state} wheelSize={480} />
        </>
      )}
    </div>
  );
}
