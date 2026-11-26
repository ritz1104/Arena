import { Tournament, Round, Team, Battle, Question } from '../models/index.js';
import { computePool } from './pool.js';
import { idStr } from '../utils/random.js';

const ids = (arr = []) => arr.map(idStr);

function teamSummary(t) {
  return {
    id: idStr(t._id),
    teamName: t.teamName,
    members: (t.members || []).map((m) => m.name),
    totalScore: t.totalScore,
    status: t.status,
    isWildcard: t.isWildcard,
    currentRound: t.currentRound,
  };
}

function battleSummary(b) {
  return {
    id: idStr(b._id),
    battleNumber: b.battleNumber,
    roundNumber: b.roundNumber,
    isFinal: b.isFinal,
    status: b.status,
    teamA: idStr(b.teamA),
    teamB: idStr(b.teamB),
    scoreA: b.scoreA,
    scoreB: b.scoreB,
    winner: idStr(b.winner),
    loser: idStr(b.loser),
    createdVia: b.createdVia,
  };
}

/**
 * Builds the authoritative state in two forms:
 *  - host: everything, including the correct answer/explanation of the current question
 *  - pub:  audience-safe — question text only once shown, hint only once revealed,
 *          answer only once the host reveals it. Nothing secret ever leaves the server.
 */
