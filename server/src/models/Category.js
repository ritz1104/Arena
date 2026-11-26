import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    key: { type: String, unique: true },
    color: { type: String, default: '#CC8B65' },
  },
  { timestamps: true }
);

categorySchema.pre('validate', function k(next) {
  this.key = String(this.name || '').trim().toLowerCase();
  next();
});

export const DEFAULT_CATEGORIES = [
  { name: 'HTML Fundamentals', color: '#CC8B65' },
  { name: 'CSS Fundamentals', color: '#7FB3A6' },
  { name: 'JavaScript Fundamentals', color: '#E6B98F' },
  { name: 'JavaScript DOM Manipulation', color: '#6FBF9C' },
  { name: 'Computer Networks', color: '#D97A62' },
  { name: 'Web Development Fundamentals', color: '#D6CEC3' },
];

export async function ensureDefaultCategories() {
  for (const c of DEFAULT_CATEGORIES) {
    await Category.updateOne({ key: c.name.toLowerCase() }, { $setOnInsert: { ...c, key: c.name.toLowerCase() } }, { upsert: true });
  }
}

export const Category = mongoose.model('Category', categorySchema);
