/* First-run walkthrough: one coach card at a time over the real staff controls.
   Progress is kept per device and business in localStorage; nothing is stored in the database.
   Step 3 (and the optional check in step 4) happen on the real customer screen in this tab,
   which shows its explanation only while WALKTHROUGH_SCREEN_KEY holds a matching, unexpired token. */
const WALKTHROUGH_SCREEN_KEY = 'popbia-walkthrough-screen';
const walkthrough = { state: null, view: null, cleanup: false };
const walkthroughKey = () => `popbia-walkthrough:${cloud.business.id}`;
const walkthroughActive = () => walkthrough.state?.status === 'active' && !!cloud?.entitlement?.access_allowed;
const practiceOrders = () => loadOrders().filter(order => walkthrough.state?.practice?.includes(order.id));

function readWalkthrough() {
  try { return JSON.parse(localStorage.getItem(walkthroughKey())); } catch { return null; }
}
function saveWalkthrough() {
  try { localStorage.setItem(walkthroughKey(), JSON.stringify(walkthrough.state)); return true; } catch { return false; }
}

async function startWalkthrough(restart = false) {
  let state = restart ? null : readWalkthrough();
  if (state && state.status !== 'active') { walkthrough.state = state; return; }
  if (!state && !restart) {
    // Only new businesses are offered the walkthrough automatically.
    const { count, error } = await client.from('collection_orders').select('id', { count: 'exact', head: true }).eq('business_id', cloud.business.id);
    const ageDays = (Date.now() - Date.parse(cloud.business.created_at)) / 86400000;
    if (error || ageDays > 14 || count >= 5) return;
  }
  state ||= { status: 'active', step: 'orders', practice: [] };
  // Coming back from the customer screen (button, Back or a refresh) continues with the next step.
  if (state.step === 'customer') state.step = 'ready';
  if (state.step === 'ready-check') state.step = 'try';
  try { localStorage.removeItem(WALKTHROUGH_SCREEN_KEY); } catch {}
  walkthrough.state = state;
  walkthrough.view = null;
  walkthrough.cleanup = false;
  // Without storage, progress could not survive the trip to the customer screen.
  if (!saveWalkthrough()) { walkthrough.state = null; return; }
  if (restart) {
    queueSettingsBody.classList.add('hidden');
    queueSettingsToggle.setAttribute('aria-expanded', 'false');
  }
  renderOrders();
}

function walkthroughOrderAdded(id) {
  if (!walkthroughActive() || !id) return;
  const state = walkthrough.state;
  state.practice = [...new Set([...(state.practice || []), id])];
  if (state.step === 'orders') { state.testOrder = id; state.step = 'screen'; }
  saveWalkthrough();
}

function showWalkthroughScreen(stage) {
  try {
    localStorage.setItem(WALKTHROUGH_SCREEN_KEY, JSON.stringify({ display: cloud.business.display_id, until: Date.now() + 30 * 60000 }));
  } catch {}
  location.assign(`${screenLinks().screen}&tour=${stage}`);
}

// During step 2 the customer screen opens in this tab, so the owner comes straight back.
function walkthroughOpenScreen(event) {
  if (!walkthroughActive() || walkthrough.state.step !== 'screen') return;
  event.preventDefault();
  walkthrough.state.step = 'customer';
  saveWalkthrough();
  showWalkthroughScreen('intro');
}

function endWalkthrough(status) {
  walkthrough.state = { ...walkthrough.state, status };
  walkthrough.cleanup = false;
  saveWalkthrough();
  renderOrders();
  // Kept until the next action; the status line above is cleared by every refresh.
  $('wtNote').textContent = status === 'finished'
    ? 'You’re all set. You can restart the walkthrough any time from Queue settings.'
    : 'Walkthrough skipped. You can restart it any time from Queue settings.';
  $('wtNote').hidden = false;
  customerNameField.hidden ? addOrderBtn.focus() : customerNameInput.focus();
}

