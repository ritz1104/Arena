import { Tournament, Battle, Team, Question, AnswerAttempt, getSettings } from '../models/index.js';
import { AppError, assert } from '../utils/errors.js';
import { idEq, idStr, shuffle, uuid } from '../utils/random.js';
import { logEvent } from './events.js';
import { emitFx, emitLeaderboardChanged, broadcastState } from './broadcast.js';
import { requireActive, finalizeChampion } from './tournamentEngine.js';
import { scheduleTimer, clearBattleTimer, setExpiryHandler } from './timer.js';

/*
 * LIVE BATTLE STATE MACHINE (stored in battle.live)
 *
 *  ready ──show──▶ question ──start timer──▶ buzz_open(initial)
 *  buzz_open ──buzz──▶ answering ──correct──▶ resolved (+1 answering team)
 *                          └─wrong/timeout──▶ (+1 opposition) steal ──correct──▶ resolved (+1 opposition)
 *                                                                └─wrong/none──▶ resolved (no points)
 *  buzz_open(initial) ──10s, nobody──▶ no_buzz ──reveal hint──▶ buzz_open(hint)
 *  buzz_open(hint)    ──10s, nobody──▶ resolved (skipped, no points)
 *  answering (hint stage) wrong/timeout ──▶ +1 opposition, resolved (steal only if stealAfterHint)
 *  resolved ──next──▶ ready (next question)   resolved(last) ──end──▶ finished
 */

const idleTimer = () => ({ kind: null, duration: 0, endsAt: null, remainingMs: 0, running: false });
const freshLive = (qIndex = 0) => ({
  phase: 'ready',
  qIndex,
  stage: 'initial',
  hintRevealed: false,
  answerRevealed: false,
  answeringTeam: null,
  firstBuzzTeam: null,
  attemptNumber: 0,
  timeUp: false,
  outcome: null,
  timer: idleTimer(),
});

const sideOf = (battle, teamId) => (idEq(battle.teamA, teamId) ? 'A' : idEq(battle.teamB, teamId) ? 'B' : null);
const opponent = (battle, teamId) => (idEq(battle.teamA, teamId) ? battle.teamB : battle.teamA);

const PHASE_LABEL = {
  ready: 'waiting to show the question',
  question: 'question shown, timer not started',
  buzz_open: 'buzzers open',
  no_buzz: 'no buzz yet',
  answering: 'a team is answering',
  steal: 'opposition is answering',
  resolved: 'question resolved',
  finished: 'battle finished',
};

function expectPhase(battle, phases, msg) {
  if (!phases.includes(battle.live.phase)) {
    throw new AppError(msg || `Not allowed right now (${PHASE_LABEL[battle.live.phase] || battle.live.phase}).`, 409, 'PHASE');
  }
}

function setTimer(battle, kind, seconds) {
  const ms = Math.round(seconds * 1000);
  battle.live.timer = { kind, duration: ms, endsAt: new Date(Date.now() + ms), remainingMs: ms, running: true };
  battle.live.timeUp = false;
}
function stopTimer(battle) {
  battle.live.timer = idleTimer();
}

async function names(battle) {
  const teams = await Team.find({ _id: { $in: [battle.teamA, battle.teamB] } }).select('teamName').lean();
  const m = new Map(teams.map((x) => [idStr(x._id), x.teamName]));
  return (id) => m.get(idStr(id)) ?? 'Team';
}

async function loadLive() {
  const { t, round } = await requireActive();
  assert(t.activeBattle, 'No live battle in progress.');
  const battle = await Battle.findById(t.activeBattle);
  assert(battle && battle.status === 'active', 'No live battle in progress.');
  return { t, round, battle };
}

async function save(battle) {
  await battle.save();
  scheduleTimer(battle);
}

async function pickQuestions({ t, round, count, exclude = [] }) {
  const usedIds = await Battle.distinct('questions', { tournament: t._id, status: { $in: ['active', 'completed'] } });
  const filter = {
    isActive: true,
    _id: { $nin: [...usedIds, ...exclude] },
    $or: [{ rounds: { $size: 0 } }, { rounds: round.roundNumber }],
  };
  const pool = await Question.find(filter).select('_id').lean();
  return shuffle(pool.map((q) => q._id)).slice(0, count);
}

