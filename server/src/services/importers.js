import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import { Team, Category, normalizeName } from '../models/index.js';
import { AppError } from '../utils/errors.js';

const MAX_MEMBERS = 4;
const ext = (name = '') => name.toLowerCase().split('.').pop();
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/* ---------------- generic table readers ---------------- */

function cellText(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if (v.text) return String(v.text);
    if (v.result != null) return String(v.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
  }
  return String(v);
}

async function readRows(buffer, filename) {
  const e = ext(filename);
  if (e === 'csv' || e === 'txt') {
    const parsed = Papa.parse(buffer.toString('utf8').replace(/^﻿/, ''), { skipEmptyLines: 'greedy' });
    return parsed.data.map((r) => r.map(clean));
  }
  if (e === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws) return [];
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = [];
      for (let c = 1; c <= row.cellCount; c++) vals.push(clean(cellText(row.getCell(c).value)));
      if (vals.some(Boolean)) rows.push(vals);
    });
    return rows;
  }
  throw new AppError('Unsupported file type. Upload a .csv or .xlsx file.', 415);
}

/* ---------------- teams ---------------- */

const isTeamHeader = (s) => /^(team|group|squad)(\s*name)?$/i.test(s);
const isMemberHeader = (s) => /^(member|participant|student|player|name)s?\s*\d*$/i.test(s) || /^member\s*name/i.test(s);
const isSerial = (s) => /^(s\.?\s*no\.?|sr\.?\s*no\.?|#|no\.?|\d+[.)]?)$/i.test(s);

function rowsToTeams(rows) {
  if (!rows.length) return [];
  let teamCol = 0;
  let memberCols = null;
  let start = 0;
  const header = rows[0].map((h) => h.toLowerCase());
  const tIdx = header.findIndex((h) => /team|group|squad/.test(h));
  if (tIdx !== -1 && header.some((h, i) => i !== tIdx && isMemberHeader(h))) {
    teamCol = tIdx;
    memberCols = header.map((h, i) => (i !== tIdx && (isMemberHeader(h) || /member|participant|student|player/.test(h)) ? i : -1)).filter((i) => i >= 0);
    start = 1;
  } else if (tIdx !== -1 && rows[0].length === 1 && isTeamHeader(rows[0][0])) {
    start = 1;
  }
  const out = [];
  for (const r of rows.slice(start)) {
    let cells = [...r];
    if (memberCols == null) {
      while (cells.length && (isSerial(cells[0]) || !cells[0])) cells.shift();
      const [teamName, ...members] = cells;
      out.push({ teamName: clean(teamName), members: members.map(clean).filter(Boolean) });
    } else {
      out.push({ teamName: clean(cells[teamCol]), members: memberCols.map((i) => clean(cells[i])).filter(Boolean) });
    }
  }
  return out;
}

/** Heuristic PDF text parser — handles "Team: X" blocks, "X: a, b, c" lines, bullets and table-like rows. */
export function parseTeamText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/ /g, ' ').trim()).filter(Boolean);
  const teams = [];
  let current = null;
  const startTeam = (name, explicit) => {
    current = { teamName: clean(name), members: [], explicit };
    teams.push(current);
  };
  const splitMembers = (s) => s.split(/\s*[,;|]\s*|\s+&\s+|\s+and\s+/i).map(clean).filter(Boolean);

  for (let line of lines) {
    if (/^page\s+\d+(\s+of\s+\d+)?$/i.test(line)) continue;
    const cells = line.split(/\t+|\s{3,}/).map(clean).filter(Boolean);
    const lower = line.toLowerCase();
    // header row of a table
    if (cells.length >= 2 && cells.every((c) => isTeamHeader(c) || isMemberHeader(c) || isSerial(c))) continue;
    if (/^(team\s*list|registered\s*teams|participants?)$/i.test(line)) continue;
    if (/\b(registered\s+teams|team\s+list|list\s+of\s+teams|participant\s+list)\b/i.test(line)) continue; // document titles

    const kv = line.match(/^(.{1,60}?)\s*[:\-–—]\s+(.+)$/) || line.match(/^(.{1,60}?)\s*:\s*(.+)$/);
    if (kv) {
      const left = kv[1].replace(/^\d+[.)]\s*/, '').trim();
      const right = kv[2].trim();
      if (/^(team|group|squad)(\s*name)?(\s*(no\.?|#)?\s*\d+)?$/i.test(left)) {
        startTeam(right, true);
        continue;
      }
      if (/^(member|participant|student|player|leader|captain|name)s?(\s*\d+)?$/i.test(left)) {
        if (!current) startTeam('', true);
        current.members.push(...splitMembers(right));
        continue;
      }
      if (/[,;|&]/.test(right) || /\band\b/i.test(right) || !current?.explicit) {
        startTeam(left, false);
        current.members.push(...splitMembers(right));
        current = null;
        continue;
      }
    }
    if (cells.length >= 2) {
      while (cells.length && isSerial(cells[0])) cells.shift();
      if (cells.length >= 1) {
        startTeam(cells[0], false);
        current.members.push(...cells.slice(1).flatMap(splitMembers));
        current = null;
        continue;
      }
    }
    const bullet = line.match(/^(?:\d+[.)]|[-•*▪●◦])\s+(.+)$/);
    if (bullet && current?.explicit) {
      current.members.push(...splitMembers(bullet[1]));
      continue;
    }
    if (/^(team|group|squad)\b/i.test(lower) && !/[,;|]/.test(line)) {
      startTeam(line, true);
      continue;
    }
    if (current?.explicit) {
      current.members.push(...splitMembers(line));
      continue;
    }
    startTeam(bullet ? bullet[1] : line, false);
    current = null;
  }
  return teams.map(({ teamName, members }) => ({ teamName, members }));
}

