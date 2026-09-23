// SHA-256 operates on exact original bytes; text is encoded as UTF-8.
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
}
export const textHash = async (text: string) => 'sha256:' + await sha256(new TextEncoder().encode(text));
export function safePath(path: string) {
  const normalized = path.normalize('NFKC').replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (!path || normalized.startsWith('/') || parts.some((p)=> !p || p==='.' || p==='..' || p.toLowerCase()==='dreams') || /[\x00-\x1f:]/.test(normalized)) throw new Error('Invalid or sealed vault path');
  return normalized;
}
export function expiry(ttl: string | undefined, at = Date.now()) {
  const duration: Record<string,number> = { 'session': 3600000, '1h':3600000, '24h':86400000, '7d':604800000, '30d':2592000000 };
  if (!ttl) return at + duration.session;
  if (!duration[ttl]) throw new Error('Unsupported context TTL');
  return at + duration[ttl];
}
