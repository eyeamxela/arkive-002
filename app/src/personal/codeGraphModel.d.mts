export type CodeGraphData = {
  format: 'arkive-code-graph';
  version: 1;
  repository: string;
  nodes: Array<{ id: string; label: string; type: string; filePath?: string; community?: string }>;
  edges: Array<{ source: string; target: string; type: string }>;
  truncated: boolean;
};
export function parseCodeGraph(text: string): CodeGraphData | null;
