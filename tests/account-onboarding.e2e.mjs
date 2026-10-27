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

const suffix = Date.now(), email = `onboarding-${suffix}@example.com`, password = 'PopBia-test-42!', newPassword = 'PopBia-reset-42!';
const admin = createClient(url, status.SERVICE_ROLE_KEY, {auth:{persistSession:false}});
const mailUrl = status.MAILPIT_URL || status.INBUCKET_URL;
assert.match(mailUrl, /^http:\/\/(127\.0\.0\.1|localhost):/);
// Returns this run's Auth links of one type, oldest first, once at least `count` have arrived.
async function mailLinks(type, count = 1) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const inbox = await (await fetch(mailUrl + '/api/v1/messages?limit=200')).json();
    const mails = (inbox.messages || []).filter(m => m.To?.some(to => to.Address === email)).sort((a, b) => Date.parse(a.Created) - Date.parse(b.Created));
    const links = [];
    for (const mail of mails) {
      const content = await (await fetch(mailUrl + '/api/v1/message/' + mail.ID)).json();
      const link = content.HTML?.match(/href="([^"]*auth\/v1\/verify[^"]*)"/i)?.[1]?.replaceAll('&amp;', '&');
      if (link && new URL(link).searchParams.get('type') === type) links.push(link);
    }
    if (links.length >= count) return links;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Expected ${count} ${type} email(s) in local Mailpit.`);
}
async function newPage(browser) {
  const page = await browser.newPage(); page.on('pageerror', e => errors.push(e.message)); return page;
}
const message = page => page.locator('#accountMessage').innerText();
async function waitMessage(page, text) {
  await page.waitForFunction(t => document.getElementById('accountMessage').textContent.includes(t), text, {timeout: 15000});
}
try {
  const settings = await (await fetch(url + '/auth/v1/settings', {headers:{apikey:key}})).json();
  assert.equal(settings.mailer_autoconfirm, false, 'Run this suite with local auth.email.enable_confirmations=true.');
  const cb = await chromium.launch(), fb = await firefox.launch(); browsers.push(cb, fb);

  // Marketing entry points: every trial CTA opens signup mode; no demo link dead-ends.
  for (const path of ['/index.html', '/collection.html', '/walkthrough.html']) {
    const page = await newPage(cb);
    await page.addInitScript(() => {
      let qr; Object.defineProperty(window, 'QRCode', { configurable: true, get: () => qr, set(value) {
        const draw = value.toCanvas; value.toCanvas = (canvas, text, ...rest) => { window.sampleQr = text; return draw.call(value, canvas, text, ...rest); }; qr = value;
      }});
    });
    await page.goto(base + path);
    const links = await page.locator('a').evaluateAll(as => as.map(a => ({ href: a.getAttribute('href'), text: a.textContent })));
    const trials = links.filter(link => /free trial/i.test(link.text));
    assert(trials.length >= 1, `${path} has a trial CTA`);
    for (const link of trials) assert.equal(link.href, '/account.html?signup=1', `${path}: ${link.text}`);
    assert(!links.some(link => /board(-admin)?\.html/.test(link.href || '')), `${path} links to a login-only or display-less screen`);
    if (path !== '/walkthrough.html') {
      assert.equal(await page.evaluate(() => window.sampleQr), base + path + '#flow-title');
      assert(!/30 minutes/.test(await page.locator('body').innerText()));
    }
    await page.close();
  }

  const signup = await newPage(cb);
  await signup.goto(base + '/index.html');
  await signup.locator('.hero-actions a').click();
  await signup.waitForURL(u => u.pathname === '/account.html' && u.search === '?signup=1');
  await signup.locator('#authForm').waitFor({state:'visible'});
  assert.equal(await signup.locator('#accountTitle').innerText(), 'Start your free trial');
  assert.match(await signup.locator('#trialNote').innerText(), /14 days free.*No card required/);
  assert.equal(await signup.locator('#authSubmit').innerText(), 'Create account');
  assert.equal(await signup.locator('#signupAcknowledgement').isVisible(), true);
  assert.equal(await signup.locator('#forgotPassword').isVisible(), false);
  assert.equal(await signup.locator('#switchAuth').innerText(), 'Already have an account? Log in');
  // Show/hide password.
  await signup.locator('#email').fill(email); await signup.locator('#password').fill(password);
  const toggle = signup.locator('[data-password-toggle="password"]');
  await toggle.click();
  assert.equal(await signup.locator('#password').getAttribute('type'), 'text');
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true'); assert.equal(await toggle.innerText(), 'Hide');
  await toggle.click();
  assert.equal(await signup.locator('#password').getAttribute('type'), 'password');
  for (const width of [1280, 390]) {
    await signup.setViewportSize({width, height:900});
    assert(await signup.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await signup.screenshot({path:`/tmp/popbia-signup-${width}.png`, fullPage:true});
  }
  await signup.locator('#authSubmit').click();
  await signup.locator('#signupConfirmation').waitFor({state:'visible'});
  assert.equal(await signup.locator('#accountTitle').innerText(), 'Check your inbox');
  assert.equal(await signup.locator('#confirmationEmail').innerText(), email);
  for (const id of ['#authForm', '#businessForm', '#requestForm', '#recoveryForm']) assert.equal(await signup.locator(id).isVisible(), false);
  assert.equal(await signup.locator('#onboardingPlans').count(), 0);
  assert.equal(await signup.evaluate(async()=> (await window.createPopBiaClient().auth.getSession()).data.session), null);
  // A confirmation email was just sent, so resending starts on cooldown.
  assert.equal(await signup.locator('#resendConfirmation').isDisabled(), true);
  assert.match(await signup.locator('#resendConfirmation').innerText(), /^Resend email \(\d+s\)$/);
  // The normal ten-second account refresh must not undo the confirmation screen.
  await signup.waitForTimeout(10500);
  assert.equal(await signup.locator('#signupConfirmation').isVisible(), true);
  await signup.setViewportSize({width:390,height:844});
  await signup.screenshot({path:'/tmp/popbia-check-inbox.png',fullPage:true});
  await signup.locator('#backToLogin').click();
  assert.equal(await signup.locator('#authSubmit').innerText(), 'Log in');
  assert.equal(await signup.locator('#accountTitle').innerText(), 'Log in to PopBia');

  // Logging in before confirming explains what to do and offers a new email.
  const unconfirmed = await newPage(cb);
  await unconfirmed.goto(base + '/account.html');
  await unconfirmed.locator('#email').fill(email); await unconfirmed.locator('#password').fill(password);
  await unconfirmed.locator('#authSubmit').click();
  await waitMessage(unconfirmed, 'Please confirm your email first');
  assert(!/email not confirmed/i.test(await message(unconfirmed)));
  assert.equal(await unconfirmed.locator('#helpResend').isVisible(), true);
  const [firstLink] = await mailLinks('signup', 1);
  assert(firstLink.startsWith(url));
  await unconfirmed.locator('#helpResend').click();
  await unconfirmed.locator('#signupConfirmation').waitFor({state:'visible'});
  await waitMessage(unconfirmed, `We’ve sent a new confirmation link to ${email}`);
  assert.equal(await unconfirmed.locator('#resendConfirmation').isDisabled(), true);
  const signupLinks = await mailLinks('signup', 2), latestLink = signupLinks.at(-1);
  assert.notEqual(latestLink, firstLink);

  // A superseded confirmation link is explained, with both recovery routes.
  const confirmed = await newPage(fb);
  await confirmed.goto(firstLink);
  await confirmed.waitForURL(u => u.pathname === '/account.html');
  await waitMessage(confirmed, 'That link has expired or has already been used');
  assert.equal(await confirmed.locator('#helpResend').isVisible(), true);
  assert.equal(await confirmed.locator('#helpReset').isVisible(), true);
  assert.equal(await confirmed.locator('#authSubmit').innerText(), 'Log in');
  assert(!/error/.test(await confirmed.evaluate(() => location.href)));
  await confirmed.waitForTimeout(10500); // Polling keeps the explanation.
  await waitMessage(confirmed, 'That link has expired');
  await confirmed.locator('#helpResend').click(); // Empty email field: asks which address.
  await confirmed.locator('#requestForm').waitFor({state:'visible'});
  assert.equal(await confirmed.locator('#accountTitle').innerText(), 'Resend confirmation email');
  await confirmed.locator('#requestBack').click();
  await confirmed.locator('#authForm').waitFor({state:'visible'});

  // The current link confirms and lands directly on business naming: no plan selection.
  await confirmed.goto(latestLink);
  await confirmed.waitForURL(u => u.pathname === '/account.html');
  await confirmed.locator('#businessForm').waitFor({state:'visible'});
  assert.equal(await confirmed.locator('#accountTitle').innerText(), 'Name your business');
  await waitMessage(confirmed, 'Email confirmed. Your 14-day free trial starts when you create your business.');
  assert.match(await confirmed.locator('#trialNote').innerText(), /14 days free/);
  assert.equal(await confirmed.evaluate(() => location.hash), '');
  assert.equal(await confirmed.locator('#onboardingPlans').count(), 0);
  const users = await admin.auth.admin.listUsers(); const user = users.data.users.find(u=>u.email===email);
  assert(user.email_confirmed_at);
  assert.deepEqual((await admin.from('business_members').select('*').eq('user_id',user.id)).data, []);
  // Reloading before naming the business resumes at the same step.
  await confirmed.reload(); await confirmed.locator('#businessForm').waitFor({state:'visible'});
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

  // Returning user with a workspace skips onboarding.
  await confirmed.goto(base + '/account.html');await confirmed.waitForURL('**/board-admin.html');
  await confirmed.locator('#logoutButton').click();await confirmed.waitForURL('**/account.html');
  await confirmed.locator('#email').fill(email);await confirmed.locator('#password').fill(password);await confirmed.locator('#authSubmit').click();
  await confirmed.waitForURL('**/board-admin.html');
  await confirmed.locator('#logoutButton').click();await confirmed.waitForURL('**/account.html');

  // Password recovery: generic acknowledgement, cooldown, and a working reset link.
  await confirmed.locator('#authForm').waitFor({state:'visible'});
  await confirmed.locator('#forgotPassword').click();
  await confirmed.locator('#requestForm').waitFor({state:'visible'});
  assert.equal(await confirmed.locator('#accountTitle').innerText(), 'Reset your password');
  await confirmed.locator('#requestEmail').fill(email);
  await confirmed.locator('#requestSubmit').click();
  await waitMessage(confirmed, `If there’s a PopBia account for ${email}, we’ve sent it a link`);
  assert.equal(await confirmed.locator('#requestSubmit').isDisabled(), true);
  assert.match(await confirmed.locator('#requestSubmit').innerText(), /^Send reset link \(\d+s\)$/);
  const stranger = await newPage(cb);
  await stranger.goto(base + '/account.html'); await stranger.locator('#forgotPassword').click();
  await stranger.locator('#requestEmail').fill(`nobody-${suffix}@example.com`); await stranger.locator('#requestSubmit').click();
  await waitMessage(stranger, `If there’s a PopBia account for nobody-${suffix}@example.com, we’ve sent it a link`);
  const [resetLink] = await mailLinks('recovery', 1);
  const recovery = await newPage(fb);
  await recovery.goto(resetLink);
  await recovery.waitForURL(u => u.pathname === '/account.html');
  await recovery.locator('#recoveryForm').waitFor({state:'visible'});
  assert.equal(await recovery.locator('#accountTitle').innerText(), 'Choose a new password');
  await recovery.waitForTimeout(10500); // A recovery session must not continue into staff controls.
  assert.equal(new URL(recovery.url()).pathname, '/account.html');
  assert.equal(await recovery.evaluate(() => location.hash), '');
  await recovery.locator('#newPassword').fill(newPassword);
  await recovery.locator('#recoveryForm button[type=submit]').click();
  await recovery.waitForURL('**/board-admin.html');

  // Wrong password and unknown account read the same; the old password no longer works.
  const returning = await newPage(cb);
  await returning.goto(base + '/account.html');
  await returning.locator('#email').fill(email); await returning.locator('#password').fill(password);
  await returning.locator('#authSubmit').click();
  await waitMessage(returning, 'That email and password don’t match');
  const wrongPassword = await message(returning);
  assert(!/invalid login credentials/i.test(wrongPassword));
  assert.equal(await returning.locator('#helpReset').isVisible(), true);
  await returning.locator('#email').fill(`nobody-${suffix}@example.com`);
  await returning.evaluate(() => { document.getElementById('accountMessage').textContent = ''; });
  await returning.locator('#authSubmit').click();
  await returning.waitForFunction(() => /^[^…]+$/.test(document.getElementById('accountMessage').textContent));
  assert.equal(await message(returning), wrongPassword);
  await returning.locator('#email').fill(email); await returning.locator('#password').fill(newPassword);
  await returning.locator('#authSubmit').click();
  await returning.waitForURL('**/board-admin.html');

  // A used reset link is explained rather than silently showing the login form.
  const reused = await newPage(cb);
  await reused.goto(resetLink);
  await reused.waitForURL(u => u.pathname === '/account.html');
  await waitMessage(reused, 'That link has expired or has already been used');
  assert.equal(await reused.locator('#recoveryForm').isVisible(), false);

  // Signing up again with a confirmed address points to login and recovery.
  const duplicate = await newPage(cb);
  await duplicate.goto(base + '/account.html?signup=1');
  await duplicate.locator('#email').fill(email); await duplicate.locator('#password').fill('Another-pass-42!');
  await duplicate.locator('#authSubmit').click();
  await duplicate.waitForFunction(() => !document.getElementById('signupConfirmation').hidden || document.getElementById('accountMessage').textContent.includes('may already have an account'));
  if (await duplicate.locator('#signupConfirmation').isVisible()) assert.equal(await duplicate.locator('#confirmationEmail').innerText(), email);
  else { await waitMessage(duplicate, 'This email may already have an account'); assert.equal(await duplicate.locator('#helpReset').isVisible(), true); }

  // Workspace creation stays idempotent: no second trial.
  const staff = createClient(url,key,{auth:{persistSession:false}});assert.ifError((await staff.auth.signInWithPassword({email,password:newPassword})).error);
  assert.equal((await staff.rpc('create_business',{business_name:'Cannot reset'})).data,membership.data.business_id);
  const again = (await staff.rpc('collection_entitlement',{target_business:membership.data.business_id})).data;
  assert.equal(again.trial_started_at,entitlement.trial_started_at);
  // Existing legacy workspace skips onboarding too.
  assert.ifError((await admin.from('business_entitlements').update({subscription_status:'active',legacy_access:true}).eq('business_id',membership.data.business_id)).error);
  await confirmed.goto(base+'/account.html');
  await confirmed.locator('#email').fill(email);await confirmed.locator('#password').fill(newPassword);await confirmed.locator('#authSubmit').click();
  await confirmed.waitForURL('**/board-admin.html');
  assert.deepEqual(errors,[]);
  console.log('PASS: trial CTAs open signup; demo links and sample QR repaired; show/hide password; confirmation inbox with resend cooldown survives polling; friendly unconfirmed login with resend; superseded link explained; confirmation lands on business naming without plans; resume before naming; exact unchanged trial; returning login; password reset request (generic, cooldown), recovery session held on new-password form, reset login; uniform wrong-password/unknown messages; used reset link explained; duplicate signup guidance; idempotent workspace and legacy bypass.');
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
