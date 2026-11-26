import mongoose from 'mongoose';

export const TEAM_STATUSES = ['active', 'qualified', 'eliminated', 'champion'];
export const normalizeName = (s = '') => String(s).trim().replace(/\s+/g, ' ').toLowerCase();

const memberSchema = new mongoose.Schema(
  { name: { type: String, trim: true, maxlength: 60, required: true } },
  { _id: false }
);

const teamSchema = new mongoose.Schema(
  {
    teamName: { type: String, required: [true, 'Team name is required'], trim: true, maxlength: 60 },
    nameKey: { type: String, unique: true, index: true },
    members: {
      type: [memberSchema],
      default: [],
      validate: { validator: (v) => v.length <= 4, message: 'A team can have at most 4 members' },
    },
    totalScore: { type: Number, default: 0 },
    currentRound: { type: Number, default: 0 },
    status: { type: String, enum: TEAM_STATUSES, default: 'active', index: true },
    isWildcard: { type: Boolean, default: false },
  },
  { timestamps: true }
);

teamSchema.pre('validate', function key(next) {
  this.teamName = String(this.teamName || '').trim().replace(/\s+/g, ' ');
  this.nameKey = normalizeName(this.teamName);
  next();
});

export const Team = mongoose.model('Team', teamSchema);
