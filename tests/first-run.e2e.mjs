// First-run walkthrough across staff controls and the customer screen. Local Supabase only; never hosted.
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
// POPBIA_TEST_PORT lets the suite run beside a dev server on 8787 (add it to the Auth redirect URLs).
const port = Number(process.env.POPBIA_TEST_PORT || 8787);
await new Promise(done => server.listen(port, '127.0.0.1', done));
const base = `http://127.0.0.1:${port}`;
const browsers = [], errors = [], password = 'PopBia-first-run-42!', suffix = Date.now();
const emails = ['new', 'mobile', 'established'].map(name => `first-run-${name}-${suffix}@example.com`);
const admin = createClient(url, status.SERVICE_ROLE_KEY, {auth:{persistSession:false}});

const watch = page => { page.on('pageerror', e => errors.push(`${page.url()}: ${e.message}`)); return page; };
async function waitText(page, selector, text) {
  await page.waitForFunction(({selector,text}) => document.querySelector(selector)?.textContent.includes(text), {selector,text}, {timeout: 15000});
}
const text = async (page, selector) => (await page.locator(selector).textContent()).trim();
const idle = page => page.waitForFunction(() => !busy);
const focused = page => page.evaluate(() => ({ id: document.activeElement.id, action: document.activeElement.dataset.action, row: document.activeElement.closest('[data-row-id]')?.dataset.rowId }));
// Dimming fades over 0.2s, so wait for the settled value.
const expectOpacity = (page, selector, value) => page.waitForFunction(({ selector, value }) => getComputedStyle(document.querySelector(selector)).opacity === value, { selector, value }, { timeout: 5000 });
const isTarget = (page, selector) => page.locator(selector).evaluate(el => el.classList.contains('wt-target'));
const noHorizontalScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
async function step(page, number, title) {
  await page.locator('#walkthrough').waitFor({ state: 'visible' });
  await waitText(page, '#wtStep', `Step ${number} of 5`);
  await waitText(page, '#wtTitle', title);
}
// The card's title, text and buttons must not overlap each other or leave the card or screen.
const cardFits = page => page.evaluate(() => {
  const card = document.getElementById('walkthrough');
  if (!card || card.hidden) return true;
  const box = card.getBoundingClientRect();
  const parts = [...card.querySelectorAll('#wtStep, #wtTitle, #wtText, .wt-button, .wt-skip')].filter(el => !el.hidden && el.offsetParent).map(el => el.getBoundingClientRect());
  const inside = r => r.left >= box.left - .5 && r.right <= box.right + .5 && r.top >= box.top - .5 && r.bottom <= box.bottom + .5;
  const overlap = (a, b) => a.left < b.right - .5 && b.left < a.right - .5 && a.top < b.bottom - .5 && b.top < a.bottom - .5;
  return box.left >= 0 && box.right <= innerWidth && box.bottom <= innerHeight && parts.every(inside) && parts.every((a, i) => parts.slice(i + 1).every(b => !overlap(a, b)));
});
async function shoot(page, name, widths = [1280]) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
    assert(await noHorizontalScroll(page), `${name} at ${width}px scrolls sideways`);
    assert(await cardFits(page), `${name} at ${width}px: walkthrough card content overlaps or overflows`);
    await page.screenshot({ path: `/tmp/popbia-wt-${name}-${width}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}
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
}

try {
  for (const email of emails) assert.ifError((await admin.auth.admin.createUser({ email, password, email_confirm: true })).error);
  const cb = await chromium.launch(), fb = await firefox.launch(); browsers.push(cb, fb);
  const context = await cb.newContext({ viewport: { width: 1280, height: 900 } });
  const a = watch(await context.newPage());
  await signIn(a, emails[0], 'Walkthrough Café');
  const ownerId = (await admin.auth.admin.listUsers()).data.users.find(u => u.email === emails[0]).id;
  const businessId = (await admin.from('business_members').select('business_id').eq('user_id', ownerId).single()).data.business_id;
  const business = (await admin.from('businesses').select('*').eq('id', businessId).single()).data;

  // Step 1 — Your orders: the real add bar is highlighted and focused; unrelated sections are dimmed.
  await step(a, 1, 'Your orders');
  assert.equal(await text(a, '#wtText'), 'This is where you’ll manage orders. Let’s add your first one!');
  assert.equal(await isTarget(a, '#adminControlRow'), true);
  assert.equal((await focused(a)).id, 'customerNameInput');
  assert.equal(await a.locator('#customerNameInput').getAttribute('aria-describedby'), 'wtTitle wtText');
  await expectOpacity(a, '#adminQueueView', '0.35');
  await expectOpacity(a, '.staff-header', '0.35');
  await expectOpacity(a, '#adminControlRow', '1');
  assert.match(await text(a, '.queue-empty.is-first-run'), /Your test order will appear here/);
  assert.equal(await a.locator('.first-run, #firstRun').count(), 0); // The old checklist card is gone.
  // The card follows the page content, so keyboard users reach it after the taught control.
  assert.equal(await a.evaluate(() => !!(document.querySelector('main').compareDocumentPosition(document.getElementById('walkthrough')) & Node.DOCUMENT_POSITION_FOLLOWING)), true);
  await shoot(a, '1-orders', [1280, 390, 320]);
  await a.reload(); await step(a, 1, 'Your orders'); // Refresh keeps the step.
  await a.locator('#customerNameInput').waitFor();
  assert.equal((await focused(a)).id, 'customerNameInput');
  await a.keyboard.type('Test'); await a.keyboard.press('Enter');
  await waitText(a, '#ordersList', '#1 · Test');

  // Step 2 — Customer screen: header button, then Open customer screen in the same tab.
  await step(a, 2, 'Customer screen');
  assert.equal(await text(a, '#wtText'), 'Customers can follow their orders here. Open the screen to take a look.');
  assert.equal(await isTarget(a, '#screenPanelToggle'), true);
  assert.equal((await focused(a)).id, 'screenPanelToggle');
  await expectOpacity(a, '#ordersList', '0.35');
  assert.equal(await a.locator('#customerNameInput').getAttribute('aria-describedby'), null); // Cleared from the old target.
  await shoot(a, '2-screen', [1280, 390, 320]);
  await a.reload(); await step(a, 2, 'Customer screen');
  await a.waitForFunction(() => document.activeElement.id === 'screenPanelToggle');
  await a.keyboard.press('Enter');
  await a.locator('#screenPanel').waitFor({ state: 'visible' });
  await a.waitForFunction(() => document.getElementById('openBoard').classList.contains('wt-target'));
  assert.equal((await focused(a)).id, 'openBoard');
  // Only Open customer screen during this step: the QR option and secondary actions are tucked away.
  assert.equal(await a.locator('.screen-option-qr').isVisible(), false);
  assert.equal(await a.locator('#copyScreenLink').isVisible(), false);
  assert.equal(await text(a, '#screenTvTitle'), 'TV or tablet');
  await shoot(a, '2-screen-open', [1280, 390, 320]);
  for (const width of [390, 320]) { // The highlighted button stays clear of the card on phones.
    await a.setViewportSize({ width, height: 844 });
    await a.locator('#openBoard').scrollIntoViewIfNeeded();
    const [target, card] = await Promise.all([a.locator('#openBoard').boundingBox(), a.locator('#walkthrough').boundingBox()]);
    assert(target.y + target.height <= card.y, `Open customer screen is covered by the card at ${width}px`);
  }
  await a.setViewportSize({ width: 1280, height: 900 });
  await a.keyboard.press('Enter');
  await a.waitForURL(u => u.pathname === '/board.html' && u.searchParams.get('display') === business.display_id && u.searchParams.get('tour') === 'intro');
  assert.equal(context.pages().length, 1); // Same tab: nothing to juggle on a phone.

  // Step 3 — What customers see, on the real customer screen.
  await step(a, 3, 'What customers see');
  assert.equal(await text(a, '#wtText'), 'Orders move from Preparing to Ready for collection. Let’s head back and try it.');
  await waitText(a, '#preparingList', '#1');
  assert.equal(await isTarget(a, '.board-column.preparing'), true);
  assert.equal((await focused(a)).id, 'wtBack');
  assert.equal(await a.locator('.board-qr').isVisible(), false);
  assert.deepEqual(await a.locator('a').evaluateAll(as => as.filter(x => /board-admin|account/.test(x.getAttribute('href') || '')).map(x => x.id)), ['wtBack']);
  await shoot(a, '3-customer', [1280, 390]);
  await a.reload(); await step(a, 3, 'What customers see'); // Refresh on the customer screen keeps the explanation.
  // Never on ordinary screens: a customer's phone or a TV with the same URL sees no walkthrough.
  const stranger = watch(await (await cb.newContext({ viewport: { width: 390, height: 844 } })).newPage());
  for (const query of ['&tour=intro', '&phone=1&tour=intro', '&tour=ready']) {
    await stranger.goto(`${base}/board.html?display=${business.display_id}${query}`);
    await waitText(stranger, '#preparingList', '#1');
    assert.equal(await stranger.locator('#walkthrough').isVisible(), false);
    assert.equal(await stranger.locator('#wtBack').isVisible(), false);
  }
  // An expired token, or one for another business, is ignored too.
  await a.evaluate(() => { const t = JSON.parse(localStorage.getItem('popbia-walkthrough-screen')); localStorage.setItem('popbia-walkthrough-screen', JSON.stringify({ ...t, until: 0 })); });
  await a.reload(); await waitText(a, '#preparingList', '#1');
  assert.equal(await a.locator('#walkthrough').isVisible(), false);
  await a.evaluate(() => localStorage.setItem('popbia-walkthrough-screen', JSON.stringify({ display: '00000000-0000-4000-8000-000000000000', until: Date.now() + 60000 })));
  await a.reload(); await waitText(a, '#preparingList', '#1');
  assert.equal(await a.locator('#walkthrough').isVisible(), false);
  await a.evaluate(display => localStorage.setItem('popbia-walkthrough-screen', JSON.stringify({ display, until: Date.now() + 60000 })), business.display_id);
  await a.reload(); await step(a, 3, 'What customers see');
  await a.waitForFunction(() => document.activeElement.id === 'wtBack');
  await a.keyboard.press('Enter'); // Back to staff controls
  await a.waitForURL('**/board-admin.html');

  // Step 4 — Mark it Ready: the test order's real Mark Ready button.
  await step(a, 4, 'Mark it Ready');
  assert.equal(await text(a, '#wtText'), 'Order finished? Press Mark Ready and watch it update for customers.');
  const testId = (await admin.from('collection_orders').select('id').eq('business_id', business.id).single()).data.id;
  await a.waitForFunction(id => document.activeElement.closest('[data-row-id]')?.dataset.rowId === id, testId);
  assert.equal(await isTarget(a, `[data-row-id="${testId}"]`), true);
  assert.deepEqual(await focused(a), { id: '', action: 'ready', row: testId });
  assert.equal(await a.evaluate(() => localStorage.getItem('popbia-walkthrough-screen')), null); // Token cleared on return.
  await shoot(a, '4-ready', [1280, 390]);
  await a.locator(`[data-row-id="${testId}"] [data-action="ready"]`).focus();
  await a.keyboard.press('Enter');
  await step(a, 4, 'It’s ready!');
  assert.equal(await text(a, '#wtText'), '#1 · Test is now Ready for collection on the customer screen.');
  assert.equal(await text(a, '#wtPrimary'), 'Next');
  assert.equal(await text(a, '#wtSecondary'), 'See the customer screen');
  await a.waitForFunction(() => document.activeElement.id === 'wtPrimary');
  assert.equal((await admin.from('collection_orders').select('status').eq('id', testId).single()).data.status, 'ready');
  await shoot(a, '4-done', [1280, 390, 320]);
  await a.reload(); await step(a, 4, 'It’s ready!'); // Not asked to mark it again after a refresh.
  await a.locator('#wtSecondary').click();
  await a.waitForURL(u => u.pathname === '/board.html' && u.searchParams.get('tour') === 'ready');
  await step(a, 4, 'Customers see it’s ready');
  await waitText(a, '#readyList', '#1');
  assert.equal(await isTarget(a, '.board-column.ready'), true);
  await shoot(a, '4-customer-ready', [1280, 390]);
  await a.goBack(); // The browser's Back works as well as the button.
  await a.waitForURL('**/board-admin.html');

  // Step 5 — Try it yourself: nothing dimmed, normal controls, Finish with practice-order cleanup.
  await step(a, 5, 'Your turn!');
  assert.equal(await text(a, '#wtText'), 'Add an order using your name and give PopBia a try.');
  await expectOpacity(a, '#adminQueueView', '1');
  await expectOpacity(a, '#ordersList', '1');
  await a.waitForFunction(() => document.activeElement.id === 'customerNameInput');
  assert.equal(await text(a, '#wtPrimary'), 'Finish walkthrough');
  await shoot(a, '5-try', [1280, 390]);
  await a.locator('#customerNameInput').fill('Ryan'); await a.locator('#customerNameInput').press('Enter');
  await waitText(a, '#ordersList', '#2 · Ryan');
  const ryanId = await a.locator('.order-row', { hasText: 'Ryan' }).getAttribute('data-row-id');
  await a.locator(`[data-row-id="${ryanId}"] [data-action="edit"]`).click();
  await a.locator(`[data-row-id="${ryanId}"] .order-edit-input`).fill('Ryan H');
  await a.locator(`[data-row-id="${ryanId}"] .order-edit-input`).press('Enter');
  await waitText(a, `[data-row-id="${ryanId}"] .order-label`, '#2 · Ryan H');
  await idle(a); await a.locator(`[data-row-id="${ryanId}"] [data-action="ready"]`).click(); await idle(a);
  await a.locator(`[data-row-id="${ryanId}"] [data-action="collected"]`).click(); await idle(a);
  await a.waitForFunction(id => !document.querySelector(`[data-row-id="${id}"]`), ryanId);
  await step(a, 5, 'Your turn!');
  await a.locator('#wtPrimary').click();
  await step(a, 5, 'Remove your practice order?');
  assert.equal(await text(a, '#wtText'), 'So customers don’t see it. Your next order will still be #3.');
  assert.equal(await text(a, '#wtSecondary'), 'Keep it');
  assert.equal(await a.locator('#wtSkip').isVisible(), false);
  assert.equal((await focused(a)).id, 'wtPrimary');
  await shoot(a, '5-cleanup', [1280, 390, 320]);
  await a.locator('#wtPrimary').click();
  await a.locator('#walkthrough').waitFor({ state: 'hidden' });
  await waitText(a, '.queue-empty', 'No active orders');
  assert.equal(await text(a, '#addOrderBtn'), 'Add order #3'); // Practice numbers are never reused.
  assert.equal((await admin.from('collection_orders').select('id').eq('id', testId)).data.length, 0);
  assert.match(await text(a, '#wtNote'), /restart the walkthrough any time from Queue settings/);
  assert.equal(await a.evaluate(() => document.body.classList.contains('wt-active')), false);
  assert.equal(await a.locator('[aria-describedby="wtTitle wtText"]').count(), 0);
  await a.reload(); await a.locator('.queue-empty').waitFor(); await a.waitForTimeout(1500);
  assert.equal(await a.locator('#walkthrough').isVisible(), false);

  // Restart from Queue settings begins at step 1; skipping persists.
  await a.locator('#queueSettingsToggle').click();
  await a.locator('#restartWalkthrough').click();
  await step(a, 1, 'Your orders');
  assert.equal(await a.locator('#queueSettingsBody').isVisible(), false);
  assert.equal((await focused(a)).id, 'customerNameInput');
  assert.equal(await text(a, '#addOrderBtn'), 'Add order #3');
  await a.locator('#wtSkip').click();
  await a.locator('#walkthrough').waitFor({ state: 'hidden' });
  assert.match(await text(a, '#wtNote'), /Walkthrough skipped/);
  await a.reload(); await a.locator('.queue-empty').waitFor(); await a.waitForTimeout(1500);
  assert.equal(await a.locator('#walkthrough').isVisible(), false);
  console.log('PASS: five-step walkthrough — focused add bar with dimming, refresh at steps 1–4, keyboard progress, same-tab customer screen with explanation gated to this device (not customers, expired or other tokens), Back button and browser Back, Mark Ready confirmation and Ready check, try-it-yourself with edit/ready/collected, practice-order cleanup without number reuse, restart from Queue settings, skip persistence, screenshots of every step at 1280/390.');

  // Outside the walkthrough the Customer screen panel shows both options.
  await a.locator('#screenPanelToggle').click();
  for (const selector of ['.screen-option-qr', '#copyScreenLink', '#printPoster', '#showPoster', '#copyCustomerLink', '#openBoard']) assert.equal(await a.locator(selector).isVisible(), true, selector);
  assert.equal(await text(a, '#screenQrTitle'), 'QR code');
  await a.locator('#screenPanel').screenshot({ path: '/tmp/popbia-screen-panel-normal-1280.png' });
  await a.locator('#screenPanelClose').click();

  // Normal staff controls after the walkthrough: every queue style and in-row editing.
  await a.locator('#addOrderBtn').click();
  await waitText(a, '#ordersList', '#3');
  await a.locator('#customerNameInput').fill('Maya'); await a.locator('#customerNameInput').press('Enter');
  await waitText(a, '#ordersList', '#4 · Maya');
  assert.equal(await text(a, '#addOrderBtn'), 'Add order #5');
  await a.locator('#queueSettingsToggle').click();
  await a.locator('#queueStyleSelect').selectOption('number'); await idle(a);
  await a.waitForFunction(() => cloud.business.queue_style === 'number');
  assert.equal(await a.locator('#customerNameField').isVisible(), false);
  await a.locator('#addOrderBtn').click();
  const numberRow = a.locator('.order-row').filter({ has: a.locator('.order-label', { hasText: /^#5$/ }) });
  await numberRow.waitFor();
  assert.equal(await numberRow.locator('[data-action="edit"]').count(), 0);
  await a.locator('#queueStyleSelect').selectOption('name'); await idle(a);
  await a.waitForFunction(() => cloud.business.queue_style === 'name');
  await a.locator('#addOrderBtn').click();
  await waitText(a, '#cloudMessage', 'Enter the customer’s name');
  await a.locator('#customerNameInput').fill('Sam'); await a.locator('#addOrderBtn').click();
  await waitText(a, '#ordersList', 'Sam');
  await a.locator('#queueStyleSelect').selectOption('number-name'); await idle(a);
  const mayaId = await a.locator('.order-row', { hasText: 'Maya' }).getAttribute('data-row-id');
  const row = a.locator(`[data-row-id="${mayaId}"]`);
  await row.locator('[data-action="edit"]').click();
  assert.equal(await text(a, `[data-row-id="${mayaId}"] .order-edit-label`), 'Editing order #4');
  await a.locator('#customerNameInput').fill('Next customer'); await a.locator('#customerNameInput').press('Enter');
  await waitText(a, '#ordersList', 'Next customer');
  assert.equal((await admin.from('collection_orders').select('customer_name').eq('id', mayaId).single()).data.customer_name, 'Maya');
  await row.locator('.order-edit-input').fill('Mia draft'); await row.locator('.order-edit-input').focus();
  await a.waitForTimeout(10500); // Polling keeps the open edit and its focus.
  assert.equal(await row.locator('.order-edit-input').inputValue(), 'Mia draft');
  await row.locator('.order-edit-input').press('Escape');
  assert.equal(await text(a, `[data-row-id="${mayaId}"] .order-label`), '#4 · Maya');
  await row.locator('[data-action="edit"]').click();
  await row.locator('.order-edit-input').fill('Mia'); await row.locator('.order-edit-input').press('Enter');
  await waitText(a, `[data-row-id="${mayaId}"] .order-label`, '#4 · Mia');
  const samId = await a.locator('.order-row', { hasText: 'Sam' }).getAttribute('data-row-id');
  await a.locator(`[data-row-id="${samId}"] [data-action="edit"]`).click();
  await a.locator(`[data-row-id="${samId}"] .order-edit-input`).fill('');
  await a.locator(`[data-row-id="${samId}"] [data-action="save-edit"]`).click();
  await waitText(a, '#cloudMessage', 'This order needs a name');
  const owner = createClient(url, key, {auth:{persistSession:false}});
  assert.ifError((await owner.auth.signInWithPassword({email: emails[0], password})).error);
  assert.ifError((await owner.from('collection_orders').delete().eq('id', samId)).error);
  await waitText(a, '#cloudMessage', 'no longer active, so the edit was cancelled');
  assert.deepEqual(errors, []);
  console.log('PASS: after the walkthrough, number+name / number-only / name-only creation and in-row editing (add bar never captures the edit, polling keeps the draft, Escape/Enter, validation, closes when removed elsewhere).');

  // Phone width in Firefox: step 1 layout, keyboard reaches Skip, skip persists with a quiet empty state.
  const m = watch(await fb.newPage({ viewport: { width: 390, height: 844 } }));
  await signIn(m, emails[1], 'Mobile Market');
  await step(m, 1, 'Your orders');
  assert(await noHorizontalScroll(m));
  const card = await m.locator('#walkthrough').boundingBox();
  assert(card.x >= 0 && card.x + card.width <= 390 && card.y + card.height <= 844);
  await m.screenshot({ path: '/tmp/popbia-wt-1-orders-firefox-390.png' });
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) { await m.keyboard.press('Tab'); reached = (await focused(m)).id === 'wtSkip'; }
  assert(reached, 'Skip walkthrough is reachable by keyboard');
  await m.keyboard.press('Enter');
  await m.locator('#walkthrough').waitFor({ state: 'hidden' });
  await m.reload(); await m.locator('.queue-empty').waitFor(); await m.waitForTimeout(1500);
  assert.equal(await m.locator('#walkthrough').isVisible(), false);
  assert.equal(await text(m, '.queue-empty'), 'No active orders. New orders appear here and on your customer screen.');

  // An established business (older than the trial window) is never offered the walkthrough.
  const established = createClient(url, key, {auth:{persistSession:false}});
  assert.ifError((await established.auth.signInWithPassword({email: emails[2], password})).error);
  const old = await established.rpc('create_business', {business_name: 'Established Eatery'}); assert.ifError(old.error);
  assert.ifError((await admin.from('businesses').update({created_at: new Date(Date.now() - 30 * 86400000).toISOString()}).eq('id', old.data)).error);
  const e = watch(await cb.newPage());
  await signIn(e, emails[2]);
  await e.locator('.queue-empty').waitFor(); await e.waitForTimeout(1500);
  assert.equal(await e.locator('#walkthrough').isVisible(), false);
  assert.equal(await e.evaluate(() => document.body.classList.contains('wt-focus')), false);
  assert.deepEqual(errors, []);
  console.log('PASS: Firefox at 390px (card fits, Skip reachable by keyboard, skip persists, quiet empty state); established business sees no walkthrough.');
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
