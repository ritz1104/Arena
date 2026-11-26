import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema(
  {
    questionText: { type: String, required: true, trim: true, maxlength: 1000 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    hint: { type: String, trim: true, default: '', maxlength: 500 },
    correctAnswer: { type: String, required: true, trim: true, maxlength: 500 },
    explanation: { type: String, trim: true, default: '', maxlength: 1000 },
    difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
    isActive: { type: Boolean, default: true, index: true },
    rounds: { type: [Number], default: [] }, // empty = available for any round
  },
  { timestamps: true }
);

export const Question = mongoose.model('Question', questionSchema);
