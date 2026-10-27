function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function showReadyAnnouncement(orderLabel) {
  if (!readyAnnouncementEl || !readyAnnouncementOrderEl) return;

  readyAnnouncementOrderEl.textContent = orderLabel;
  readyAnnouncementEl.classList.add("is-visible");
  const duration = reducedMotion ? 1200 : 1700;
  window.clearTimeout(showReadyAnnouncement._hideTimer);
  showReadyAnnouncement._hideTimer = window.setTimeout(() => {
    readyAnnouncementEl.classList.remove("is-visible");
  }, duration);
}

function updateClock() {
  if (!boardClock) return;
  const now = new Date();
  boardClock.dateTime = now.toISOString();
  boardClock.textContent = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(now);
}

function queueReadyAnnouncement(order) {
  const orderLabel = order.type === "number"
    ? `#${order.label}`
    : order.type === "number-name"
      ? `#${order.number || "?"}${order.label ? ` · ${order.label}` : ""}`
      : order.label;
  const alreadyQueued = readyAnnouncementQueue.some(item => item.id === order.id && item.label === orderLabel);
  if (alreadyQueued) return;

  readyAnnouncementQueue.push({ id: String(order.id), label: orderLabel });
  if (!readyAnnouncementActive) {
    processReadyAnnouncementQueue();
  }
}

function processReadyAnnouncementQueue() {
  if (!readyAnnouncementQueue.length) {
    readyAnnouncementActive = false;
    return;
  }

  readyAnnouncementActive = true;
  const nextOrder = readyAnnouncementQueue.shift();
  showReadyAnnouncement(nextOrder.label);
  playReadyChime();
  const nextDelay = reducedMotion ? 1200 : 1600;
  window.setTimeout(() => {
    processReadyAnnouncementQueue();
  }, nextDelay);
}

function playReadyChime() {
  const enabled = cloud.business.ready_chime;
  // Browsers keep sound off until someone taps the screen (see Turn sound on).
  const context = sound.context;
  if (!enabled || sound.muted || !context || context.state !== "running") return;
  try {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.08, context.currentTime + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + .2);
  } catch (error) {
    // Browser autoplay restrictions can prevent a demo chime.
  }
}

function queueJustReadyOrder(orderId) {
  if (!orderId) return;
  justReadyOrderIds.add(orderId);
  window.setTimeout(() => {
    justReadyOrderIds.delete(orderId);
    renderBoard();
  }, reducedMotion ? 700 : 900);
}

function detectReadyTransitions(currentOrders) {
  if (!readyTransitionTrackingReady) {
    previousOrdersById = new Map(currentOrders.map(order => [String(order.id), { status: order.status, label: order.label, type: order.type, number: order.number }]));
    readyTransitionTrackingReady = true;
    return;
  }

  const nextMap = new Map(currentOrders.map(order => [String(order.id), { status: order.status, label: order.label, type: order.type, number: order.number }]));
  const readyTransitions = [];

  for (const [orderId, nextOrder] of nextMap.entries()) {
    const previousOrder = previousOrdersById.get(orderId);
    if (previousOrder && previousOrder.status === "preparing" && nextOrder.status === "ready") {
      boardPages.ready.page = 0;
      boardPages.ready.changedAt = performance.now();
      readyTransitions.push({ id: orderId, label: nextOrder.label, type: nextOrder.type, number: nextOrder.number });
      queueJustReadyOrder(orderId);
    }
  }

  previousOrdersById = nextMap;
  readyTransitions.forEach(order => queueReadyAnnouncement(order));
}

