// First-use experience in staff controls. Local Supabase only; never hosted.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium, firefox } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
const cliArgs = ['supabase', 'status', '-o', 'json'];
if (process.env.SUPABASE_TEST_WORKDIR) cliArgs.push('--workdir', process.env.SUPABASE_TEST_WORKDIR);
const status = JSON.parse(execFileSync('npx', cliArgs, { encoding: 'utf8' }));
const url = status.API_URL;
assert.match(url, /^http:\/\/(127\.0\.0\.1|localhost):/); // Never test against production.
const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
const config = { url, publishableKey: key };
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://local').pathname;
    if (pathname === '/supabase-config.js') {
      res.setHeader('Content-Type', 'text/javascript'); res.end(`window.POPBIA_SUPABASE=${JSON.stringify(config)};`); return;
    }
    const file = resolve('public', '.' + (pathname === '/' ? '/account.html' : pathname));
    if (!file.startsWith(resolve('public') + '/')) { res.writeHead(403).end(); return; }
    const data = await readFile(file);
    res.setHeader('Content-Type', ({ '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml' })[extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(8787, '127.0.0.1', done));
const base = 'http://127.0.0.1:8787';
const browsers = [], errors = [], password = 'PopBia-first-run-42!', suffix = Date.now();
const emails = ['new', 'dismiss', 'established'].map(name => `first-run-${name}-${suffix}@example.com`);
const admin = createClient(url, status.SERVICE_ROLE_KEY, {auth:{persistSession:false}});

async function newPage(browser, width = 1280) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  page.on('pageerror', e => errors.push(e.message)); return page;
}
async function waitText(page, selector, text) {
  await page.waitForFunction(({selector,text}) => document.querySelector(selector)?.textContent.includes(text), {selector,text}, {timeout: 15000});
}
const text = async (page, selector) => (await page.locator(selector).textContent()).trim();
const idle = page => page.waitForFunction(() => !busy);
async function signIn(page, email, businessName) {
  await page.goto(base + '/account.html');
  await page.locator('#email').fill(email); await page.locator('#password').fill(password);
  await page.locator('#authSubmit').click();
  if (businessName) {
    await page.locator('#businessForm').waitFor({state:'visible'});
    await page.locator('#businessName').fill(businessName); await page.locator('#businessForm button').click();
  }
  await page.waitForURL('**/board-admin.html');
  await page.locator('#collection-demo').waitFor({state:'visible'});
  await page.waitForFunction(() => document.querySelector('.admin-connection-status')?.textContent === 'Live');
}
const noHorizontalScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