/** Merge duplicate team rows (one-row-per-member files) and validate everything. */
export async function validateTeamRows(rawTeams, { mergeDuplicates = true } = {}) {
  const merged = [];
  const index = new Map();
  for (const t of rawTeams) {
    const key = normalizeName(t.teamName);
    if (mergeDuplicates && key && index.has(key)) {
      const prev = index.get(key);
      for (const m of t.members) if (!prev.members.some((x) => x.toLowerCase() === m.toLowerCase())) prev.members.push(m);
      continue;
    }
    const row = { teamName: clean(t.teamName), members: (t.members || []).map(clean).filter(Boolean) };
    merged.push(row);
    if (key) index.set(key, row);
  }

  const existing = await Team.find({ nameKey: { $in: merged.map((r) => normalizeName(r.teamName)) } }).select('nameKey').lean();
  const existingKeys = new Set(existing.map((e) => e.nameKey));
  const seen = new Map();
  return merged.map((r, i) => {
    const errors = [];
    const key = normalizeName(r.teamName);
    if (!key) errors.push('Team name is required');
    if (r.teamName.length > 60) errors.push('Team name is longer than 60 characters');
    if (key && existingKeys.has(key)) errors.push('A team with this name is already registered');
    if (key && seen.has(key)) errors.push(`Duplicate of row ${seen.get(key) + 1}`);
    if (r.members.length > MAX_MEMBERS) errors.push(`Has ${r.members.length} members (maximum ${MAX_MEMBERS})`);
    if (r.members.some((m) => m.length > 60)) errors.push('A member name is longer than 60 characters');
    if (key && !seen.has(key)) seen.set(key, i);
    return { row: i + 1, teamName: r.teamName, members: r.members, errors };
  });
}

export async function parseTeamsFile(file) {
  const e = ext(file.originalname);
  let teams;
  if (e === 'pdf') {
    // pdf-parse bundles several pdf.js builds; some PDF generators only parse in one of them.
    let data = null;
    for (const version of ['v1.10.100', 'v2.0.550', 'v1.10.88', 'v1.9.426']) {
      try {
        data = await pdf(file.buffer, { version });
        break;
      } catch {
        /* try the next pdf.js build */
      }
    }
    if (!data) throw new AppError('Could not read that PDF. Make sure it is a text-based (not scanned) PDF.', 422);
    teams = parseTeamText(data.text || '');
  } else {
    teams = rowsToTeams(await readRows(file.buffer, file.originalname));
  }
  teams = teams.filter((t) => t.teamName || t.members.length);
  if (!teams.length) throw new AppError('No team records were found in that file.', 422);
  if (teams.length > 500) throw new AppError('That file contains too many records (max 500).', 422);
  return validateTeamRows(teams);
}

/* ---------------- questions ---------------- */

const QCOLS = {
  questionText: /^(question|question\s*text|questiontext|q)$/i,
  category: /^(category|topic|section)$/i,
  hint: /^hint$/i,
  correctAnswer: /^(answer|correct\s*answer|correctanswer|solution)$/i,
  difficulty: /^(difficulty|level)$/i,
  explanation: /^(explanation|notes?)$/i,
  rounds: /^(rounds?|round\s*numbers?)$/i,
};

export function normalizeDifficulty(v) {
  const s = clean(v).toLowerCase();
  if (!s) return 'Medium';
  if (s.startsWith('e')) return 'Easy';
  if (s.startsWith('h')) return 'Hard';
  if (s.startsWith('m')) return 'Medium';
  return null;
}

export const parseRounds = (v) =>
  [...new Set(String(v ?? '').split(/[,\s;]+/).map((x) => Number.parseInt(x, 10)).filter((n) => Number.isInteger(n) && n > 0 && n < 100))];

export async function validateQuestionRows(rows) {
  const cats = await Category.find().lean();
  const byKey = new Map(cats.map((c) => [c.key, c]));
  return rows.map((r, i) => {
    const errors = [];
    const warnings = [];
    const q = {
      questionText: clean(r.questionText),
      category: clean(r.category),
      hint: clean(r.hint),
      correctAnswer: clean(r.correctAnswer),
      difficulty: normalizeDifficulty(r.difficulty),
      explanation: clean(r.explanation),
      rounds: Array.isArray(r.rounds) ? r.rounds : parseRounds(r.rounds),
    };
    if (!q.questionText) errors.push('Question text is required');
    if (!q.correctAnswer) errors.push('Correct answer is required');
    if (!q.category) errors.push('Category is required');
    else if (!byKey.has(q.category.toLowerCase())) warnings.push(`New category "${q.category}" will be created`);
    if (!q.difficulty) {
      errors.push('Difficulty must be Easy, Medium or Hard');
      q.difficulty = 'Medium';
    }
    if (q.questionText.length > 1000) errors.push('Question text is too long');
    return { row: i + 1, ...q, errors, warnings };
  });
}

export async function parseQuestionsFile(file) {
  const rows = await readRows(file.buffer, file.originalname);
  if (rows.length < 2) throw new AppError('The file needs a header row and at least one question.', 422);
  const header = rows[0];
  const map = {};
  header.forEach((h, i) => {
    for (const [k, re] of Object.entries(QCOLS)) if (re.test(clean(h)) && map[k] == null) map[k] = i;
  });
  if (map.questionText == null || map.correctAnswer == null) {
    throw new AppError('Header row must include at least "Question" and "Answer" columns.', 422);
  }
  const records = rows.slice(1).map((r) => Object.fromEntries(Object.entries(map).map(([k, i]) => [k, r[i] ?? ''])));
  if (records.length > 1000) throw new AppError('Too many rows (max 1000).', 422);
  return validateQuestionRows(records);
}
