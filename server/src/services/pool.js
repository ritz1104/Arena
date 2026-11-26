import { idEq } from '../utils/random.js';

export const hasId = (arr = [], id) => arr.some((x) => idEq(x, id));

/** Teams of the round still waiting to be drawn by the wheel. */
export function computePool(round) {
  if (!round) return [];
  return round.participatingTeams.filter(
    (id) => !hasId(round.drawnTeams, id) && !hasId(round.byeTeams, id) && !hasId(round.pendingDraw, id)
  );
}
