import { Round, Team, Battle } from '../models/index.js';
import { AppError, assert } from '../utils/errors.js';
import { idEq, idStr } from '../utils/random.js';
import { logEvent } from './events.js';
import { emitFx, emitLeaderboardChanged } from './broadcast.js';
import { requireActive, createBattle, finalizeChampion, getCurrentTournament } from './tournamentEngine.js';
import { overallLeaderboard } from './leaderboard.js';
import { hasId } from './pool.js';

/*
 * PLAYOFF FORMAT
 *   #1 on points  ─────────────────────────────┐
 *   #2 vs #3  → SEMIFINAL (buzzer battle) ──────┴─→ GRAND FINAL (video challenge, judged)
 *
 * Grand Final status flow: setup → working (problem revealed, countdown) → showcase (videos played)
 *                          → judging → results (champion decided by judge totals)
 */

export const DEFAULT_CRITERIA = [
  { key: 'correctness', name: 'Correctness of solution', max: 10 },
  { key: 'clarity', name: 'Clarity of explanation', max: 10 },
  { key: 'creativity', name: 'Creativity', max: 10 },
  { key: 'presentation', name: 'Presentation & teamwork', max: 10 },
];

const teamName = async (id) => (await Team.findById(id).select('teamName').lean())?.teamName ?? 'Team';

/** Suggested seeds: teams still in the competition ranked by total points (overall leaderboard order). */
export async function playoffSeeds() {
  const t = await getCurrentTournament();
  if (!t) return { eligible: [], seeds: [] };
  const round = await Round.findOne({ tournament: t._id, roundNumber: t.currentRound }).lean();
  const { rows } = await overallLeaderboard();
  const alive = round ? round.qualifiedTeams.map(idStr) : [];
  const ranked = rows.map((r) => ({
    id: r.team.id,
    teamName: r.team.teamName,
    points: r.points,
    battlesWon: r.battlesWon,
    stillIn: alive.includes(r.team.id),
  }));
  const pool = ranked.filter((r) => r.stillIn);
  const fill = pool.length >= 3 ? pool : [...pool, ...ranked.filter((r) => !r.stillIn)];
  return { eligible: ranked, seeds: fill.slice(0, 3).map((r) => r.id) };
}

export async function startPlayoffs({ seeds = [], questionsPerBattle } = {}, ctx) {
  const { t, round: prev } = await requireActive();
  assert(prev.status === 'completed', `Complete Round ${prev.roundNumber} before starting the playoffs.`);
  assert(prev.kind === 'standard', 'The playoffs have already started.');
  const ids = seeds.map(String);
  assert(ids.length === 3 && new Set(ids).size === 3, 'Choose three different teams for seeds #1, #2 and #3.');
  const teams = await Team.find({ _id: { $in: ids } });
  assert(teams.length === 3, 'A seeded team was not found.');
  const { rows } = await overallLeaderboard();
  const pts = (id) => rows.find((r) => r.team.id === id)?.points ?? 0;

  const n = prev.roundNumber + 1;
  const round = await Round.create({
    tournament: t._id,
    roundNumber: n,
    kind: 'semifinal',
    participatingTeams: [ids[1], ids[2]],
    seeds: ids.map((id, i) => ({ team: id, seed: i + 1, points: pts(id) })),
    questionsPerBattle: Math.min(30, Math.max(1, Number(questionsPerBattle) || prev.questionsPerBattle || 5)),
    isFinal: false,
  });

  // Everyone outside the top three is out; #1 waits in the final.
  const others = await Team.find({ _id: { $nin: ids }, status: { $in: ['active', 'qualified'] } }).select('_id');
  await Team.updateMany({ _id: { $in: others.map((o) => o._id) } }, { status: 'eliminated' });
  await Team.updateOne({ _id: ids[0] }, { status: 'qualified', currentRound: n });
  await Team.updateMany({ _id: { $in: [ids[1], ids[2]] } }, { status: 'active', currentRound: n });

  const battle = await createBattle({ t, round, teamA: ids[1], teamB: ids[2], via: 'playoff' });
  await round.save();
  t.currentRound = n;
  t.displayBattle = battle._id;
  t.scene = 'versus';
  await t.save();

  const [a, b, c] = await Promise.all(ids.map(teamName));
  await logEvent(t, 'playoffs_started', `Playoffs: #1 ${a} goes straight to the Grand Final · Semifinal: #2 ${b} vs #3 ${c}`, { seeds: ids }, { ...ctx, audit: true });
  emitFx({ type: 'roundStart', roundNumber: n, label: 'SEMIFINAL' });
  emitLeaderboardChanged();
  return { battleId: battle._id };
}