function renderOrderList(listElement, status) {
  const overdueMinutes = cloud.business.overdue_seconds / 60;
  const orders = loadOrders()
    .filter(order => order.status === status)
    .map((order, storedIndex) => ({ order, storedIndex }));

  if (status === "ready") {
    orders.sort((a, b) => (Number(b.order.readyAt) || 0) - (Number(a.order.readyAt) || 0) || a.storedIndex - b.storedIndex);
  } else {
    orders.sort((a, b) => {
      const numberA = Number(a.order.type === "number-name" ? a.order.number : a.order.type === "number" ? a.order.label : 0);
      const numberB = Number(b.order.type === "number-name" ? b.order.number : b.order.type === "number" ? b.order.label : 0);
      if (numberA && numberB) return numberA - numberB;
      const createdA = a.order.createdAt || 0;
      const createdB = b.order.createdAt || 0;
      if (createdA && createdB) return createdA - createdB;
      return a.storedIndex - b.storedIndex;
    });
  }

  const state = boardPages[status];
  const sharedScreen = !document.body.classList.contains('phone-view') && window.matchMedia('(min-width: 761px)').matches;
  const rowHeight = Math.max(68, Math.min(88, window.innerHeight * .08));
  const capacity = sharedScreen ? Math.max(1, Math.floor(listElement.clientHeight / rowHeight)) : Math.max(1, orders.length);
  const pageCount = Math.ceil(orders.length / capacity);
  if (capacity !== state.capacity || pageCount <= 1 || state.page >= pageCount) {
    state.page = 0; state.changedAt = performance.now();
  } else if (performance.now() - state.changedAt >= 7000) {
    state.page = (state.page + 1) % pageCount; state.changedAt = performance.now();
  }
  state.capacity = capacity;
  const visibleOrders = orders.slice(state.page * capacity, (state.page + 1) * capacity);
  document.getElementById(`${status}More`).textContent = orders.length > capacity
    ? `+ ${orders.length - visibleOrders.length} more ${status}` : '';

  if (!orders.length) {
    listElement.innerHTML = `<li class="empty-state">${status === "ready" ? "No orders ready yet" : "No orders being prepared"}</li>`;
    return;
  }

  const markup = visibleOrders.map(({ order }) => {
    const classes = ["order-card", status];
    const overdue = status === "ready" && Number.isFinite(Number(order.readyAt)) && Date.now() - Number(order.readyAt) >= overdueMinutes * 60000;
    if (overdue) classes.push("overdue");
    if (status === "ready" && justReadyOrderIds.has(String(order.id))) {
      classes.push("just-ready");
    }
    const identifier = escapeHtml(order.type === "number" ? `#${order.label}` : order.type === "number-name" ? `#${order.number || "?"}` : order.label);
    const customerName = order.type === "number-name" && order.label
      ? `<span class="order-name">${escapeHtml(order.label)}</span>${overdue ? '<span class="overdue-note">Please see staff</span>' : ""}`
      : overdue ? '<span class="overdue-note">Please see staff</span>' : "";
    return `
      <li data-order-id="${escapeHtml(order.id)}" class="${classes.join(" ")} ${order.type}">
        ${overdue ? '<svg class="attention-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M9 20a3 3 0 0 0 6 0M12 2V1"/></svg>' : ""}
        <span class="order-number">${identifier}</span>
        ${customerName}
      </li>
    `;
  }).join("");
  if (listElement.innerHTML !== markup) listElement.innerHTML = markup;
}
const boardPages = { preparing: { page: 0, capacity: 0, changedAt: performance.now() }, ready: { page: 0, capacity: 0, changedAt: performance.now() } };
const boardClock = document.getElementById('boardClock');
const preparingList = document.getElementById('preparingList'), readyList = document.getElementById('readyList');
const readyAnnouncementEl = document.getElementById('readyAnnouncement');
const readyAnnouncementOrderEl = document.getElementById('readyAnnouncementOrder');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const readyAnnouncementQueue = [], justReadyOrderIds = new Set();
let readyAnnouncementActive = false, previousOrdersById = new Map(), readyTransitionTrackingReady = false, cloud;
const loadOrders = () => cloud?.orders || [];

/* Shared-screen helpers. Each is optional: a browser without the feature simply hides its control. */
const sound = { context: null, muted: false };
let wakeLock = null, lastUpdated = null;
const sharedScreen = () => !document.body.classList.contains('phone-view');
const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
function canFullscreen() {
  const root = document.documentElement;
  return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled) && !!(root.requestFullscreen || root.webkitRequestFullscreen);
}
function displayNote(text) { document.getElementById('displayNote').textContent = text; }
function renderDisplayControls() {
  const fullscreen = document.getElementById('fullscreenToggle'), soundToggle = document.getElementById('soundToggle');
  document.getElementById('displayControls').hidden = !sharedScreen();
  fullscreen.hidden = !canFullscreen();
  fullscreen.textContent = fullscreenElement() ? 'Exit full screen' : 'Full screen';
  const on = !sound.muted && sound.context?.state === 'running';
  soundToggle.hidden = !window.AudioContext || !cloud?.business?.ready_chime || !!cloud.business.inactive;
  soundToggle.textContent = on ? 'Sound on' : 'Turn sound on';
  soundToggle.setAttribute('aria-pressed', String(on));
}
async function toggleFullscreen() {
  try {
    if (fullscreenElement()) await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else {
      const root = document.documentElement;
      await (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
    }
  } catch (error) {
    displayNote('Full screen isn’t available here. Use the browser or TV menu instead.');
  }
  requestWakeLock();
  renderDisplayControls();
}
async function toggleSound() {
  if (!sound.muted && sound.context?.state === 'running') { sound.muted = true; renderDisplayControls(); return; }
  try {
    sound.muted = false;
    sound.context ||= new AudioContext();
    await sound.context.resume();
    if (sound.context.state === 'running') playReadyChime(); // A short chime confirms sound works.
    else displayNote('This browser blocked sound. Check the device volume and browser settings.');
  } catch (error) {
    displayNote('Sound isn’t available in this browser.');
  }
  requestWakeLock();
  renderDisplayControls();
}
// Keeps the screen from sleeping where supported; the browser releases it when the page is hidden.
async function requestWakeLock() {
  if (!sharedScreen() || !navigator.wakeLock || wakeLock || document.hidden) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; displayNote(''); });
    displayNote('Screen stays on');
  } catch (error) {
    wakeLock = null;
  }
}
function showConnection(text) {
  const status = document.getElementById('cloudMessage');
  let state = 'live', label = text;
  if (text.includes('Display not found')) {
    state = 'offline';
    label = 'This customer screen link isn’t valid. Ask staff for the current link.';
  } else if (text.startsWith('Connection error')) {
    state = 'offline';
    label = `Offline · retrying${lastUpdated ? ` · last update ${new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(lastUpdated)}` : ''}`;
  } else if (text.startsWith('Collection is currently inactive')) state = 'inactive';
  else if (/reconnecting|connecting/i.test(text)) { state = 'reconnecting'; label = 'Reconnecting…'; }
  status.dataset.state = state;
  status.textContent = label;
}
/* The walkthrough explanation appears only when staff controls on this device just sent the owner here.
   ?tour= on its own is ignored, so shared and customer screens never show it. */
