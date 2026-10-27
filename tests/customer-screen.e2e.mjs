// Customer screen setup, QR poster and shared-display behaviour. Local Supabase only; never hosted.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
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
const browsers = [], errors = [], password = 'PopBia-screen-42!', suffix = Date.now();
const emails = ['owner', 'second'].map(name => `screen-${name}-${suffix}@example.com`);
const admin = createClient(url, status.SERVICE_ROLE_KEY, {auth:{persistSession:false}});

const watch = page => { page.on('pageerror', e => errors.push(`${page.url()}: ${e.message}`)); return page; };
async function waitText(page, selector, text) {
  await page.waitForFunction(({selector,text}) => document.querySelector(selector)?.textContent.includes(text), {selector,text}, {timeout: 20000});
}
const text = async (page, selector) => (await page.locator(selector).textContent()).trim();
const noHorizontalScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const staffLinks = page => page.locator('a').evaluateAll(as => as.map(a => a.getAttribute('href') || '').filter(h => /board-admin|account\.html/.test(h)));
// True only if the image is exactly the QR symbol for `expected`: every module is sampled and compared.
const qrMatches = (page, source, expected) => page.evaluate(async ({ source, expected }) => {
  let canvas = source.canvas ? document.querySelector(source.canvas) : null;
  if (source.svg) {
    const image = new Image();
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(document.querySelector(source.svg)));
    await image.decode();
    canvas = document.createElement('canvas'); canvas.width = canvas.height = 660;
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, 660, 660); context.drawImage(image, 0, 0, 660, 660);
  }
  const { width, height } = canvas, pixels = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const dark = (x, y) => pixels[(Math.floor(y) * width + Math.floor(x)) * 4] < 128;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (dark(x, y)) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const modules = QRCode.create(expected, { errorCorrectionLevel: 'M' }).modules, n = modules.size, size = (maxX - minX + 1) / n;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (dark(minX + (c + .5) * size, minY + (r + .5) * size) !== !!modules.data[r * n + c]) return false;
  }
  return true;
}, { source, expected });
async function signIn(page, email, businessName) {
  await page.goto(base + '/account.html');
  await page.locator('#email').fill(email); await page.locator('#password').fill(password);
  await page.locator('#authSubmit').click();
  await page.locator('#businessForm').waitFor({state:'visible'});
  await page.locator('#businessName').fill(businessName); await page.locator('#businessForm button').click();
  await page.waitForURL('**/board-admin.html');
  await page.waitForFunction(() => document.querySelector('.admin-connection-status')?.textContent === 'Live');
}

