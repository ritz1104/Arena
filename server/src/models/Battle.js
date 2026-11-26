import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

export const PHASES = ['ready', 'question', 'buzz_open', 'no_buzz', 'answering', 'steal', 'resolved', 'finished'];

const timerSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['buzz', 'answer', 'steal', null], default: null },
    duration: { type: Number, default: 0 },
    endsAt: { type: Date, default: null },
    remainingMs: { type: Number, default: 0 },
    running: { type: Boolean, default: false },
  },
  { _id: false }
);

const liveSchema = new mongoose.Schema(
  {
    phase: { type: String, enum: PHASES, default: 'ready' },
    qIndex: { type: Number, default: 0 },
    stage: { type: String, enum: ['initial', 'hint'], default: 'initial' },
    hintRevealed: { type: Boolean, default: false },
    answerRevealed: { type: Boolean, default: false },
    answeringTeam: { type: ObjectId, ref: 'Team', default: null },
    firstBuzzTeam: { type: ObjectId, ref: 'Team', default: null },
    attemptNumber: { type: Number, default: 0 },
    timeUp: { type: Boolean, default: false },
    outcome: { type: String, default: null },
    timer: { type: timerSchema, default: () => ({}) },
  },
  { _id: false }
);

const questionResultSchema = new mongoose.Schema(
  {
    question: { type: ObjectId, ref: 'Question' },
    index: Number,
    outcome: String,
    pointsA: { type: Number, default: 0 },
    pointsB: { type: Number, default: 0 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const battleSchema = new mongoose.Schema(
  {
    tournament: { type: ObjectId, ref: 'Tournament', required: true, index: true },
    round: { type: ObjectId, ref: 'Round', required: true, index: true },
    roundNumber: { type: Number, required: true },
    battleNumber: { type: Number, required: true },
    teamA: { type: ObjectId, ref: 'Team', required: true },
    teamB: { type: ObjectId, ref: 'Team', required: true },
    questions: [{ type: ObjectId, ref: 'Question' }],
    questionResults: { type: [questionResultSchema], default: [] },
    scoreA: { type: Number, default: 0 },
    scoreB: { type: Number, default: 0 },
    winner: { type: ObjectId, ref: 'Team', default: null },
    loser: { type: ObjectId, ref: 'Team', default: null },
    status: { type: String, enum: ['pending', 'active', 'completed', 'cancelled'], default: 'pending', index: true },
    isFinal: { type: Boolean, default: false },
    createdVia: { type: String, enum: ['wheel', 'manual', 'playoff'], default: 'wheel' },
    config: {
      buzzSeconds: { type: Number, default: 10 },
      answerSeconds: { type: Number, default: 5 },
      stealSeconds: { type: Number, default: 10 },
      stealAfterHint: { type: Boolean, default: false },
    },
    live: { type: liveSchema, default: () => ({}) },
    winnerOverrideReason: { type: String, default: null },
    startedAt: Date,
    completedAt: Date,
  },
  { timestamps: true, optimisticConcurrency: true }
);
battleSchema.index({ tournament: 1, battleNumber: 1 }, { unique: true });

export const Battle = mongoose.model('Battle', battleSchema);
