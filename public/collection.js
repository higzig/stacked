(() => {
  const navToggle = document.getElementById("navToggle");
  const siteNav = document.getElementById("siteNav");

  navToggle.addEventListener("click", () => {
    const open = siteNav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.textContent = open ? "Close" : "Menu";
  });

  siteNav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
    siteNav.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.textContent = "Menu";
  }));

  const initialOrders = [
    { id: 50, number: 50, name: "Maya", status: "ready" },
    { id: 51, number: 51, name: "Aoife", status: "preparing" },
    { id: 52, number: 52, name: "Jack", status: "preparing" }
  ];
  let orders = initialOrders.map(order => ({ ...order }));
  let nextNumber = 53;

  const demoName = document.getElementById("demoName");
  const demoAdd = document.getElementById("demoAdd");
  const demoNextNumber = document.getElementById("demoNextNumber");
  const demoReset = document.getElementById("demoReset");
  const staffOrders = document.getElementById("staffOrders");
  const customerPreparing = document.getElementById("customerPreparing");
  const customerReady = document.getElementById("customerReady");

  function orderLabel(order) {
    return order.name ? `#${order.number} · ${order.name}` : `#${order.number}`;
  }

  function actionButton(label, action, order) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.action = action;
    button.dataset.orderId = String(order.id);
    return button;
  }

  function renderCustomerList(list, matchingOrders) {
    list.replaceChildren();
    if (!matchingOrders.length) {
      const empty = document.createElement("li");
      empty.className = "demo-empty";
      empty.textContent = "No orders";
      list.append(empty);
      return;
    }
    matchingOrders.forEach(order => {
      const item = document.createElement("li");
      const name = document.createElement("span");
      const number = document.createElement("span");
      name.textContent = order.name || "Order";
      number.textContent = `#${order.number}`;
      item.append(name, number);
      list.append(item);
    });
  }

  function renderDemo() {
    demoNextNumber.textContent = `#${nextNumber}`;
    staffOrders.replaceChildren();
    orders.filter(order => order.status !== "collected").forEach(order => {
      const item = document.createElement("li");
      item.className = "staff-order";
      const head = document.createElement("div");
      head.className = "staff-order-head";
      const identity = document.createElement("strong");
      const status = document.createElement("span");
      identity.textContent = orderLabel(order);
      status.textContent = order.status;
      head.append(identity, status);
      const actions = document.createElement("div");
      actions.className = "staff-order-actions";
      if (order.status === "preparing") {
        actions.append(actionButton("Mark Ready", "ready", order));
      } else {
        actions.append(actionButton("Collected", "collected", order));
        actions.append(actionButton("Back", "preparing", order));
      }
      item.append(head, actions);
      staffOrders.append(item);
    });
    renderCustomerList(customerPreparing, orders.filter(order => order.status === "preparing"));
    renderCustomerList(customerReady, orders.filter(order => order.status === "ready"));
  }

  function addDemoOrder() {
    const name = demoName.value.trim().slice(0, 28);
    orders.push({ id: nextNumber, number: nextNumber, name, status: "preparing" });
    nextNumber += 1;
    demoName.value = "";
    demoName.focus();
    renderDemo();
  }

  demoAdd.addEventListener("click", addDemoOrder);
  demoName.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      addDemoOrder();
    }
  });
  staffOrders.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const order = orders.find(item => String(item.id) === button.dataset.orderId);
    if (!order) return;
    order.status = button.dataset.action;
    renderDemo();
  });
  demoReset.addEventListener("click", () => {
    orders = initialOrders.map(order => ({ ...order }));
    nextNumber = 53;
    demoName.value = "";
    renderDemo();
  });

  renderDemo();
})();
