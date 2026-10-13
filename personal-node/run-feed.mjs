import { setTimeout as delay } from 'node:timers/promises';

/** Bounded NDJSON snapshots of durable events, never prompts, sources, results or credentials. */
export async function streamRunEvents(req, res, { snapshot, signal, interval = 1000 }) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  res.once('close', stop); signal.addEventListener('abort', stop, { once: true });
  let previous = ''; let ticks = 0;
  try {
    if (signal.aborted) return;
    // Authorize before sending a successful response, then again for every snapshot.
    let state = await snapshot();
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no' });
    while (!controller.signal.aborted) {
      const runs = state.governance.runs.slice(-50).map(run => ({ id: run.id, roomId: run.roomId, state: run.state,
        updatedAt: run.updatedAt, events: (run.events || []).map((event, index) => ({ ...event, id: `${run.id}:${index}` })) }));
      const payload = JSON.stringify({ type: 'snapshot', runs });
      if (payload !== previous || ticks % 10 === 0) {
        if (!res.write(`${payload}\n`)) break; // Drop slow consumers; reconnect reads a fresh durable snapshot.
        previous = payload;
      }
      if (++ticks >= 25) break; // Periodic reconnect also releases per-member request quota.
      await delay(interval, undefined, { signal: controller.signal });
      state = await snapshot();
    }
  } catch (error) {
    if (!res.headersSent) throw error;
    if (!controller.signal.aborted) res.write(`${JSON.stringify({ type: 'unavailable' })}\n`);
  } finally {
    signal.removeEventListener('abort', stop); res.off('close', stop);
    if (res.headersSent) res.end();
  }
}
