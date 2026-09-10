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
    { id: 47, number: 47, name: "Maya", status: "ready" },
    { id: 48, number: 48, name: "", status: "preparing" }
  ];
  let orders = initialOrders.map(order => ({ ...order }));
  let nextNumber = 49;

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
        actions.append(actionButton("Mark ready", "ready", order));
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
    nextNumber = 49;
    demoName.value = "";
    renderDemo();
  });

  const contactConfig = window.POPBIA_CONFIG || {};
  const contactForm = document.getElementById("contactForm");
  const contactSubmit = document.getElementById("contactSubmit");
  const contactStatus = document.getElementById("contactStatus");
  const verifiedEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactConfig.contactEmail || "");
  const verifiedUrl = /^https:\/\//.test(contactConfig.contactUrl || "");

  const interest = document.getElementById("contactInterest");
  const collectionQuestion = document.getElementById("collectionQuestion");
  const collectionMethod = document.getElementById("collectionMethod");

  function updateCollectionQuestion() {
    const relevant = ["Collection system", "Website + Collection"].includes(interest.value);
    collectionQuestion.hidden = !relevant;
    collectionMethod.disabled = !relevant;
    collectionMethod.required = relevant;
    if (!relevant) collectionMethod.value = "";
  }
  interest.addEventListener("change", updateCollectionQuestion);
  window.addEventListener("pageshow", updateCollectionQuestion);
  updateCollectionQuestion();

  if (verifiedEmail || verifiedUrl) {
    contactSubmit.disabled = false;
    contactStatus.textContent = verifiedEmail
      ? "This opens an email draft for you to review and send."
      : "Continue to our contact page to share your enquiry. Nothing is sent from this form.";
  }

  contactForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!verifiedEmail && !verifiedUrl) return;
    if (!contactForm.reportValidity()) return;

    if (verifiedUrl && !verifiedEmail) {
      window.location.href = contactConfig.contactUrl;
      return;
    }

    const data = new FormData(contactForm);
    const subject = encodeURIComponent(`PopBia — ${data.get("interest")} — ${data.get("business")}`);
    const body = encodeURIComponent(
      `Name: ${data.get("name")}\nBusiness: ${data.get("business")}\nEmail: ${data.get("email")}\nInterest: ${data.get("interest")}\nWhere they trade: ${data.get("location") || "Not provided"}${data.has("collectionMethod") ? `\nCurrent collection method: ${data.get("collectionMethod")}` : ""}\n\n${data.get("message")}`
    );
    window.location.href = `mailto:${contactConfig.contactEmail}?subject=${subject}&body=${body}`;
  });

  renderDemo();
})();
