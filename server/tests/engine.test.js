import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB } from '../src/db.js';
import {
  Team, Question, Tournament, Round, Battle, AnswerAttempt, TournamentEvent, Setting, ensureDefaultCategories, getSettings,
} from '../src/models/index.js';
import { seed } from '../src/seed.js';
import { executeCommand, executeDeviceBuzz } from '../src/services/commands.js';
import { onTimerExpired, recoverLiveBattle } from '../src/services/battleEngine.js';
import { clearBattleTimer } from '../src/services/timer.js';
import { broadcastState } from '../src/services/broadcast.js';
import { roundLeaderboard, overallLeaderboard } from '../src/services/leaderboard.js';
import { parseTeamText, validateTeamRows } from '../src/services/importers.js';

const URI = process.env.TEST_MONGO_URI || 'mongodb://127.0.0.1:27017/buzz_or_lose_test';
const admin = { _id: new mongoose.Types.ObjectId(), name: 'Test Host', role: 'admin' };
const cmd = (type, payload = {}) => executeCommand(type, payload, { user: admin });

before(async () => {
  await connectDB(URI);
});
after(async () => {
  clearBattleTimer();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
beforeEach(async () => {
  clearBattleTimer();
  await Promise.all([Team, Question, Tournament, Round, Battle, AnswerAttempt, TournamentEvent, Setting].map((m) => m.deleteMany({})));
  await Promise.all([Battle, AnswerAttempt].map((m) => m.syncIndexes()));
  await ensureDefaultCategories();
  await seed();
  await getSettings();
});

async function keepTeams(n) {
  const teams = await Team.find().sort({ teamName: 1 });
  await Team.deleteMany({ _id: { $in: teams.slice(n).map((t) => t._id) } });
}
const state = async () => (await broadcastState()).host;
const live = async () => (await state()).battle.live;

async function drawAndStartBattle() {
  await cmd('wheel.spin');
  const r2 = await cmd('wheel.spin');
  assert.ok(r2.battleId, 'second spin creates a battle');
  await cmd('battle.start', { battleId: r2.battleId });
  return Battle.findById(r2.battleId);
}
async function openBuzzers() {
  await cmd('battle.showQuestion');
  await cmd('battle.startTimer');
}
async function finishRemaining(winnerSide = 'A') {
  // answer every remaining question correctly for one side, then end
  for (;;) {
    const s = await state();
    const l = s.battle.live;
    if (l.phase === 'ready') await openBuzzers();
    if ((await live()).phase === 'buzz_open') {
      await cmd('battle.buzz', { side: winnerSide });
      await cmd('battle.mark', { result: 'correct' });
    }
    const after = await live();
    if (after.qIndex >= after.total - 1) break;
    await cmd('battle.next');
  }
  await cmd('battle.end');
}

test('wheel never selects the same team twice and creates a battle from two picks', async () => {
  await cmd('tournament.start', { questionsPerBattle: 3 });
  const seen = new Set();
  for (let i = 0; i < 5; i++) {
    const a = await cmd('wheel.spin');
    const b = await cmd('wheel.spin');
    assert.notEqual(String(a.teamId), String(b.teamId));
    assert.ok(!seen.has(String(a.teamId)) && !seen.has(String(b.teamId)), 'no repeated selection within a round');
    seen.add(String(a.teamId));
    seen.add(String(b.teamId));
  }
  assert.equal(seen.size, 10);
  await assert.rejects(cmd('wheel.spin'), /drawn/);
  const battles = await Battle.countDocuments({ status: 'pending' });
  assert.equal(battles, 5);
});

test('scoring rules: correct, wrong + steal, steal miss, hint stage, skip after hint', async () => {
  await cmd('tournament.start', { questionsPerBattle: 5 });
  const battle = await drawAndStartBattle();

  // Q1: A buzzes and is correct → A +1
  await openBuzzers();
  await cmd('battle.buzz', { side: 'A' });
  await cmd('battle.mark', { result: 'correct' });
  let b = await Battle.findById(battle._id);
  assert.deepEqual([b.scoreA, b.scoreB], [1, 0]);

  // Q2: A wrong → B +1, B steals correctly → B +1 more
  await cmd('battle.next');
  await openBuzzers();
  await cmd('battle.buzz', { side: 'A' });
  await cmd('battle.mark', { result: 'wrong' });
  assert.equal((await live()).phase, 'steal');
  await cmd('battle.mark', { result: 'correct' });
  b = await Battle.findById(battle._id);
  assert.deepEqual([b.scoreA, b.scoreB], [1, 2]);

  // Q3: B times out → A +1, A misses the steal → nothing
  await cmd('battle.next');
  await openBuzzers();
  await cmd('battle.buzz', { side: 'B' });
  await cmd('battle.mark', { result: 'timeout' });
  await cmd('battle.mark', { result: 'wrong' });
  b = await Battle.findById(battle._id);
  assert.deepEqual([b.scoreA, b.scoreB], [2, 2]);
  assert.equal((await live()).outcome, 'steal_failed');

  // Q4: nobody buzzes → hint → A buzzes, wrong → B +1, no steal after hint
  await cmd('battle.next');
  await openBuzzers();
  await assert.rejects(cmd('battle.revealHint'), /after nobody buzzes/);
  b = await Battle.findById(battle._id);
  await onTimerExpired(String(b._id), 'buzz', new Date(b.live.timer.endsAt).getTime());
  assert.equal((await live()).phase, 'no_buzz');
  await cmd('battle.revealHint');
  const l4 = await live();
  assert.equal(l4.stage, 'hint');
  assert.equal(l4.phase, 'buzz_open');
  await assert.rejects(cmd('battle.revealHint'), /Not allowed|only after|Only one/);
  await cmd('battle.buzz', { side: 'A' });
  await cmd('battle.mark', { result: 'wrong' });
  assert.equal((await live()).phase, 'resolved');
  b = await Battle.findById(battle._id);
  assert.deepEqual([b.scoreA, b.scoreB], [2, 3]);

  // Q5: nobody buzzes, hint, nobody buzzes again → skipped, no points
  await cmd('battle.next');
  await openBuzzers();
  b = await Battle.findById(battle._id);
  await onTimerExpired(String(b._id), 'buzz', new Date(b.live.timer.endsAt).getTime());
  await cmd('battle.revealHint');
  b = await Battle.findById(battle._id);
  await onTimerExpired(String(b._id), 'buzz', new Date(b.live.timer.endsAt).getTime());
  const l5 = await live();
  assert.equal(l5.phase, 'resolved');
  assert.equal(l5.outcome, 'skipped_no_buzz');
  b = await Battle.findById(battle._id);
  assert.deepEqual([b.scoreA, b.scoreB], [2, 3]);

  // End: B wins 3–2
  await assert.rejects(cmd('battle.next'), /last question/);
  await cmd('battle.end');
  b = await Battle.findById(battle._id);
  assert.equal(String(b.winner), String(b.teamB));
  assert.equal((await Team.findById(b.teamB)).status, 'qualified');
  assert.equal((await Team.findById(b.teamA)).status, 'eliminated');
  assert.equal((await Team.findById(b.teamB)).totalScore, 3);

  const lb = await roundLeaderboard();
  const rowB = lb.rows.find((r) => r.team.id === String(b.teamB));
  assert.equal(rowB.points, 3);
  assert.equal(rowB.correct, 1);
  assert.equal(rowB.battlesWon, 1);
});

test('simultaneous buzzes: exactly one team wins the buzz', async () => {
  await cmd('tournament.start', { questionsPerBattle: 2 });
  await drawAndStartBattle();
  await openBuzzers();
  const results = await Promise.all([executeDeviceBuzz('A'), executeDeviceBuzz('B'), executeDeviceBuzz('A'), executeDeviceBuzz('B')]);
  assert.equal(results.filter((r) => r.accepted).length, 1);
  const l = await live();
  assert.equal(l.phase, 'answering');
});

test('duplicate result submissions never award points twice', async () => {
  await cmd('tournament.start', { questionsPerBattle: 2 });
  const battle = await drawAndStartBattle();
  await openBuzzers();
  await cmd('battle.buzz', { side: 'A' });
  const settled = await Promise.allSettled([
    cmd('battle.mark', { result: 'correct', actionId: 'x1' }),
    cmd('battle.mark', { result: 'correct', actionId: 'x2' }),
    cmd('battle.mark', { result: 'correct', actionId: 'x1' }),
  ]);
  assert.equal(settled.filter((s) => s.status === 'fulfilled').length, 1);
  const b = await Battle.findById(battle._id);
  assert.equal(b.scoreA, 1);
  assert.equal(await AnswerAttempt.countDocuments({ battle: battle._id }), 1);
  // Reusing an actionId later is rejected too
  await cmd('battle.next');
  await openBuzzers();
  await cmd('battle.buzz', { side: 'B' });
  await assert.rejects(cmd('battle.mark', { result: 'correct', actionId: 'x1' }), /already been recorded/);
});

test('tied battle requires a tiebreaker or a documented host decision', async () => {
  await cmd('tournament.start', { questionsPerBattle: 2 });
  const battle = await drawAndStartBattle();
  await openBuzzers();
  await cmd('battle.buzz', { side: 'A' });
  await cmd('battle.mark', { result: 'correct' });
  await cmd('battle.next');
  await openBuzzers();
  await cmd('battle.buzz', { side: 'B' });
  await cmd('battle.mark', { result: 'correct' });
  await assert.rejects(cmd('battle.end'), /tied/);
  await cmd('battle.tiebreaker');
  const l = await live();
  assert.equal(l.total, 3);
  assert.equal(l.qIndex, 2);
  await openBuzzers();
  await cmd('battle.buzz', { side: 'B' });
  await cmd('battle.mark', { result: 'correct' });
  await cmd('battle.end');
  const b = await Battle.findById(battle._id);
  assert.equal(String(b.winner), String(b.teamB));
});

test('odd team count: bye, wildcard, next round, final and champion', async () => {
  await keepTeams(5);
  await cmd('tournament.start', { questionsPerBattle: 1 });
  // two battles from the wheel, one team left
  for (let i = 0; i < 2; i++) {
    const b = await drawAndStartBattle();
    await finishRemaining('A');
    assert.equal((await Battle.findById(b._id)).status, 'completed');
  }
  await assert.rejects(cmd('wheel.spin'), /Only one team/);
  await assert.rejects(cmd('round.complete'), /not been drawn/);
  const s = await state();
  assert.equal(s.round.pool.length, 1);
  const byeTeam = s.round.pool[0];
  await cmd('round.bye', { teamId: byeTeam });
  await cmd('round.complete');
  const r1 = await Round.findOne({ roundNumber: 1 });
  assert.equal(r1.qualifiedTeams.length, 3);
  assert.equal(r1.eliminatedTeams.length, 2);
  assert.equal((await Team.findById(byeTeam)).status, 'qualified');

  // wildcard: highest scoring eliminated team from round 1
  const { wildcardCandidates } = await import('../src/services/tournamentEngine.js');
  const cands = await wildcardCandidates();
  assert.equal(cands.length, 2);
  assert.ok(cands[0].suggested);
  await cmd('round.create', { wildcards: [cands[0].id] });
  const r2 = await Round.findOne({ roundNumber: 2 });
  assert.equal(r2.participatingTeams.length, 4);
  assert.equal(r2.wildcardTeams.length, 1);
  assert.equal(r2.isFinal, false);
  assert.equal((await Team.findById(cands[0].id)).status, 'active');

  for (let i = 0; i < 2; i++) {
    await drawAndStartBattle();
    await finishRemaining('B');
  }
  await cmd('round.complete');
  await cmd('round.create');
  const r3 = await Round.findOne({ roundNumber: 3 });
  assert.equal(r3.isFinal, true);
  const fb = await drawAndStartBattle();
  assert.equal(fb.isFinal, true);
  await finishRemaining('A');
  const t = await Tournament.findOne();
  assert.equal(t.status, 'completed');
  const final = await Battle.findById(fb._id);
  assert.equal(String(t.champion), String(final.teamA));
  assert.equal((await Team.findById(final.teamA)).status, 'champion');
  await cmd('tournament.announceChampion');
  assert.equal((await Tournament.findOne()).scene, 'champion');

  // history kept: teams never deleted, overall leaderboard has all 5
  const overall = await overallLeaderboard();
  assert.equal(overall.rows.length, 5);
  assert.equal(await Team.countDocuments(), 5);
});

test('playoffs: #1 straight to final, #2 vs #3 semifinal, judged video Grand Final', async () => {
  await keepTeams(6);
  await cmd('tournament.start', { questionsPerBattle: 1 });
  for (let i = 0; i < 3; i++) {
    await drawAndStartBattle();
    await finishRemaining(i === 0 ? 'A' : 'B');
  }
  await cmd('round.complete');

  const { playoffSeeds } = await import('../src/services/playoffEngine.js');
  const { seeds } = await playoffSeeds();
  assert.equal(seeds.length, 3);
  const { battleId } = await cmd('playoff.start', { seeds, questionsPerBattle: 1 });
  const semi = await Battle.findById(battleId);
  assert.deepEqual([String(semi.teamA), String(semi.teamB)], [seeds[1], seeds[2]]);
  assert.equal(semi.isFinal, false, 'semifinal never crowns a champion');
  assert.equal((await Team.findById(seeds[0])).status, 'qualified');
  assert.equal(await Team.countDocuments({ status: 'eliminated' }), 3);
  await assert.rejects(cmd('wheel.spin'), /drawn/);

  await cmd('battle.start', { battleId });
  await finishRemaining('B'); // #3 upsets #2
  assert.equal((await Tournament.findOne()).status, 'active');
  await cmd('round.complete');
  await assert.rejects(cmd('round.create'), /Grand Final/);

  await cmd('final.create', { title: 'Build a URL shortener', problem: 'Explain how you would design it.', durationMin: 30 });
  let snap = await state();
  assert.deepEqual(snap.final.finalists, [seeds[0], seeds[2]]);
  let pub = (await broadcastState()).pub;
  assert.equal(pub.final.problem, null, 'problem hidden until revealed');
  await assert.rejects(cmd('wheel.spin'), /video challenge/);

  await cmd('final.startWork');
  pub = (await broadcastState()).pub;
  assert.equal(pub.final.problem, 'Explain how you would design it.');
  await cmd('final.adjustTime', { minutes: 5 });
  await cmd('final.endWork');
  await assert.rejects(cmd('final.showcase', { teamId: seeds[0] }), /no video/);
  await cmd('final.submission', { teamId: seeds[0], link: 'https://example.com/v1' });
  await cmd('final.submission', { teamId: seeds[2], link: 'https://example.com/v2' });
  await assert.rejects(cmd('final.submission', { teamId: seeds[2], link: 'javascript:alert(1)' }), /valid/);
  await cmd('final.showcase', { teamId: seeds[0] });
  await cmd('final.startJudging');

  const full = (v) => ({ correctness: v, clarity: v, creativity: v, presentation: v });
  await cmd('final.score', { judge: 'Asha', teamId: seeds[0], values: full(7) });
  await assert.rejects(cmd('final.score', { judge: 'Asha', teamId: seeds[0], values: full(11) }), /between 0 and 10/);
  await assert.rejects(cmd('final.reveal'), /missing/);
  await cmd('final.score', { judge: 'Asha', teamId: seeds[2], values: full(8) });
  await cmd('final.score', { judge: 'Ravi', teamId: seeds[0], values: full(9) });
  await cmd('final.score', { judge: 'Ravi', teamId: seeds[2], values: full(9) });
  pub = (await broadcastState()).pub;
  assert.equal(pub.final.totals, null, 'scores secret until reveal');

  await cmd('final.reveal');
  const t = await Tournament.findOne();
  assert.equal(String(t.champion), seeds[2]); // 68 vs 64
  assert.equal(String(t.runnerUp), seeds[0]);
  assert.equal((await Team.findById(seeds[2])).status, 'champion');
  const { finalLeaderboard } = await import('../src/services/leaderboard.js');
  const fl = await finalLeaderboard();
  assert.equal(fl.format, 'video');
  assert.equal(fl.finalists.find((f) => f.team.id === seeds[2]).finalScore, 68);
});

test('audience snapshot never contains the hidden answer', async () => {
  await cmd('tournament.start', { questionsPerBattle: 2 });
  await drawAndStartBattle();
  let snap = await broadcastState();
  assert.equal(snap.pub.battle.question.text, null, 'question hidden until shown');
  await openBuzzers();
  snap = await broadcastState();
  const json = JSON.stringify(snap.pub);
  const secret = snap.host.battle.question.answer;
  assert.ok(secret);
  assert.ok(!json.includes(JSON.stringify(secret)), 'answer not in public state');
  assert.equal(snap.pub.battle.question.answer, null);
  assert.equal(snap.pub.battle.question.explanation, null);
  assert.equal(snap.pub.battle.question.hint, null);
  await cmd('battle.buzz', { side: 'A' });
  await cmd('battle.mark', { result: 'correct' });
  await cmd('battle.revealAnswer');
  snap = await broadcastState();
  assert.equal(snap.pub.battle.question.answer, snap.host.battle.question.answer);
});

test('hosts only: commands without an authorized user are rejected', async () => {
  await assert.rejects(executeCommand('tournament.start', {}, { user: null }), /Not authorized/);
  await assert.rejects(executeCommand('tournament.start', {}, { user: { role: 'audience' } }), /Not authorized/);
  await assert.rejects(executeCommand('tournament.reset', { confirm: 'RESET' }, { user: { ...admin, role: 'host' } }), /Only an admin/);
});

test('timer recovery after a restart fires an expired deadline', async () => {
  await cmd('tournament.start', { questionsPerBattle: 2 });
  const battle = await drawAndStartBattle();
  await openBuzzers();
  clearBattleTimer(); // simulate the process dying
  await Battle.updateOne({ _id: battle._id }, { 'live.timer.endsAt': new Date(Date.now() - 1000) });
  await recoverLiveBattle();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal((await Battle.findById(battle._id)).live.phase, 'no_buzz');
});

test('corrections are audited: manual pairing, cancel, score adjustment', async () => {
  await keepTeams(4);
  await cmd('tournament.start', { questionsPerBattle: 2 });
  const s = await state();
  const [a, b] = s.round.pool;
  const { battleId } = await cmd('round.manualPair', { teamA: a, teamB: b, reason: 'Teams requested' });
  await cmd('battle.cancel', { battleId, reason: 'Wrong pairing' });
  assert.equal((await state()).round.pool.length, 4);
  const battle = await drawAndStartBattle();
  await assert.rejects(cmd('battle.adjust', { teamId: battle.teamA, delta: 1 }), /reason/);
  await cmd('battle.adjust', { teamId: battle.teamA, delta: 2, reason: 'Judge review' });
  assert.equal((await Battle.findById(battle._id)).scoreA, 2);
  const audits = await TournamentEvent.find({ audit: true });
  assert.ok(audits.length >= 3);
});

test('PDF/CSV text parsing extracts teams and flags invalid rows', async () => {
  const text = [
    'Registered Teams',
    'Team Name: Quantum Coders',
    'Member 1: Asha',
    'Member 2: Ravi',
    'Team 2 - Bit Busters',
    '1. Leela',
    '2. Om',
    'Logic Lords: Anu, Ben, Cy, Dee, Eli',
    'Code Crusaders: Someone',
  ].join('\n');
  const teams = parseTeamText(text);
  assert.deepEqual(teams[0], { teamName: 'Quantum Coders', members: ['Asha', 'Ravi'] });
  assert.deepEqual(teams[1], { teamName: 'Bit Busters', members: ['Leela', 'Om'] });
  const rows = await validateTeamRows(teams);
  assert.match(rows[2].errors.join(), /maximum 4/);
  assert.match(rows[3].errors.join(), /already registered/);
  assert.equal(rows[0].errors.length, 0);
});
