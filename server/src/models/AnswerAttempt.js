import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

const attemptSchema = new mongoose.Schema(
  {
    tournament: { type: ObjectId, ref: 'Tournament', required: true, index: true },
    round: { type: ObjectId, ref: 'Round', required: true, index: true },
    battle: { type: ObjectId, ref: 'Battle', required: true, index: true },
    question: { type: ObjectId, ref: 'Question', default: null },
    questionIndex: { type: Number, default: null },
    team: { type: ObjectId, ref: 'Team', default: null }, // team that answered (null for adjustments)
    beneficiary: { type: ObjectId, ref: 'Team', default: null }, // team that received the points
    kind: { type: String, enum: ['answer', 'steal', 'adjustment'], required: true },
    answer: { type: String, enum: ['correct', 'wrong', 'timeout', 'adjustment'], required: true },
    isCorrect: { type: Boolean, default: false },
    pointsAwarded: { type: Number, default: 0 },
    attemptNumber: { type: Number, default: 1 },
    stage: { type: String, enum: ['initial', 'hint', null], default: null },
    reason: { type: String, default: null },
    actionId: { type: String, required: true, unique: true },
    actor: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// One result per attempt slot of a question — duplicate scoring is impossible at the DB level.
attemptSchema.index(
  { battle: 1, questionIndex: 1, attemptNumber: 1 },
  { unique: true, partialFilterExpression: { kind: { $in: ['answer', 'steal'] } } }
);

export const AnswerAttempt = mongoose.model('AnswerAttempt', attemptSchema);