function cleanCriteria(criteria) {
  const list = (Array.isArray(criteria) && criteria.length ? criteria : DEFAULT_CRITERIA).slice(0, 8).map((c, i) => ({
    key: String(c.key || `c${i + 1}`).replace(/[^a-z0-9_]/gi, '').slice(0, 24) || `c${i + 1}`,
    name: String(c.name || `Criterion ${i + 1}`).trim().slice(0, 60),
    max: Math.min(100, Math.max(1, Number.parseInt(c.max, 10) || 10)),
  }));
  assert(new Set(list.map((c) => c.key)).size === list.length, 'Criteria need unique names.');
  return list;
}

async function finalists(prev, teamsOverride) {
  if (teamsOverride?.length) return teamsOverride.map(String);
  if (prev.kind === 'semifinal') {
    const seed1 = prev.seeds.find((s) => s.seed === 1)?.team;
    assert(seed1, 'Seed #1 is missing.');
    assert(prev.qualifiedTeams.length === 1, 'The semifinal has no winner yet.');
    return [idStr(seed1), idStr(prev.qualifiedTeams[0])];
  }
  return prev.qualifiedTeams.map(idStr);
}

export async function createVideoFinal({ title, problem, durationMin, criteria, teams } = {}, ctx) {
  const { t, round: prev } = await requireActive();
  assert(prev.status === 'completed', `Complete Round ${prev.roundNumber} first.`);
  assert(prev.kind !== 'final_video', 'The Grand Final already exists.');
  const ids = [...new Set(await finalists(prev, teams))];
  assert(ids.length >= 2, 'At least two finalists are needed.');
  const n = prev.roundNumber + 1;
  await Round.create({
    tournament: t._id,
    roundNumber: n,
    kind: 'final_video',
    isFinal: true,
    participatingTeams: ids,
    drawnTeams: ids, // nothing to draw — keeps the wheel empty
    videoFinal: {
      title: title?.trim() || undefined,
      problem: problem?.trim() || '',
      durationMin: Math.min(600, Math.max(1, Number(durationMin) || 60)),
      criteria: cleanCriteria(criteria),
      submissions: ids.map((id) => ({ team: id })),
    },
  });
  await Team.updateMany({ _id: { $in: ids } }, { status: 'active', currentRound: n });
  t.currentRound = n;
  t.scene = 'final';
  t.displayBattle = null;
  await t.save();
  const names = await Promise.all(ids.map(teamName));
  await logEvent(t, 'round_started', `THE GRAND FINAL (video challenge): ${names.join(' vs ')}`, { roundNumber: n }, ctx);
  emitFx({ type: 'roundStart', roundNumber: n, isFinal: true, label: 'THE GRAND FINAL' });
  return {};
}

async function loadFinal() {
  const { t, round } = await requireActive();
  assert(round.kind === 'final_video' && round.videoFinal, 'The Grand Final has not been set up.');
  return { t, round, vf: round.videoFinal };
}

const save = async (round) => {
  round.markModified('videoFinal');
  await round.save();
};

export async function updateBrief({ title, problem, durationMin, criteria } = {}) {
  const { round, vf } = await loadFinal();
  assert(['setup', 'working'].includes(vf.status), 'The brief can only be changed before the showcase.');
  if (title !== undefined) vf.title = String(title).trim().slice(0, 140) || vf.title;
  if (problem !== undefined) vf.problem = String(problem).trim().slice(0, 6000);
  if (durationMin !== undefined && vf.status === 'setup') vf.durationMin = Math.min(600, Math.max(1, Number(durationMin) || vf.durationMin));
  if (criteria !== undefined) {
    assert(!vf.scores.length, 'Criteria cannot change after judges have started scoring.');
    vf.criteria = cleanCriteria(criteria);
  }
  await save(round);
  return {};
}

export async function startWork(_p, ctx) {
  const { t, round, vf } = await loadFinal();
  assert(vf.status === 'setup', 'The challenge has already started.');
  assert(vf.problem.trim(), 'Write the problem statement first.');
  vf.status = 'working';
  vf.startedAt = new Date();
  vf.endsAt = new Date(Date.now() + vf.durationMin * 60000);
  vf.pausedRemainingMs = null;
  await save(round);
  await logEvent(t, 'final_started', `Grand Final problem revealed — ${vf.durationMin} minutes on the clock`, {}, ctx);
  emitFx({ type: 'finalStart' });
  return {};
}