try {
  for (const email of emails) assert.ifError((await admin.auth.admin.createUser({ email, password, email_confirm: true })).error);
  const cb = await chromium.launch(), fb = await firefox.launch(); browsers.push(cb, fb);
  const staffContext = await cb.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  // Count print and chime calls in every page of the staff context, including tabs it opens.
  await staffContext.addInitScript(() => {
    window.printCalls = 0; window.print = () => { window.printCalls++; };
    window.chimes = 0;
    if (window.AudioContext) {
      const create = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function () { window.chimes++; return create.call(this); };
    }
  });
  const staff = watch(await staffContext.newPage());
  await signIn(staff, emails[0], 'Screen Café');
  const business = (await admin.from('businesses').select('*').eq('name', 'Screen Café').single()).data;
  const screenUrl = `${base}/board.html?display=${business.display_id}`;
  const customerUrl = `${screenUrl}&phone=1`;
  const posterUrl = `${base}/qr-poster.html?display=${business.display_id}`;
  await staff.locator('#firstRunAdd').click();
  await waitText(staff, '#ordersList', '#1 · Test');

  // 1. Customer screen panel: discoverable from the header, both options, correct links.
  assert.equal(await staff.locator('#screenPanel').isVisible(), false);
  await staff.locator('#screenPanelToggle').click();
  await staff.locator('#screenPanel').waitFor({state:'visible'});
  assert.equal(await staff.locator('#screenPanelToggle').getAttribute('aria-expanded'), 'true');
  assert.equal(await staff.evaluate(() => document.activeElement.id), 'screenPanelTitle');
  assert.equal(await text(staff, '#screenTvTitle'), 'Show it on a TV or tablet');
  assert.equal(await text(staff, '#screenQrTitle'), 'Let customers scan a QR code');
  assert.equal(await staff.locator('#openBoard').getAttribute('href'), screenUrl);
  assert.equal(await staff.locator('#showPoster').getAttribute('href'), posterUrl);
  assert.equal(await staff.locator('#printPoster').getAttribute('href'), `${posterUrl}&print=1`);
  assert.equal(await qrMatches(staff, { canvas: '#screenQrCode' }, customerUrl), true);
  assert.equal(await qrMatches(staff, { canvas: '#screenQrCode' }, screenUrl), false); // The check really discriminates.
  for (const width of [1280, 390]) {
    await staff.setViewportSize({ width, height: 900 });
    assert(await noHorizontalScroll(staff));
    await staff.locator('#screenPanel').screenshot({ path: `/tmp/popbia-screen-panel-${width}.png` });
  }
  await staff.setViewportSize({ width: 1280, height: 900 });

  // 2. Copy links (clipboard), including the manual fallback when the browser refuses.
  await staff.locator('#copyCustomerLink').click();
  await waitText(staff, '#screenCopyStatus', 'Customer link copied');
  assert.equal(await staff.evaluate(() => navigator.clipboard.readText()), customerUrl);
  await staff.locator('#copyScreenLink').click();
  await waitText(staff, '#screenCopyStatus', 'Screen link copied');
  assert.equal(await staff.evaluate(() => navigator.clipboard.readText()), screenUrl);
  await waitText(staff, '#firstRunProgress', '2 of 3 done'); // Setting up the screen counts as the guide's step 2.
  await staff.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('Denied')); });
  await staff.locator('#copyCustomerLink').click();
  await waitText(staff, '#screenCopyStatus', 'Couldn’t copy automatically');
  assert.equal(await staff.locator('#screenCopyFallback').inputValue(), customerUrl);
  assert.equal(await staff.evaluate(() => document.activeElement.id), 'screenCopyFallback');

  // 3. Shared customer screen in a new tab: wording, empty states, footer QR, display controls.
  const [board] = await Promise.all([staffContext.waitForEvent('page'), staff.locator('#openBoard').click()]);
  watch(board); await board.waitForLoadState();
  assert.equal(board.url(), screenUrl);
  await waitText(board, '.board-brand-copy h1', 'Screen Café');
  await waitText(board, '#preparingList', '#1');
  assert.equal(await text(board, '#preparingTitle'), 'Preparing');
  assert.equal(await text(board, '#readyTitle'), 'Ready for collection');
  assert.equal(await text(board, '#readyList'), 'No orders ready yet');
  assert.equal(await board.locator('#cloudMessage').getAttribute('data-state'), 'live');
  assert.equal(await qrMatches(board, { canvas: '#boardQrCode' }, customerUrl), true);
  assert.equal(await board.locator('#displayControls').isVisible(), true);
  assert.deepEqual(await staffLinks(board), []);
  assert.equal(new URL(staff.url()).pathname, '/board-admin.html'); // Staff tab untouched.
  // Sound: one tap unlocks audio; the confirmation chime and later Ready chimes play.
  assert.equal(await text(board, '#soundToggle'), 'Turn sound on');
  await board.locator('#soundToggle').click();
  await board.waitForFunction(() => document.getElementById('soundToggle').getAttribute('aria-pressed') === 'true');
  assert.equal(await text(board, '#soundToggle'), 'Sound on');
  const chimesBefore = await board.evaluate(() => window.chimes);
  assert(chimesBefore >= 1);
  // Full screen through a tap, and back.
  await board.locator('#fullscreenToggle').click();
  await board.waitForFunction(() => !!document.fullscreenElement);
  assert.equal(await text(board, '#fullscreenToggle'), 'Exit full screen');
  await board.screenshot({ path: '/tmp/popbia-customer-screen-fullscreen.png' });
  await board.locator('#fullscreenToggle').click();
  await board.waitForFunction(() => !document.fullscreenElement);
  assert.equal(await text(board, '#fullscreenToggle'), 'Full screen');

  // 4. Real-time Ready update with chime, then the guide's test order is removed cleanly.
  await staff.locator('[data-action="ready"]').first().click();
  await waitText(board, '#readyList', '#1');
  assert.equal(await text(board, '#preparingList'), 'No orders being prepared');
  await board.waitForFunction(before => window.chimes > before, chimesBefore);
  await waitText(staff, '#firstRunProgress', 'All done');
  assert.equal(await staff.locator('#firstRunRemoveTest').isVisible(), true);
  await staff.locator('#firstRunRemoveTest').click();
  await staff.waitForFunction(() => !document.getElementById('ordersList').textContent.includes('Test'));
  await waitText(board, '#readyList', 'No orders ready yet');
  assert.equal(await text(staff, '#addOrderBtn'), 'Add order #2'); // Numbers are never reused.
  assert.match(await text(staff, '#firstRunFinishText'), /Your next order will be #2\. Numbers aren’t reused\./);
  assert.equal(await staff.locator('#firstRunRemoveTest').isVisible(), false);
  await staff.locator('#firstRunDone').click();
  assert.equal(await staff.locator('#firstRun').isVisible(), false);
  // Reopen the guide from Queue settings.
  await staff.locator('#queueSettingsToggle').click();
  await staff.locator('#showGuideBtn').click();
  await staff.locator('#firstRun').waitFor({state:'visible'});
  assert.equal(await text(staff, '#firstRunProgress'), 'All done');
  assert.equal(await staff.evaluate(() => document.activeElement.id), 'firstRunTitle');
  await staff.reload(); await staff.locator('#firstRun').waitFor({state:'visible'}); // A reopened guide survives refresh.
  await staff.locator('#firstRunDone').click();
  await staff.reload(); await staff.locator('.queue-empty').waitFor(); await staff.waitForTimeout(1000);
  assert.equal(await staff.locator('#firstRun').isVisible(), false);
  // Refreshing the customer screen keeps it working.
  await staff.locator('#customerNameInput').fill('Aoife'); await staff.locator('#addOrderBtn').click();
  await board.reload(); await waitText(board, '#preparingList', 'Aoife');
  await board.waitForFunction(() => document.getElementById('cloudMessage').dataset.state === 'live');
  // Turning the chime off in settings hides the sound control.
  await staff.locator('#queueSettingsToggle').click();
  await staff.locator('#readyChimeSelect').selectOption('off');
  await board.waitForFunction(() => document.getElementById('soundToggle').hidden);
  await staff.locator('#readyChimeSelect').selectOption('on');
  await board.waitForFunction(() => !document.getElementById('soundToggle').hidden);
  console.log('PASS: customer screen panel (desktop/mobile), QR verified module-by-module for the phone link, copy links with fallback, new-tab customer screen with consistent wording and empty states, footer QR, sound unlock and chimes, fullscreen toggle, real-time Ready, test order removal without number reuse, guide reopened from Queue settings, refresh, chime setting.');

  // 5. QR poster: auto print, correct QR, one A4 page; on-screen version for phones; invalid links.
  await staff.locator('#screenPanelToggle').click();
  await staff.locator('#screenPanel').waitFor({state:'visible'});
  const [poster] = await Promise.all([staffContext.waitForEvent('page'), staff.locator('#printPoster').click()]);
  watch(poster); await poster.waitForLoadState();
  await waitText(poster, '#posterBusiness', 'Screen Café');
  await poster.waitForFunction(() => window.printCalls === 1);
  assert.equal(await poster.title(), 'Screen Café — QR poster');
  assert.equal(await qrMatches(poster, { svg: '#posterQr svg' }, customerUrl), true);
  assert.equal(await text(poster, '.poster-headline'), 'Scan to check when your order is ready');
  assert.deepEqual(await staffLinks(poster), []);
  await poster.emulateMedia({ media: 'print' });
  assert.equal(await poster.locator('.poster-toolbar').isVisible(), false);
  const pdf = await poster.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  await writeFile('/tmp/popbia-qr-poster.pdf', pdf);
  assert.equal(pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g).length, 1, 'Poster prints on exactly one A4 page');
  await poster.setViewportSize({ width: 794, height: 1123 }); await poster.screenshot({ path: '/tmp/popbia-qr-poster-print.png' });
  const [shown] = await Promise.all([staffContext.waitForEvent('page'), staff.locator('#showPoster').click()]);
  watch(shown); await waitText(shown, '#posterBusiness', 'Screen Café');
  await shown.waitForTimeout(500);
  assert.equal(await shown.evaluate(() => window.printCalls), 0);
  await shown.setViewportSize({ width: 390, height: 844 });
  assert(await noHorizontalScroll(shown));
  await shown.screenshot({ path: '/tmp/popbia-qr-poster-phone.png', fullPage: true });
  await shown.goto(`${base}/qr-poster.html?display=not-a-display`);
  await waitText(shown, '#posterMessage', 'This poster link isn’t complete');
  assert.equal(await shown.locator('#poster').isVisible(), false);
  await shown.goto(`${base}/qr-poster.html?display=00000000-0000-4000-8000-000000000000`);
  await waitText(shown, '#posterMessage', 'doesn’t match a business');
  console.log('PASS: printable poster auto-prints, QR verified for the phone link, single A4 PDF page, phone display without printing, invalid and unknown poster links explained.');

  // 6. Customers need no account: a fresh anonymous phone opens the QR destination.
  const phoneContext = await cb.newContext({ viewport: { width: 390, height: 844 } });
  const phone = watch(await phoneContext.newPage());
  await phone.goto(customerUrl);
  await waitText(phone, '.board-brand-copy h1', 'Screen Café');
  await waitText(phone, '#preparingList', 'Aoife');
  assert.equal(await phone.evaluate(() => document.body.classList.contains('phone-view')), true);
  assert.equal(await phone.locator('.board-qr').isVisible(), false);
  assert.equal(await phone.locator('#cloudMessage').isVisible(), true);
  assert.equal(await phone.evaluate(() => Object.keys(localStorage).some(k => k.includes('popbia-account'))), false);
  assert.deepEqual(await staffLinks(phone), []);
  assert(await noHorizontalScroll(phone));
  await phone.screenshot({ path: '/tmp/popbia-customer-phone.png', fullPage: true });
  // Staff controls stay protected for that visitor, and base tables stay closed to anonymous clients.
  await phone.goto(`${base}/board-admin.html`);
  await phone.waitForURL('**/account.html');
  assert.equal(await phone.locator('#collection-demo').count(), 0);
  const anon = createClient(url, key, { auth: { persistSession: false } });
  assert.ok((await anon.from('collection_orders').select('*')).error);
  assert.ok((await anon.from('businesses').select('*')).error);
  const projection = (await anon.rpc('collection_display', { display: business.display_id })).data;
  assert.deepEqual(Object.keys(projection).sort(), ['inactive', 'name', 'orders', 'overdue_seconds', 'queue_style', 'ready_chime']);
  assert.deepEqual(Object.keys(projection.orders[0]).sort(), ['created_at', 'customer_name', 'id', 'number', 'ready_at', 'status', 'type']);
  assert(!JSON.stringify(projection).includes(business.id)); // No internal business ID or emails.
  assert(!JSON.stringify(projection).includes('@'));

  // 7. QR codes resolve to the right business: a second business gets its own link and queue.
  const second = createClient(url, key, { auth: { persistSession: false } });
  assert.ifError((await second.auth.signInWithPassword({ email: emails[1], password })).error);
  const secondId = (await second.rpc('create_business', { business_name: 'Second Stall' })).data;
  assert.ifError((await second.rpc('add_collection_order', { target_business: secondId, customer_name: 'Only here' })).error);
  const secondDisplay = (await admin.from('businesses').select('display_id').eq('id', secondId).single()).data.display_id;
  assert.notEqual(secondDisplay, business.display_id);
  await phone.goto(`${base}/board.html?display=${secondDisplay}&phone=1`);
  await waitText(phone, '.board-brand-copy h1', 'Second Stall');
  await waitText(phone, '#preparingList', 'Only here');
  assert(!(await text(phone, '#preparingList')).includes('Aoife'));
  await phone.goto(customerUrl); await waitText(phone, '#preparingList', 'Aoife');
  assert(!(await text(phone, '#preparingList')).includes('Only here'));
  await phone.goto(`${base}/board.html?display=00000000-0000-4000-8000-000000000000`);
  await waitText(phone, '#cloudMessage', 'isn’t valid');

  // 8. Reconnect: offline shows a clear state and the last update; coming back online catches up.
  const tv = watch(await (await cb.newContext({ viewport: { width: 1280, height: 720 } })).newPage());
  await tv.goto(screenUrl); await waitText(tv, '#preparingList', 'Aoife');
  await tv.context().setOffline(true);
  await tv.evaluate(() => cloud.refresh());
  await tv.waitForFunction(() => document.getElementById('cloudMessage').dataset.state === 'offline');
  assert.match(await text(tv, '#cloudMessage'), /^Offline · retrying · last update \d\d:\d\d$/);
  const owner = createClient(url, key, { auth: { persistSession: false } });
  assert.ifError((await owner.auth.signInWithPassword({ email: emails[0], password })).error);
  assert.ifError((await owner.rpc('add_collection_order', { target_business: business.id, customer_name: 'While offline' })).error);
  await tv.context().setOffline(false);
  await waitText(tv, '#preparingList', 'While offline');
  await tv.waitForFunction(() => document.getElementById('cloudMessage').dataset.state === 'live', null, { timeout: 30000 });
  await tv.screenshot({ path: '/tmp/popbia-customer-screen-tv.png' });

  // 9. Wake lock where supported (stubbed), released and re-acquired when the screen is visible again.
  const wakePage = watch(await (await cb.newContext()).newPage());
  await wakePage.addInitScript(() => {
    window.wakeRequests = 0;
    Object.defineProperty(Navigator.prototype, 'wakeLock', { configurable: true, get: () => ({
      request: async () => { window.wakeRequests++; const sentinel = new EventTarget(); sentinel.release = async () => sentinel.dispatchEvent(new Event('release')); window.sentinel = sentinel; return sentinel; }
    }) });
  });
  await wakePage.goto(screenUrl);
  await wakePage.waitForFunction(() => window.wakeRequests === 1);
  await waitText(wakePage, '#displayNote', 'Screen stays on');
  await wakePage.evaluate(() => window.sentinel.release());
  assert.equal(await text(wakePage, '#displayNote'), '');
  await wakePage.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await wakePage.waitForFunction(() => window.wakeRequests === 2);
  // Phone views never hold a wake lock.
  await wakePage.goto(customerUrl); await waitText(wakePage, '#preparingList', 'Aoife');
  assert.equal(await wakePage.evaluate(() => window.wakeRequests), 0);

  // 10. Browsers without fullscreen, wake lock or Web Audio: controls hide and the screen still works.
  const bare = watch(await (await cb.newContext()).newPage());
  await bare.addInitScript(() => {
    for (const name of ['fullscreenEnabled', 'webkitFullscreenEnabled']) Object.defineProperty(Document.prototype, name, { configurable: true, get: () => false });
    Object.defineProperty(Navigator.prototype, 'wakeLock', { configurable: true, get: () => undefined });
    window.AudioContext = undefined; window.webkitAudioContext = undefined;
  });
  await bare.goto(screenUrl); await waitText(bare, '#preparingList', 'Aoife');
  assert.equal(await bare.locator('#fullscreenToggle').isVisible(), false);
  assert.equal(await bare.locator('#soundToggle').isVisible(), false);
  assert.equal(await text(bare, '#displayNote'), '');
  assert.ifError((await owner.rpc('add_collection_order', { target_business: business.id, customer_name: 'Still live' })).error);
  await waitText(bare, '#preparingList', 'Still live');
  // Firefox shared screen renders its controls without errors.
  const fox = watch(await fb.newPage({ viewport: { width: 1280, height: 720 } }));
  await fox.goto(screenUrl); await waitText(fox, '#preparingList', 'Still live');
  assert.equal(await fox.locator('#displayControls').isVisible(), true);
  assert.equal(await fox.locator('#soundToggle').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log('PASS: anonymous phone view (no session, no staff links), staff controls redirect to login, minimal public projection, per-business QR destinations, invalid screen link, offline state with last update and catch-up on reconnect, wake lock acquire/release/re-acquire, phone views skip wake lock, unsupported-feature fallbacks, Firefox shared screen.');
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
