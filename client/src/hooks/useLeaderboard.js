import { useEffect, useState } from 'react';
import { useLive } from '../context/LiveContext.jsx';

/** Fetches a leaderboard (public endpoint) and refreshes whenever scores change. */
export function useLeaderboard(type, round) {
  const { lbVersion, state } = useLive() || {};
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const champion = state?.tournament?.champion;
  const currentRound = state?.tournament?.currentRound;

  useEffect(() => {
    const ctrl = new AbortController();
    const q = round ? `?round=${round}` : '';
    fetch(`/api/public/leaderboard/${type}${q}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => e.name !== 'AbortError' && setError('Could not load the leaderboard.'));
    return () => ctrl.abort();
  }, [type, round, lbVersion, champion, currentRound]);

  return { data, error };
}
