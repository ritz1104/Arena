import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLive } from '../context/LiveContext.jsx';

export const REVEAL_HOLD = 6000;

/**
 * Derives what the wheel should show from the authoritative state:
 * while a spin is animating (and for a short reveal afterwards) it shows the
 * spin's frozen segment list; otherwise it shows the current undrawn pool.
 * The newly selected team stays hidden from the "pick" slots until the wheel lands.
 */
export function useWheelView(state) {
  const { now } = useLive();
  const [, force] = useState(0);
  const [landedSpin, setLandedSpin] = useState(null);
  const round = state?.round;
  const spin = round?.lastSpin ?? null;
  const teams = state?.teams ?? {};

  useEffect(() => {
    if (!spin) return undefined;
    const t1 = spin.startedAt + spin.duration - now();
    const t2 = spin.startedAt + spin.duration + REVEAL_HOLD - now();
    const timers = [t1, t2].filter((t) => t > 0).map((t) => setTimeout(() => force((x) => x + 1), t + 30));
    return () => timers.forEach(clearTimeout);
  }, [spin?.spinId, spin, now]);

  const t = now();
  const spinning = !!spin && t < spin.startedAt + spin.duration;
  const holding = !!spin && t < spin.startedAt + spin.duration + REVEAL_HOLD;
  const landed = !!spin && (landedSpin === spin.spinId || !spinning);

  const poolSegments = useMemo(
    () => (round?.pool ?? []).map((id) => ({ teamId: id, name: teams[id]?.teamName ?? 'Team' })),
    [round?.pool, teams]
  );

  const battle = spin?.battleId ? state?.roundBattles?.find((b) => b.id === spin.battleId) : null;
  let pick1 = round?.pendingDraw?.[0] ?? null;
  let pick2 = null;
  if (spin?.slot === 1 && spinning && pick1 === spin.teamId && !landed) pick1 = null;
  if (spin?.slot === 2 && holding && battle) {
    pick1 = battle.teamA;
    pick2 = landed ? battle.teamB : null;
  }

  const onLanded = useCallback((s) => setLandedSpin(s.spinId), []);

  return {
    spin: holding ? spin : null,
    segments: holding && spin ? spin.segments : poolSegments,
    spinning: spinning && !landed,
    landed: holding && landed,
    reveal: holding && landed ? { teamId: spin.teamId, slot: spin.slot, battle } : null,
    pick1,
    pick2,
    poolCount: round?.pool?.length ?? 0,
    onLanded,
  };
}
