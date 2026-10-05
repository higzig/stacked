// Disposable local Supabase only; runs Chromium and Firefox, not two tabs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium, firefox } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
const status = JSON.parse(execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8' }));
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
const browsers = [], errors = [];

const suffix = Date.now();
const email = `stacked-${suffix}@example.com`, otherEmail = `other-${suffix}@example.com`, password = 'PopBia-test-42!';
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false }});
async function pageFor(engine) {
  const browser = await engine.launch(); browsers.push(browser);
  const page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message)); return page;
}
async function login(page, address, signup = false) {
  await page.goto(base + '/account.html');
  await page.locator('#authForm').waitFor({ state: 'visible' });
  if (signup) await page.locator('#switchAuth').click();
  await page.locator('#email').fill(address); await page.locator('#password').fill(password);
  await page.locator('#authSubmit').click();
}
async function waitText(page, selector, text) {
  await page.waitForFunction(({selector,text}) => document.querySelector(selector)?.textContent.includes(text), {selector,text}, {timeout: 15000});
}
try {
  const a = await pageFor(chromium), b = await pageFor(firefox), display = await pageFor(chromium);
  await login(a, email, true);
  await a.locator('#businessForm').waitFor({state:'visible'});
  await a.locator('#businessName').fill('Stacked'); await a.locator('#businessForm button').click();
  await a.waitForURL('**/board-admin.html');
  await a.locator('#collection-demo').waitFor({state:'visible'});
  await a.locator('#orderNumberInput').fill('42'); await a.locator('#customerNameInput').fill('Aoife');
  await a.locator('#addOrderBtn').click(); await waitText(a,'#ordersList','#42');
  const displayUrl = await a.locator('#openBoard').getAttribute('href');
  await display.goto(base + '/' + displayUrl);
  await waitText(display,'#preparingList','#42');
  await waitText(a,'.admin-connection-status','Live'); await waitText(display,'#cloudMessage','Live');
  // Disable catch-up polling to prove the following updates arrive via Realtime.
  await a.evaluate(() => clearInterval(cloud.timer)); await display.evaluate(() => clearInterval(cloud.timer));
  await login(b, email);
  await b.waitForURL('**/board-admin.html'); await waitText(b,'#ordersList','#42');
  await b.locator('[data-action="ready"]').click();
  await a.waitForSelector('.order-row.ready'); await waitText(display,'#readyList','#42');
  assert.equal(await display.locator('#preparingList').textContent(), 'No orders');
  console.log('PASS: Chromium signup/onboarding → Firefox login → Ready sync to Chromium and anonymous display via Realtime.');
  await b.reload(); await waitText(b,'#ordersList','#42');
  await a.locator('#logoutButton').click(); await a.waitForURL('**/account.html');
  await login(a,email); await a.waitForURL('**/board-admin.html'); await waitText(a,'#ordersList','#42');
  console.log('PASS: persistent session after reload, logout and login preserve business and order.');
  const staff = createClient(url,key,{auth:{persistSession:false}}), other = createClient(url,key,{auth:{persistSession:false}}), anon = createClient(url,key,{auth:{persistSession:false}});
  const loginResult = await staff.auth.signInWithPassword({email,password}); assert.ifError(loginResult.error);
  const signupResult = await other.auth.signUp({email:otherEmail,password}); assert.ifError(signupResult.error);
  const workspace = await other.rpc('create_business',{business_name:'Other business'}); assert.ifError(workspace.error);
  const business = (await staff.from('businesses').select('*').single()).data;
  const order = (await staff.from('collection_orders').select('*').eq('number',42).single()).data;
  assert.deepEqual((await other.from('collection_orders').select('*').eq('business_id',business.id)).data,[]);
  assert.deepEqual((await other.from('businesses').select('*').eq('id',business.id)).data,[]);
  const edit = await other.from('collection_orders').update({status:'collected'}).eq('id',order.id).select(); assert.deepEqual(edit.data,[]);
  const remove = await other.from('collection_orders').delete().eq('id',order.id).select(); assert.deepEqual(remove.data,[]);
  assert.ok((await other.rpc('add_collection_order',{target_business:business.id,customer_name:'intruder'})).error);
  assert.ok((await other.from('business_members').insert({business_id:business.id,user_id:signupResult.data.user.id})).error);
  assert.ok((await other.from('collection_orders').update({business_id:workspace.data}).eq('id',order.id)).error);
  assert.ok((await anon.from('collection_orders').select('*')).error);
  assert.ok((await anon.from('businesses').select('*')).error);
  const snapshot = await anon.rpc('collection_display',{display:business.display_id}); assert.ifError(snapshot.error);
  assert.deepEqual(Object.keys(snapshot.data).sort(),['name','orders','overdue_seconds','queue_style','ready_chime']);
  assert.ok(!JSON.stringify(snapshot.data).includes(business.id));
  assert.equal((await anon.rpc('collection_display',{display:crypto.randomUUID()})).data,null);
  assert.ok((await anon.rpc('create_business',{business_name:'intruder'})).error);
  console.log('PASS: cross-tenant read/update/delete/RPC/membership tampering denied; anonymous access is restricted to display projection.');
  const concurrent = await Promise.all(Array.from({length:8},() => staff.rpc('add_collection_order',{target_business:business.id,customer_name:'Concurrent'})));
  concurrent.forEach(r => assert.ifError(r.error));
  const numbered = await staff.from('collection_orders').select('number').eq('business_id',business.id);
  assert.equal(new Set(numbered.data.map(o => o.number)).size,numbered.data.length);
  await b.locator('[data-action="collected"]').first().click();
  await display.waitForFunction(() => !document.getElementById('readyList').textContent.includes('#42'));
  const history = await staff.from('collection_orders').select('*').eq('id',order.id).single(); assert.equal(history.data.status,'collected'); assert.ok(history.data.collected_at);
  console.log('PASS: concurrent numbering stays unique; collected orders disappear publicly and remain in staff history.');
  assert.ok((await staff.from('businesses').update({next_number:999}).eq('id',business.id)).error);
  assert.ok((await staff.from('collection_orders').update({ready_at:new Date().toISOString()}).eq('id',order.id)).error);
  assert.ok((await staff.from('collection_orders').insert({business_id:business.id,number:999,type:'number'})).error);
  await b.locator('#queueSettingsToggle').click();
  await b.locator('#queueStyleSelect').selectOption('name');
  await b.waitForFunction(() => !busy && cloud.business.queue_style === 'name');
  await a.waitForFunction(() => cloud.business.queue_style === 'name');
  assert.equal(await b.locator('.order-row').count(),8); // Switching style keeps existing orders.
  await b.locator('#overdueSelect').selectOption('30');
  await b.waitForFunction(() => !busy && cloud.business.overdue_seconds === 30);
  await display.waitForFunction(() => cloud.business.overdue_seconds === 30);
  await b.locator('#readyChimeSelect').selectOption('off');
  await b.waitForFunction(() => !busy && !cloud.business.ready_chime);
  await display.waitForFunction(() => !cloud.business.ready_chime);
  const editRow = b.locator('.order-row').first(); const editId = await editRow.getAttribute('data-row-id');
  await editRow.locator('[data-action="edit"]').click();
  await b.locator('#customerNameInput').fill('Edited'); await b.locator('#addOrderBtn').click();
  await waitText(display,'#preparingList','Edited');
  await b.locator(`[data-row-id="${editId}"] [data-action="remove"]`).click();
  await display.waitForFunction(() => !document.getElementById('preparingList').textContent.includes('Edited'));
  await b.locator('#customerNameInput').fill('Name only'); await b.locator('#addOrderBtn').click();
  await waitText(display,'#preparingList','Name only');
  await b.waitForFunction(() => !busy);
  b.once('dialog', dialog => dialog.accept()); await b.locator('#resetDemoBtn').click();
  await display.waitForFunction(() => document.getElementById('preparingList').textContent === 'No orders');
  assert.ok(!(await anon.rpc('collection_display',{display:business.display_id})).data.orders.length);
  console.log('PASS: settings sync, queue style preserves orders, edits/removals/name-only orders/clear queue work; protected columns and direct inserts are denied.');
  await a.setViewportSize({width:390,height:844}); await a.screenshot({path:'/tmp/popbia-staff-mobile.png',fullPage:true});
  await display.screenshot({path:'/tmp/popbia-display.png',fullPage:true});
  assert.deepEqual(errors,[]);
} finally {
  // Local test fixtures only. Include signup users even if an earlier assertion failed.
  const users = await admin.auth.admin.listUsers();
  for (const user of users.data?.users || []) if ([email,otherEmail].includes(user.email)) {
    const memberships = await admin.from('business_members').select('business_id').eq('user_id',user.id);
    for (const m of memberships.data || []) await admin.from('businesses').delete().eq('id',m.business_id);
    await admin.auth.admin.deleteUser(user.id);
  }
  for (const browser of browsers) await browser.close();
  await new Promise(done => server.close(done));
}
