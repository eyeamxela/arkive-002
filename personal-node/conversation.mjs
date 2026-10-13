import { createHash } from 'node:crypto';

export const HISTORY_TURNS = 8;
export const HISTORY_CHARACTERS = 32000;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = () => { throw Object.assign(new Error('Conversation inputs changed or are invalid; request a new run'), { code: 'HISTORY_STALE', status: 409 }); };
const sessionKey = run => hash([run.roomId, run.principalId, run.scopeHash, run.bindings, run.providerFingerprint]);
const messages = runs => runs.flatMap(run => [{ role: 'user', content: run.prompt }, { role: 'assistant', content: run.result }]);

/** Select only durable, completed receipts under the exact current authority and model. */
export function pinConversation(runs, run) {
  const eligible = runs.filter(prior => prior.state === 'completed' && sessionKey(prior) === sessionKey(run));
  const selected = [];
  for (const prior of eligible.slice().reverse()) {
    if (selected.length >= HISTORY_TURNS) break;
    const next = [prior, ...selected];
    if (JSON.stringify(messages(next)).length > HISTORY_CHARACTERS) break;
    selected.unshift(prior);
  }
  const history = messages(selected);
  return { version: 1, sessionKey: sessionKey(run), runIds: selected.map(prior => prior.id), digest: hash(history), characters: JSON.stringify(history).length };
}

export function validateConversation(value, run) {
  if (!value || Object.keys(value).some(key => !['version', 'sessionKey', 'runIds', 'digest', 'characters'].includes(key)) || value.version !== 1 ||
      !Array.isArray(value.runIds) || value.runIds.length > HISTORY_TURNS || new Set(value.runIds).size !== value.runIds.length ||
      value.runIds.some(id => typeof id !== 'string' || !/^run_[0-9a-f-]{36}$/.test(id) || id === run.id) ||
      value.sessionKey !== sessionKey(run) || !/^[a-f0-9]{64}$/.test(value.digest) ||
      !Number.isInteger(value.characters) || value.characters < 2 || value.characters > HISTORY_CHARACTERS) fail();
}

/** Recheck pinned receipts at approval and completion; never substitute newer conversation. */
export function readConversation(runs, run) {
  if (!run.conversation) return [];
  validateConversation(run.conversation, run);
  const prior = run.conversation.runIds.map(id => runs.find(item => item.id === id));
  if (prior.some(item => !item || item.state !== 'completed' || sessionKey(item) !== sessionKey(run))) fail();
  const history = messages(prior);
  if (hash(history) !== run.conversation.digest || JSON.stringify(history).length !== run.conversation.characters) fail();
  return history;
}
