(() => {
  const $ = id => document.getElementById(id);
  const message = $('accountMessage'), authForm = $('authForm'), businessForm = $('businessForm');
  const COOLDOWN_SECONDS = 60;
  let client, signup = false, busy = false, checking = false, leaving = false;
  let screen = null, recovering = false, requestType = 'reset', confirmationEmail = null;
  const cooldowns = { confirm: 0, reset: 0 };
  // Supabase redirects back with type/error parameters. Read them before the SDK clears its tokens.
  const linkParams = new URLSearchParams(location.hash.slice(1));
  new URLSearchParams(location.search).forEach((value, key) => { if (key.startsWith('error')) linkParams.set(key, value); });
  const linkError = linkParams.get('error_code') || linkParams.get('error');
  const linkType = linkError ? null : linkParams.get('type');
  recovering = linkType === 'recovery';
  const redirectTo = () => new URL('account.html', location.href).href;
  const show = text => { message.textContent = text; };

  // Friendly copy only; Supabase Auth remains the authority for every decision.
  const offline = 'We couldn’t reach PopBia. Check your internet connection and try again.';
  const sessionEnded = 'Your session has ended. Please log in again.';
  const messages = {
    invalid_credentials: 'That email and password don’t match. Check them and try again, or reset your password.',
    email_not_confirmed: 'Please confirm your email first, using the link we sent when you signed up. Can’t find it? We can send a new one.',
    user_already_exists: 'This email may already have an account. Try logging in, or reset your password.',
    email_exists: 'This email may already have an account. Try logging in, or reset your password.',
    weak_password: 'Choose a stronger password with at least 8 characters.',
    same_password: 'That’s already your password. Choose a different one.',
    email_address_invalid: 'That email address doesn’t look right. Check it and try again.',
    validation_failed: 'Check your email address and password, then try again.',
    over_email_send_rate_limit: 'We’ve just sent you an email. Please wait a minute before asking for another.',
    over_request_rate_limit: 'Too many attempts. Please wait a few minutes and try again.',
    signup_disabled: 'New sign-ups are paused. Email hello@popbia.com and we’ll help you get started.',
    session_not_found: sessionEnded, session_expired: sessionEnded, refresh_token_not_found: sessionEnded
  };
  const isOffline = error => error?.name === 'AuthRetryableFetchError' || /failed to fetch|networkerror|load failed/i.test(error?.message || '');
  function codeOf(error) {
    if (error?.code && messages[error.code]) return error.code;
    const text = error?.message || '';
    if (/invalid login credentials/i.test(text)) return 'invalid_credentials';
    if (/email not confirmed/i.test(text)) return 'email_not_confirmed';
    if (/authentication required|jwt expired/i.test(text)) return 'session_expired';
    if (error?.status === 429) return 'over_request_rate_limit';
    return error?.code || null;
  }
  function friendly(error) {
    console.warn(error);
    if (isOffline(error)) return offline;
    return messages[codeOf(error)] || 'Something went wrong. Please try again, or email hello@popbia.com if it keeps happening.';
  }
  const isRateLimit = error => ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(codeOf(error));
  // Requests for unknown or already-confirmed addresses look identical to successful ones.
  const mustReport = error => error && (isOffline(error) || isRateLimit(error) || error.status >= 500);

  function startCooldown(key) { cooldowns[key] = Date.now() + COOLDOWN_SECONDS * 1000; renderCooldowns(); }
  function renderCooldowns() {
    const label = (button, key, text) => {
      const seconds = Math.max(0, Math.ceil((cooldowns[key] - Date.now()) / 1000));
      button.disabled = busy || seconds > 0;
      button.textContent = seconds ? `${text} (${seconds}s)` : text;
    };
    label($('resendConfirmation'), 'confirm', 'Resend email');
    label($('helpResend'), 'confirm', 'Send a new confirmation email');
    label($('requestSubmit'), requestType, requestType === 'reset' ? 'Send reset link' : 'Send confirmation email');
  }
  function help(resend = false, reset = false) {
    $('helpResend').hidden = !resend; $('helpReset').hidden = !reset;
    $('authHelp').hidden = !resend && !reset;
  }
  function view(next, title, focus = false) {
    screen = next;
    $('signupConfirmation').hidden = next !== 'confirmation';
    authForm.hidden = next !== 'auth';
    $('requestForm').hidden = next !== 'request';
    $('recoveryForm').hidden = next !== 'recovery';
    businessForm.hidden = next !== 'business';
    $('trialNote').hidden = !((next === 'auth' && signup) || next === 'business');
    if (next !== 'auth') help();
    $('accountTitle').textContent = title;
    if (focus) $('accountTitle').focus();
  }
  function showAuth(text) {
    view('auth', signup ? 'Start your free trial' : 'Log in to PopBia');
    show(text ?? (signup ? 'Create your account, confirm your email, then name your business.' : 'Welcome back. Log in to your business.'));
  }
  function setAuthMode(isSignup) {
    signup = isSignup;
    $('signupAcknowledgement').hidden = !signup;
    $('passwordHint').hidden = !signup;
    $('forgotPassword').hidden = signup;
    $('authSubmit').textContent = signup ? 'Create account' : 'Log in';
    $('switchAuth').textContent = signup ? 'Already have an account? Log in' : 'New to PopBia? Start a free trial';
    $('password').autocomplete = signup ? 'new-password' : 'current-password';
    help();
    if (screen === 'auth') showAuth();
  }
  function showConfirmation(email, text = '') {
    confirmationEmail = email;
    $('confirmationEmail').textContent = email;
    view('confirmation', 'Check your inbox', true);
    show(text);
  }
  function openRequest(type) {
    requestType = type;
    $('requestEmail').value = $('email').value.trim() || confirmationEmail || '';
    $('requestIntro').textContent = type === 'reset'
      ? 'Enter the email you use for PopBia and we’ll send you a link to choose a new password.'
      : 'Enter the email you signed up with and we’ll send you a new confirmation link.';
    view('request', type === 'reset' ? 'Reset your password' : 'Resend confirmation email');
    show('');
    renderCooldowns();
    $('requestEmail').focus();
  }
  function backToLogin(text) {
    confirmationEmail = null;
    setAuthMode(false);
    $('password').value = '';
    showAuth(text);
    $('email').focus();
  }
  async function loadAccount() {
    if (checking) return;
    checking = true;
    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      $('accountLogout').hidden = !data.session;
      if (!data.session) {
        recovering = false;
        window.renderCollectionEntitlement($('collectionEntitlement'), null);
        // Account polling must not dismiss the inbox or email-request screens.
        if (screen !== 'auth' && screen !== 'confirmation' && screen !== 'request') showAuth();
        return;
      }
      confirmationEmail = null;
      if (recovering) {
        if (screen !== 'recovery') {
          view('recovery', 'Choose a new password', true);
          show(`Enter a new password for ${data.session.user.email}.`);
          $('newPassword').focus();
        }
        return;
      }
      if (!['workspace', 'business', 'loading'].includes(screen)) view('loading', 'Your Collection workspace');
      const business = await client.from('businesses').select('id').order('created_at').limit(1).maybeSingle();
      if (business.error) throw business.error;
      if (business.data) {
        view('workspace', 'Your Collection workspace');
        const entitlement = await client.rpc('collection_entitlement', { target_business: business.data.id });
        if (entitlement.error) throw entitlement.error;
        window.renderCollectionEntitlement($('collectionEntitlement'), entitlement.data);
        if (!entitlement.data.access_allowed) { show('Your workspace is preserved. Contact us to continue.'); return; }
        if (!leaving) { leaving = true; location.replace('board-admin.html'); }
        return;
      }
      window.renderCollectionEntitlement($('collectionEntitlement'), null);
      if (screen !== 'business') {
        view('business', 'Name your business');
        show(`${linkType === 'signup' ? 'Email confirmed. ' : ''}Your 14-day free trial starts when you create your business.`);
        $('businessName').focus();
      }
    } catch (error) { show(friendly(error)); }
    finally { checking = false; }
  }
  async function submit(work, pending = 'Please wait…') {
    if (busy) return;
    busy = true;
    document.querySelectorAll('button').forEach(el => el.disabled = true);
    show(pending);
    try { await work(); if (message.textContent === pending) show(''); }
    catch (error) { show(friendly(error)); }
    finally {
      busy = false;
      document.querySelectorAll('button').forEach(el => el.disabled = false);
      renderCooldowns();
    }
  }
  async function sendConfirmation(email) {
    const { error } = await client.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo() } });
    if (isRateLimit(error)) startCooldown('confirm');
    if (mustReport(error)) throw error;
    startCooldown('confirm');
    showConfirmation(email, `We’ve sent a new confirmation link to ${email}. Already confirmed? Go back and log in.`);
  }
  async function sendReset(email) {
    const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
    if (isRateLimit(error)) startCooldown('reset');
    if (mustReport(error)) throw error;
    startCooldown('reset');
    show(`If there’s a PopBia account for ${email}, we’ve sent it a link to reset your password. Check your inbox and spam folder.`);
  }

  document.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
    const input = $(button.dataset.passwordToggle), reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    button.textContent = reveal ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', String(reveal));
  }));
  $('switchAuth').addEventListener('click', () => setAuthMode(!signup));
  $('backToLogin').addEventListener('click', () => backToLogin('Log in after confirming your email.'));
  $('requestBack').addEventListener('click', () => backToLogin());
  $('forgotPassword').addEventListener('click', () => openRequest('reset'));
  $('helpReset').addEventListener('click', () => openRequest('reset'));
  $('helpResend').addEventListener('click', () => {
    const email = $('email').value.trim();
    if (email && $('email').checkValidity()) submit(() => sendConfirmation(email), 'Sending a new confirmation email…');
    else openRequest('confirm');
  });
  $('resendConfirmation').addEventListener('click', () => submit(() => sendConfirmation(confirmationEmail), 'Sending a new confirmation email…'));
  $('requestForm').addEventListener('submit', event => {
    event.preventDefault();
    const email = $('requestEmail').value.trim();
    submit(() => requestType === 'reset' ? sendReset(email) : sendConfirmation(email), 'Sending…');
  });
  authForm.addEventListener('submit', event => {
    event.preventDefault();
    help();
    submit(async () => {
      const credentials = { email: $('email').value.trim(), password: $('password').value };
      const { data, error } = signup
        ? await client.auth.signUp({ ...credentials, options: { emailRedirectTo: redirectTo() } })
        : await client.auth.signInWithPassword(credentials);
      if (error) {
        show(friendly(error));
        help(codeOf(error) === 'email_not_confirmed', ['invalid_credentials', 'user_already_exists', 'email_exists'].includes(codeOf(error)));
        return;
      }
      $('password').value = '';
      if (signup && !data.session) {
        startCooldown('confirm');
        showConfirmation(credentials.email);
        return;
      }
      await loadAccount();
    }, signup ? 'Creating your account…' : 'Logging in…');
  });
  $('recoveryForm').addEventListener('submit', event => {
    event.preventDefault();
    submit(async () => {
      const { error } = await client.auth.updateUser({ password: $('newPassword').value });
      if (error) throw error;
      $('newPassword').value = '';
      recovering = false;
      show('Password updated. Taking you to your workspace…');
      await loadAccount();
    }, 'Saving your new password…');
  });
  businessForm.addEventListener('submit', event => {
    event.preventDefault();
    submit(async () => {
      const { error } = await client.rpc('create_business', { business_name: $('businessName').value.trim() });
      if (error) throw error;
      location.replace('board-admin.html');
    }, 'Creating your business…');
  });
  $('accountLogout').addEventListener('click', () => submit(async () => {
    const { error } = await client.auth.signOut(); if (error) throw error;
    recovering = false;
    setAuthMode(false);
    await loadAccount();
  }));
  try {
    client = window.createPopBiaClient();
    setAuthMode(new URLSearchParams(location.search).has('signup'));
    // Schedule outside the auth callback to avoid holding the SDK's auth lock.
    client.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY') recovering = true;
      setTimeout(() => { if (!busy) loadAccount(); }, 0);
    });
    client.auth.getSession().finally(() => {
      // The SDK has read any redirect tokens by now; keep them out of history and bookmarks.
      const clean = new URL(location.href);
      ['error', 'error_code', 'error_description'].forEach(key => clean.searchParams.delete(key));
      clean.hash = '';
      history.replaceState(history.state, '', clean.href);
      if (linkError) {
        setAuthMode(false);
        showAuth(linkError === 'otp_expired'
          ? 'That link has expired or has already been used. Already confirmed your email? Just log in. Otherwise, ask for a new link below.'
          : 'That link didn’t work. Ask for a new one below, or log in if you’ve already confirmed your email.');
        help(true, true);
      }
      loadAccount();
    });
    setInterval(() => { if (!busy && !leaving) loadAccount(); }, 10000);
    setInterval(renderCooldowns, 1000);
  } catch (error) { show(error.message); }
})();
