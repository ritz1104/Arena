import { Router } from 'express';
import { z } from 'zod';
import { Team, Battle, Round, Tournament, AnswerAttempt, TournamentEvent, normalizeName } from '../models/index.js';
import { asyncH, AppError } from '../utils/errors.js';
import { dataUpload } from '../middleware/upload.js';
import { parseTeamsFile, validateTeamRows } from '../services/importers.js';
import { logEvent } from '../services/events.js';
import { broadcastState } from '../services/broadcast.js';
import { runExclusive } from '../services/lock.js';
import { idStr } from '../utils/random.js';

const r = Router();

const teamBody = z.object({
  teamName: z.string().trim().min(1, 'Team name is required').max(60),
  members: z.array(z.string().trim().max(60)).max(4, 'A team can have at most 4 members').default([]),
});
const cleanMembers = (m) => m.map((x) => x.trim()).filter(Boolean).map((name) => ({ name }));
const refresh = () => runExclusive(broadcastState).catch(() => {});

async function liveTournament() {
  return Tournament.findOne({ status: { $in: ['active', 'completed'] } }).sort({ createdAt: -1 }).lean();
}

r.get(
  '/',
  asyncH(async (req, res) => {
    const { search = '', status = '' } = req.query;
    const q = {};
    if (status) q.status = String(status);
    if (search) q.nameKey = { $regex: normalizeName(String(search)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') };
    const teams = await Team.find(q).sort({ teamName: 1 }).lean();
    const t = await liveTournament();
    let inTournament = new Set();
    if (t) {
      const rounds = await Round.find({ tournament: t._id }).select('participatingTeams').lean();
      inTournament = new Set(rounds.flatMap((x) => x.participatingTeams.map(idStr)));
    }
    res.json({
      teams: teams.map((x) => ({ ...x, id: idStr(x._id), locked: inTournament.has(idStr(x._id)) })),
      competitionLive: !!t && t.status === 'active',
    });
  })
);

r.post(
  '/',
  asyncH(async (req, res) => {
    const body = teamBody.parse(req.body);
    if (await Team.exists({ nameKey: normalizeName(body.teamName) })) throw new AppError('A team with this name already exists.', 409);
    const team = await Team.create({ teamName: body.teamName, members: cleanMembers(body.members) });
    const t = await liveTournament();
    await logEvent(t?._id ?? null, 'team_registered', `Team ${team.teamName} registered`, { teamId: team._id }, { user: req.user });
    refresh();
    res.status(201).json({ team });
  })
);

r.post(
  '/import/preview',
  dataUpload.single('file'),
  asyncH(async (req, res) => {
    if (!req.file) throw new AppError('Choose a file to import.', 400);
    const rows = await parseTeamsFile(req.file);
    res.json({ rows, fileName: req.file.originalname });
  })
);

r.post(
  '/bulk',
  asyncH(async (req, res) => {
    const { teams } = z.object({ teams: z.array(z.object({ teamName: z.string().default(''), members: z.array(z.string()).default([]) })).min(1).max(500) }).parse(req.body);
    const rows = await validateTeamRows(teams, { mergeDuplicates: false });
    if (rows.some((x) => x.errors.length)) return res.status(422).json({ error: 'Some records are invalid. Fix them and confirm again.', rows });
    const created = await Team.insertMany(rows.map((x) => ({ teamName: x.teamName, members: cleanMembers(x.members), nameKey: normalizeName(x.teamName) })));
    const t = await liveTournament();
    await logEvent(t?._id ?? null, 'team_registered', `${created.length} team(s) imported`, { count: created.length }, { user: req.user });
    refresh();
    res.status(201).json({ created: created.length });
  })
);

r.put(
  '/:id',
  asyncH(async (req, res) => {
    const body = teamBody.parse(req.body); // scores/status are never editable here
    const team = await Team.findById(req.params.id);
    if (!team) throw new AppError('Team not found.', 404);
    const key = normalizeName(body.teamName);
    if (key !== team.nameKey && (await Team.exists({ nameKey: key }))) throw new AppError('A team with this name already exists.', 409);
    const oldName = team.teamName;
    team.teamName = body.teamName;
    team.members = cleanMembers(body.members);
    await team.save();
    const t = await liveTournament();
    if (t) await logEvent(t._id, 'team_updated', `Team ${oldName} details updated${oldName !== team.teamName ? ` (renamed to ${team.teamName})` : ''}`, { teamId: team._id }, { user: req.user, audit: true });
    refresh();
    res.json({ team });
  })
);

r.delete(
  '/:id',
  asyncH(async (req, res) => {
    const team = await Team.findById(req.params.id);
    if (!team) throw new AppError('Team not found.', 404);
    const played = await Battle.exists({ $or: [{ teamA: team._id }, { teamB: team._id }], status: { $ne: 'cancelled' } });
    const t = await liveTournament();
    const inRound = t ? await Round.exists({ tournament: t._id, participatingTeams: team._id }) : null;
    if (played || inRound) throw new AppError('This team has competition history and cannot be deleted. Its record is kept for leaderboards.', 409);
    await team.deleteOne();
    refresh();
    res.json({ ok: true });
  })
);

r.get(
  '/:id/history',
  asyncH(async (req, res) => {
    const team = await Team.findById(req.params.id).lean();
    if (!team) throw new AppError('Team not found.', 404);
    const battles = await Battle.find({ $or: [{ teamA: team._id }, { teamB: team._id }], status: { $ne: 'cancelled' } })
      .sort({ createdAt: 1 })
      .populate('teamA teamB', 'teamName')
      .populate('tournament', 'name status')
      .lean();
    const attempts = await AnswerAttempt.find({ $or: [{ team: team._id }, { beneficiary: team._id }] }).lean();
    const events = await TournamentEvent.find({ $or: [{ 'eventData.teamId': team._id }, { 'eventData.teamId': String(team._id) }] }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({
      team,
      battles: battles.map((b) => {
        const isA = idStr(b.teamA?._id) === idStr(team._id);
        return {
          id: b._id,
          tournament: b.tournament?.name,
          roundNumber: b.roundNumber,
          battleNumber: b.battleNumber,
          opponent: (isA ? b.teamB : b.teamA)?.teamName,
          score: isA ? b.scoreA : b.scoreB,
          opponentScore: isA ? b.scoreB : b.scoreA,
          status: b.status,
          result: b.status !== 'completed' ? b.status : idStr(b.winner) === idStr(team._id) ? 'won' : 'lost',
          isFinal: b.isFinal,
        };
      }),
      stats: {
        correct: attempts.filter((a) => idStr(a.team) === idStr(team._id) && a.isCorrect).length,
        wrong: attempts.filter((a) => idStr(a.team) === idStr(team._id) && !a.isCorrect && a.kind !== 'adjustment').length,
        pointsEarned: attempts.filter((a) => idStr(a.beneficiary) === idStr(team._id)).reduce((s, a) => s + a.pointsAwarded, 0),
      },
      events,
    });
  })
);

export default r;
