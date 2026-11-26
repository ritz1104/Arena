import mongoose from 'mongoose';
import crypto from 'node:crypto';

export const SOUND_EVENTS = {
  wheelSpin: { label: 'Wheel starts', preset: 'roulette' },
  wheelStop: { label: 'Wheel stops', preset: 'stopHit' },
  teamSelected: { label: 'Team selected', preset: 'reveal' },
  battleStart: { label: 'Battle starts', preset: 'countdown' },
  question: { label: 'Question appears', preset: 'pop' },
  buzz: { label: 'Buzzer pressed', preset: 'buzzer' },
  correct: { label: 'Correct answer', preset: 'victory' },
  wrong: { label: 'Wrong answer', preset: 'fail' },
  hint: { label: 'Hint revealed', preset: 'mystery' },
  timeUp: { label: 'Time up', preset: 'timeUp' },
  tick: { label: 'Countdown tick', preset: 'tick' },
  eliminated: { label: 'Team eliminated', preset: 'elimination' },
  leaderboard: { label: 'Leaderboard changes', preset: 'notify' },
  champion: { label: 'Final winner', preset: 'champion' },
};

export const SOUND_PRESETS = [
  'roulette', 'stopHit', 'reveal', 'countdown', 'pop', 'buzzer', 'victory',
  'fail', 'mystery', 'timeUp', 'tick', 'elimination', 'notify', 'champion', 'none',
];

const defaultSoundEvents = () =>
  Object.fromEntries(Object.entries(SOUND_EVENTS).map(([k, v]) => [k, { source: 'builtin', preset: v.preset, url: '' }]));

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true },
    buzzSeconds: { type: Number, default: 10, min: 3, max: 60 },
    answerSeconds: { type: Number, default: 5, min: 3, max: 60 },
    stealSeconds: { type: Number, default: 10, min: 3, max: 60 },
    questionsPerBattle: { type: Number, default: 5, min: 1, max: 30 },
    stealAfterHint: { type: Boolean, default: false },
    buzzerKey: { type: String, default: () => crypto.randomBytes(4).toString('hex') },
    sound: {
      enabled: { type: Boolean, default: true },
      volume: { type: Number, default: 0.8, min: 0, max: 1 },
      playOnHost: { type: Boolean, default: false },
      playOnAudience: { type: Boolean, default: true },
      events: { type: Object, default: defaultSoundEvents },
    },
  },
  { timestamps: true, minimize: false }
);

export const Setting = mongoose.model('Setting', settingSchema);

export async function getSettings() {
  let s = await Setting.findOne({ key: 'global' });
  if (!s) s = await Setting.create({ key: 'global' });
  const current = s.sound?.events || {};
  const missing = Object.keys(SOUND_EVENTS).filter((k) => !current[k]);
  if (missing.length) {
    s.sound.events = { ...defaultSoundEvents(), ...current };
    s.markModified('sound.events');
    await s.save();
  }
  return s;
}

export function publicSoundConfig(s) {
  return {
    enabled: s.sound.enabled,
    volume: s.sound.volume,
    playOnHost: s.sound.playOnHost,
    playOnAudience: s.sound.playOnAudience,
    events: s.sound.events,
  };
}
