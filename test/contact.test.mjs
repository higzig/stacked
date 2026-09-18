import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/contact.mjs';

const valid = { name: 'Sarah', business: 'Food & Friends', email: 'sarah@example.com', interest: 'Collection system', collectionMethod: 'Call out names', location: 'Dublin', message: 'We need a collection screen.\nCan we use our own TV?' };
function request(data = valid, headers = {}) {
  return new Request('https://popbia.com/api/contact', { method: 'POST', headers: { Origin: 'https://popbia.com', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
}
function setup(send) {
  const emails = [];
  return { emails, env: { ASSETS: { fetch: async () => new Response('static asset') }, CONTACT_LIMITER: { limit: async () => ({ success: true }) }, EMAIL: { send: async message => { emails.push(message); if (send) await send(message, emails.length); return { messageId: 'test' }; } } } };
}
test('sends every answer to Ryan and a professional acknowledgement to customer with correct reply addresses', async () => {
  const { env, emails } = setup();
  const response = await worker.fetch(request(), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).message, 'Query submitted');
  assert.equal(emails.length, 2);
  assert.equal(emails[0].to, 'ryan@popbia.com');
  assert.equal(emails[0].replyTo, valid.email);
  for (const value of Object.values(valid)) assert.ok(emails[0].text.includes(value));
  assert.equal(emails[1].to, valid.email);
  assert.equal(emails[1].replyTo, 'ryan@popbia.com');
  assert.match(emails[1].text, /within 1 working day/);
  assert.match(emails[0].html, /Food &amp; Friends/);
});
test('escapes submitted HTML and does not echo the enquiry in the auto reply', async () => {
  const { env, emails } = setup();
  await worker.fetch(request({ ...valid, message: '<img src=x onerror=alert(1)>' }), env);
  assert.match(emails[0].html, /&lt;img/);
  assert.ok(!emails[0].html.includes('<img'));
  assert.ok(!emails[1].html.includes('onerror'));
});
test('rejects malformed input and header injection without sending', async () => {
  for (const data of [null, [], { ...valid, email: 'a@b.com\r\nBcc: other@b.com' }, { ...valid, name: '' }, { ...valid, interest: 'invalid' }, { ...valid, collectionMethod: '' }, { ...valid, message: 'a'.repeat(5001) }, { ...valid, website: 'spam' }]) {
    const { env, emails } = setup();
    assert.equal((await worker.fetch(request(data), env)).status, 400);
    assert.equal(emails.length, 0);
  }
});
test('accepts other interests without a collection answer', async () => {
  const { env } = setup();
  assert.equal((await worker.fetch(request({ ...valid, interest: 'Website / template', collectionMethod: '' }), env)).status, 200);
});
test('rejects foreign origins, oversized requests and excessive submissions', async () => {
  const { env, emails } = setup();
  assert.equal((await worker.fetch(request(valid, { Origin: 'https://elsewhere.test' }), env)).status, 403);
  assert.equal((await worker.fetch(request({ ...valid, message: 'a'.repeat(33000) }), env)).status, 413);
  env.CONTACT_LIMITER.limit = async () => ({ success: false });
  assert.equal((await worker.fetch(request(), env)).status, 429);
  assert.equal(emails.length, 0);
});
test('does not show success or send an acknowledgement if notification fails', async () => {
  const { env, emails } = setup(async () => { throw new Error('provider unavailable'); });
  assert.equal((await worker.fetch(request(), env)).status, 502);
  assert.equal(emails.length, 1);
});
test('does not encourage duplicate enquiries when only the acknowledgement fails', async () => {
  const { env } = setup(async (_, count) => { if (count === 2) throw new Error('recipient rejected'); });
  assert.equal((await worker.fetch(request(), env)).status, 200);
});
test('preserves static assets and reports missing email setup', async () => {
  const { env } = setup();
  assert.equal(await (await worker.fetch(new Request('https://popbia.com/'), env)).text(), 'static asset');
  delete env.EMAIL;
  assert.equal((await worker.fetch(request(), env)).status, 503);
});
