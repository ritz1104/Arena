import { Router } from 'express';
import { asyncH } from '../utils/errors.js';
import { getSnapshot } from '../services/broadcast.js';
import { getSettings, publicSoundConfig } from '../models/index.js';
import { leaderboardByType } from './arena.js';

/** Read-only, audience-safe endpoints. Nothing here exposes answers or allows changes. */
const r = Router();

r.get('/state', asyncH(async (_req, res) => res.json((await getSnapshot()).pub)));
r.get('/sound', asyncH(async (_req, res) => res.json(publicSoundConfig(await getSettings()))));
r.get('/leaderboard/:type', asyncH(async (req, res) => res.json(await leaderboardByType(req.params.type, req.query.round))));

export default r;
