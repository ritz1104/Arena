import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema(
  {
    tournament: { type: mongoose.Schema.Types.ObjectId, ref: 'Tournament', default: null, index: true },
    eventType: { type: String, required: true, index: true },
    message: { type: String, default: '' },
    eventData: { type: Object, default: {} },
    audit: { type: Boolean, default: false },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
eventSchema.index({ createdAt: -1 });

export const TournamentEvent = mongoose.model('TournamentEvent', eventSchema);
