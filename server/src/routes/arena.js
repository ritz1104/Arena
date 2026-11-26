import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  Tournament, Round, Team, Battle, AnswerAttempt, TournamentEvent, Question, getSettings, SOUND_EVENTS, SOUND_PRESETS, publicSoundConfig,
} from '../models/index.js';
import { asyncH, AppError } from '../utils/errors.js';
import { requireRole } from '../middleware/auth.js';
import { soundUpload, soundDir, AUDIO_EXT, videoUpload } from '../middleware/upload.js';
import { playoffSeeds, DEFAULT_CRITERIA } from '../services/playoffEngine.js';
import { executeCommand } from '../services/commands.js';
import { getSnapshot, broadcastState, getIO } from '../services/broadcast.js';
import { runExclusive } from '../services/lock.js';
import { wildcardCandidates } from '../services/tournamentEngine.js';
import { roundLeaderboard, overallLeaderboard, finalLeaderboard } from '../services/leaderboard.js';
import { idStr, token } from '../utils/random.js';

const r = Router();

const current = () => Tournament.findOne({ status: { $in: ['active', 'completed'] } }).sort({ createdAt: -1 }).lean();

/* ---------------- live state + commands ---------------- */

r.get('/live/state', asyncH(async (_req, res) => res.json((await getSnapshot()).host)));

r.post(
  '/live/command',
  asyncH(async (req, res) => {
    const { type, payload } = z.object({ type: z.string().max(60), payload: z.record(z.any()).optional() }).parse(req.body);
    const result = await executeCommand(type, payload, { user: req.user });
    res.json({ ok: true, result });
  })
);

/* ---------------- dashboard ---------------- */

r.get(
  '/stats',
  asyncH(async (_req, res) => {
    const t = await current();
    const teams = await Team.find().lean();
    const participants = teams.reduce((s, x) => s + x.members.length, 0);
    let battlesCompleted = 0;
    let questionsAttempted = 0;
    let pointsAwarded = 0;
    let leader = null;
    if (t) {
      battlesCompleted = await Battle.countDocuments({ tournament: t._id, status: 'completed' });
      const results = await Battle.find({ tournament: t._id, status: { $in: ['active', 'completed'] } }).select('questionResults').lean();
      questionsAttempted = results.reduce((s, b) => s + b.questionResults.length, 0);
      const agg = await AnswerAttempt.aggregate([{ $match: { tournament: t._id } }, { $group: { _id: null, pts: { $sum: '$pointsAwarded' } } }]);
      pointsAwarded = agg[0]?.pts ?? 0;
      const overall = await overallLeaderboard();
      leader = overall.rows[0] && overall.rows[0].points > 0 ? overall.rows[0] : null;
    }
    res.json({
      tournament: t ? { id: t._id, name: t.name, status: t.status, currentRound: t.currentRound, startedAt: t.startedAt } : null,
      totalTeams: teams.length,
      totalParticipants: participants,
      activeTeams: teams.filter((x) => x.status === 'active' || x.status === 'qualified').length,
      eliminatedTeams: teams.filter((x) => x.status === 'eliminated').length,
      currentRound: t?.currentRound ?? 0,
      battlesCompleted,
      questionsAttempted,
      pointsAwarded,
      leader,
      questionBank: await Question.countDocuments({ isActive: true }),
    });
  })
);

r.get(
  '/events',
  asyncH(async (req, res) => {
    const limit = Math.min(500, Number(req.query.limit) || 50);
    const t = await current();
    const q = {};
    if (req.query.scope !== 'all' && t) q.tournament = { $in: [t._id, null] };
    if (req.query.audit === '1') q.audit = true;
    if (req.query.type) q.eventType = String(req.query.type);
    const events = await TournamentEvent.find(q).sort({ createdAt: -1 }).limit(limit).populate('actor', 'name').lean();
    res.json({ events: events.map((e) => ({ ...e, actorName: e.actor?.name ?? null })) });
  })
);

/* ---------------- rounds + battles ---------------- */

