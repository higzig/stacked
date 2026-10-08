// Uses local Supabase with email confirmation enabled and Mailpit; never hosted.
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
const browsers = [], errors = [];

const suffix = Date.now(), email = `onboarding-${suffix}@example.com`, password = 'PopBia-test-42!';
const admin = createClient(url, status.SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const mailUrl = status.MAILPIT_URL || status.INBUCKET_URL;
assert.match(mailUrl, /^http:\/\/(127\.0\.0\.1|localhost):/);
async function mailboxLink() {
  for (let attempt = 0; attempt < 30; attempt++) {
    const inbox = await (await fetch(mailUrl + '/api/v1/messages')).json();
    const mail = inbox.messages?.find(m => m.To?.some(to => to.Address === email));
    if (mail) {
      const content = await (await fetch(mailUrl + '/api/v1/message/' + mail.ID)).json();
      const link = content.HTML?.match(/href="([^"]*auth\/v1\/verify[^"]*)"/i)?.[1];
      if (link) return link.replaceAll('&amp;', '&');
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Confirmation email not received in local Mailpit.');
}
try {
  const settings = await (await fetch(url + '/auth/v1/settings', {headers:{apikey:key}})).json();
  assert.equal(settings.mailer_autoconfirm, false, 'Run this suite with local auth.email.enable_confirmations=true.');
  const cb = await chromium.launch(), fb = await firefox.launch(); browsers.push(cb, fb);
  const signup = await cb.newPage(), confirmed = await fb.newPage();
  for(const p of [signup, confirmed]) p.on('pageerror', e => errors.push(e.message));
  await signup.goto(base + '/account.html');
  await signup.locator('#switchAuth').click();
  await signup.locator('#email').fill(email); await signup.locator('#password').fill(password);
  await signup.locator('#authSubmit').click();
  await signup.locator('#signupConfirmation').waitFor({state:'visible'});
  assert.equal(await signup.locator('#accountTitle').innerText(), 'Check your inbox');
  assert.equal(await signup.locator('#confirmationEmail').innerText(), email);
  assert.equal(await signup.locator('#authForm').isVisible(), false);
  assert.equal(await signup.locator('#businessForm').isVisible(), false);
  assert.equal(await signup.locator('#onboardingPlans').isVisible(), false);
  assert.equal(await signup.evaluate(async()=> (await window.createPopBiaClient().auth.getSession()).data.session), null);
  // The normal ten-second account refresh must not undo the confirmation screen.
  await signup.waitForTimeout(10500);
  assert.equal(await signup.locator('#signupConfirmation').isVisible(), true);
  await signup.setViewportSize({width:390,height:844});
  await signup.screenshot({path:'/tmp/popbia-check-inbox.png',fullPage:true});
  await signup.locator('#backToLogin').click();
  assert.equal(await signup.locator('#authSubmit').innerText(), 'Log in');
  await signup.locator('#password').fill(password); await signup.locator('#authSubmit').click();
  await signup.waitForFunction(()=>document.getElementById('accountMessage').textContent.toLowerCase().includes('email not confirmed'));
  const confirmationLink = await mailboxLink();
  assert(confirmationLink.startsWith(url));
  await confirmed.goto(confirmationLink);
  await confirmed.waitForURL(u => u.pathname === '/account.html');
  await confirmed.locator('#onboardingPlans').waitFor({state:'visible'});
  assert.equal(await confirmed.locator('#businessForm').isVisible(), false);
  assert(!/[€]|39|360|discount|savings/i.test(await confirmed.locator('#onboardingPlans').innerText()));
  const links = await confirmed.locator('.invite-notice a').evaluateAll(as=>as.map(a=>a.href));
  assert(links[0].startsWith('mailto:hello@popbia.com'));assert(decodeURIComponent(links[0]).includes('Monthly plan interest'));
  assert(decodeURIComponent(links[1]).includes('Annual plan interest'));
  for(const width of [1280,390]) {
    await confirmed.setViewportSize({width,height:900});
    assert(await confirmed.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const cards = await confirmed.locator('.onboarding-card').all();
    const boxes = await Promise.all(cards.map(c=>c.boundingBox()));
    if(width===1280) assert(boxes[0].x<boxes[1].x && boxes[1].x<boxes[2].x);
    else assert(boxes[0].y<boxes[1].y && boxes[1].y<boxes[2].y);
    await confirmed.screenshot({path:`/tmp/popbia-onboarding-${width}.png`,fullPage:true});
  }
  await confirmed.reload();await confirmed.locator('#startTrial').waitFor({state:'visible'});
  const users = await admin.auth.admin.listUsers(); const user = users.data.users.find(u=>u.email===email);
  assert(user.email_confirmed_at);
  assert.deepEqual((await admin.from('business_members').select('*').eq('user_id',user.id)).data, []);
  await confirmed.locator('#startTrial').click();
  await confirmed.locator('#businessName').fill('Trial Counter');
  await confirmed.waitForTimeout(10500);
  assert.equal(await confirmed.locator('#businessName').inputValue(), 'Trial Counter');
  assert.equal(await confirmed.locator('#businessForm').isVisible(), true);
  await confirmed.locator('#businessForm button').click();
  await confirmed.waitForURL('**/board-admin.html');
  await confirmed.locator('#collection-demo').waitFor({state:'visible'});
  assert((await confirmed.locator('#collectionEntitlement').innerText()).includes('14 days remaining'));
  const membership = await admin.from('business_members').select('business_id').eq('user_id',user.id).single();
  const entitlement = (await admin.from('business_entitlements').select('*').eq('business_id',membership.data.business_id).single()).data;
  assert.equal(Date.parse(entitlement.trial_ends_at)-Date.parse(entitlement.trial_started_at),14*86400000);
  await confirmed.goto(base + '/account.html');await confirmed.waitForURL('**/board-admin.html');
  await confirmed.locator('#logoutButton').click();await confirmed.waitForURL('**/account.html');
  await confirmed.locator('#email').fill(email);await confirmed.locator('#password').fill(password);await confirmed.locator('#authSubmit').click();
  await confirmed.waitForURL('**/board-admin.html');
  const staff = createClient(url,key,{auth:{persistSession:false}});assert.ifError((await staff.auth.signInWithPassword({email,password})).error);
  assert.equal((await staff.rpc('create_business',{business_name:'Cannot reset'})).data,membership.data.business_id);
  const again = (await staff.rpc('collection_entitlement',{target_business:membership.data.business_id})).data;
  assert.equal(again.trial_started_at,entitlement.trial_started_at);
  // Existing legacy workspace skips selection too.
  assert.ifError((await admin.from('business_entitlements').update({subscription_status:'active',legacy_access:true}).eq('business_id',membership.data.business_id)).error);
  await confirmed.goto(base+'/account.html');await confirmed.waitForURL('**/board-admin.html');
  assert.deepEqual(errors,[]);
  console.log('PASS: real email confirmation across Chromium/Firefox; dedicated inbox screen survives refresh polling; login return, no pre-confirmation session, desktop/mobile cards, email interest links, one-time workspace onboarding, exact unchanged trial, existing trial/legacy bypass.');
} finally {
  const users = await admin.auth.admin.listUsers();
  for(const user of users.data?.users || []) if(user.email===email) {
    const memberships = await admin.from('business_members').select('business_id').eq('user_id',user.id);
    for(const m of memberships.data || []) await admin.from('businesses').delete().eq('id',m.business_id);
    await admin.auth.admin.deleteUser(user.id);
  }
  for(const browser of browsers) await browser.close();
  await new Promise(done=>server.close(done));
}