function walkthroughStage(display) {
  const stage = new URLSearchParams(location.search).get('tour');
  if (stage !== 'intro' && stage !== 'ready') return null;
  try {
    const token = JSON.parse(localStorage.getItem('popbia-walkthrough-screen'));
    return token?.display === display && token.until > Date.now() ? stage : null;
  } catch (error) {
    return null;
  }
}
function showWalkthrough(stage) {
  const intro = stage === 'intro';
  document.getElementById('wtStep').textContent = intro ? 'Step 3 of 5' : 'Step 4 of 5';
  document.getElementById('wtTitle').textContent = intro ? 'What customers see' : 'Customers see it’s ready';
  document.getElementById('wtText').textContent = intro
    ? 'Orders move from Preparing to Ready for collection. Let’s head back and try it.'
    : 'Your order is now under Ready for collection, so the customer knows to collect it.';
  // The link to staff controls exists only for the owner taking the walkthrough.
  document.getElementById('wtBack').href = 'board-admin.html';
  document.body.classList.add('wt-active');
  document.querySelector(`.board-column.${intro ? 'preparing' : 'ready'}`).classList.add('wt-target');
  document.getElementById('walkthrough').hidden = false;
  document.getElementById('wtBack').focus();
}
document.getElementById('fullscreenToggle').addEventListener('click', toggleFullscreen);
document.getElementById('soundToggle').addEventListener('click', toggleSound);
document.addEventListener('fullscreenchange', renderDisplayControls);
document.addEventListener('webkitfullscreenchange', renderDisplayControls);
document.addEventListener('visibilitychange', () => { if (!document.hidden) requestWakeLock(); });
function renderBoard() {
  if (cloud.business.inactive) {
    readyAnnouncementQueue.length = 0;
    readyAnnouncementEl.classList.remove('is-visible');
    readyAnnouncementEl.hidden = true;
  } else { readyAnnouncementEl.hidden = false; detectReadyTransitions(loadOrders()); }
  renderOrderList(preparingList, 'preparing'); renderOrderList(readyList, 'ready');
}
window.addEventListener('resize', () => { if (cloud?.business) renderBoard(); });
(async () => {
  const message = document.getElementById('cloudMessage');
  try {
    const display = new URLSearchParams(location.search).get('display');
    if (!display || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(display)) throw new Error('This customer screen link isn’t complete. Scan the QR code again, or ask staff for the link.');
    document.body.classList.toggle('phone-view', new URLSearchParams(location.search).get('phone') === '1');
    const tour = walkthroughStage(display);
    if (tour) showWalkthrough(tour);
    const view = new URLSearchParams(location.search).get('view');
    document.querySelector('.board-column.preparing').classList.toggle('is-hidden', view === 'ready');
    document.querySelector('.board-column.ready').classList.toggle('is-hidden', view === 'preparing');
    document.querySelector('.board-grid').classList.toggle('single-view', ['ready','preparing'].includes(view));
    const boardUrl = new URL(`board.html?display=${display}&phone=1`, location.href).href;
    document.getElementById('boardQrUrl').href = boardUrl;
    window.QRCode?.toCanvas(document.getElementById('boardQrCode'), boardUrl, { width: 88, margin: 1 });
    cloud = new CollectionCloud(window.createPopBiaClient(true), { display,
      onChange: () => {
        lastUpdated = new Date();
        document.title = `${cloud.business.name} — Order status`;
        document.querySelector('.board-brand-copy h1').textContent = cloud.business.name;
        renderBoard();
        renderDisplayControls();
      },
      onStatus: showConnection
    });
    renderDisplayControls();
    requestWakeLock();
    await cloud.start();
    updateClock(); setInterval(updateClock, 1000);
    setInterval(() => { if (cloud.business.queue_style) renderBoard(); }, 1000);
  } catch (error) { message.dataset.state = 'offline'; message.textContent = error.message; }
})();