r.get(
  '/rounds',
  asyncH(async (_req, res) => {
    const t = await current();
    if (!t) return res.json({ tournament: null, rounds: [] });
    const rounds = await Round.find({ tournament: t._id }).sort({ roundNumber: 1 }).lean();
    const battles = await Battle.find({ tournament: t._id, status: { $ne: 'cancelled' } }).sort({ battleNumber: 1 }).lean();
    res.json({
      tournament: { id: t._id, name: t.name, status: t.status, currentRound: t.currentRound, champion: idStr(t.champion), runnerUp: idStr(t.runnerUp) },
      rounds: rounds.map((rd) => ({
        id: idStr(rd._id),
        roundNumber: rd.roundNumber,
        status: rd.status,
        isFinal: rd.isFinal,
        kind: rd.kind ?? 'standard',
        questionsPerBattle: rd.questionsPerBattle,
        participating: rd.participatingTeams.map(idStr),
        qualified: rd.qualifiedTeams.map(idStr),
        eliminated: rd.eliminatedTeams.map(idStr),
        wildcards: rd.wildcardTeams.map(idStr),
        byes: rd.byeTeams.map(idStr),
        battles: battles
          .filter((b) => idStr(b.round) === idStr(rd._id))
          .map((b) => ({ id: idStr(b._id), battleNumber: b.battleNumber, teamA: idStr(b.teamA), teamB: idStr(b.teamB), scoreA: b.scoreA, scoreB: b.scoreB, winner: idStr(b.winner), status: b.status, createdVia: b.createdVia, isFinal: b.isFinal, winnerOverrideReason: b.winnerOverrideReason })),
        createdAt: rd.createdAt,
        completedAt: rd.completedAt,
      })),
    });
  })
);

r.get('/rounds/wildcard-candidates', asyncH(async (_req, res) => res.json({ candidates: await wildcardCandidates() })));
r.get('/rounds/playoff-seeds', asyncH(async (_req, res) => res.json(await playoffSeeds())));
r.get('/final/default-criteria', (_req, res) => res.json({ criteria: DEFAULT_CRITERIA }));

/* Grand Final video upload — stored on disk, then attached through the normal audited command path. */
r.post(
  '/final/video',
  videoUpload.single('file'),
  asyncH(async (req, res) => {
    if (!req.file) throw new AppError('Choose a video file.', 400);
    try {
      const result = await executeCommand(
        'final.submission',
        { teamId: String(req.body.teamId || ''), url: `/uploads/videos/${req.file.filename}`, fileName: req.file.originalname.slice(0, 120) },
        { user: req.user }
      );
      res.status(201).json({ ok: true, result });
    } catch (e) {
      await fs.unlink(req.file.path).catch(() => {});
      throw e;
    }
  })
);

r.get(
  '/battles',
  asyncH(async (req, res) => {
    const t = await current();
    if (!t) return res.json({ battles: [] });
    const q = { tournament: t._id, status: { $ne: 'cancelled' } };
    if (req.query.round) q.roundNumber = Number(req.query.round);
    const battles = await Battle.find(q).sort({ battleNumber: -1 }).populate('teamA teamB winner', 'teamName').lean();
    res.json({
      battles: battles.map((b) => ({
        id: idStr(b._id), battleNumber: b.battleNumber, roundNumber: b.roundNumber, isFinal: b.isFinal, status: b.status,
        teamA: b.teamA?.teamName, teamB: b.teamB?.teamName, scoreA: b.scoreA, scoreB: b.scoreB, winner: b.winner?.teamName ?? null,
        questions: b.questionResults.length, createdVia: b.createdVia, startedAt: b.startedAt, completedAt: b.completedAt,
      })),
    });
  })
);

r.get(
  '/battles/:id',
  asyncH(async (req, res) => {
    const b = await Battle.findById(req.params.id).populate('teamA teamB winner', 'teamName').populate({ path: 'questions', populate: { path: 'category', select: 'name color' } }).lean();
    if (!b) throw new AppError('Battle not found.', 404);
    const attempts = await AnswerAttempt.find({ battle: b._id }).sort({ createdAt: 1 }).populate('team beneficiary', 'teamName').populate('actor', 'name').lean();
    res.json({ battle: b, attempts });
  })
);

/* ---------------- leaderboards ---------------- */

