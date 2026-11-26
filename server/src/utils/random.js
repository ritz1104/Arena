import crypto from 'node:crypto';

export const randomInt = (max) => crypto.randomInt(max);
export const token = (bytes = 6) => crypto.randomBytes(bytes).toString('hex');
export const uuid = () => crypto.randomUUID();
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const idEq = (a, b) => a != null && b != null && String(a?._id ?? a) === String(b?._id ?? b);
export const idStr = (a) => (a == null ? null : String(a?._id ?? a));
