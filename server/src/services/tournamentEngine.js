import { Tournament, Round, Team, Battle, AnswerAttempt, SCENES, getSettings } from '../models/index.js';
import { AppError, assert } from '../utils/errors.js';
import { randomInt, uuid, idEq, idStr } from '../utils/random.js';
import { logEvent } from './events.js';
import { emitFx, emitLeaderboardChanged } from './broadcast.js';
import { computePool, hasId } from './pool.js';
import { clearBattleTimer } from './timer.js';

export const SPIN_DURATION = 6500;

const clampInt = (v, min, max, fallback) => {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

export async function getCurrentTournament() {
  return Tournament.findOne({ status: { $in: ['active', 'completed'] } }).sort({ createdAt: -1 });
}

export async function requireActive() {
  const t = await Tournament.findOne({ status: 'active' }).sort({ createdAt: -1 });
  assert(t, 'No active competition. Start the competition first.');
  const round = await Round.findOne({ tournament: t._id, roundNumber: t.currentRound });
  assert(round, 'Current round not found.');
  return { t, round };
}

async function teamName(id) {
  const t = await Team.findById(id).select('teamName').lean();
  return t?.teamName ?? 'Unknown team';
}

/* ------------------------------------------------------------------ */
/* Tournament lifecycle                                                */
/* ------------------------------------------------------------------ */

export async function startTournament({ name, questionsPerBattle } = {}, ctx) {
  const existing = await Tournament.findOne({ status: 'active' });
  assert(!existing, 'A competition is already running.');
  const teams = await Team.find().sort({ teamName: 1 });
  assert(teams.length >= 2, 'Register at least 2 teams to start the competition.');
  const settings = await getSettings();

  await Tournament.updateMany({ status: 'completed' }, { status: 'archived' });
  await Team.updateMany({}, { status: 'active', totalScore: 0, currentRound: 1, isWildcard: false });

  const qpb = clampInt(questionsPerBattle, 1, 30, settings.questionsPerBattle);
  const t = await Tournament.create({
    name: name?.trim() || undefined,
    createdBy: ctx.user?._id,
    currentRound: 1,
    scene: 'wheel',
    settings: {
      buzzSeconds: settings.buzzSeconds,
      answerSeconds: settings.answerSeconds,
      stealSeconds: settings.stealSeconds,
      questionsPerBattle: qpb,
    },
  });
  await Round.create({
    tournament: t._id,
    roundNumber: 1,
    participatingTeams: teams.map((x) => x._id),
    questionsPerBattle: qpb,
    isFinal: teams.length === 2,
  });
  await logEvent(t, 'competition_started', `Competition "${t.name}" started with ${teams.length} teams`, { teams: teams.length }, ctx);
  await logEvent(t, 'round_started', `Round 1 started — ${teams.length} teams in the arena`, { roundNumber: 1 }, ctx);
  emitFx({ type: 'roundStart', roundNumber: 1 });
  emitLeaderboardChanged();
  return { tournamentId: t._id };
}

export async function resetCompetition({ confirm } = {}, ctx) {
  assert(confirm === 'RESET', 'Type RESET to confirm.');
  const t = await getCurrentTournament();
  assert(t, 'There is no competition to reset.');
  clearBattleTimer();
  await Battle.updateMany({ tournament: t._id, status: { $in: ['active', 'pending'] } }, { status: 'cancelled' });
  t.status = 'archived';
  t.activeBattle = null;
  await t.save();
  await Team.updateMany({}, { status: 'active', totalScore: 0, currentRound: 0, isWildcard: false });
  await logEvent(t, 'competition_reset', 'Competition archived and reset by host', {}, { ...ctx, audit: true });
  emitLeaderboardChanged();
  return {};
}

export async function setScene({ scene } = {}) {
  assert(SCENES.includes(scene), 'Unknown screen.');
  const t = await getCurrentTournament();
  assert(t, 'Start the competition first.');
  if (scene === 'champion') assert(t.champion, 'No champion has been decided yet.');
  t.scene = scene;
  await t.save();
  if (scene.startsWith('leaderboard')) emitFx({ type: 'leaderboardShow', scene });
  return {};
}

export async function showVersus({ battleId } = {}) {
  const { t, round } = await requireActive();
  assert(!t.activeBattle, 'A battle is live — the versus screen is shown automatically.');
  const battle = await Battle.findOne({ _id: battleId, round: round._id, status: { $ne: 'cancelled' } });
  assert(battle, 'Battle not found in this round.');
  t.displayBattle = battle._id;
  t.scene = 'versus';
  await t.save();
  emitFx({ type: 'versus', battleId: idStr(battle._id) });
  return {};
}

/* ------------------------------------------------------------------ */
/* Wheel + battle creation                                             */
/* ------------------------------------------------------------------ */

export async function createBattle({ t, round, teamA, teamB, via }) {
  assert(!idEq(teamA, teamB), 'A team cannot battle itself.');
  t.battleCounter += 1;
  const battle = await Battle.create({
    tournament: t._id,
    round: round._id,
    roundNumber: round.roundNumber,
    battleNumber: t.battleCounter,
    teamA,
    teamB,
    isFinal: !!round.isFinal && round.kind !== 'semifinal',
    createdVia: via,
  });
  round.drawnTeams.push(teamA, teamB);
  round.pendingDraw = round.pendingDraw.filter((id) => !idEq(id, teamA) && !idEq(id, teamB));
  await t.save();
  return battle;
}

export async function spinWheel(_payload, ctx) {
  const { t, round } = await requireActive();
  assert(round.kind !== 'final_video', 'The Grand Final is a video challenge — run it from the Grand Final console.');
  assert(round.status === 'active', 'This round is complete. Create the next round.');
  assert(!t.activeBattle, 'Finish the live battle before spinning the wheel.');
  const pool = computePool(round);
  if (round.pendingDraw.length === 0) {
    assert(pool.length > 0, 'Every team in this round has been drawn.');
    assert(
      pool.length >= 2,
      'Only one team is left in the pool. Give it a bye, add a wildcard team, or pair it manually.'
    );
  } else {
    assert(pool.length >= 1, 'No opponent is available. Add a wildcard team or reset the draw.');
  }

  const teams = await Team.find({ _id: { $in: pool } }).select('teamName').lean();
  const names = new Map(teams.map((x) => [idStr(x._id), x.teamName]));
  const segments = pool.map((id) => ({ teamId: id, name: names.get(idStr(id)) ?? 'Team' }));
  const targetIndex = randomInt(segments.length); // crypto-secure, uniform
  const selected = segments[targetIndex];
  const slot = round.pendingDraw.length + 1;

  const spin = {
    spinId: uuid(),
    segments,
    targetIndex,
    teamId: selected.teamId,
    slot,
    battleId: null,
    startedAt: new Date(),
    duration: SPIN_DURATION,
  };

  let battle = null;
  if (slot === 1) {
    round.pendingDraw = [selected.teamId];
  } else {
    battle = await createBattle({ t, round, teamA: round.pendingDraw[0], teamB: selected.teamId, via: 'wheel' });
    spin.battleId = battle._id;
    t.displayBattle = battle._id;
  }
  round.lastSpin = spin;
  await round.save();
  t.scene = 'wheel';
  await t.save();

  await logEvent(t, 'team_selected', `Wheel selected ${selected.name} (pick ${slot} of 2)`, { teamId: selected.teamId, slot }, ctx);
  if (battle) {
    const a = await teamName(battle.teamA);
    await logEvent(t, 'battle_created', `Battle #${battle.battleNumber}: ${a} vs ${selected.name}`, { battleId: battle._id }, ctx);
  }
  emitFx({ type: 'spin', spinId: spin.spinId });
  return { spinId: spin.spinId, teamId: selected.teamId, slot, battleId: battle?._id ?? null };
}

export async function resetDraw({ reason } = {}, ctx) {
  const { t, round } = await requireActive();
  assert(round.pendingDraw.length > 0, 'There is no pending selection to reset.');
  const name = await teamName(round.pendingDraw[0]);
  round.pendingDraw = [];
  round.lastSpin = null;
  await round.save();
  await logEvent(t, 'draw_reset', `Pending selection of ${name} was reset${reason ? ` — ${reason}` : ''}`, { reason }, { ...ctx, audit: true });
  return {};
}

export async function manualPair({ teamA, teamB, reason } = {}, ctx) {
  const { t, round } = await requireActive();
  assert(round.status === 'active', 'This round is complete.');
  assert(teamA && teamB && !idEq(teamA, teamB), 'Choose two different teams.');
  const available = [...computePool(round), ...round.pendingDraw];
  assert(hasId(available, teamA) && hasId(available, teamB), 'Both teams must still be undrawn in this round.');
  const battle = await createBattle({ t, round, teamA, teamB, via: 'manual' });
  round.lastSpin = null;
  await round.save();
  t.displayBattle = battle._id;
  await t.save();
  const [a, b] = await Promise.all([teamName(teamA), teamName(teamB)]);
  await logEvent(
    t,
    'battle_created',
    `Battle #${battle.battleNumber} paired manually: ${a} vs ${b}${reason ? ` — ${reason}` : ''}`,
    { battleId: battle._id, reason },
    { ...ctx, audit: true }
  );
  return { battleId: battle._id };
}

export async function cancelBattle({ battleId, reason } = {}, ctx) {
  const { t, round } = await requireActive();
  const battle = await Battle.findOne({ _id: battleId, round: round._id });
  assert(battle, 'Battle not found in this round.');
  assert(battle.status === 'pending', 'Only battles that have not started can be cancelled.');
  battle.status = 'cancelled';
  await battle.save();
  round.drawnTeams = round.drawnTeams.filter((id) => !idEq(id, battle.teamA) && !idEq(id, battle.teamB));
  if (round.lastSpin && idEq(round.lastSpin.battleId, battle._id)) round.lastSpin = null;
  await round.save();
  if (idEq(t.displayBattle, battle._id)) {
    t.displayBattle = null;
    if (t.scene === 'versus') t.scene = 'wheel';
    await t.save();
  }
  await logEvent(t, 'battle_cancelled', `Battle #${battle.battleNumber} cancelled — both teams returned to the wheel${reason ? ` (${reason})` : ''}`, { battleId, reason }, { ...ctx, audit: true });
  return {};
}

export async function swapTeam({ battleId, side, teamId, reason } = {}, ctx) {
  const { t, round } = await requireActive();
  assert(['A', 'B'].includes(side), 'Choose which side to replace.');
  const battle = await Battle.findOne({ _id: battleId, round: round._id });
  assert(battle && battle.status === 'pending', 'Only battles that have not started can be changed.');
  assert(hasId(computePool(round), teamId), 'The replacement team must still be undrawn in this round.');
  const key = side === 'A' ? 'teamA' : 'teamB';
  const oldId = battle[key];
  battle[key] = teamId;
  await battle.save();
  round.drawnTeams = round.drawnTeams.filter((id) => !idEq(id, oldId));
  round.drawnTeams.push(teamId);
  await round.save();
  const [o, n] = await Promise.all([teamName(oldId), teamName(teamId)]);
  await logEvent(t, 'battle_corrected', `Battle #${battle.battleNumber}: ${o} replaced by ${n}${reason ? ` — ${reason}` : ''}`, { battleId, oldId, teamId, reason }, { ...ctx, audit: true });
  return {};
}

/* ------------------------------------------------------------------ */
/* Round management                                                    */
/* ------------------------------------------------------------------ */

export async function giveBye({ teamId, reason } = {}, ctx) {
  const { t, round } = await requireActive();
  assert(round.status === 'active', 'This round is complete.');
  const available = [...computePool(round), ...round.pendingDraw];
  assert(hasId(available, teamId), 'Only an undrawn team in this round can receive a bye.');
  round.pendingDraw = round.pendingDraw.filter((id) => !idEq(id, teamId));
  round.byeTeams.push(teamId);
  round.qualifiedTeams.push(teamId);
  await round.save();
  await Team.updateOne({ _id: teamId }, { status: 'qualified' });
  const name = await teamName(teamId);
  await logEvent(t, 'bye_given', `${name} received a bye and advances${reason ? ` — ${reason}` : ''}`, { teamId, reason }, { ...ctx, audit: true });
  emitFx({ type: 'advance', teamId: idStr(teamId), reason: 'bye' });
  return {};
}

export async function addTeamToRound({ teamId, reason } = {}, ctx) {
  const { t, round } = await requireActive();
  assert(round.status === 'active', 'This round is complete.');
  const team = await Team.findById(teamId);
  assert(team, 'Team not found.');
  assert(!hasId(round.participatingTeams, teamId), 'That team is already in this round.');
  assert(team.status !== 'champion', 'The champion cannot be re-entered.');
  const wasEliminated = team.status === 'eliminated';
  round.participatingTeams.push(team._id);
  if (wasEliminated) round.wildcardTeams.push(team._id);
  assert(round.kind === 'standard', 'Teams cannot be added to a playoff round.');
  if (round.isFinal) round.isFinal = round.participatingTeams.length === 2;
  await round.save();
  team.status = 'active';
  team.currentRound = round.roundNumber;
  if (wasEliminated) team.isWildcard = true;
  await team.save();
  await logEvent(
    t,
    wasEliminated ? 'wildcard_added' : 'team_added',
    `${team.teamName} ${wasEliminated ? 'returns as a WILDCARD' : 'was added'} to Round ${round.roundNumber}${reason ? ` — ${reason}` : ''}`,
    { teamId, reason },
    { ...ctx, audit: true }
  );
  if (wasEliminated) emitFx({ type: 'wildcard', teamId: idStr(team._id), name: team.teamName });
  return {};
}

export async function completeRound(_p, ctx) {
  const { t, round } = await requireActive();
  assert(round.status === 'active', 'This round is already complete.');
  assert(!round.isFinal || round.participatingTeams.length !== 2, 'The final round completes when the final battle ends.');
  const pool = computePool(round);
  assert(pool.length === 0 && round.pendingDraw.length === 0, `${pool.length + round.pendingDraw.length} team(s) have not been drawn yet. Draw, pair or give them a bye first.`);
  const open = await Battle.countDocuments({ round: round._id, status: { $in: ['pending', 'active'] } });
  assert(open === 0, 'Some battles in this round have not been completed.');
  round.status = 'completed';
  round.completedAt = new Date();
  await round.save();
  t.scene = 'leaderboard_round';
  await t.save();
  await logEvent(t, 'round_completed', `Round ${round.roundNumber} complete — ${round.qualifiedTeams.length} team(s) qualified`, { roundNumber: round.roundNumber }, ctx);
  emitFx({ type: 'roundComplete', roundNumber: round.roundNumber });
  emitLeaderboardChanged();
  return {};
}

export async function createNextRound({ wildcards = [], questionsPerBattle } = {}, ctx) {
  const { t, round: prev } = await requireActive();
  assert(prev.status === 'completed', `Complete Round ${prev.roundNumber} before starting the next round.`);
  assert(prev.kind === 'standard', 'After the semifinal, set up the Grand Final instead.');
  const advancing = prev.qualifiedTeams.map(idStr);
  const wc = [...new Set((wildcards || []).map(String))].filter((id) => !advancing.includes(id));
  if (wc.length) {
    const wcTeams = await Team.find({ _id: { $in: wc } });
    assert(wcTeams.length === wc.length, 'A wildcard team was not found.');
    assert(wcTeams.every((x) => x.status === 'eliminated'), 'Wildcards must be eliminated teams.');
  }
  const participants = [...advancing, ...wc];
  assert(participants.length >= 2, 'Only one team remains — declare the champion instead of creating a round.');

  const settings = await getSettings();
  const n = prev.roundNumber + 1;
  const round = await Round.create({
    tournament: t._id,
    roundNumber: n,
    participatingTeams: participants,
    wildcardTeams: wc,
    questionsPerBattle: clampInt(questionsPerBattle, 1, 30, prev.questionsPerBattle || settings.questionsPerBattle),
    isFinal: participants.length === 2,
  });
  await Team.updateMany({ _id: { $in: participants } }, { status: 'active', currentRound: n });
  if (wc.length) await Team.updateMany({ _id: { $in: wc } }, { isWildcard: true });

  t.currentRound = n;
  t.scene = 'wheel';
  t.displayBattle = null;
  await t.save();

  for (const id of wc) {
    await logEvent(t, 'wildcard_added', `${await teamName(id)} enters Round ${n} as a WILDCARD`, { teamId: id }, { ...ctx, audit: true });
  }
  await logEvent(
    t,
    'round_started',
    `${round.isFinal ? 'THE FINAL' : `Round ${n}`} started — ${participants.length} teams`,
    { roundNumber: n, isFinal: round.isFinal },
    ctx
  );
  emitFx({ type: 'roundStart', roundNumber: n, isFinal: round.isFinal });
  emitLeaderboardChanged();
  return { roundId: round._id };
}

export async function declareChampion({ teamId } = {}, ctx) {
  const { t, round } = await requireActive();
  assert(round.status === 'completed', 'Complete the current round first.');
  assert(round.qualifiedTeams.length === 1 && idEq(round.qualifiedTeams[0], teamId), 'Only the sole remaining qualified team can be declared champion.');
  const lastBattle = await Battle.findOne({ round: round._id, status: 'completed', winner: teamId }).sort({ completedAt: -1 });
  await finalizeChampion(t, teamId, lastBattle?.loser ?? null, ctx);
  return {};
}

export async function finalizeChampion(t, winnerId, runnerUpId, ctx) {
  t.champion = winnerId;
  t.runnerUp = runnerUpId;
  t.status = 'completed';
  t.completedAt = new Date();
  await t.save();
  await Team.updateOne({ _id: winnerId }, { status: 'champion' });
  await logEvent(t, 'champion_crowned', `${await teamName(winnerId)} are the CHAMPIONS!`, { teamId: winnerId }, ctx);
  emitLeaderboardChanged();
}

export async function announceChampion(_p, ctx) {
  const t = await getCurrentTournament();
  assert(t?.champion, 'No champion has been decided yet.');
  t.scene = 'champion';
  t.championAnnouncedAt = new Date();
  await t.save();
  await logEvent(t, 'champion_announced', `Champion announced: ${await teamName(t.champion)}`, {}, ctx);
  emitFx({ type: 'champion', teamId: idStr(t.champion) });
  return {};
}

/** Wildcard candidates: eliminated teams ranked by points scored in the previous round, then total. */
export async function wildcardCandidates() {
  const t = await getCurrentTournament();
  if (!t) return [];
  const round = await Round.findOne({ tournament: t._id, roundNumber: t.currentRound });
  if (!round) return [];
  const teams = await Team.find({ status: 'eliminated' }).lean();
  const attempts = await AnswerAttempt.aggregate([
    { $match: { round: round._id, beneficiary: { $ne: null } } },
    { $group: { _id: '$beneficiary', pts: { $sum: '$pointsAwarded' } } },
  ]);
  const roundPts = new Map(attempts.map((a) => [idStr(a._id), a.pts]));
  return teams
    .map((tm) => ({
      id: idStr(tm._id),
      teamName: tm.teamName,
      members: tm.members.map((m) => m.name),
      eliminatedThisRound: hasId(round.eliminatedTeams, tm._id),
      roundPoints: roundPts.get(idStr(tm._id)) ?? 0,
      totalScore: tm.totalScore,
    }))
    .sort(
      (a, b) =>
        Number(b.eliminatedThisRound) - Number(a.eliminatedThisRound) ||
        b.roundPoints - a.roundPoints ||
        b.totalScore - a.totalScore ||
        a.teamName.localeCompare(b.teamName)
    )
    .map((c, i) => ({ ...c, suggested: i === 0 && c.eliminatedThisRound }));
}

export { AppError };