export async function adjustTime({ minutes } = {}, ctx) {
  const { t, round, vf } = await loadFinal();
  assert(vf.status === 'working', 'The work timer is not running.');
  const m = Number.parseInt(minutes, 10);
  assert(m && Math.abs(m) <= 120, 'Adjust by 1–120 minutes.');
  if (vf.pausedRemainingMs != null) vf.pausedRemainingMs = Math.max(0, vf.pausedRemainingMs + m * 60000);
  else vf.endsAt = new Date(Math.max(Date.now(), new Date(vf.endsAt).getTime() + m * 60000));
  await save(round);
  await logEvent(t, 'final_time', `Grand Final timer ${m > 0 ? 'extended' : 'shortened'} by ${Math.abs(m)} min`, {}, { ...ctx, audit: true });
  return {};
}

export async function pauseWork() {
  const { round, vf } = await loadFinal();
  assert(vf.status === 'working', 'The work timer is not running.');
  if (vf.pausedRemainingMs != null) {
    vf.endsAt = new Date(Date.now() + vf.pausedRemainingMs);
    vf.pausedRemainingMs = null;
  } else {
    vf.pausedRemainingMs = Math.max(0, new Date(vf.endsAt).getTime() - Date.now());
  }
  await save(round);
  return {};
}

export async function endWork(_p, ctx) {
  const { t, round, vf } = await loadFinal();
  assert(vf.status === 'working', 'The challenge is not running.');
  vf.status = 'showcase';
  vf.pausedRemainingMs = null;
  vf.endsAt = new Date();
  await save(round);
  await logEvent(t, 'final_showcase', 'Time is up — video showcase begins', {}, ctx);
  emitFx({ type: 'finalTimeUp' });
  return {};
}

export async function setShowcase({ teamId } = {}) {
  const { t, round, vf } = await loadFinal();
  assert(['showcase', 'judging'].includes(vf.status), 'Videos are shown after the work time ends.');
  if (teamId) {
    assert(hasId(round.participatingTeams, teamId), 'That team is not a finalist.');
    const sub = vf.submissions.find((s) => idEq(s.team, teamId));
    assert(sub?.url || sub?.link, 'This team has no video yet.');
  }
  vf.showcaseTeam = teamId || null;
  await save(round);
  t.scene = 'final';
  await t.save();
  emitFx({ type: 'videoControl', action: 'load', teamId: teamId || null });
  return {};
}

export async function videoControl({ action } = {}) {
  assert(['play', 'pause', 'restart', 'fullscreen'].includes(action), 'Unknown video action.');
  await loadFinal();
  emitFx({ type: 'videoControl', action });
  return {};
}

export async function startJudging(_p, ctx) {
  const { t, round, vf } = await loadFinal();
  assert(vf.status === 'showcase', 'Show the videos first.');
  vf.status = 'judging';
  vf.showcaseTeam = null;
  await save(round);
  await logEvent(t, 'final_judging', 'Judges are scoring the Grand Final videos', {}, ctx);
  return {};
}

export async function saveScore({ judge, teamId, values } = {}, ctx) {
  const { t, round, vf } = await loadFinal();
  assert(['showcase', 'judging'].includes(vf.status), 'Scoring opens once the videos are being shown.');
  const j = String(judge || '').trim().slice(0, 40);
  assert(j, 'Enter the judge name.');
  assert(hasId(round.participatingTeams, teamId), 'That team is not a finalist.');
  const clean = {};
  for (const c of vf.criteria) {
    const v = Number(values?.[c.key]);
    assert(Number.isFinite(v) && v >= 0 && v <= c.max, `${c.name} must be between 0 and ${c.max}.`);
    clean[c.key] = Math.round(v * 10) / 10;
  }
  const total = Object.values(clean).reduce((s, v) => s + v, 0);
  const i = vf.scores.findIndex((s) => s.judge.toLowerCase() === j.toLowerCase() && idEq(s.team, teamId));
  const entry = { judge: j, team: teamId, values: clean, total, updatedAt: new Date() };
  if (i >= 0) vf.scores[i] = entry;
  else vf.scores.push(entry);
  await save(round);
  await logEvent(t, 'final_score', `Judge ${j} scored ${await teamName(teamId)}`, { teamId, judge: j }, ctx);
  return { total };
}

export async function removeJudge({ judge } = {}, ctx) {
  const { t, round, vf } = await loadFinal();
  assert(vf.status !== 'results', 'Results are already final.');
  const before = vf.scores.length;
  vf.scores = vf.scores.filter((s) => s.judge.toLowerCase() !== String(judge || '').toLowerCase());
  assert(vf.scores.length < before, 'No scores found for that judge.');
  await save(round);
  await logEvent(t, 'final_score', `Scores of judge ${judge} removed`, { judge }, { ...ctx, audit: true });
  return {};
}

