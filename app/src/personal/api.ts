export type BrainObject = {
  id: string; title: string; kind: string; text: string; revisionId: string;
  sourcePath?: string; sourceIds: string[];
  sourceMetadata?: { kind: 'github'; repository: string; ref: string; path: string; commitSha: string; blobSha: string };
};
export type Message = { id: string; role: string; text: string; sourceIds?: string[]; createdAt?: string };
export type Room = { id: string; title: string; selectedSourceIds: string[]; messages: Message[] };
export type Proposal = { id: string; title: string; text: string; sourceIds: string[]; status: string };
export type Folder = { id: string; path: string; name?: string };
export type SourceConnection = { id: string; kind: 'github'; repository: string; ref: string; subpath: string; lastSyncedAt?: string; importedCount?: number };
export type Provider = { id: string; name?: string; configured: boolean; model: string | null; external: boolean };
export type NodeStatus = { locked: boolean; initialized: boolean; nodeId: string; providers: Provider[] };
export type Brain = {
  schemaVersion: number; brainId: string; name: string; template: string;
  objects: BrainObject[]; rooms: Room[]; proposals: Proposal[]; folders: Folder[];
  connections?: SourceConnection[];
  revisions: unknown[]; audit: unknown[]; conflicts: unknown[];
};

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
    if (!token.trim()) throw new Error('An owner token is required.');
    this.url = parsed.origin;
    this.token = token.trim();
  }
  async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    if (!path.startsWith('/v1/')) throw new Error('Unexpected node API route.');
    const response = await fetch(`${this.url}${path}`, {
      method, headers: { Authorization: `Bearer ${this.token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'omit', cache: 'no-store', redirect: 'error',
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error?.message || `Node request failed (${response.status}).`);
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
