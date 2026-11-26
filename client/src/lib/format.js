export const pad2 = (n) => String(n).padStart(2, '0');

export function timeAgo(date) {
  const s = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(date).toLocaleDateString();
}

export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');

export const STATUS_LABEL = {
  active: 'Active',
  qualified: 'Qualified',
  eliminated: 'Eliminated',
  champion: 'Champion',
  bye: 'Bye',
};

export const OUTCOME_LABEL = {
  correct: 'Correct',
  steal_correct: 'Stolen',
  steal_failed: 'Steal missed',
  wrong: 'Wrong',
  skipped: 'Skipped',
  skipped_no_buzz: 'No buzz',
};

export const PHASE_LABEL = {
  ready: 'Get ready',
  question: 'Question on screen',
  buzz_open: 'Buzzers open',
  no_buzz: 'No buzz',
  answering: 'Answering',
  steal: 'Steal chance',
  resolved: 'Resolved',
  finished: 'Battle over',
};

export const SEGMENT_COLORS = [
  ['#CC8B65', '#8A5434'],
  ['#2C7A63', '#01382C'],
  ['#6FBF9C', '#2E7D5E'],
  ['#E6B98F', '#B87348'],
  ['#C4583F', '#9E3F2B'],
  ['#7FB3A6', '#4E7F73'],
  ['#B9786E', '#8E5149'],
  ['#A8B88A', '#6E7D52'],
];