async function resolveQuestion(battle, outcome) {
  stopTimer(battle);
  const { qIndex } = battle.live;
  const attempts = await AnswerAttempt.find({ battle: battle._id, questionIndex: qIndex, kind: { $ne: 'adjustment' } }).lean();
  const pts = (side) =>
    attempts.filter((a) => idEq(a.beneficiary, side)).reduce((s, a) => s + a.pointsAwarded, 0);
  battle.live.phase = 'resolved';
  battle.live.outcome = outcome;
  battle.live.timeUp = false;
  battle.questionResults.push({
    question: battle.questions[qIndex],
    index: qIndex,
    outcome,
    pointsA: pts(battle.teamA),
    pointsB: pts(battle.teamB),
  });
}

async function recordAttempt({ t, round, battle, team, beneficiary, kind, answer, points, attemptNumber, actionId, ctx, reason }) {
  try {
    await AnswerAttempt.create({
      tournament: t._id,
      round: round._id,
      battle: battle._id,
      question: kind === 'adjustment' ? null : battle.questions[battle.live.qIndex],
      questionIndex: kind === 'adjustment' ? null : battle.live.qIndex,
      team,
      beneficiary,
      kind,
      answer,
      isCorrect: answer === 'correct',
      pointsAwarded: points,
      attemptNumber,
      stage: kind === 'adjustment' ? null : battle.live.stage,
      reason: reason ?? null,
      actionId: actionId || uuid(),
      actor: ctx?.user?._id ?? null,
    });
  } catch (e) {
    if (e?.code === 11000) throw new AppError('This result has already been recorded.', 409, 'DUPLICATE');
    throw e;
  }
  if (points && beneficiary) {
    if (idEq(beneficiary, battle.teamA)) battle.scoreA += points;
    else battle.scoreB += points;
    await Team.updateOne({ _id: beneficiary }, { $inc: { totalScore: points } });
  }
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

export async function startBattle({ battleId } = {}, ctx) {
  const { t, round } = await requireActive();
  assert(!t.activeBattle, 'Another battle is already live.');
  const battle = await Battle.findById(battleId);
  assert(battle && idEq(battle.round, round._id), 'Battle not found in the current round.');
  assert(battle.status === 'pending', 'This battle has already been played.');
  const settings = await getSettings();
  const count = round.questionsPerBattle || settings.questionsPerBattle;
  const questions = await pickQuestions({ t, round, count });
  assert(questions.length > 0, 'No unused active questions are available for this round. Add or activate more questions.');

  battle.questions = questions;
  battle.questionResults = [];
  battle.config = {
    buzzSeconds: settings.buzzSeconds,
    answerSeconds: settings.answerSeconds,
    stealSeconds: settings.stealSeconds,
    stealAfterHint: settings.stealAfterHint,
  };
  battle.live = freshLive(0);
  battle.status = 'active';
  battle.startedAt = new Date();
  await save(battle);

  t.activeBattle = battle._id;
  t.displayBattle = battle._id;
  t.scene = 'battle';
  await t.save();

  const n = await names(battle);
  await logEvent(t, 'battle_started', `Battle #${battle.battleNumber} started: ${n(battle.teamA)} vs ${n(battle.teamB)}`, { battleId: battle._id }, ctx);
  emitFx({ type: 'battleStart', battleId: idStr(battle._id), isFinal: battle.isFinal });
  return {
    warning: questions.length < count ? `Only ${questions.length} unused question(s) were available for this battle.` : null,
  };
}

export async function showQuestion(_p, ctx) {
  const { t, battle } = await loadLive();
  expectPhase(battle, ['ready'], 'The question is already on screen.');
  battle.live.phase = 'question';
  await save(battle);
  await logEvent(t, 'question_displayed', `Question ${battle.live.qIndex + 1}/${battle.questions.length} displayed (Battle #${battle.battleNumber})`, { battleId: battle._id }, ctx);
  emitFx({ type: 'question', index: battle.live.qIndex });
  return {};
}

export async function startTimer() {
  const { battle } = await loadLive();
  expectPhase(battle, ['question'], 'Show the question before starting the timer.');
  battle.live.phase = 'buzz_open';
  battle.live.stage = 'initial';
  setTimer(battle, 'buzz', battle.config.buzzSeconds);
  await save(battle);
  emitFx({ type: 'buzzOpen', stage: 'initial' });
  return {};
}

export async function pauseTimer() {
  const { battle } = await loadLive();
  const tm = battle.live.timer;
  assert(tm?.running, 'The timer is not running.');
  const remaining = Math.max(0, new Date(tm.endsAt).getTime() - Date.now());
  battle.live.timer = { ...tm.toObject?.() ?? tm, running: false, endsAt: null, remainingMs: remaining };
  await save(battle);
  emitFx({ type: 'timerPause' });
  return {};
}

export async function resumeTimer() {
  const { battle } = await loadLive();
  const tm = battle.live.timer;
  assert(tm && !tm.running && tm.kind && tm.remainingMs > 0 && !battle.live.timeUp, 'There is no paused timer to resume.');
  battle.live.timer = { ...tm.toObject?.() ?? tm, running: true, endsAt: new Date(Date.now() + tm.remainingMs) };
  await save(battle);
  emitFx({ type: 'timerResume' });
  return {};
}

export async function revealHint(_p, ctx) {
  const { t, battle } = await loadLive();
  expectPhase(battle, ['no_buzz'], 'The hint can be revealed only after nobody buzzes in the first countdown.');
  assert(battle.live.stage === 'initial' && !battle.live.hintRevealed, 'Only one hint is allowed per question.');
  battle.live.stage = 'hint';
  battle.live.hintRevealed = true;
  battle.live.phase = 'buzz_open';
  setTimer(battle, 'buzz', battle.config.buzzSeconds);
  await save(battle);
  await logEvent(t, 'hint_revealed', `Hint revealed for question ${battle.live.qIndex + 1} — buzzers open again`, { battleId: battle._id }, ctx);
  emitFx({ type: 'hint' });
  return {};
}

/** First valid buzz wins; every other buzz is rejected because the phase has moved on. */
export async function buzz({ teamId, side, source = 'host' } = {}, ctx) {
  const { t, battle } = await loadLive();
  let team = teamId;
  if (!team && side) team = side === 'A' ? battle.teamA : side === 'B' ? battle.teamB : null;
  const s = sideOf(battle, team);
  assert(s, 'That team is not in this battle.');
  if (battle.live.phase !== 'buzz_open') {
    if (source === 'device') return { accepted: false, reason: 'locked' };
    throw new AppError(
      battle.live.phase === 'question' ? 'Start the timer to open the buzzers.' : 'Buzzers are locked.',
      409,
      'LOCKED'
    );
  }
  battle.live.answeringTeam = team;
  battle.live.firstBuzzTeam = team;
  battle.live.attemptNumber = 1;
  battle.live.phase = 'answering';
  setTimer(battle, 'answer', battle.config.answerSeconds);
  await save(battle);
  const n = await names(battle);
  await logEvent(t, 'buzzer_pressed', `${n(team)} buzzed first${source === 'device' ? ' (buzzer)' : ''}`, { battleId: battle._id, teamId: team, source }, ctx);
  emitFx({ type: 'buzz', teamId: idStr(team), side: s });
  return { accepted: true, side: s };
}

/** Host decision on the current answer. result: 'correct' | 'wrong' | 'timeout' */
export async function markResult({ result, actionId } = {}, ctx) {
  assert(['correct', 'wrong', 'timeout'].includes(result), 'Unknown result.');
  const { t, round, battle } = await loadLive();
  expectPhase(battle, ['answering', 'steal'], 'No team is answering right now.');
  const live = battle.live;
  const isSteal = live.phase === 'steal';
  const team = live.answeringTeam;
  const opp = opponent(battle, team);
  const n = await names(battle);
  const qLabel = `Q${live.qIndex + 1}`;
  const base = { t, round, battle, ctx, actionId, team, attemptNumber: live.attemptNumber || (isSteal ? 2 : 1) };

  if (result === 'correct') {
    await recordAttempt({ ...base, beneficiary: team, kind: isSteal ? 'steal' : 'answer', answer: 'correct', points: 1 });
    await resolveQuestion(battle, isSteal ? 'steal_correct' : 'correct');
    await save(battle);
    await logEvent(t, 'correct_answer', `${qLabel}: ${n(team)} answered correctly${isSteal ? ' on the steal' : ''} (+1)`, { battleId: battle._id, teamId: team }, ctx);
    emitFx({ type: 'correct', teamId: idStr(team), side: sideOf(battle, team), points: 1, steal: isSteal });
  } else if (!isSteal) {
    await recordAttempt({ ...base, beneficiary: opp, kind: 'answer', answer: result, points: 1 });
    const allowSteal = live.stage === 'initial' || battle.config.stealAfterHint;
    if (allowSteal) {
      live.answeringTeam = opp;
      live.attemptNumber = 2;
      live.phase = 'steal';
      setTimer(battle, 'steal', battle.config.stealSeconds);
    } else {
      await resolveQuestion(battle, 'wrong');
    }
    await save(battle);
    await logEvent(
      t,
      'wrong_answer',
      `${qLabel}: ${n(team)} ${result === 'timeout' ? 'did not answer in time' : 'answered wrong'} — ${n(opp)} +1${allowSteal ? ', steal chance' : ''}`,
      { battleId: battle._id, teamId: team, beneficiary: opp },
      ctx
    );
    emitFx({ type: 'wrong', teamId: idStr(team), side: sideOf(battle, team), penaltyTo: idStr(opp), timeout: result === 'timeout', steal: allowSteal });
  } else {
    await recordAttempt({ ...base, beneficiary: null, kind: 'steal', answer: result, points: 0 });
    await resolveQuestion(battle, 'steal_failed');
    await save(battle);
    await logEvent(t, 'wrong_answer', `${qLabel}: ${n(team)} missed the steal — no extra points`, { battleId: battle._id, teamId: team }, ctx);
    emitFx({ type: 'wrong', teamId: idStr(team), side: sideOf(battle, team), steal: false, stealFailed: true, timeout: result === 'timeout' });
  }
  emitLeaderboardChanged();
  return { scoreA: battle.scoreA, scoreB: battle.scoreB };
}

export async function skipQuestion({ reason } = {}, ctx) {
  const { t, battle } = await loadLive();
  expectPhase(battle, ['ready', 'question', 'buzz_open', 'no_buzz', 'answering', 'steal'], 'This question is already resolved.');
  await resolveQuestion(battle, 'skipped');
  await save(battle);
  await logEvent(t, 'question_skipped', `Question ${battle.live.qIndex + 1} skipped by host${reason ? ` — ${reason}` : ''}`, { battleId: battle._id }, ctx);
  emitFx({ type: 'skipped' });
  return {};
}

export async function revealAnswer(_p, ctx) {
  const { t, battle } = await loadLive();
  expectPhase(battle, ['resolved'], 'Confirm the result before revealing the answer.');
  assert(!battle.live.answerRevealed, 'The answer is already revealed.');
  battle.live.answerRevealed = true;
  await save(battle);
  await logEvent(t, 'answer_revealed', `Answer revealed for question ${battle.live.qIndex + 1}`, { battleId: battle._id }, ctx);
  emitFx({ type: 'answerReveal' });
  return {};
}

export async function nextQuestion() {
  const { battle } = await loadLive();
  expectPhase(battle, ['resolved'], 'Resolve the current question first.');
  assert(battle.live.qIndex < battle.questions.length - 1, 'That was the last question. End the battle or add a tiebreaker.');
  battle.live = freshLive(battle.live.qIndex + 1);
  await save(battle);
  emitFx({ type: 'nextQuestion', index: battle.live.qIndex });
  return {};
}

export async function addTiebreaker(_p, ctx) {
  const { t, round, battle } = await loadLive();
  expectPhase(battle, ['resolved'], 'Resolve the current question first.');
  assert(battle.live.qIndex === battle.questions.length - 1, 'Tiebreakers are added after the last question.');
  assert(battle.scoreA === battle.scoreB, 'Scores are not tied.');
  const [q] = await pickQuestions({ t, round, count: 1, exclude: battle.questions });
  assert(q, 'No unused questions are left for a tiebreaker.');
  battle.questions.push(q);
  battle.live = freshLive(battle.questions.length - 1);
  await save(battle);
  await logEvent(t, 'tiebreaker_added', `Tiebreaker question added to Battle #${battle.battleNumber}`, { battleId: battle._id }, ctx);
  emitFx({ type: 'tiebreaker' });
  return {};
}

export async function endBattle({ winnerId, reason, early } = {}, ctx) {
  const { t, round, battle } = await loadLive();
  expectPhase(battle, ['resolved', 'ready'], 'Resolve the current question before ending the battle.');
  const allDone = battle.live.phase === 'resolved' && battle.live.qIndex === battle.questions.length - 1;
  assert(allDone || early, 'Questions remain. Confirm that you want to end the battle early.');

  const natural = battle.scoreA === battle.scoreB ? null : battle.scoreA > battle.scoreB ? battle.teamA : battle.teamB;
  let winner = natural;
  if (winnerId && !idEq(winnerId, natural)) {
    assert(sideOf(battle, winnerId), 'The winner must be one of the two teams.');
    assert(reason?.trim(), 'Give a reason for choosing the winner manually.');
    winner = winnerId;
    battle.winnerOverrideReason = reason.trim();
  }
  assert(winner, 'Scores are tied — add a tiebreaker question or choose the winner manually with a reason.');
  const loser = opponent(battle, winner);

  clearBattleTimer();
  stopTimer(battle);
  battle.winner = winner;
  battle.loser = loser;
  battle.status = 'completed';
  battle.completedAt = new Date();
  battle.live.phase = 'finished';
  await battle.save();

  if (!round.qualifiedTeams.some((x) => idEq(x, winner))) round.qualifiedTeams.push(winner);
  if (!round.eliminatedTeams.some((x) => idEq(x, loser))) round.eliminatedTeams.push(loser);
  if (battle.isFinal) {
    round.status = 'completed';
    round.completedAt = new Date();
  }
  await round.save();
  await Team.updateOne({ _id: winner }, { status: battle.isFinal ? 'champion' : 'qualified' });
  await Team.updateOne({ _id: loser }, { status: 'eliminated' });

  t.activeBattle = null;
  await t.save();

  const n = await names(battle);
  const opts = battle.winnerOverrideReason ? { ...ctx, audit: true } : ctx;
  await logEvent(
    t,
    'battle_completed',
    `Battle #${battle.battleNumber} finished ${battle.scoreA}–${battle.scoreB}: ${n(winner)} win${battle.winnerOverrideReason ? ` (host decision: ${battle.winnerOverrideReason})` : ''}`,
    { battleId: battle._id, winner, loser },
    opts
  );
  await logEvent(t, 'team_advanced', `${n(winner)} ${battle.isFinal ? 'win the championship' : 'advance to the next round'}`, { teamId: winner }, ctx);
  await logEvent(t, 'team_eliminated', `${n(loser)} ${battle.isFinal ? 'finish as runner-up' : 'are eliminated'}`, { teamId: loser }, ctx);

  if (battle.isFinal) await finalizeChampion(t, winner, loser, ctx);
  emitFx({ type: 'battleEnd', winner: idStr(winner), loser: idStr(loser), isFinal: battle.isFinal });
  emitLeaderboardChanged();
  return {};
}

export async function adjustScore({ teamId, delta, reason, actionId } = {}, ctx) {
  const { t, round, battle } = await loadLive();
  const d = Number.parseInt(delta, 10);
  assert(Number.isInteger(d) && d !== 0 && Math.abs(d) <= 5, 'Adjustment must be between -5 and +5.');
  assert(reason?.trim(), 'A reason is required for score adjustments.');
  assert(sideOf(battle, teamId), 'That team is not in this battle.');
  const current = idEq(teamId, battle.teamA) ? battle.scoreA : battle.scoreB;
  assert(current + d >= 0, 'A battle score cannot go below zero.');
  await recordAttempt({ t, round, battle, ctx, actionId, team: null, beneficiary: teamId, kind: 'adjustment', answer: 'adjustment', points: d, attemptNumber: 0, reason: reason.trim() });
  await save(battle);
  const n = await names(battle);
  await logEvent(t, 'score_adjusted', `Score correction: ${n(teamId)} ${d > 0 ? '+' : ''}${d} — ${reason.trim()}`, { battleId: battle._id, teamId, delta: d, reason }, { ...ctx, audit: true });
  emitFx({ type: 'scoreAdjust', teamId: idStr(teamId), delta: d });
  emitLeaderboardChanged();
  return {};
}

/** Correction: put a live battle back to "pending" — only allowed before any point was recorded. */
export async function abortBattle({ reason } = {}, ctx) {
  const { t, battle } = await loadLive();
  const attempts = await AnswerAttempt.countDocuments({ battle: battle._id });
  assert(attempts === 0, 'Points have already been recorded in this battle. Use a score correction instead.');
  clearBattleTimer();
  battle.status = 'pending';
  battle.questions = [];
  battle.questionResults = [];
  battle.live = freshLive(0);
  battle.startedAt = null;
  await battle.save();
  t.activeBattle = null;
  t.scene = 'wheel';
  await t.save();
  await logEvent(t, 'battle_aborted', `Battle #${battle.battleNumber} was stopped and returned to pending${reason ? ` — ${reason}` : ''}`, { battleId: battle._id }, { ...ctx, audit: true });
  return {};
}

/* ------------------------------------------------------------------ */
/* Timer expiry + recovery                                             */
/* ------------------------------------------------------------------ */

export async function onTimerExpired(battleId, kind, endsAtMs) {
  const battle = await Battle.findById(battleId);
  if (!battle || battle.status !== 'active') return;
  const tm = battle.live.timer;
  if (!tm?.running || tm.kind !== kind || new Date(tm.endsAt).getTime() !== endsAtMs) return; // stale timer
  const t = await Tournament.findById(battle.tournament);

  if (kind === 'buzz') {
    if (battle.live.stage === 'initial') {
      stopTimer(battle);
      battle.live.phase = 'no_buzz';
      await save(battle);
      emitFx({ type: 'noBuzz', stage: 'initial' });
    } else {
      await resolveQuestion(battle, 'skipped_no_buzz');
      await save(battle);
      await logEvent(t, 'question_skipped', `Nobody buzzed after the hint — question ${battle.live.qIndex + 1} skipped, no points`, { battleId: battle._id });
      emitFx({ type: 'skipped', reason: 'noBuzz' });
    }
  } else {
    battle.live.timer = { kind, duration: tm.duration, endsAt: null, remainingMs: 0, running: false };
    battle.live.timeUp = true;
    await save(battle);
    emitFx({ type: 'timeUp', teamId: idStr(battle.live.answeringTeam) });
  }
}

setExpiryHandler(async (...args) => {
  await onTimerExpired(...args);
  await broadcastState();
});

/** Called on boot: re-arms (or immediately fires) the timer of a live battle after a restart. */
export async function recoverLiveBattle() {
  const t = await Tournament.findOne({ status: 'active', activeBattle: { $ne: null } });
  if (!t) return null;
  const battle = await Battle.findById(t.activeBattle);
  if (!battle || battle.status !== 'active') return null;
  scheduleTimer(battle);
  return battle;
}

/** Buzz from a podium device (left = Team A, right = Team B). */
export async function deviceBuzz({ side }) {
  const t = await Tournament.findOne({ status: 'active', activeBattle: { $ne: null } });
  if (!t) return { accepted: false, reason: 'no_battle' };
  return buzz({ side, source: 'device' }, { user: null });
}