function walkthroughView() {
  const state = walkthrough.state, style = getQueueStyle(), next = nextOrderNumber(), orders = loadOrders();
  const entry = customerNameField.hidden ? addOrderBtn : customerNameInput;
  if (state.step === 'orders') {
    return { key: 'orders', index: 1, title: 'Your orders', text: 'This is where you’ll manage orders. Let’s add your first one!', target: adminControlRow, focus: entry };
  }
  if (state.step === 'screen') {
    return $('screenPanel').hidden
      ? { key: 'screen', index: 2, title: 'Customer screen', text: 'Customers can follow their orders here. Open the screen to take a look.', target: $('screenPanelToggle'), focus: $('screenPanelToggle') }
      : { key: 'screen:open', index: 2, title: 'Customer screen', text: 'Customers can follow their orders here. Open the screen to take a look.', target: $('openBoard'), focus: $('openBoard') };
  }
  if (state.step === 'ready') {
    let test = orders.find(order => order.id === state.testOrder);
    if (test?.status === 'ready' && !state.marked) { state.marked = true; saveWalkthrough(); }
    const row = id => ordersList.querySelector(`[data-row-id="${CSS.escape(id)}"]`);
    if (state.marked) {
      return { key: 'ready:done', index: 4, title: 'It’s ready!',
        text: `${test ? orderLabel(test) : 'Your test order'} is now Ready for collection on the customer screen.`,
        target: test && row(test.id), actions: [['next', 'Next', 'primary'], ['see-screen', 'See the customer screen', 'secondary']] };
    }
    // If the test order was removed, teach with any order still being prepared.
    if (test?.status !== 'preparing') {
      test = orders.find(order => order.status === 'preparing');
      if (test) { state.testOrder = test.id; saveWalkthrough(); }
    }
    if (!test) return { key: 'ready:empty', index: 4, title: 'Mark it Ready', text: 'Add an order first, then press Mark Ready.', target: adminControlRow, focus: entry };
    return { key: `ready:${test.id}`, index: 4, title: 'Mark it Ready',
      text: 'Order finished? Press Mark Ready and watch it update for customers.',
      target: row(test.id), focus: row(test.id)?.querySelector('[data-action="ready"]') };
  }
  const practice = practiceOrders();
  if (walkthrough.cleanup && practice.length) {
    const count = practice.length;
    return { key: 'try:cleanup', index: 5, title: `Remove ${count === 1 ? 'your practice order' : `${count} practice orders`}?`, dim: false, skip: false,
      text: `So customers don’t see ${count === 1 ? 'it' : 'them'}.${next ? ` Your next order will still be #${next}.` : ''}`,
      actions: [['cleanup', 'Remove and finish', 'primary'], ['keep', count === 1 ? 'Keep it' : 'Keep them', 'secondary']] };
  }
  return { key: 'try', index: 5, title: 'Your turn!', dim: false,
    text: 'Add an order using your name and give PopBia a try.',
    focus: entry, actions: [['finish', 'Finish walkthrough', 'primary']] };
}

// Returns true when it moved focus to a new step's control.
function renderWalkthrough() {
  const card = $('walkthrough');
  document.querySelectorAll('.wt-target').forEach(el => el.classList.remove('wt-target'));
  document.querySelectorAll('[data-wt-described]').forEach(el => { el.removeAttribute('aria-describedby'); delete el.dataset.wtDescribed; });
  if (!walkthroughActive()) {
    card.hidden = true;
    document.body.classList.remove('wt-active', 'wt-focus');
    document.body.style.paddingBottom = '';
    walkthrough.view = null;
    return false;
  }
  const view = walkthroughView();
  document.body.classList.add('wt-active');
  document.body.classList.toggle('wt-focus', view.dim !== false);
  document.body.dataset.wtStep = walkthrough.state.step;
  $('wtStep').textContent = `Step ${view.index} of 5`;
  card.querySelectorAll('.wt-dots i').forEach((dot, i) => { dot.className = i < view.index - 1 ? 'is-done' : i === view.index - 1 ? 'is-current' : ''; });
  if ($('wtTitle').textContent !== view.title) $('wtTitle').textContent = view.title;
  if ($('wtText').textContent !== view.text) $('wtText').textContent = view.text;
  const buttons = { primary: $('wtPrimary'), secondary: $('wtSecondary') };
  // Update only what changed: hiding a focused button, even briefly, would drop keyboard focus.
  Object.entries(buttons).forEach(([kind, button]) => {
    const [type, label] = (view.actions || []).find(entry => entry[2] === kind) || [];
    button.hidden = !type;
    if (type && button.textContent !== label) button.textContent = label;
    if (type) button.dataset.action = type;
  });
  $('wtSkip').hidden = view.skip === false;
  view.target?.classList.add('wt-target');
  if (view.focus) { view.focus.setAttribute('aria-describedby', 'wtTitle wtText'); view.focus.dataset.wtDescribed = ''; }
  card.hidden = false;
  document.body.style.paddingBottom = `${card.offsetHeight + 32}px`;
  // Move focus once per new view; wait while a request is running (controls are disabled).
  if (walkthrough.view === view.key || busy) return false;
  walkthrough.view = view.key;
  const focus = view.focus || (view.actions ? buttons.primary : $('wtTitle'));
  (view.target || view.focus)?.scrollIntoView({ block: 'center' });
  focus.focus({ preventScroll: true });
  return true;
}

async function walkthroughAction(event) {
  const type = event.currentTarget.dataset.action, state = walkthrough.state;
  if (type === 'next') { state.step = 'try'; saveWalkthrough(); renderWalkthrough(); }
  if (type === 'see-screen') { state.step = 'ready-check'; saveWalkthrough(); showWalkthroughScreen('ready'); }
  if (type === 'finish') {
    if (!practiceOrders().length) { endWalkthrough('finished'); return; }
    walkthrough.cleanup = true;
    renderWalkthrough();
  }
  if (type === 'keep') endWalkthrough('finished');
  if (type === 'cleanup') {
    await action(async () => { for (const order of practiceOrders()) await cloud.remove(order.id); });
    if (!practiceOrders().length) endWalkthrough('finished');
  }
}

$('wtPrimary').addEventListener('click', walkthroughAction);
$('wtSecondary').addEventListener('click', walkthroughAction);
$('wtSkip').addEventListener('click', () => endWalkthrough('skipped'));
// A page restored from the back/forward cache didn't reload, so re-read progress.
window.addEventListener('pageshow', event => { if (event.persisted && cloud?.business?.id) startWalkthrough(); });
