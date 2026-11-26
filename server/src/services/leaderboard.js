import { Tournament, Round, Team, Battle, AnswerAttempt } from '../models/index.js';
import { idStr } from '../utils/random.js';
import { hasId } from './pool.js';

async function currentTournament() {
  return Tournament.findOne({ status: { $in: ['active', 'completed'] } }).sort({ createdAt: -1 }).lean();
}

function rank(rows) {
  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.battlesWon - a.battlesWon ||
      b.correct - a.correct ||
      a.wrong - b.wrong ||
      a.team.teamName.localeCompare(b.team.teamName)
  );
  let prev = null;
  rows.forEach((r, i) => {
    const key = `${r.points}|${r.battlesWon}|${r.correct}|${r.wrong}`;
    r.rank = prev && prev.key === key ? prev.rank : i + 1;
    prev = { key, rank: r.rank };
  });
  return rows;
}

/** Aggregates scoring purely from the persisted attempt + battle history (never from client state). */
async function aggregate({ tournamentId, roundId = null, teamIds }) {
  const match = { tournament: tournamentId };
  if (roundId) match.round = roundId;
  const [attempts, battles, teams] = await Promise.all([
    AnswerAttempt.find(match).lean(),
    Battle.find({ ...match, status: { $in: ['active', 'completed'] } }).lean(),
    Team.find({ _id: { $in: teamIds } }).lean(),
  ]);
  const stats = new Map(
    teams.map((t) => [
      idStr(t._id),
      {
        team: { id: idStr(t._id), teamName: t.teamName, members: t.members.map((m) => m.name), status: t.status, isWildcard: t.isWildcard },
        points: 0,
        correct: 0,
        wrong: 0,
        battlesPlayed: 0,
        battlesWon: 0,
        roundsParticipated: 0,
      },
    ])
  );
  for (const a of attempts) {
    const b = stats.get(idStr(a.beneficiary));
    if (b) b.points += a.pointsAwarded;
    const t = stats.get(idStr(a.team));
    if (t && a.kind !== 'adjustment') {
      if (a.isCorrect) t.correct += 1;
      else t.wrong += 1;
    }
  }
  for (const b of battles) {
    for (const id of [b.teamA, b.teamB]) {
      const s = stats.get(idStr(id));
      if (s) s.battlesPlayed += 1;
    }
    const w = stats.get(idStr(b.winner));
    if (w && b.status === 'completed') w.battlesWon += 1;
  }
  return stats;
}

export async function roundLeaderboard(roundNumber) {
  const t = await currentTournament();
  if (!t) return { tournament: null, round: null, rows: [] };
  const round = await Round.findOne({ tournament: t._id, roundNumber: roundNumber ?? t.currentRound }).lean();
  if (!round) return { tournament: { id: idStr(t._id), name: t.name }, round: null, rows: [] };
  const stats = await aggregate({ tournamentId: t._id, roundId: round._id, teamIds: round.participatingTeams });
  const rows = [...stats.values()].map((r) => {
    const id = r.team.id;
    const roundStatus = r.team.status === 'champion' && round.isFinal
      ? 'champion'
      : hasId(round.byeTeams, id)
      ? 'bye'
      : hasId(round.qualifiedTeams, id)
        ? 'qualified'
        : hasId(round.eliminatedTeams, id)
          ? 'eliminated'
          : 'active';
    return { ...r, roundStatus, roundsParticipated: 1, isWildcard: hasId(round.wildcardTeams, id) };
  });
  return {
    tournament: { id: idStr(t._id), name: t.name },
    round: { roundNumber: round.roundNumber, status: round.status, isFinal: round.isFinal },
    rows: rank(rows),
  };
}

export async function overallLeaderboard() {
  const t = await currentTournament();
  if (!t) {
    const teams = await Team.find().lean();
    return {
      tournament: null,
      rows: rank(
        teams.map((x) => ({
          team: { id: idStr(x._id), teamName: x.teamName, members: x.members.map((m) => m.name), status: x.status },
          points: 0, correct: 0, wrong: 0, battlesPlayed: 0, battlesWon: 0, roundsParticipated: 0,
        }))
      ),
    };
  }
  const rounds = await Round.find({ tournament: t._id }).lean();
  const teamIds = [...new Set(rounds.flatMap((r) => r.participatingTeams.map(idStr)))];
  const stats = await aggregate({ tournamentId: t._id, teamIds });
  for (const r of rounds) {
    for (const id of r.participatingTeams) {
      const s = stats.get(idStr(id));
      if (s) s.roundsParticipated += 1;
    }
  }
  return { tournament: { id: idStr(t._id), name: t.name, status: t.status }, rows: rank([...stats.values()]) };
}

export async function finalLeaderboard() {
  const t = await currentTournament();
  if (!t) return { ready: false };
  const finalRound = await Round.findOne({ tournament: t._id, isFinal: true }).sort({ roundNumber: -1 }).lean();
  const finalBattle = finalRound
    ? await Battle.findOne({ round: finalRound._id, isFinal: true, status: { $in: ['active', 'completed', 'pending'] } }).sort({ battleNumber: -1 }).lean()
    : null;
  const overall = await overallLeaderboard();
  const byId = new Map(overall.rows.map((r) => [r.team.id, r]));
  const finalistIds = finalRound ? finalRound.participatingTeams.map(idStr) : t.champion ? [idStr(t.champion)] : [];
  const isVideo = finalRound?.kind === 'final_video';
  const vf = finalRound?.videoFinal;
  const judgeTotal = (id) =>
    vf && vf.status === 'results' ? vf.scores.filter((x) => idStr(x.team) === id).reduce((acc, x) => acc + (x.total ?? 0), 0) : null;
  const finalists = finalistIds.map((id) => {
    const row = byId.get(id);
    const finalScore = isVideo ? judgeTotal(id) : finalBattle ? (idStr(finalBattle.teamA) === id ? finalBattle.scoreA : idStr(finalBattle.teamB) === id ? finalBattle.scoreB : null) : null;
    return { team: row?.team ?? { id }, finalScore, totalScore: row?.points ?? 0, battlesWon: row?.battlesWon ?? 0, correct: row?.correct ?? 0 };
  });
  return {
    ready: !!finalRound || !!t.champion,
    format: isVideo ? 'video' : 'battle',
    challengeTitle: isVideo ? vf.title : null,
    judges: isVideo ? new Set(vf.scores.map((x) => x.judge)).size : 0,
    tournament: { id: idStr(t._id), name: t.name, status: t.status },
    championshipTitle: `${t.name} — Champions`,
    finalBattle: finalBattle
      ? { id: idStr(finalBattle._id), status: finalBattle.status, scoreA: finalBattle.scoreA, scoreB: finalBattle.scoreB, teamA: idStr(finalBattle.teamA), teamB: idStr(finalBattle.teamB) }
      : null,
    finalists,
    champion: t.champion ? byId.get(idStr(t.champion))?.team ?? { id: idStr(t.champion) } : null,
    runnerUp: t.runnerUp ? byId.get(idStr(t.runnerUp))?.team ?? { id: idStr(t.runnerUp) } : null,
    championTotal: t.champion ? byId.get(idStr(t.champion))?.points ?? 0 : null,
    overallTop: overall.rows.slice(0, 8),
  };
}
