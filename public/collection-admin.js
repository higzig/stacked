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

function refreshQueueUi() {
  const queueStyle = getQueueStyle();
  const setupComplete = true;
  const editStyle = loadOrders().find(order => order.id === editingOrderId)?.type || queueStyle;
  orderNumberInput.parentElement.hidden = queueStyle === "name" || Boolean(editingOrderId);
  setupPanel.classList.toggle("hidden", setupComplete);
  adminQueueView.classList.toggle("hidden", !setupComplete);

  const isNameMode = queueStyle === "name" || queueStyle === "number-name";
  if (customerNameInput) {
    customerNameField.style.display = isNameMode || Boolean(editingOrderId) ? "flex" : "none";
    customerNameLabel.textContent = editingOrderId && editStyle === "number"
      ? "Order number"
      : editStyle === "number-name"
        ? "Customer name (optional)"
        : "Customer name";
    customerNameInput.placeholder = editingOrderId && editStyle === "number" ? "e.g. 42" : "e.g. Ronan";
  }
  addOrderBtn.textContent = editingOrderId
    ? "Save edit"
    : queueStyle === "number-name"
      ? `Add order #${getNextNumber()}`
      : queueStyle === "number"
        ? `Add order #${getNextNumber()}`
        : "Add order";
  if (queueStyleSelect) {
    queueStyleSelect.value = queueStyle;
  }
  if (overdueSelect) {
    overdueSelect.value = String(getOverdueMinutes() * 60);
  }
  if (readyChimeSelect) {
    readyChimeSelect.value = isReadyChimeEnabled() ? "on" : "off";
  }
  if (queueSettingsPanel) {
    queueSettingsPanel.classList.remove("hidden");
  }
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

function renderOrders() {
  const queueStyle = getQueueStyle();
  const orders = loadOrders().filter(order => order.status !== "collected");
  const sortedOrders = orders.sort(sortOrders);

  if (!sortedOrders.length) {
    ordersList.innerHTML = '<div class="order-row"><div class="order-summary"><span class="order-label">No orders</span><span class="order-status-badge preparing">Waiting</span></div></div>';
    refreshQueueUi();
    return;
  }

  ordersList.innerHTML = sortedOrders.map(order => {
    const label = order.type === "number"
      ? `#${order.label}`
      : order.type === "number-name"
        ? `#${order.number || "?"}${order.label ? ` · ${order.label}` : ""}`
        : order.label;
    const safeLabel = escapeHtml(label);
    const safeId = escapeHtml(order.id);
    const remaining = getReadyRemainingSeconds(order);
    const overdue = isOverdue(order);
    const removalText = remaining !== null
      ? `<small class="order-timer ${overdue ? "overdue" : ""}">${overdue ? "Please see staff" : `Ready reminder in ${formatCountdown(remaining)}`}</small>`
      : "";

    const isPreparing = order.status === "preparing";
    const primaryActionLabel = isPreparing ? "Mark Ready" : "Mark Collected";
    const primaryAction = isPreparing ? "ready" : "collected";

    return `
      <div class="order-row ${order.status}${overdue ? " overdue" : ""}" data-row-id="${safeId}">
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
            <button type="button" class="order-action-btn edit" data-order-id="${safeId}" data-action="edit">Edit</button>
            <button type="button" class="order-action-btn remove" data-order-id="${safeId}" data-action="remove">Remove</button>
          </div>
        </div>
      </div>
    `;
  }).join("");

  refreshQueueUi();
}

function editSpecificOrder(orderId) {
  const order = loadOrders().find(item => item.id === orderId);
  if (!order) return;
  editingOrderId = orderId;
  customerNameInput.value = order.type === "number" ? order.label : order.label;
  customerNameInput.focus();
  refreshQueueUi();
}
const $ = id => document.getElementById(id);
const setupPanel = $('setupPanel'), adminQueueView = $('adminQueueView'), queueSettingsPanel = $('queueSettingsPanel');
const queueSettingsToggle = $('queueSettingsToggle'), queueSettingsBody = $('queueSettingsBody');
const queueStyleSelect = $('queueStyleSelect'), overdueSelect = $('overdueSelect'), readyChimeSelect = $('readyChimeSelect');
const customerNameField = $('customerNameField'), customerNameLabel = customerNameField.querySelector('label');
const customerNameInput = $('customerNameInput'), addOrderBtn = $('addOrderBtn'), ordersList = $('ordersList');
const orderNumberInput = $('orderNumberInput'), message = $('cloudMessage');
let cloud, client, editingOrderId = null, busy = false, leaving = false;
function redirectToAccount() {
  if (leaving) return;
  leaving = true; cloud?.close();
  document.querySelector('#collection-demo').hidden = true;
  location.replace('account.html');
}
const loadOrders = () => cloud?.orders || [];
const getQueueStyle = () => cloud.business.queue_style;
const getNextNumber = () => cloud.business.next_number;
const getOverdueMinutes = () => cloud.business.overdue_seconds / 60;
const isReadyChimeEnabled = () => cloud.business.ready_chime;
async function action(work) {
  if (busy || !cloud?.entitlement?.access_allowed) return;
  busy = true;
  document.querySelectorAll('#collection-demo button, #collection-demo input, #collection-demo select').forEach(el => el.disabled = true);
  try { await work(); message.textContent = ''; }
  catch (error) { message.textContent = error.message; }
  finally {
    busy = false;
    document.querySelectorAll('#collection-demo button, #collection-demo input, #collection-demo select').forEach(el => el.disabled = !cloud?.entitlement?.access_allowed);
  }
}
async function addOrder() {
  await action(async () => {
    if (editingOrderId) {
      const order = loadOrders().find(o => o.id === editingOrderId);
      if (!order) throw new Error('This order is no longer active.');
      const value = customerNameInput.value.trim();
      const fields = order.type === 'number' ? { number: Number(value) } : { customer_name: value };
      await cloud.update(order.id, fields);
      editingOrderId = null;
    } else {
      const number = orderNumberInput.value ? Number(orderNumberInput.value) : null;
      if (number !== null && (!Number.isInteger(number) || number < 1)) throw new Error('Enter a positive whole order number.');
      if (getQueueStyle() === 'name' && !customerNameInput.value.trim()) throw new Error('Enter a customer name.');
      await cloud.add(customerNameInput.value.trim(), number);
    }
    customerNameInput.value = ''; orderNumberInput.value = '';
    refreshQueueUi(); customerNameInput.focus();
  });
}
queueSettingsToggle.addEventListener('click', () => queueSettingsToggle.setAttribute('aria-expanded', String(!queueSettingsBody.classList.toggle('hidden'))));
queueStyleSelect.addEventListener('change', () => action(() => cloud.settings({ queue_style: queueStyleSelect.value })));
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
  if (type === 'edit') { editSpecificOrder(orderId); return; }
  action(() => type === 'remove' ? cloud.remove(orderId) : cloud.update(orderId, { status: type }));
});
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
        $('openBoard').hidden = locked;
        if (!busy) document.querySelectorAll('#collection-demo button, #collection-demo input, #collection-demo select').forEach(el => el.disabled = locked);
        if (locked) editingOrderId = null;
        message.textContent = ''; 
        document.querySelector('.product-brand span:last-child').textContent = `${cloud.business.name} · Staff controls`;
        $('openBoard').href = `board.html?display=${cloud.business.display_id}`;
        renderOrders();
      },
      onStatus: text => {
        document.querySelector('.admin-connection-status').textContent = text;
        if (text.startsWith('Connection error')) message.textContent = text;
      }
    });
    await cloud.start(result.data);
    setInterval(updateOrderTimes, 1000);
  } catch (error) { message.textContent = error.message; }
})();