export async function buildSnapshot() {
  const empty = { tournament: null, round: null, battle: null, roundBattles: [], teams: {}, rounds: [] };
  const t = await Tournament.findOne({ status: { $in: ['active', 'completed'] } }).sort({ createdAt: -1 }).lean();
  const allTeams = await Team.find().sort({ teamName: 1 }).lean();
  const teams = Object.fromEntries(allTeams.map((x) => [idStr(x._id), teamSummary(x)]));
  if (!t) {
    const s = { ...empty, teams, registeredTeams: allTeams.length };
    return { host: s, pub: s };
  }

  const round = await Round.findOne({ tournament: t._id, roundNumber: t.currentRound }).lean();
  const rounds = await Round.find({ tournament: t._id }).sort({ roundNumber: 1 }).select('roundNumber status isFinal kind participatingTeams qualifiedTeams eliminatedTeams').lean();
  const roundBattles = round
    ? await Battle.find({ round: round._id, status: { $ne: 'cancelled' } }).sort({ battleNumber: 1 }).lean()
    : [];

  let battleDoc = null;
  if (t.displayBattle) {
    battleDoc = roundBattles.find((b) => idStr(b._id) === idStr(t.displayBattle)) || (await Battle.findById(t.displayBattle).lean());
    if (battleDoc?.status === 'cancelled') battleDoc = null;
  }

  const tournament = {
    id: idStr(t._id),
    name: t.name,
    status: t.status,
    currentRound: t.currentRound,
    scene: t.scene,
    activeBattle: idStr(t.activeBattle),
    displayBattle: idStr(battleDoc?._id),
    champion: idStr(t.champion),
    runnerUp: idStr(t.runnerUp),
    championAnnouncedAt: t.championAnnouncedAt,
    battleCounter: t.battleCounter,
  };

  let roundState = null;
  if (round) {
    const pool = computePool(round);
    const open = roundBattles.filter((b) => b.status === 'pending' || b.status === 'active').length;
    roundState = {
      id: idStr(round._id),
      roundNumber: round.roundNumber,
      status: round.status,
      isFinal: round.isFinal,
      questionsPerBattle: round.questionsPerBattle,
      participating: ids(round.participatingTeams),
      pool: ids(pool),
      pendingDraw: ids(round.pendingDraw),
      drawn: ids(round.drawnTeams),
      qualified: ids(round.qualifiedTeams),
      eliminated: ids(round.eliminatedTeams),
      wildcards: ids(round.wildcardTeams),
      byes: ids(round.byeTeams),
      lastSpin: round.lastSpin
        ? {
            spinId: round.lastSpin.spinId,
            segments: round.lastSpin.segments.map((s) => ({ teamId: idStr(s.teamId), name: s.name })),
            targetIndex: round.lastSpin.targetIndex,
            teamId: idStr(round.lastSpin.teamId),
            slot: round.lastSpin.slot,
            battleId: idStr(round.lastSpin.battleId),
            startedAt: new Date(round.lastSpin.startedAt).getTime(),
            duration: round.lastSpin.duration,
          }
        : null,
      canComplete:
        round.kind !== 'final_video' &&
        round.status === 'active' && pool.length === 0 && round.pendingDraw.length === 0 && open === 0 && roundBattles.length > 0,
      openBattles: open,
      kind: round.kind ?? 'standard',
      seeds: (round.seeds ?? []).map((s) => ({ team: idStr(s.team), seed: s.seed, points: s.points })),
    };
  }

  // Grand Final (video challenge)
  let finalHost = null;
  let finalPub = null;
  const vf = round?.kind === 'final_video' ? round.videoFinal : null;
  if (vf) {
    const judges = [...new Set((vf.scores ?? []).map((x) => x.judge))];
    const totals = round.participatingTeams
      .map((id) => {
        const mine = (vf.scores ?? []).filter((x) => idStr(x.team) === idStr(id));
        return {
          team: idStr(id),
          total: mine.reduce((acc, x) => acc + (x.total ?? 0), 0),
          judgesScored: mine.length,
          byCriterion: Object.fromEntries(vf.criteria.map((c) => [c.key, mine.reduce((acc, x) => acc + (x.values?.[c.key] ?? 0), 0)])),
        };
      })
      .sort((a, b) => b.total - a.total);
    const base = {
      title: vf.title,
      status: vf.status,
      durationMin: vf.durationMin,
      startedAt: vf.startedAt ? new Date(vf.startedAt).getTime() : null,
      endsAt: vf.endsAt ? new Date(vf.endsAt).getTime() : null,
      pausedRemainingMs: vf.pausedRemainingMs,
      criteria: vf.criteria,
      finalists: ids(round.participatingTeams),
      submissions: (vf.submissions ?? []).map((x) => ({ team: idStr(x.team), url: x.url || '', link: x.link || '', fileName: x.fileName || '', submittedAt: x.submittedAt })),
      showcaseTeam: idStr(vf.showcaseTeam),
      judgeCount: judges.length,
      winnerOverrideReason: vf.winnerOverrideReason,
    };
    finalHost = { ...base, problem: vf.problem, judges, scores: (vf.scores ?? []).map((x) => ({ ...x, team: idStr(x.team) })), totals };
    finalPub = {
      ...base,
      problem: vf.status === 'setup' ? null : vf.problem,
      totals: vf.status === 'results' ? totals : null, // judges' scores stay secret until the reveal
    };
  }

  let battlePub = null;
  let battleHost = null;
  if (battleDoc) {
    const live = battleDoc.live || {};
    const qid = battleDoc.questions?.[live.qIndex];
    const q = qid ? await Question.findById(qid).populate('category', 'name color').lean() : null;
    const liveOut = {
      phase: live.phase,
      qIndex: live.qIndex,
      total: battleDoc.questions?.length ?? 0,
      stage: live.stage,
      hintRevealed: !!live.hintRevealed,
      answerRevealed: !!live.answerRevealed,
      answeringTeam: idStr(live.answeringTeam),
      firstBuzzTeam: idStr(live.firstBuzzTeam),
      timeUp: !!live.timeUp,
      outcome: live.outcome,
      timer: {
        kind: live.timer?.kind ?? null,
        duration: live.timer?.duration ?? 0,
        endsAt: live.timer?.endsAt ? new Date(live.timer.endsAt).getTime() : null,
        remainingMs: live.timer?.remainingMs ?? 0,
        running: !!live.timer?.running,
      },
    };
    const base = {
      ...battleSummary(battleDoc),
      config: battleDoc.config,
      winnerOverrideReason: battleDoc.winnerOverrideReason,
      results: (battleDoc.questionResults || []).map((r) => ({ index: r.index, outcome: r.outcome, pointsA: r.pointsA, pointsB: r.pointsB })),
      live: liveOut,
    };
    const shown = q && battleDoc.status === 'active' ? live.phase !== 'ready' : q && battleDoc.status === 'completed';
    const qMeta = q
      ? { index: live.qIndex, total: liveOut.total, category: q.category ? { name: q.category.name, color: q.category.color } : null, difficulty: q.difficulty, hasHint: !!q.hint }
      : null;
    battlePub = {
      ...base,
      question: q
        ? {
            ...qMeta,
            text: shown ? q.questionText : null,
            hint: live.hintRevealed ? q.hint || 'No hint for this one — think fast!' : null,
            answer: live.answerRevealed ? q.correctAnswer : null,
            explanation: live.answerRevealed ? q.explanation || null : null,
          }
        : null,
    };
    battleHost = {
      ...base,
      question: q
        ? { ...qMeta, id: idStr(q._id), text: q.questionText, hint: q.hint, answer: q.correctAnswer, explanation: q.explanation, shown: !!shown }
        : null,
    };
  }

  const shared = {
    tournament,
    round: roundState,
    rounds: rounds.map((r) => ({
      id: idStr(r._id),
      roundNumber: r.roundNumber,
      status: r.status,
      isFinal: r.isFinal,
      kind: r.kind ?? 'standard',
      participating: r.participatingTeams.length,
      qualified: r.qualifiedTeams.length,
      eliminated: r.eliminatedTeams.length,
    })),
    roundBattles: roundBattles.map(battleSummary),
    teams,
    registeredTeams: allTeams.length,
  };
  return { host: { ...shared, battle: battleHost, final: finalHost }, pub: { ...shared, battle: battlePub, final: finalPub } };
}
