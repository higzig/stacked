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
  if (!enabled || !window.AudioContext) return;
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(.08, context.currentTime + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + .2);
    oscillator.addEventListener("ended", () => context.close());
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

  if (!orders.length) {
    listElement.innerHTML = '<li class="empty-state">No orders</li>';
    return;
  }

  listElement.innerHTML = orders.map(({ order }) => {
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
      <li class="${classes.join(" ")} ${order.type}">
        ${overdue ? '<svg class="attention-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M9 20a3 3 0 0 0 6 0M12 2V1"/></svg>' : ""}
        <span class="order-number">${identifier}</span>
        ${customerName}
      </li>
    `;
  }).join("");
}
const boardClock = document.getElementById('boardClock');
const preparingList = document.getElementById('preparingList'), readyList = document.getElementById('readyList');
const readyAnnouncementEl = document.getElementById('readyAnnouncement');
const readyAnnouncementOrderEl = document.getElementById('readyAnnouncementOrder');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const readyAnnouncementQueue = [], justReadyOrderIds = new Set();
let readyAnnouncementActive = false, previousOrdersById = new Map(), readyTransitionTrackingReady = false, cloud;
const loadOrders = () => cloud?.orders || [];
function renderBoard() {
  if (cloud.business.inactive) {
    readyAnnouncementQueue.length = 0;
    readyAnnouncementEl.classList.remove('is-visible');
    readyAnnouncementEl.hidden = true;
  } else { readyAnnouncementEl.hidden = false; detectReadyTransitions(loadOrders()); }
  renderOrderList(preparingList, 'preparing'); renderOrderList(readyList, 'ready');
}
(async () => {
  const message = document.getElementById('cloudMessage');
  try {
    const display = new URLSearchParams(location.search).get('display');
    if (!display || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(display)) throw new Error('Open your business’s customer display link from staff controls.');
    const view = new URLSearchParams(location.search).get('view');
    document.querySelector('.board-column.preparing').classList.toggle('is-hidden', view === 'ready');
    document.querySelector('.board-column.ready').classList.toggle('is-hidden', view === 'preparing');
    document.querySelector('.board-grid').classList.toggle('single-view', ['ready','preparing'].includes(view));
    const boardUrl = new URL(`board.html?display=${display}`, location.href).href;
    document.getElementById('boardQrUrl').href = boardUrl;
    window.QRCode?.toCanvas(document.getElementById('boardQrCode'), boardUrl, { width: 88, margin: 1 });
    cloud = new CollectionCloud(window.createPopBiaClient(true), { display,
      onChange: () => {
        document.title = `${cloud.business.name} — Collection`;
        document.querySelector('.board-brand-copy h1').textContent = cloud.business.name;
        renderBoard();
      },
      onStatus: text => { message.textContent = text; }
    });
    await cloud.start();
    updateClock(); setInterval(updateClock, 1000);
    setInterval(() => { if (cloud.business.queue_style) renderBoard(); }, 1000);
  } catch (error) { message.textContent = error.message; }
})();