try {
  for (const email of emails) assert.ifError((await admin.auth.admin.createUser({ email, password, email_confirm: true })).error);
  const cb = await chromium.launch(), fb = await firefox.launch(); browsers.push(cb, fb);

  // 1. A brand-new business sees the guide and an intentional empty queue.
  const a = await newPage(cb);
  await signIn(a, emails[0], 'First Run Café');
  await a.locator('#firstRun').waitFor({state:'visible'});
  assert.equal(await text(a, '#firstRunProgress'), '0 of 3 done');
  assert.equal(await text(a, '#firstRunTitle'), 'Try a test order before service');
  assert.match(await text(a, '#firstRunIntro'), /staff controls.*customer screen/);
  assert.match(await a.locator('[data-step="order"]').getAttribute('class'), /is-current/);
  assert.match(await text(a, '#firstRunOrderHint'), /order #1\..*first real customer will be #2/);
  assert.match(await text(a, '.queue-empty.is-first-run'), /No orders yet/);
  assert.equal(await a.locator('.order-row').count(), 0); // The empty state no longer looks like an order.
  assert.equal(await text(a, '#addOrderBtn'), 'Add order #1');
  assert.equal(await text(a, '#customerNameLabel'), 'Customer name (optional)');
  assert.match(await text(a, '#openBoard'), /^Open customer screen/);
  for (const width of [1280, 390]) {
    await a.setViewportSize({width, height: 900});
    assert(await noHorizontalScroll(a));
    await a.screenshot({path:`/tmp/popbia-first-run-${width}.png`, fullPage:true});
  }
  await a.setViewportSize({width: 1280, height: 900});

  // 2. Step 1: the guide's button adds a test order that uses the next number.
  await a.locator('#firstRunAdd').click();
  await waitText(a, '#ordersList', '#1 · Test');
  await waitText(a, '#firstRunProgress', '1 of 3 done');
  assert.equal(await a.locator('#firstRunAdd').isVisible(), false);
  assert.match(await a.locator('[data-step="order"]').getAttribute('class'), /is-done/);
  assert.match(await a.locator('[data-step="screen"]').getAttribute('class'), /is-current/);
  assert.equal(await a.locator('.queue-empty').count(), 0);
  // Refresh mid-onboarding keeps progress (derived from order history).
  await a.reload(); await a.locator('#firstRun').waitFor({state:'visible'});
  await waitText(a, '#firstRunProgress', '1 of 3 done');

  // 3. Step 2: the customer screen opens in a new tab and leaves staff controls untouched.
  const [board] = await Promise.all([a.context().waitForEvent('page'), a.locator('#firstRunScreen').click()]);
  board.on('pageerror', e => errors.push(e.message));
  await board.waitForLoadState();
  assert.match(board.url(), /\/board\.html\?display=[0-9a-f-]{36}$/);
  await waitText(board, '#preparingList', '#1');
  assert.equal(new URL(a.url()).pathname, '/board-admin.html');
  await waitText(a, '#ordersList', '#1 · Test');
  await waitText(a, '#firstRunProgress', '2 of 3 done');
  await a.reload(); await waitText(a, '#firstRunProgress', '2 of 3 done');

  // 4. Step 3: Mark Ready updates the customer screen and completes the guide.
  await a.locator('[data-action="ready"]').first().click();
  await waitText(board, '#readyList', '#1');
  await waitText(a, '#firstRunProgress', 'All done');
  assert.equal(await text(a, '#firstRunTitle'), 'You’re ready for service');
  assert.match(await text(a, '#firstRunFinishText'), /Your next order will be #2\./);
  await a.screenshot({path:'/tmp/popbia-first-run-complete.png', fullPage:true});
  // Once complete, the guide does not come back.
  await a.reload(); await a.locator('#ordersList .order-row').first().waitFor();
  await a.waitForTimeout(1500);
  assert.equal(await a.locator('#firstRun').isVisible(), false);

  // 5. Order creation in every queue style.
  await a.locator('#addOrderBtn').click(); // number + name, no name entered
  await waitText(a, '#ordersList', '#2');
  assert.equal(await a.locator('[data-row-id] .order-label', { hasText: /^#2$/ }).count(), 1);
  await a.locator('#customerNameInput').fill('Maya'); await a.locator('#customerNameInput').press('Enter');
  await waitText(a, '#ordersList', '#3 · Maya');
  await waitText(board, '#preparingList', 'Maya');
  assert.equal(await text(a, '#addOrderBtn'), 'Add order #4');
  assert.equal(await a.evaluate(() => document.activeElement.id), 'customerNameInput');
  await a.locator('#queueSettingsToggle').click();
  await a.locator('#queueStyleSelect').selectOption('number'); await idle(a);
  await a.waitForFunction(() => cloud.business.queue_style === 'number');
  assert.equal(await a.locator('#customerNameField').isVisible(), false);
  await a.locator('#addOrderBtn').click();
  await waitText(a, '#ordersList', '#4');
  const numberRow = a.locator('.order-row').filter({ has: a.locator('.order-label', { hasText: /^#4$/ }) });
  assert.equal(await numberRow.count(), 1);
  assert.equal(await numberRow.locator('[data-action="edit"]').count(), 0); // Nothing to edit on a number-only order.
  await a.locator('#queueStyleSelect').selectOption('name'); await idle(a);
  await a.waitForFunction(() => cloud.business.queue_style === 'name');
  assert.equal(await text(a, '#customerNameLabel'), 'Customer name');
  assert.equal(await text(a, '#addOrderBtn'), 'Add order');
  await a.locator('#addOrderBtn').click();
  await waitText(a, '#cloudMessage', 'Enter the customer’s name');
  await a.locator('#customerNameInput').fill('Sam'); await a.locator('#addOrderBtn').click();
  await waitText(board, '#preparingList', 'Sam');
  await a.locator('#queueStyleSelect').selectOption('number-name'); await idle(a);

  // 6. Editing happens in the row: the add bar keeps adding, polling keeps the draft, Cancel/Escape/Enter.
  const mayaRow = () => a.locator('.order-row', { hasText: 'Maya' });
  const mayaId = await mayaRow().getAttribute('data-row-id');
  const row = a.locator(`[data-row-id="${mayaId}"]`);
  await row.locator('[data-action="edit"]').click();
  assert.match(await row.getAttribute('class'), /is-editing/);
  assert.equal(await text(a, `[data-row-id="${mayaId}"] .order-edit-label`), 'Editing order #3');
  assert.equal(await row.locator('.order-edit-input').inputValue(), 'Maya');
  assert.equal(await a.evaluate(() => document.activeElement.classList.contains('order-edit-input')), true);
  assert.match(await text(a, '#addOrderBtn'), /^Add order #\d+$/); // Never "Save edit".
  await a.locator('#customerNameInput').fill('Next customer'); await a.locator('#customerNameInput').press('Enter');
  await waitText(board, '#preparingList', 'Next customer');
  assert.equal((await admin.from('collection_orders').select('customer_name').eq('id', mayaId).single()).data.customer_name, 'Maya');
  await row.locator('.order-edit-input').fill('Mia draft');
  await row.locator('.order-edit-input').focus();
  await a.waitForTimeout(10500); // Ten-second polling and Realtime refreshes keep the open edit.
  assert.equal(await row.locator('.order-edit-input').inputValue(), 'Mia draft');
  assert.equal(await a.evaluate(() => document.activeElement.classList.contains('order-edit-input')), true);
  await a.setViewportSize({width: 390, height: 844}); assert(await noHorizontalScroll(a));
  await row.scrollIntoViewIfNeeded(); await a.screenshot({path:'/tmp/popbia-edit-row-390.png'});
  await a.setViewportSize({width: 1280, height: 900});
  await row.locator('[data-action="cancel-edit"]').click();
  assert.equal((await row.locator('.order-label').textContent()).trim(), '#3 · Maya');
  assert.equal(await a.evaluate(() => document.activeElement.dataset.action), 'edit');
  await row.locator('[data-action="edit"]').click();
  await row.locator('.order-edit-input').fill('Mia'); await row.locator('.order-edit-input').press('Escape');
  assert.equal((await row.locator('.order-label').textContent()).trim(), '#3 · Maya');
  await row.locator('[data-action="edit"]').click();
  await row.locator('.order-edit-input').fill('Mia'); await row.locator('.order-edit-input').press('Enter');
  await waitText(a, `[data-row-id="${mayaId}"] .order-label`, '#3 · Mia');
  await waitText(board, '#preparingList', 'Mia');
  const samRow = a.locator('.order-row', { hasText: 'Sam' }); const samId = await samRow.getAttribute('data-row-id');
  await samRow.locator('[data-action="edit"]').click();
  await a.locator(`[data-row-id="${samId}"] .order-edit-input`).fill('');
  await a.locator(`[data-row-id="${samId}"] [data-action="save-edit"]`).click();
  await waitText(a, '#cloudMessage', 'This order needs a name');
  assert.equal(await a.locator(`[data-row-id="${samId}"] .order-edit-input`).isVisible(), true);
  // An order removed on another device closes the edit with an explanation.
  const staff = createClient(url, key, {auth:{persistSession:false}});
  assert.ifError((await staff.auth.signInWithPassword({email: emails[0], password})).error);
  assert.ifError((await staff.from('collection_orders').delete().eq('id', samId)).error);
  await waitText(a, '#cloudMessage', 'no longer active, so the edit was cancelled');
  assert.equal(await a.locator('.order-edit-input').count(), 0);
  console.log('PASS: new-business guide and empty state; test order numbering; progress persists across refresh; customer screen opens in a new tab without resetting staff controls; Ready reaches the customer screen and completes the guide; completed guide stays hidden; number+name (optional name), number-only (no name field, no Edit) and name-only (required) creation; in-row editing never captures the next order, survives polling, Cancel/Escape/Enter, validation, and closes when the order disappears.');

  // 7. Dismissal persists across refresh; the empty state becomes the quiet version.
  const d = await newPage(fb, 390);
  await signIn(d, emails[1], 'Dismiss Diner');
  await d.locator('#firstRun').waitFor({state:'visible'});
  assert(await noHorizontalScroll(d));
  await d.locator('#firstRunDismiss').click();
  assert.equal(await d.locator('#firstRun').isVisible(), false);
  assert.equal(await text(d, '.queue-empty'), 'No active orders. New orders appear here and on your customer screen.');
  assert.equal(await d.evaluate(() => document.activeElement.id), 'customerNameInput');
  await d.reload(); await d.locator('.queue-empty').waitFor();
  await d.waitForTimeout(1500);
  assert.equal(await d.locator('#firstRun').isVisible(), false);
  assert.equal(await d.locator('.queue-empty.is-first-run').count(), 0);

  // 8. An established business (older than the trial window) never sees the guide.
  const owner = createClient(url, key, {auth:{persistSession:false}});
  assert.ifError((await owner.auth.signInWithPassword({email: emails[2], password})).error);
  const established = await owner.rpc('create_business', {business_name: 'Established Eatery'}); assert.ifError(established.error);
  assert.ifError((await admin.from('businesses').update({created_at: new Date(Date.now() - 30 * 86400000).toISOString()}).eq('id', established.data)).error);
  const e = await newPage(cb);
  await signIn(e, emails[2]);
  await e.locator('.queue-empty').waitFor(); await e.waitForTimeout(1500);
  assert.equal(await e.locator('#firstRun').isVisible(), false);
  assert.equal(await text(e, '.queue-empty'), 'No active orders. New orders appear here and on your customer screen.');
  await e.screenshot({path:'/tmp/popbia-returning-empty.png', fullPage:true});
  assert.deepEqual(errors, []);
  console.log('PASS: dismissal persists across refresh with a quiet empty state at 390px in Firefox; established business sees no guide.');
} finally {
  const users = await admin.auth.admin.listUsers();
  for (const user of users.data?.users || []) if (emails.includes(user.email)) {
    const memberships = await admin.from('business_members').select('business_id').eq('user_id', user.id);
    for (const m of memberships.data || []) await admin.from('businesses').delete().eq('id', m.business_id);
    await admin.auth.admin.deleteUser(user.id);
  }
  for (const browser of browsers) await browser.close();
  await new Promise(done => server.close(done));
}
