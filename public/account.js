(() => {
  const $ = id => document.getElementById(id);
  const message = $('accountMessage'), authForm = $('authForm'), businessForm = $('businessForm');
  let client, signup = false, busy = false, checking = false, leaving = false;
  const show = text => { message.textContent = text; };
  async function loadAccount() {
    if (checking) return;
    checking = true;
    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      authForm.hidden = Boolean(data.session); businessForm.hidden = true;
      $('accountLogout').hidden = !data.session;
      if (!data.session) { window.renderCollectionEntitlement($('collectionEntitlement'), null); show('Log in to your business, or create an account.'); return; }
      const business = await client.from('businesses').select('id').order('created_at').limit(1).maybeSingle();
      if (business.error) throw business.error;
      if (business.data) {
        const entitlement = await client.rpc('collection_entitlement', { target_business: business.data.id });
        if (entitlement.error) throw entitlement.error;
        window.renderCollectionEntitlement($('collectionEntitlement'), entitlement.data);
        if (!entitlement.data.access_allowed) { show('Your workspace is preserved. Contact us to continue.'); return; }
        if (!leaving) { leaving = true; location.replace('board-admin.html'); }
        return;
      }
      window.renderCollectionEntitlement($('collectionEntitlement'), null);
      businessForm.hidden = false; show('Welcome. Set up your business to begin.');
    } catch (error) { show(error.message); }
    finally { checking = false; }
  }
  async function submit(work) {
    if (busy) return;
    busy = true;
    document.querySelectorAll('button').forEach(el => el.disabled = true);
    show('Please wait…');
    try { await work(); } catch (error) { show(error.message); }
    finally { busy = false; document.querySelectorAll('button').forEach(el => el.disabled = false); }
  }
  $('switchAuth').addEventListener('click', () => {
    signup = !signup;
    $('authSubmit').textContent = signup ? 'Sign up' : 'Log in';
    $('switchAuth').textContent = signup ? 'Already have an account? Log in' : 'Create an account';
    $('password').autocomplete = signup ? 'new-password' : 'current-password';
  });
  authForm.addEventListener('submit', event => {
    event.preventDefault();
    submit(async () => {
      const credentials = { email: $('email').value.trim(), password: $('password').value };
      const { data, error } = signup
        ? await client.auth.signUp({ ...credentials, options: { emailRedirectTo: new URL('account.html', location.href).href } })
        : await client.auth.signInWithPassword(credentials);
      if (error) throw error;
      $('password').value = '';
      if (signup && !data.session) { show('Check your email to confirm your account, then log in here.'); return; }
      await loadAccount();
    });
  });
  businessForm.addEventListener('submit', event => {
    event.preventDefault();
    submit(async () => {
      const { error } = await client.rpc('create_business', { business_name: $('businessName').value.trim() });
      if (error) throw error;
      location.replace('board-admin.html');
    });
  });
  $('accountLogout').addEventListener('click', () => submit(async () => {
    const { error } = await client.auth.signOut(); if (error) throw error;
    await loadAccount();
  }));
  try {
    client = window.createPopBiaClient();
    // Schedule outside the auth callback to avoid holding the SDK's auth lock.
    client.auth.onAuthStateChange(() => setTimeout(() => { if (!busy) loadAccount(); }, 0));
    loadAccount();
    setInterval(() => { if (!busy && !leaving) loadAccount(); }, 10000);
  } catch (error) { show(error.message); }
})();
