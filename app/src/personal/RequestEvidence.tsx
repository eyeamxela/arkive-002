import type { ContextBudget, ProviderReceipt } from './api';
import './RequestEvidence.css';

const OUTCOME_MESSAGES: Record<ProviderReceipt['outcome'], string> = {
  complete: 'The provider reported a complete response. The answer is still unverified, not Canon.',
  incomplete: 'The response reached its output limit and may be cut off. It is excluded from conversation history. Increase the output budget or narrow your question before retrying.',
  refused: 'The provider declined this request. This response is excluded from conversation history.',
  filtered: 'The provider filtered this response. It is excluded from conversation history.',
  unsupported: 'The model requested a tool action that this text-chat adapter cannot execute. No tool was run; this response is excluded from conversation history.',
  unknown: 'The provider did not confirm that the answer finished. This response is excluded from conversation history.',
};

export function ContextBudgetNotice({ budget }: { budget?: ContextBudget }) {
  if (!budget) return null;
  return <p className={budget.overLimit ? 'pn-cw-unavailable' : 'pn-fine'} role={budget.overLimit ? 'alert' : undefined} data-context-budget>
    Selected memory: {budget.characters.toLocaleString()} / {budget.limit.toLocaleString()} serialized characters.
    {budget.overLimit ? ' Too much memory for one request. Remove sources or select a smaller folder before sending.' : ' This is Arkive’s source-size limit, not the model’s token window; your prompt and optional history also use tokens.'}
  </p>;
}

export function ResponseOutcome({ receipt }: { receipt?: ProviderReceipt }) {
  if (!receipt || receipt.outcome === 'complete') return null;
  return <p className="pn-cw-unavailable" role="note" data-response-outcome={receipt.outcome}>
    <strong>{receipt.outcome === 'incomplete' ? 'Incomplete answer. ' : 'Response needs attention. '}</strong>{OUTCOME_MESSAGES[receipt.outcome]}
  </p>;
}

export function ProviderReceiptDetails({ receipt, fullDetails = true }: { receipt?: ProviderReceipt; fullDetails?: boolean }) {
  if (!receipt) return null;
  const usage = receipt.usage;
  const count = (value?: number) => value === undefined ? 'Not reported' : value.toLocaleString();
  return <details className="pn-run-binding" data-provider-receipt><summary>Provider receipt · {receipt.outcome}</summary>
    <p>{OUTCOME_MESSAGES[receipt.outcome]}</p>
    {fullDetails ? <dl><dt>Actual model</dt><dd>{receipt.returnedModel || 'Not reported'}</dd>
      <dt>Response ID</dt><dd>{receipt.responseId || 'Not reported'}</dd>
      <dt>Finish reason</dt><dd>{receipt.finishReason || 'Not reported'}</dd>
      <dt>Input tokens</dt><dd>{count(usage?.inputTokens)}</dd>
      <dt>Output tokens</dt><dd>{count(usage?.outputTokens)}</dd>
      <dt>Total tokens</dt><dd>{count(usage?.totalTokens)}</dd>
      <dt>Reasoning tokens</dt><dd>{count(usage?.reasoningTokens)}</dd></dl> : <><p>Finish reason: {receipt.finishReason || 'Not reported'}</p><p className="pn-fine">Connection details and token accounting are visible only to the owner.</p></>}
    {fullDetails ? <p className="pn-fine">Provider-reported metadata. Token counts are not a billing receipt.</p> : null}
  </details>;
}
