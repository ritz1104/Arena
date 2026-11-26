import { Router } from 'express';
import { z } from 'zod';
import { Question, Category, Battle, Tournament } from '../models/index.js';
import { asyncH, AppError } from '../utils/errors.js';
import { dataUpload } from '../middleware/upload.js';
import { parseQuestionsFile, validateQuestionRows } from '../services/importers.js';
import { idStr } from '../utils/random.js';

export const questions = Router();
export const categories = Router();

const qBody = z.object({
  questionText: z.string().trim().min(1, 'Question text is required').max(1000),
  category: z.string().min(1, 'Category is required'),
  hint: z.string().trim().max(500).default(''),
  correctAnswer: z.string().trim().min(1, 'Correct answer is required').max(500),
  explanation: z.string().trim().max(1000).default(''),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']).default('Medium'),
  isActive: z.boolean().default(true),
  rounds: z.array(z.number().int().min(1).max(99)).max(20).default([]),
});

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function usedInCurrentTournament() {
  const t = await Tournament.findOne({ status: { $in: ['active', 'completed'] } }).sort({ createdAt: -1 }).lean();
  if (!t) return new Set();
  const ids = await Battle.distinct('questions', { tournament: t._id, status: { $in: ['active', 'completed'] } });
  return new Set(ids.map(idStr));
}

questions.get(
  '/',
  asyncH(async (req, res) => {
    const { category, difficulty, search, active } = req.query;
    const q = {};
    if (category) q.category = category;
    if (difficulty) q.difficulty = difficulty;
    if (active === 'true') q.isActive = true;
    if (active === 'false') q.isActive = false;
    if (search) q.questionText = { $regex: esc(String(search)), $options: 'i' };
    const [list, used] = await Promise.all([Question.find(q).populate('category', 'name color').sort({ createdAt: -1 }).lean(), usedInCurrentTournament()]);
    res.json({ questions: list.map((x) => ({ ...x, id: idStr(x._id), used: used.has(idStr(x._id)) })) });
  })
);

questions.get(
  '/stats',
  asyncH(async (_req, res) => {
    const [all, used] = await Promise.all([Question.find().select('isActive difficulty category rounds').lean(), usedInCurrentTournament()]);
    res.json({
      total: all.length,
      active: all.filter((q) => q.isActive).length,
      availableNow: all.filter((q) => q.isActive && !used.has(idStr(q._id))).length,
      used: used.size,
      byDifficulty: ['Easy', 'Medium', 'Hard'].map((d) => ({ difficulty: d, count: all.filter((q) => q.difficulty === d).length })),
    });
  })
);

questions.post(
  '/',
  asyncH(async (req, res) => {
    const body = qBody.parse(req.body);
    if (!(await Category.exists({ _id: body.category }))) throw new AppError('Choose a valid category.', 400);
    const q = await Question.create(body);
    res.status(201).json({ question: q });
  })
);

questions.put(
  '/:id',
  asyncH(async (req, res) => {
    const body = qBody.parse(req.body);
    if (!(await Category.exists({ _id: body.category }))) throw new AppError('Choose a valid category.', 400);
    const q = await Question.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    if (!q) throw new AppError('Question not found.', 404);
    res.json({ question: q });
  })
);

questions.patch(
  '/:id/active',
  asyncH(async (req, res) => {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const q = await Question.findByIdAndUpdate(req.params.id, { isActive }, { new: true });
    if (!q) throw new AppError('Question not found.', 404);
    res.json({ question: q });
  })
);

questions.post(
  '/assign-rounds',
  asyncH(async (req, res) => {
    const { ids, rounds } = z.object({ ids: z.array(z.string()).min(1).max(1000), rounds: z.array(z.number().int().min(1).max(99)).max(20) }).parse(req.body);
    const r = await Question.updateMany({ _id: { $in: ids } }, { rounds });
    res.json({ updated: r.modifiedCount });
  })
);

questions.delete(
  '/:id',
  asyncH(async (req, res) => {
    const used = await Battle.exists({ questions: req.params.id, status: { $in: ['active', 'completed'] } });
    if (used) throw new AppError('This question has been used in a battle. Deactivate it instead so history stays intact.', 409);
    const q = await Question.findByIdAndDelete(req.params.id);
    if (!q) throw new AppError('Question not found.', 404);
    res.json({ ok: true });
  })
);

questions.post(
  '/import/preview',
  dataUpload.single('file'),
  asyncH(async (req, res) => {
    if (!req.file) throw new AppError('Choose a file to import.', 400);
    res.json({ rows: await parseQuestionsFile(req.file), fileName: req.file.originalname });
  })
);

questions.post(
  '/bulk',
  asyncH(async (req, res) => {
    const { rows: input } = z.object({ rows: z.array(z.record(z.any())).min(1).max(1000) }).parse(req.body);
    const rows = await validateQuestionRows(input);
    if (rows.some((x) => x.errors.length)) return res.status(422).json({ error: 'Some rows are invalid. Fix them and confirm again.', rows });
    const catIds = new Map();
    for (const name of [...new Set(rows.map((x) => x.category))]) {
      const key = name.toLowerCase();
      let c = await Category.findOne({ key });
      if (!c) c = await Category.create({ name });
      catIds.set(key, c._id);
    }
    const docs = await Question.insertMany(
      rows.map((x) => ({
        questionText: x.questionText,
        category: catIds.get(x.category.toLowerCase()),
        hint: x.hint,
        correctAnswer: x.correctAnswer,
        explanation: x.explanation,
        difficulty: x.difficulty,
        rounds: x.rounds,
      }))
    );
    res.status(201).json({ created: docs.length });
  })
);

/* ---------------- categories ---------------- */

categories.get(
  '/',
  asyncH(async (_req, res) => {
    const [cats, counts] = await Promise.all([
      Category.find().sort({ createdAt: 1 }).lean(),
      Question.aggregate([{ $group: { _id: '$category', count: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } }]),
    ]);
    const m = new Map(counts.map((c) => [idStr(c._id), c]));
    res.json({ categories: cats.map((c) => ({ ...c, id: idStr(c._id), count: m.get(idStr(c._id))?.count ?? 0, active: m.get(idStr(c._id))?.active ?? 0 })) });
  })
);

const catBody = z.object({ name: z.string().trim().min(1).max(60), color: z.string().regex(/^#[0-9a-f]{6}$/i).default('#CC8B65') });

categories.post(
  '/',
  asyncH(async (req, res) => {
    const body = catBody.parse(req.body);
    if (await Category.exists({ key: body.name.toLowerCase() })) throw new AppError('That category already exists.', 409);
    res.status(201).json({ category: await Category.create(body) });
  })
);

categories.put(
  '/:id',
  asyncH(async (req, res) => {
    const body = catBody.parse(req.body);
    const c = await Category.findById(req.params.id);
    if (!c) throw new AppError('Category not found.', 404);
    c.name = body.name;
    c.color = body.color;
    await c.save();
    res.json({ category: c });
  })
);

categories.delete(
  '/:id',
  asyncH(async (req, res) => {
    if (await Question.exists({ category: req.params.id })) throw new AppError('Move or delete the questions in this category first.', 409);
    await Category.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  })
);
