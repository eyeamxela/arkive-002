import { useEffect, useState } from 'react';
import type { PersonalNodeClient, RunProgress } from './api';

/** One feed per workspace; replace snapshots rather than append/replay private state. */
export function useRunFeed(client: PersonalNodeClient, enabled: boolean) {
  const [value, setValue] = useState<{ runs: RunProgress[]; connected: boolean }>({ runs: [], connected: false });
  useEffect(() => {
    let disposed = false; let timer: ReturnType<typeof setTimeout> | undefined; let current: AbortController | undefined;
    const clear = () => { current?.abort(); clearTimeout(timer); setValue({ runs: [], connected: false }); };
    const start = async () => {
      if (disposed || !enabled || document.visibilityState === 'hidden') return;
      const controller = new AbortController(); current = controller;
      try { await client.watchRuns(runs => { if (!disposed && !controller.signal.aborted) setValue({ runs, connected: true }); }, controller.signal); }
      catch { if (!disposed && !controller.signal.aborted) setValue({ runs: [], connected: false }); }
      finally { if (!disposed && !controller.signal.aborted) timer = setTimeout(() => void start(), 1500); }
    };
    const visibility = () => { clear(); if (document.visibilityState !== 'hidden') void start(); };
    setValue({ runs: [], connected: false }); void start();
    document.addEventListener('visibilitychange', visibility);
    return () => { disposed = true; current?.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visibility); };
  }, [client, enabled]);
  return value;
}
