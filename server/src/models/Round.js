import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;
const refs = () => ({ type: [{ type: ObjectId, ref: 'Team' }], default: [] });

const spinSchema = new mongoose.Schema(
  {
    spinId: String,
    segments: [{ teamId: { type: ObjectId, ref: 'Team' }, name: String, _id: false }],
    targetIndex: Number,
    teamId: { type: ObjectId, ref: 'Team' },
    slot: Number,
    battleId: { type: ObjectId, ref: 'Battle', default: null },
    startedAt: Date,
    duration: Number,
  },
  { _id: false }
);

/* Grand Final as a video challenge: problem statement → teams record a solution video → judges score. */
const videoFinalSchema = new mongoose.Schema(
  {
    title: { type: String, default: 'The Grand Final Challenge', maxlength: 140 },
    problem: { type: String, default: '', maxlength: 6000 },
    durationMin: { type: Number, default: 60, min: 1, max: 600 },
    status: { type: String, enum: ['setup', 'working', 'showcase', 'judging', 'results'], default: 'setup' },
    startedAt: Date,
    endsAt: Date,
    pausedRemainingMs: { type: Number, default: null },
    criteria: [{ key: String, name: String, max: Number, _id: false }],
    submissions: [
      {
        team: { type: ObjectId, ref: 'Team' },
        url: { type: String, default: '' }, // uploaded file served from /uploads/videos
        link: { type: String, default: '' }, // external link (YouTube / Drive / etc.)
        fileName: { type: String, default: '' },
        submittedAt: Date,
        _id: false,
      },
    ],
    scores: [
      {
        judge: String,
        team: { type: ObjectId, ref: 'Team' },
        values: { type: Object, default: {} },
        total: Number,
        updatedAt: Date,
        _id: false,
      },
    ],
    showcaseTeam: { type: ObjectId, ref: 'Team', default: null },
    winnerOverrideReason: { type: String, default: null },
  },
  { _id: false, minimize: false }
);

const roundSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['standard', 'semifinal', 'final_video'], default: 'standard' },
    seeds: [{ team: { type: ObjectId, ref: 'Team' }, seed: Number, points: Number, _id: false }],
    videoFinal: { type: videoFinalSchema, default: null },
    tournament: { type: ObjectId, ref: 'Tournament', required: true, index: true },
    roundNumber: { type: Number, required: true },
    participatingTeams: refs(),
    drawnTeams: refs(), // teams already placed in a (non-cancelled) battle this round
    pendingDraw: refs(), // first team selected, waiting for an opponent
    qualifiedTeams: refs(),
    eliminatedTeams: refs(),
    wildcardTeams: refs(),
    byeTeams: refs(),
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
    isFinal: { type: Boolean, default: false },
    questionsPerBattle: { type: Number, default: 5, min: 1, max: 30 },
    lastSpin: { type: spinSchema, default: null },
    completedAt: Date,
  },
  { timestamps: true }
);
roundSchema.index({ tournament: 1, roundNumber: 1 }, { unique: true });

export const Round = mongoose.model('Round', roundSchema);