export function finalTotals(round) {
  const vf = round.videoFinal;
  const judges = [...new Set(vf.scores.map((s) => s.judge))];
  return round.participatingTeams
    .map((id) => {
      const mine = vf.scores.filter((s) => idEq(s.team, id));
      const byCriterion = Object.fromEntries(vf.criteria.map((c) => [c.key, mine.reduce((s, x) => s + (x.values?.[c.key] ?? 0), 0)]));
      return { team: idStr(id), total: mine.reduce((s, x) => s + x.total, 0), judgesScored: mine.length, byCriterion };
    })
    .map((r) => ({ ...r, judges: judges.length }))
    .sort((a, b) => b.total - a.total);
}

export async function revealResults({ winnerId, reason } = {}, ctx) {
  const { t, round, vf } = await loadFinal();
  assert(vf.status === 'judging', 'Finish the showcase and start judging first.');
  assert(vf.scores.length, 'No judge scores have been entered.');
  const judges = new Set(vf.scores.map((s) => s.judge.toLowerCase()));
  for (const id of round.participatingTeams) {
    const n = vf.scores.filter((s) => idEq(s.team, id)).length;
    assert(n === judges.size, `Every judge must score every finalist (${await teamName(id)} is missing ${judges.size - n}).`);
  }
  const totals = finalTotals(round);
  let winner = totals[0].team;
  const tied = totals.length > 1 && totals[0].total === totals[1].total;
  if (winnerId && !idEq(winnerId, winner)) {
    assert(reason?.trim(), 'Give a reason for choosing the winner.');
    assert(hasId(round.participatingTeams, winnerId), 'The winner must be a finalist.');
    winner = String(winnerId);
    vf.winnerOverrideReason = reason.trim();
  } else if (tied) {
    if (!winnerId) throw new AppError('The judges’ totals are tied — choose the winner with a reason.', 409, 'TIE');
    assert(reason?.trim(), 'Give a reason for breaking the tie.');
    vf.winnerOverrideReason = reason.trim();
  }
  const runnerUp = totals.find((x) => x.team !== winner)?.team ?? null;
  vf.status = 'results';
  vf.showcaseTeam = null;
  round.status = 'completed';
  round.completedAt = new Date();
  round.qualifiedTeams = [winner];
  round.eliminatedTeams = round.participatingTeams.filter((id) => !idEq(id, winner));
  await save(round);
  await Team.updateMany({ _id: { $in: round.eliminatedTeams } }, { status: 'eliminated' });

  await logEvent(
    t,
    'final_results',
    `Grand Final results: ${(await Promise.all(totals.map(async (x) => `${await teamName(x.team)} ${x.total}`))).join(' · ')}${vf.winnerOverrideReason ? ` (host decision: ${vf.winnerOverrideReason})` : ''}`,
    { totals },
    vf.winnerOverrideReason ? { ...ctx, audit: true } : ctx
  );
  await finalizeChampion(t, winner, runnerUp, ctx);
  t.scene = 'final';
  await t.save();
  emitFx({ type: 'finalReveal', winner });
  return {};
}

/** Attach an uploaded video file or external link to a finalist. */
export async function setSubmission({ teamId, url, link, fileName }, ctx) {
  const { t, round, vf } = await loadFinal();
  assert(vf.status !== 'results', 'Results are final.');
  assert(hasId(round.participatingTeams, teamId), 'That team is not a finalist.');
  if (url !== undefined) assert(url === '' || /^\/uploads\/videos\/[a-z0-9._-]+$/i.test(url), 'Invalid video file.');
  if (link !== undefined) {
    link = String(link).trim();
    assert(link === '' || (/^https?:\/\/\S+$/i.test(link) && link.length <= 500), 'Enter a valid http(s) link.');
  }
  let sub = vf.submissions.find((s) => idEq(s.team, teamId));
  if (!sub) {
    vf.submissions.push({ team: teamId });
    sub = vf.submissions[vf.submissions.length - 1];
  }
  if (url !== undefined) {
    sub.url = url;
    sub.fileName = fileName || '';
  }
  if (link !== undefined) sub.link = link;
  sub.submittedAt = url || link ? new Date() : null;
  await save(round);
  await logEvent(t, 'final_submission', `${await teamName(teamId)} ${url || link ? 'submitted their video' : 'video removed'}`, { teamId }, ctx);
  return { previous: undefined };
}

export async function battleOf(roundId) {
  return Battle.findOne({ round: roundId, status: { $ne: 'cancelled' } }).lean();
}
