import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { resolveEndpoint, requestJson, executeChat, describeProviders } from '../execution.mjs';

async function serverFixture(t, handler) {
  const requests = [];
  const server = http.createServer((req, res) => { requests.push(req.url); handler(req, res); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => {
    server.closeIdleConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

test('endpoint validation permits explicit loopback and HTTPS public addresses without connecting externally', async () => {
  for (const value of ['http://127.0.0.1:12345', 'http://[::1]:12345', 'http://localhost:12345']) {
    const endpoint = await resolveEndpoint(value);
    assert.equal(endpoint.url.protocol, 'http:');
    assert.ok(endpoint.address.address === '::1' || endpoint.address.address.startsWith('127.'));
  }
  // Literal addresses exercise classification only; these tests never make requests to them.
  const ipv4 = await resolveEndpoint('https://8.8.8.8/v1');
  assert.deepEqual(ipv4.address, { address: '8.8.8.8', family: 4 });
  const ipv6 = await resolveEndpoint('https://[2606:4700:4700::1111]/v1');
  assert.equal(ipv6.address.family, 6);
});

test('endpoint validation blocks private, link-local, metadata, multicast and mapped IPv6 destinations', async () => {
  const addresses = ['0.0.0.0', '10.0.0.1', '100.64.0.1', '100.127.255.255', '169.254.169.254',
    '172.16.0.1', '172.31.255.255', '192.168.1.1', '192.0.0.1', '198.18.0.1', '198.19.255.255',
    '224.0.0.1', '255.255.255.255', '[::]', '[fc00::1]', '[fd00::1]', '[fe80::1]', '[ff02::1]',
    '[::ffff:127.0.0.1]', '[::ffff:10.0.0.1]', '[2001:db8::1]', '[2002:0a00:0001::1]'];
  for (const address of addresses) {
    await assert.rejects(resolveEndpoint(`https://${address}/v1`), /restricted network address/, address);
  }
  for (const address of ['127.0.0.1', '[::1]', 'localhost']) {
    await assert.rejects(resolveEndpoint(`https://${address}/v1`, { allowLoopback: false }), /restricted network address/);
  }
});

test('endpoint URLs reject credentials, fragments, remote plaintext and unexpected protocols', async () => {
  for (const value of ['not a url', 'https://user:pass@8.8.8.8', 'http://127.0.0.1/#fragment',
    'http://8.8.8.8', 'http://10.0.0.1', 'http://127.example.invalid',
    'file:///tmp/synthetic', 'ftp://127.0.0.1', 'javascript:alert(1)']) {
    await assert.rejects(resolveEndpoint(value));
  }
  await assert.rejects(resolveEndpoint('http://127.0.0.1', { allowLoopback: false }), /HTTPS/);
});

test('request transport sends JSON to a loopback fixture and never follows redirects', async (t) => {
  let received;
  const target = await serverFixture(t, async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    received = { method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"accepted":true}');
  });
  const result = await requestJson(target.url, { method: 'POST', headers: { Authorization: 'Bearer synthetic-test-only' }, body: { value: 'synthetic' } });
  assert.deepEqual(result, { accepted: true });
  assert.equal(received.method, 'POST');
  assert.equal(received.headers['content-type'], 'application/json');
  assert.equal(received.headers.authorization, 'Bearer synthetic-test-only');
  assert.deepEqual(JSON.parse(received.body), { value: 'synthetic' });
  const redirect = await serverFixture(t, (_req, res) => {
    res.writeHead(302, { Location: `${target.url}/must-not-follow` }); res.end('{}');
  });
  await assert.rejects(requestJson(redirect.url), /failed \(302\)/);
  assert.deepEqual(target.requests, ['/']);
  assert.deepEqual(redirect.requests, ['/']);
});

test('request transport bounds payloads and rejects malformed JSON, upstream errors and timeouts', async (t) => {
  const f = await serverFixture(t, (req, res) => {
    if (req.url === '/oversized') { res.writeHead(200); res.end(JSON.stringify({ text: 'x'.repeat(2048) })); }
    else if (req.url === '/invalid') { res.writeHead(200); res.end('not-json'); }
    else if (req.url === '/failure') { res.writeHead(503); res.end('{"error":"synthetic upstream failure"}'); }
    // The timeout endpoint intentionally leaves the loopback request unanswered.
  });
  await assert.rejects(requestJson(`${f.url}/oversized`, { maxBytes: 128 }), /size limit/);
  await assert.rejects(requestJson(`${f.url}/invalid`), /invalid JSON/);
  await assert.rejects(requestJson(`${f.url}/failure`), /failed \(503\)/);
  await assert.rejects(requestJson(`${f.url}/timeout`, { timeoutMs: 30 }), /timed out/);
});

test('provider discovery never treats an unconfigured adapter as executable', async () => {
  const absent = describeProviders();
  assert.equal(absent.find((provider) => provider.id === 'openai-compatible').configured, false);
  assert.equal(absent.find((provider) => provider.id === 'hermes').configured, false);
  const configured = describeProviders({ baseUrl: 'http://127.0.0.1:12345', model: 'synthetic-model' });
  assert.equal(configured.find((provider) => provider.id === 'openai-compatible').configured, true);
  assert.equal(configured.find((provider) => provider.id === 'hermes').configured, false);
  const neverReadStore = { snapshot: () => { assert.fail('Invalid provider must fail before reading Brain data'); } };
  await assert.rejects(executeChat(neverReadStore, 'room-unused', { text: 'hello', allowExternal: true }), /No model provider is configured/);
  await assert.rejects(executeChat(neverReadStore, 'room-unused', { text: 'hello', allowExternal: true, provider: 'hermes' }), /not configured/);
  await assert.rejects(executeChat(neverReadStore, 'room-unused', { text: 'hello' }, {
    baseUrl: 'http://127.0.0.1:12345', model: 'synthetic-model',
  }), /Explicit approval/);
});
