export type BrainObject = {
  id: string; title: string; kind: string; text: string; revisionId?: string;
  sourcePath?: string; sourceIds: string[];
  sourceMetadata?: { kind: 'github'; repository: string; ref: string; path: string; commitSha: string; blobSha: string };
};
export type Message = { id: string; role: string; text: string; sourceIds?: string[]; createdAt?: string };
export type Room = { id: string; title: string; selectedSourceIds: string[]; messages: Message[] };
export type Proposal = { id: string; title: string; text: string; sourceIds: string[]; status: string };
export type Folder = { id: string; path: string; name?: string };
export type SourceConnection = { id: string; kind: 'github'; repository: string; ref: string; subpath: string; lastSyncedAt?: string; importedCount?: number };
export type Provider = { id: string; name?: string; configured: boolean; model: string | null; external: boolean };
export type NodePrincipal = { kind: 'owner' | 'member'; owner?: boolean; memberId?: string; name?: string };
export type NodeStatus = { locked: boolean; initialized: boolean; nodeId: string; providers: Provider[]; principal?: NodePrincipal; limits?: { brainBytes: number; transferBytes: number } };
export type FolderScanCounters = {
  scanned: number; eligible: number; imported: number; unchanged: number; skipped: number;
  bytes: number; batches: number; skippedByReason: Record<string, number>;
};
export type FolderScan = FolderScanCounters & {
  scanId: string; folderId: string; phase: 'scanning' | 'completed' | 'cancelled' | 'failed';
  startedAt: string; finishedAt?: string; complete?: boolean; note?: string; error?: string;
};
export type FolderScanResult = FolderScanCounters & {
  folder: Folder; folderId: string; scanId: string; phase: 'completed' | 'cancelled'; complete: boolean; note?: string;
};
export type WorkspaceTask = {
  id: string; title: string; description: string; status: 'todo' | 'doing' | 'review' | 'done';
  sourceIds: string[]; agentId?: string; createdAt: string; updatedAt: string;
};
export type AgentProfile = {
  id: string; name: string; description: string; providerId: string; sourceIds: string[];
  createdAt: string; updatedAt: string;
};
export type ContextManifest = {
  id: string; name: string; description: string; sourceIds: string[]; createdAt: string; updatedAt: string;
};
export type BrainCollection = ContextManifest;
export type PersonalWorkspace = {
  tasks: WorkspaceTask[]; agents: AgentProfile[]; manifests: ContextManifest[]; collections: BrainCollection[];
};
export type MemoryLayer = {
  id: string; name: string; description: string; mode: 'include' | 'ask' | 'exclude'; sourceIds: string[];
  createdAt: string; updatedAt: string; versionKey?: string;
};
export type BrainMember = { id: string; name: string; createdAt: string; revokedAt?: string };
export type RoomMemberGrant = { memberId: string; role: 'reader' | 'participant'; sourceIds: string[] };
export type RoomPolicy = {
  roomId: string; agentId?: string | null; taskId?: string | null; layerIds: string[];
  memberGrants: RoomMemberGrant[]; activeManifestId?: string | null; updatedAt: string;
};
export type SourceBinding = { sourceId: string; revisionId: string };
export type PinnedManifest = {
  id: string; roomId: string; agentId?: string; taskId?: string; bindings: SourceBinding[];
  approvedLayerIds: string[]; createdAt: string; expiresAt: string; revokedAt?: string;
};
export type AgentRun = {
  id: string; roomId: string; agentId?: string; taskId?: string; principalId?: string;
  providerId?: string; model?: string | null; prompt: string; bindings?: SourceBinding[];
  manifestId?: string; approvedLayerIds?: string[]; audience?: string[];
  state: 'awaiting-approval' | 'running' | 'completed' | 'failed' | 'rejected';
  createdAt: string; updatedAt: string; completedAt?: string; result?: string; error?: string;
  events?: { type: string; at: string }[];
};
export type RoomScope = {
  roomId: string; sourceIds: string[]; blocked: { sourceId: string; reason: string }[]; canSend: boolean;
  contextKey?: string;
  manifestStatus: 'none' | 'active' | 'expired' | 'revoked' | 'stale'; role?: 'reader' | 'participant';
};
export type BrainGovernance = {
  layers: MemoryLayer[]; members: BrainMember[]; roomPolicies: RoomPolicy[];
  manifests: PinnedManifest[]; runs: AgentRun[]; scopes?: RoomScope[];
};
export type Brain = {
  schemaVersion: number; brainId: string; name: string; template: string;
  objects: BrainObject[]; rooms: Room[]; proposals: Proposal[]; folders: Folder[];
  connections?: SourceConnection[];
  workspace?: PersonalWorkspace;
  access?: NodePrincipal;
  governance?: BrainGovernance;
  revisions: unknown[]; audit: unknown[]; conflicts: unknown[];
};

export class NodeRequestError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message); this.name = 'NodeRequestError'; this.status = status; this.code = code;
  }
}

/** Never persist an owner token or passphrase in a browser storage API. */
export class PersonalNodeClient {
  readonly url: string;
  private readonly token: string;
  constructor(url: string, token: string) {
    const parsed = new URL(url);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.username || parsed.password || parsed.search || parsed.hash ||
      (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback))) {
      throw new Error('Use an HTTPS node address, or HTTP on localhost. Credentials belong in the token field.');
    }
    if (parsed.pathname !== '/' && parsed.pathname !== '') throw new Error('Use the node origin without a path.');
    if (!token.trim()) throw new Error('A node access token is required.');
    this.url = parsed.origin;
    this.token = token.trim();
  }
  async request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
    if (!path.startsWith('/v1/')) throw new Error('Unexpected node API route.');
    const response = await fetch(`${this.url}${path}`, {
      method, headers: { Authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit', cache: 'no-store', redirect: 'error', signal,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new NodeRequestError(result?.error?.message || `Node request failed (${response.status}).`, response.status, result?.error?.code);
    return result as T;
  }
  status() { return this.request<NodeStatus>('/v1/status'); }
  brain() { return this.request<Brain>('/v1/brain'); }
}

export function isNativeDesktop() { return '__TAURI_INTERNALS__' in window; }

export async function desktopConnection() {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<{ port: number; token: string }>('personal_node_connection');
}

export async function chooseDesktopFolder() {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string | null>('pick_brain_folder');
}
