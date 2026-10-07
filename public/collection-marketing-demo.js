/* Marketing-only, one-order adaptation of the original popbia.js demo.
   No storage, account or Collection application connections. */
(() => {
  const demo = document.getElementById('threeTapsDemo');
  if (!demo) return;
  const form = document.getElementById('tapAddForm');
  const name = document.getElementById('tapName');
  const add = document.getElementById('tapAdd');
  const staff = document.getElementById('tapStaffOrders');
  const preparing = document.getElementById('tapPreparing');
  const ready = document.getElementById('tapReady');
  const status = document.getElementById('tapStatus');
  const steps = [...demo.closest('.collection-flow').querySelectorAll('.flow-steps > li')];
  let order = null;

  // Reuse the original demo's DOM-based rendering, avoiding HTML interpolation.
  function renderCustomerList(list, matchingOrders) {
    list.replaceChildren();
    if (!matchingOrders.length) {
      const empty = document.createElement('li');
      empty.className = 'demo-empty';
      empty.textContent = 'No orders';
      list.append(empty);
      return;
    }
    matchingOrders.forEach(item => {
      const row = document.createElement('li');
      const label = document.createElement('span');
      const number = document.createElement('span');
      label.textContent = item.name || 'Order';
      number.textContent = '#47';
      row.append(label, number);
      list.append(row);
    });
  }

  function render() {
    const phase = order?.status;
    const active = !order ? 0 : phase === 'preparing' ? 1 : 2;
    steps.forEach((step, index) => {
      step.classList.toggle('is-active-step', index === active && phase !== 'collected');
      step.classList.toggle('is-complete-step', index < active || phase === 'collected');
      if (index === active && phase !== 'collected') step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    name.disabled = add.disabled = !!order;
    staff.replaceChildren();
    if (order) {
      const card = document.createElement('li');
      card.className = 'staff-order';
      const head = document.createElement('div');
      head.className = 'staff-order-head';
      const identity = document.createElement('strong');
      identity.textContent = order.name ? `#47 · ${order.name}` : '#47';
      const state = document.createElement('span');
      state.textContent = phase;
      head.append(identity, state);
      card.append(head);
      if (phase !== 'collected') {
        const actions = document.createElement('div');
        actions.className = 'staff-order-actions';
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.action = phase === 'preparing' ? 'ready' : 'collected';
        button.textContent = phase === 'preparing' ? 'Mark ready' : 'Mark collected';
        actions.append(button);
        card.append(actions);
      }
      staff.append(card);
    }
    renderCustomerList(preparing, phase === 'preparing' ? [order] : []);
    renderCustomerList(ready, phase === 'ready' ? [order] : []);
    status.textContent = !order ? 'Try adding Maya’s order to start.' : phase === 'preparing' ? 'Order #47 is Preparing. Mark it ready when it’s finished.' : phase === 'ready' ? 'Order #47 is Ready on the customer board. Time to collect.' : 'Flow complete — order #47 is Collected and off the customer board.';
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (order) return;
    order = { name: name.value.trim().slice(0, 28), status: 'preparing' };
    render();
    staff.querySelector('button').focus();
  });
  staff.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || !order) return;
    order.status = button.dataset.action;
    render();
    (staff.querySelector('button') || document.getElementById('tapReset')).focus();
  });
  document.getElementById('tapReset').addEventListener('click', () => {
    order = null;
    name.value = 'Maya';
    render();
    name.focus();
  });
  render();
  demo.hidden = false;
})();