export async function leaderboardByType(type, round) {
  if (type === 'round') return roundLeaderboard(round ? Number(round) : undefined);
  if (type === 'overall') return overallLeaderboard();
  if (type === 'final') return finalLeaderboard();
  throw new AppError('Unknown leaderboard.', 404);
}
r.get('/leaderboard/:type', asyncH(async (req, res) => res.json(await leaderboardByType(req.params.type, req.query.round))));

/* ---------------- settings + sounds ---------------- */

const settingsBody = z.object({
  buzzSeconds: z.number().int().min(3).max(60),
  answerSeconds: z.number().int().min(3).max(60),
  stealSeconds: z.number().int().min(3).max(60),
  questionsPerBattle: z.number().int().min(1).max(30),
  stealAfterHint: z.boolean(),
  sound: z.object({
    enabled: z.boolean(),
    volume: z.number().min(0).max(1),
    playOnHost: z.boolean(),
    playOnAudience: z.boolean(),
    events: z.record(z.object({ source: z.enum(['builtin', 'custom']), preset: z.string().max(30).default(''), url: z.string().max(300).default('') })),
  }),
});

r.get(
  '/settings',
  asyncH(async (_req, res) => {
    const s = await getSettings();
    res.json({ settings: s.toObject(), soundEvents: SOUND_EVENTS, presets: SOUND_PRESETS });
  })
);

r.put(
  '/settings',
  requireRole('admin', 'host'),
  asyncH(async (req, res) => {
    const body = settingsBody.parse(req.body);
    for (const [k, v] of Object.entries(body.sound.events)) {
      if (!SOUND_EVENTS[k]) delete body.sound.events[k];
      else if (v.source === 'builtin' && !SOUND_PRESETS.includes(v.preset)) throw new AppError(`Unknown sound preset for ${k}.`);
      else if (v.source === 'custom' && !/^\/uploads\/sounds\/[a-z0-9._-]+$/i.test(v.url)) throw new AppError(`Choose an uploaded file for ${k}.`);
    }
    const s = await getSettings();
    Object.assign(s, { ...body, sound: { ...body.sound, events: { ...s.sound.events, ...body.sound.events } } });
    s.markModified('sound');
    await s.save();
    getIO()?.emit('sound:config', publicSoundConfig(s));
    res.json({ settings: s.toObject() });
  })
);

r.post(
  '/settings/buzzer-key',
  requireRole('admin', 'host'),
  asyncH(async (_req, res) => {
    const s = await getSettings();
    s.buzzerKey = token(4);
    await s.save();
    // Disconnect devices that used the old key
    for (const [, sock] of getIO()?.sockets.sockets ?? []) if (sock.data.buzzSide) sock.disconnect(true);
    res.json({ buzzerKey: s.buzzerKey });
  })
);

r.get(
  '/sounds',
  asyncH(async (_req, res) => {
    const files = (await fs.readdir(soundDir).catch(() => [])).filter((f) => AUDIO_EXT.includes(path.extname(f).toLowerCase()));
    res.json({ sounds: files.map((f) => ({ name: f, url: `/uploads/sounds/${f}` })) });
  })
);

r.post(
  '/sounds',
  soundUpload.single('file'),
  asyncH(async (req, res) => {
    if (!req.file) throw new AppError('Choose an audio file.', 400);
    res.status(201).json({ sound: { name: req.file.filename, url: `/uploads/sounds/${req.file.filename}` } });
  })
);

r.delete(
  '/sounds/:name',
  asyncH(async (req, res) => {
    const name = path.basename(req.params.name);
    if (!AUDIO_EXT.includes(path.extname(name).toLowerCase())) throw new AppError('Invalid file.', 400);
    await fs.unlink(path.join(soundDir, name)).catch(() => {
      throw new AppError('File not found.', 404);
    });
    const s = await getSettings();
    let changed = false;
    for (const [k, v] of Object.entries(s.sound.events)) {
      if (v.source === 'custom' && v.url.endsWith(`/${name}`)) {
        s.sound.events[k] = { source: 'builtin', preset: SOUND_EVENTS[k].preset, url: '' };
        changed = true;
      }
    }
    if (changed) {
      s.markModified('sound.events');
      await s.save();
    }
    res.json({ ok: true });
  })
);

r.post('/live/refresh', asyncH(async (_req, res) => {
  await runExclusive(broadcastState);
  res.json({ ok: true });
}));

export default r;
