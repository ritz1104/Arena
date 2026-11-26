import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { AppError } from '../utils/errors.js';

const DATA_EXT = ['.csv', '.xlsx', '.pdf', '.txt'];
const AUDIO_EXT = ['.mp3', '.wav', '.ogg', '.m4a', '.webm'];

/** Team / question import: kept in memory, parsed, never written to disk. */
export const dataUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const e = path.extname(file.originalname).toLowerCase();
    if (!DATA_EXT.includes(e)) return cb(new AppError('Only .csv, .xlsx or .pdf files are allowed.', 415));
    cb(null, true);
  },
});

const soundDir = path.join(config.uploadDir, 'sounds');
fs.mkdirSync(soundDir, { recursive: true });

export const soundUpload = multer({
  storage: multer.diskStorage({
    destination: soundDir,
    filename: (_req, file, cb) => {
      const e = path.extname(file.originalname).toLowerCase();
      const base = path
        .basename(file.originalname, e)
        .replace(/[^a-z0-9-_]+/gi, '-')
        .slice(0, 40)
        .toLowerCase();
      cb(null, `${base || 'sound'}-${crypto.randomBytes(3).toString('hex')}${e}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const e = path.extname(file.originalname).toLowerCase();
    if (!AUDIO_EXT.includes(e) || !/^audio\/|^video\/webm/.test(file.mimetype)) {
      return cb(new AppError('Only audio files (.mp3, .wav, .ogg, .m4a, .webm) are allowed.', 415));
    }
    cb(null, true);
  },
});

const videoDir = path.join(config.uploadDir, 'videos');
fs.mkdirSync(videoDir, { recursive: true });
const VIDEO_EXT = ['.mp4', '.webm', '.mov', '.m4v'];

/** Grand Final solution videos (played on the projector; served with HTTP range support). */
export const videoUpload = multer({
  storage: multer.diskStorage({
    destination: videoDir,
    filename: (_req, file, cb) => cb(null, `final-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 1024 * 1024 * 1024, files: 1 }, // 1 GB
  fileFilter: (_req, file, cb) => {
    const e = path.extname(file.originalname).toLowerCase();
    if (!VIDEO_EXT.includes(e) || !/^video\//.test(file.mimetype)) return cb(new AppError('Only video files (.mp4, .webm, .mov, .m4v) are allowed.', 415));
    cb(null, true);
  },
});

export { soundDir, AUDIO_EXT, videoDir };
