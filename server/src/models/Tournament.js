import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

export const SCENES = [
  'standby',
  'wheel',
  'versus',
  'battle',
  'leaderboard_round',
  'leaderboard_overall',
  'leaderboard_final',
  'final',
  'champion',
];

const tournamentSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Buzz or Lose – The Arena', trim: true, maxlength: 100 },
    status: { type: String, enum: ['active', 'completed', 'archived'], default: 'active', index: true },
    currentRound: { type: Number, default: 1 },
    settings: { type: Object, default: {} },
    createdBy: { type: ObjectId, ref: 'User' },
    scene: { type: String, enum: SCENES, default: 'standby' },
    activeBattle: { type: ObjectId, ref: 'Battle', default: null },
    displayBattle: { type: ObjectId, ref: 'Battle', default: null },
    battleCounter: { type: Number, default: 0 },
    champion: { type: ObjectId, ref: 'Team', default: null },
    runnerUp: { type: ObjectId, ref: 'Team', default: null },
    championAnnouncedAt: { type: Date, default: null },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Tournament = mongoose.model('Tournament', tournamentSchema);
