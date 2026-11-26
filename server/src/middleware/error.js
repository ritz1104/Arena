import mongoose from 'mongoose';
import multer from 'multer';
import { ZodError } from 'zod';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ') });
  }
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : err.message;
    return res.status(413).json({ error: msg });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ error: Object.values(err.errors).map((e) => e.message).join('; ') });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: 'Invalid identifier.' });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: 'That record already exists.' });
  }
  if (err?.status) return res.status(err.status).json({ error: err.message, code: err.code });
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong on the server.' });
}
