import { useRef, useState } from 'react';

// UI feedback only; authorization and idempotence still belong on the server.
export function useMutationFeedback() {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (lock.current) return false;
    lock.current = true;
    setPending(true);
    setError(null);
    try { await action(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The change failed. Please retry.'); return false; }
    finally { lock.current = false; setPending(false); }
  };
  return { pending, error, run };
}
