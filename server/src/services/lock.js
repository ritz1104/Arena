/**
 * Global serial command queue.
 * Every state-changing operation (host commands, buzzer presses, timer expiries)
 * runs strictly one at a time. Combined with phase checks this guarantees that
 * simultaneous buzzes resolve to exactly one winner and results are never applied twice.
 */
let chain = Promise.resolve();

export function runExclusive(fn) {
  const run = chain.then(() => fn());
  chain = run.catch(() => {});
  return run;
}
