import { AppError } from '../utils/errors.js';
import { runExclusive } from './lock.js';
import { broadcastState } from './broadcast.js';
import * as T from './tournamentEngine.js';
import * as B from './battleEngine.js';
import * as P from './playoffEngine.js';

/**
 * Every live-event action the host can perform. All of them go through
 * executeCommand → role check → serial queue → persisted → broadcast.
 */
export const COMMANDS = {
  'tournament.start': T.startTournament,
  'tournament.reset': { fn: T.resetCompetition, role: 'admin' },
  'tournament.declareChampion': T.declareChampion,
  'tournament.announceChampion': T.announceChampion,
  'scene.set': T.setScene,
  'scene.versus': T.showVersus,

  'wheel.spin': T.spinWheel,
  'wheel.resetDraw': T.resetDraw,

  'round.manualPair': T.manualPair,
  'round.bye': T.giveBye,
  'round.addTeam': T.addTeamToRound,
  'round.complete': T.completeRound,
  'round.create': T.createNextRound,

  'battle.cancel': T.cancelBattle,
  'battle.swapTeam': T.swapTeam,
  'battle.start': B.startBattle,
  'battle.showQuestion': B.showQuestion,
  'battle.startTimer': B.startTimer,
  'battle.pauseTimer': B.pauseTimer,
  'battle.resumeTimer': B.resumeTimer,
  'battle.revealHint': B.revealHint,
  'battle.buzz': B.buzz,
  'battle.mark': B.markResult,
  'battle.skip': B.skipQuestion,
  'battle.revealAnswer': B.revealAnswer,
  'battle.next': B.nextQuestion,
  'battle.tiebreaker': B.addTiebreaker,
  'battle.end': B.endBattle,
  'battle.adjust': B.adjustScore,
  'battle.abort': B.abortBattle,

  'playoff.start': P.startPlayoffs,
  'final.create': P.createVideoFinal,
  'final.updateBrief': P.updateBrief,
  'final.startWork': P.startWork,
  'final.adjustTime': P.adjustTime,
  'final.pauseWork': P.pauseWork,
  'final.endWork': P.endWork,
  'final.showcase': P.setShowcase,
  'final.video': P.videoControl,
  'final.startJudging': P.startJudging,
  'final.score': P.saveScore,
  'final.removeJudge': P.removeJudge,
  'final.reveal': P.revealResults,
  'final.submission': P.setSubmission,
};

export async function executeCommand(type, payload, ctx = {}) {
  const entry = COMMANDS[type];
  if (!entry) throw new AppError(`Unknown command: ${type}`, 400);
  const fn = typeof entry === 'function' ? entry : entry.fn;
  const role = typeof entry === 'function' ? null : entry.role;
  const user = ctx.user;
  if (!user || !['admin', 'host'].includes(user.role)) throw new AppError('Not authorized.', 403, 'FORBIDDEN');
  if (role === 'admin' && user.role !== 'admin') throw new AppError('Only an admin can do that.', 403, 'FORBIDDEN');
  const safePayload = payload && typeof payload === 'object' ? { ...payload } : {};
  if (type === 'battle.buzz') safePayload.source = 'host';

  return runExclusive(async () => {
    const result = await fn(safePayload, ctx);
    await broadcastState();
    return result ?? {};
  });
}

/** Podium buzzer press — no user, validated by the buzzer key at socket handshake. */
export function executeDeviceBuzz(side) {
  return runExclusive(async () => {
    const r = await B.deviceBuzz({ side });
    if (r.accepted) await broadcastState();
    return r;
  });
}
