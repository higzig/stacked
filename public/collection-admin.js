function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function sortOrders(a, b) {
  if (a.type === "number" && b.type === "number") {
    return Number(a.label) - Number(b.label);
  }
  if (a.type === "number-name" && b.type === "number-name") {
    return Number(a.number) - Number(b.number);
  }
  if (a.type === "number") return -1;
  if (a.type === "number-name") return b.type === "number" ? 1 : -1;
  if (b.type === "number") return 1;
  if (b.type === "number-name") return 1;
  return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
}

function getReadyRemainingSeconds(order) {
  if (order.status !== "ready" || !Number.isFinite(Number(order.readyAt))) return null;
  const timeoutSeconds = getOverdueMinutes() * 60;
  const elapsedSeconds = (Date.now() - Number(order.readyAt)) / 1000;
  return Math.max(0, timeoutSeconds - elapsedSeconds);
}

function formatCountdown(totalSeconds) {
  const rounded = Math.ceil(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function isOverdue(order) {
  return order.status === "ready" && getReadyRemainingSeconds(order) === 0;
}

// Preview of the number add_collection_order will assign; the database remains authoritative.
function nextOrderNumber() {
  if (getQueueStyle() === "name") return null;
  const active = new Set(loadOrders().map(order => Number(order.type === "number" ? order.label : order.number)));
  let next = Number(cloud.business.next_number) || 1;
  while (active.has(next)) next += 1;
  return next;
}

function refreshQueueUi() {
  const queueStyle = getQueueStyle();
  const setupComplete = true;
  setupPanel.classList.toggle("hidden", setupComplete);
  adminQueueView.classList.toggle("hidden", !setupComplete);
  const next = nextOrderNumber();
  addOrderBtn.textContent = next ? `Add order #${next}` : "Add order";
  customerNameField.hidden = queueStyle === "number";
  adminControlRow.classList.toggle("is-number-only", queueStyle === "number");
  customerNameLabel.textContent = queueStyle === "name" ? "Customer name" : "Customer name (optional)";
  if (queueStyleSelect) {
    queueStyleSelect.value = queueStyle;
  }
  autoClearSelect.value = cloud.business.ready_auto_clear_seconds === null ? 'off' : String(cloud.business.ready_auto_clear_seconds ?? 600);
  if (overdueSelect) {
    overdueSelect.value = String(getOverdueMinutes() * 60);
  }
  if (readyChimeSelect) {
    readyChimeSelect.value = isReadyChimeEnabled() ? "on" : "off";
  }
  if (queueSettingsPanel) {
    queueSettingsPanel.classList.remove("hidden");
  }
  renderWalkthrough();
}

function elapsedLabel(order) {
  const timestamp = Number(order.status === "ready" ? order.readyAt : order.createdAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return order.status === "ready" ? "Ready time unavailable" : "Waiting time unavailable";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  return `${order.status === "ready" ? "Ready" : "Waiting"} ${minutes} min`;
}

// Update time text without rebuilding buttons or interrupting keyboard focus.
function updateOrderTimes() {
  const orders = new Map(loadOrders().map(order => [order.id, order]));
  ordersList.querySelectorAll("[data-row-id]").forEach(row => {
    const order = orders.get(row.dataset.rowId);
    if (!order) return;
    row.querySelector(".order-elapsed").textContent = elapsedLabel(order);
    const reminder = row.querySelector(".order-timer");
    const overdue = isOverdue(order);
    row.classList.toggle("overdue", overdue);
    if (reminder) {
      reminder.classList.toggle("overdue", overdue);
      reminder.textContent = overdue ? "Please see staff" : `Ready reminder in ${formatCountdown(getReadyRemainingSeconds(order))}`;
    }
  });
}

function orderLabel(order) {
  return order.type === "number"
    ? `#${order.label}`
    : order.type === "number-name"
      ? `#${order.number || "?"}${order.label ? ` · ${order.label}` : ""}`
      : order.label;
}

function orderRowMarkup(order) {
  const safeLabel = escapeHtml(orderLabel(order));
  const safeId = escapeHtml(order.id);
  const remaining = getReadyRemainingSeconds(order);
  const overdue = isOverdue(order);
  const removalText = remaining !== null
    ? `<small class="order-timer ${overdue ? "overdue" : ""}">${overdue ? "Please see staff" : `Ready reminder in ${formatCountdown(remaining)}`}</small>`
    : "";

  const isPreparing = order.status === "preparing";
  const primaryActionLabel = isPreparing ? "Mark Ready" : "Mark Collected";
  const primaryAction = isPreparing ? "ready" : "collected";
  // Number-only orders have no visible name, so there is nothing to edit.
  const editButton = order.type === "number" ? "" : `<button type="button" class="order-action-btn edit" data-order-id="${safeId}" data-action="edit">Edit</button>`;

  return `
    <div class="order-row ${order.status}${overdue ? " overdue" : ""}${order.type === "number" ? " no-edit" : ""}" data-row-id="${safeId}">
      <div class="order-summary">
        <span class="order-label">${safeLabel}</span>
        <div class="order-meta">
          <span class="order-status-badge ${order.status}">${order.status}</span>
          <span class="order-elapsed">${elapsedLabel(order)}</span>
          ${removalText}
        </div>
      </div>
      <div class="order-actions">
        <div class="order-primary-action">
          <button type="button" class="order-action-btn ${isPreparing ? "ready" : "collected"}" data-order-id="${safeId}" data-action="${primaryAction}">${primaryActionLabel}</button>
        </div>
        <div class="order-secondary-actions">
          ${isPreparing ? "" : '<button type="button" class="order-action-btn preparing" data-order-id="' + safeId + '" data-action="preparing">Back to Preparing</button>'}
          ${editButton}
          <button type="button" class="order-action-btn remove" data-order-id="${safeId}" data-action="remove">Remove</button>
        </div>
      </div>
    </div>
  `;
}

// Editing happens inside the order's own row, so the add bar always adds a new order.
function editRowMarkup(order) {
  const safeId = escapeHtml(order.id);
  const identity = order.type === "name" ? `“${order.label}”` : `#${order.number}`;
  return `
    <div class="order-row ${order.status} is-editing" data-row-id="${safeId}" data-editing>
      <div class="order-summary">
        <label class="order-edit-label" for="editName-${safeId}">Editing order ${escapeHtml(identity)}</label>
        <input class="order-edit-input" id="editName-${safeId}" type="text" maxlength="120" autocomplete="off" value="${escapeHtml(order.customerName)}" placeholder="Customer name">
        <div class="order-meta">
          <span class="order-status-badge ${order.status}">${order.status}</span>
          <span class="order-elapsed">${elapsedLabel(order)}</span>
        </div>
      </div>
      <div class="order-actions">
        <div class="order-primary-action">
          <button type="button" class="order-action-btn ready" data-order-id="${safeId}" data-action="save-edit">Save name</button>
        </div>
        <div class="order-secondary-actions">
          <button type="button" class="order-action-btn edit cancel-edit" data-order-id="${safeId}" data-action="cancel-edit">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

// Replace only rows whose markup changed, keeping an in-progress edit (and its focus) intact.
const rowMarkup = new WeakMap();
function patchOrders(entries) {
  const existing = new Map([...ordersList.children].map(node => [node.dataset.key, node]));
  const wanted = new Set(entries.map(entry => entry.key));
  existing.forEach((node, key) => { if (!wanted.has(key)) node.remove(); });
  entries.forEach(({ key, html }, index) => {
    let node = existing.get(key);
    if (!node || (!key.startsWith("edit:") && rowMarkup.get(node) !== html)) {
      const template = document.createElement("template");
      template.innerHTML = html.trim();
      const fresh = template.content.firstElementChild;
      fresh.dataset.key = key;
      rowMarkup.set(fresh, html);
      if (node) node.replaceWith(fresh);
      node = fresh;
    }
    if (ordersList.children[index] !== node) ordersList.insertBefore(node, ordersList.children[index] || null);
  });
}

function renderOrders() {
  const orders = loadOrders().filter(order => order.status !== "collected");
  const sortedOrders = orders.sort(sortOrders);
  if (editingOrderId && !sortedOrders.some(order => order.id === editingOrderId)) {
    editingOrderId = null;
    message.textContent = "That order is no longer active, so the edit was cancelled.";
  }

  if (!sortedOrders.length) {
    const html = walkthroughActive()
      ? '<p class="queue-empty is-first-run">No orders yet. Your test order will appear here and on your customer screen.</p>'
      : '<p class="queue-empty">No active orders. New orders appear here and on your customer screen.</p>';
    patchOrders([{ key: walkthroughActive() ? "empty:first-run" : "empty", html }]);
    refreshQueueUi();
    return;
  }

  patchOrders(sortedOrders.map(order => order.id === editingOrderId
    ? { key: `edit:${order.id}`, html: editRowMarkup(order) }
    : { key: order.id, html: orderRowMarkup(order) }));
  refreshQueueUi();
}

function startEdit(orderId) {
  editingOrderId = orderId;
  message.textContent = "";
  renderOrders();
  const input = ordersList.querySelector(".order-edit-input");
  input?.focus();
  input?.select();
}

function cancelEdit() {
  const orderId = editingOrderId;
  editingOrderId = null;
  renderOrders();
  ordersList.querySelector(`[data-row-id="${CSS.escape(orderId || "")}"] [data-action="edit"]`)?.focus();
}

/* Customer screen panel. Public links carry only the business's random display ID. */
const screenLinks = () => {
  const display = encodeURIComponent(cloud.business.display_id);
  const link = path => new URL(path, location.href).href;
  return {
    screen: link(`board.html?display=${display}`),
    customer: link(`board.html?display=${display}&phone=1`),
    poster: link(`qr-poster.html?display=${display}`)
  };
};
let screenQrUrl = null;
function renderScreenPanel() {
  const links = screenLinks();
  $('openBoard').href = links.screen;
  $('showPoster').href = links.poster;
  $('printPoster').href = `${links.poster}&print=1`;
  if (screenQrUrl === links.customer || !window.QRCode) return;
  screenQrUrl = links.customer;
  window.QRCode.toCanvas($('screenQrCode'), links.customer, { width: 168, margin: 2, color: { dark: "#10243d", light: "#ffffff" } }, error => {
    if (error) $('screenQrCode').hidden = true;
  });
}
function toggleScreenPanel(open = $('screenPanel').hidden) {
  $('screenPanel').hidden = !open;
  $('screenPanelToggle').setAttribute('aria-expanded', String(open));
  if (!renderWalkthrough()) open ? $('screenPanelTitle').focus() : $('screenPanelToggle').focus();
}
async function copyLink(url, label) {
  const status = $('screenCopyStatus'), fallback = $('screenCopyFallback');
  fallback.hidden = true;
  try {
    await navigator.clipboard.writeText(url);
    status.textContent = `${label} copied. Paste it into a message, email or browser.`;
  } catch {
    // Clipboard access needs a secure page and permission; offer the link to copy by hand.
    fallback.value = url; fallback.hidden = false; fallback.focus(); fallback.select();
    status.textContent = `Couldn’t copy automatically. The ${label.toLowerCase()} is selected below. Copy it from there.`;
  }
}
const $ = id => document.getElementById(id);
const setupPanel = $('setupPanel'), adminQueueView = $('adminQueueView'), queueSettingsPanel = $('queueSettingsPanel');
const queueSettingsToggle = $('queueSettingsToggle'), queueSettingsBody = $('queueSettingsBody');
const queueStyleSelect = $('queueStyleSelect'), overdueSelect = $('overdueSelect'), readyChimeSelect = $('readyChimeSelect');
const autoClearSelect = $('autoClearSelect');
const customerNameInput = $('customerNameInput'), addOrderBtn = $('addOrderBtn'), ordersList = $('ordersList');
const customerNameField = $('customerNameField'), customerNameLabel = $('customerNameLabel'), adminControlRow = $('adminControlRow');
const message = $('cloudMessage');
let cloud, client, editingOrderId = null, busy = false, leaving = false;
function redirectToAccount() {
  if (leaving) return;
  leaving = true; cloud?.close();
  document.querySelector('#collection-demo').hidden = true;
  location.replace('account.html');
}
const loadOrders = () => cloud?.orders || [];
const getQueueStyle = () => cloud.business.queue_style;
const getOverdueMinutes = () => cloud.business.overdue_seconds / 60;
const isReadyChimeEnabled = () => cloud.business.ready_chime;
// Resolves to true when the walkthrough moved focus to its next control.
async function action(work) {
  if (busy || !cloud?.entitlement?.access_allowed) return false;
  busy = true;
  $('wtNote').hidden = true;
  document.querySelectorAll('#collection-demo button, #collection-demo input, #collection-demo select').forEach(el => el.disabled = true);
  try { await work(); message.textContent = ''; }
  catch (error) { message.textContent = error.message; }
  finally {
    busy = false;
    document.querySelectorAll('#collection-demo button, #collection-demo input, #collection-demo select').forEach(el => el.disabled = !cloud?.entitlement?.access_allowed);
  }
  return renderWalkthrough();
}
async function addOrder() {
  const moved = await action(async () => {
    const style = getQueueStyle();
    const name = style === 'number' ? '' : customerNameInput.value.trim();
    if (style === 'name' && !name) throw new Error('Enter the customer’s name. This queue shows names only.');
    walkthroughOrderAdded(await cloud.add(name));
    customerNameInput.value = '';
  });
  // The walkthrough moves focus to its next control when this order completes a step.
  if (!moved) customerNameField.hidden ? addOrderBtn.focus() : customerNameInput.focus();
}
async function saveEdit(orderId) {
  const order = loadOrders().find(item => item.id === orderId);
  const value = ordersList.querySelector('.order-edit-input')?.value.trim() ?? '';
  await action(async () => {
    if (!order) throw new Error('This order is no longer active.');
    if (order.type === 'name' && !value) throw new Error('This order needs a name. Enter one, or tap Cancel.');
    await cloud.update(order.id, { customer_name: value });
    editingOrderId = null;
    renderOrders();
  });
  if (!editingOrderId) ordersList.querySelector(`[data-row-id="${CSS.escape(orderId)}"] [data-action="edit"]`)?.focus();
  else ordersList.querySelector('.order-edit-input')?.focus();
}
queueSettingsToggle.addEventListener('click', () => queueSettingsToggle.setAttribute('aria-expanded', String(!queueSettingsBody.classList.toggle('hidden'))));
queueStyleSelect.addEventListener('change', () => action(() => cloud.settings({ queue_style: queueStyleSelect.value })));
autoClearSelect.addEventListener('change', () => action(() => cloud.settings({ ready_auto_clear_seconds: autoClearSelect.value === 'off' ? null : Number(autoClearSelect.value) })));
overdueSelect.addEventListener('change', () => action(() => cloud.settings({ overdue_seconds: Number(overdueSelect.value) })));
readyChimeSelect.addEventListener('change', () => action(() => cloud.settings({ ready_chime: readyChimeSelect.value === 'on' })));
addOrderBtn.addEventListener('click', addOrder);
customerNameInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); addOrder(); } });
$('resetDemoBtn').addEventListener('click', () => {
  if (confirm('Mark all active orders collected? Order history and numbering will be kept.')) action(() => cloud.mutate(client.from('collection_orders').update({ status: 'collected' }).eq('business_id', cloud.business.id).neq('status', 'collected')));
});
ordersList.addEventListener('click', event => {
  const button = event.target.closest('[data-action]');
  if (!button || busy) return;
  const { orderId, action: type } = button.dataset;
  if (type === 'edit') { startEdit(orderId); return; }
  if (type === 'cancel-edit') { cancelEdit(); return; }
  if (type === 'save-edit') { saveEdit(orderId); return; }
  action(() => type === 'remove' ? cloud.remove(orderId) : cloud.update(orderId, { status: type }));
});
ordersList.addEventListener('keydown', event => {
  if (!event.target.matches('.order-edit-input')) return;
  if (event.key === 'Enter') { event.preventDefault(); saveEdit(editingOrderId); }
  if (event.key === 'Escape') { event.preventDefault(); cancelEdit(); }
});
// collection-walkthrough.js loads after this file.
$('openBoard').addEventListener('click', event => walkthroughOpenScreen(event));
$('screenPanelToggle').addEventListener('click', () => toggleScreenPanel());
$('screenPanelClose').addEventListener('click', () => toggleScreenPanel(false));
$('copyScreenLink').addEventListener('click', () => copyLink(screenLinks().screen, 'Screen link'));
$('copyCustomerLink').addEventListener('click', () => copyLink(screenLinks().customer, 'Customer link'));
$('restartWalkthrough').addEventListener('click', () => startWalkthrough(true));
$('logoutButton').addEventListener('click', async () => {
  const { error } = await client.auth.signOut();
  if (error) { message.textContent = error.message; return; }
  redirectToAccount();
});
(async () => {
  try {
    client = window.createPopBiaClient();
    client.auth.onAuthStateChange((event, session) => {
      if (!session && event !== 'INITIAL_SESSION') { redirectToAccount(); }
    });
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session) { redirectToAccount(); return; }
    const result = await client.from('businesses').select('*').order('created_at').limit(1).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) { redirectToAccount(); return; }
    $('logoutButton').hidden = false;
    cloud = new CollectionCloud(client, {
      onChange: () => {
        const locked = !cloud.entitlement?.access_allowed;
        window.renderCollectionEntitlement($('collectionEntitlement'), cloud.entitlement);
        document.querySelector('#collection-demo').hidden = locked;
        $('screenPanelToggle').hidden = locked;
        if (locked) $('screenPanel').hidden = true;
        if (!busy) document.querySelectorAll('#collection-demo button, #collection-demo input, #collection-demo select').forEach(el => el.disabled = locked);
        if (locked) editingOrderId = null;
        message.textContent = '';
        document.querySelector('.product-brand span:last-child').textContent = `${cloud.business.name} · Staff controls`;
        renderScreenPanel();
        renderOrders();
      },
      onStatus: text => {
        document.querySelector('.admin-connection-status').textContent = text;
        if (text.startsWith('Connection error')) message.textContent = text;
      }
    });
    await cloud.start(result.data);
    setInterval(updateOrderTimes, 1000);
    await startWalkthrough();
  } catch (error) { message.textContent = error.message; }
})();
