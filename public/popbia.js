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

  const stallServices = document.getElementById("stallServices");
  if (stallServices) {
    const links = [...stallServices.querySelectorAll("a")];
    const support = document.getElementById("stallSupport");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let active = 0;
    let timer;
    let hovered = false;

    function activate(index) {
      active = index;
      links.forEach((link, i) => link.classList.toggle("is-active", i === index));
      support.textContent = links[index].dataset.description;
    }

    function schedule() {
      window.clearTimeout(timer);
      if (reducedMotion.matches || hovered || stallServices.contains(document.activeElement) || document.hidden) return;
      timer = window.setTimeout(() => {
        if (reducedMotion.matches || hovered || stallServices.contains(document.activeElement) || document.hidden) return;
        activate((active + 1) % links.length);
        schedule();
      }, 3500);
    }

    links.forEach((link, index) => {
      link.addEventListener("pointerenter", event => {
        if (event.pointerType === "touch") return;
        hovered = true;
        activate(index);
        schedule();
      });
      link.addEventListener("focus", () => { activate(index); schedule(); });
      link.addEventListener("click", () => { activate(index); schedule(); });
    });
    stallServices.addEventListener("pointerleave", () => { hovered = false; schedule(); });
    stallServices.addEventListener("focusout", () => queueMicrotask(schedule));
    reducedMotion.addEventListener("change", schedule);
    document.addEventListener("visibilitychange", schedule);
    schedule();
  }

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

    let readyHintShown = false;
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
        const hint = document.getElementById("demoReadyHint");
        if (hint && !readyHintShown) {
          actions.append(hint.content.cloneNode(true));
          readyHintShown = true;
        }
        actions.append(actionButton("Mark ready", "ready", order));
      } else {
        actions.append(actionButton("Collected", "collected", order));
        actions.append(actionButton("Back", "preparing", order));
      }
      item.append(head, actions);
      if (order.status === "ready") {
        const backHint = document.getElementById("demoBackHint");
        if (backHint) item.append(backHint.content.cloneNode(true));
      }
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

  renderDemo();
})();

// Optional presentation only: all copy and illustration content is visible by default.
(() => {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ordering = document.getElementById('ordering');
  if (!ordering) return;
  const steps = [...ordering.querySelectorAll('[data-order-step]')];
  const mockup = document.getElementById('orderMockup');
  let timers = [];
  let interacted = false;
  const animations = new Set();
  const stopSequence = () => { timers.forEach(clearTimeout); timers = []; };
  function activate(stage) {
    mockup.dataset.stage = String(stage);
    steps.forEach((button, index) => {
      button.setAttribute('aria-pressed', String(index + 1 === stage));
      button.closest('li').classList.toggle('is-complete', index + 1 <= stage);
    });
    mockup.querySelectorAll('[data-request-part]').forEach(part => {
      part.classList.toggle('is-highlighted', Number(part.dataset.requestPart) === stage || (stage === 2 && part.dataset.requestPart === '1'));
    });
  }
  steps.forEach(button => {
    const select = () => { interacted = true; stopSequence(); activate(Number(button.dataset.orderStep)); };
    button.addEventListener('focus', select);
    button.addEventListener('click', select);
    button.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') select(); });
  });
  motion.addEventListener('change', () => {
    if (!motion.matches) return;
    stopSequence();
    animations.forEach(animation => animation.cancel());
    animations.clear();
    if (!interacted) activate(4);
  });
  if (!('IntersectionObserver' in window)) return;
  const groups = [...document.querySelectorAll('.homepage main > .section, .homepage .custom-ideas')];
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      if (!motion.matches) {
        const elements = entry.target.querySelectorAll('.section-number, .section-heading h2, .section-heading > p:not(.section-number), .contact-copy h2, .contact-copy > p:not(.section-number), .template-feature, .collection-demo, .order-mockup, .ordering-steps, .contact-form, .custom-ideas h2, .custom-ideas > p');
        if (typeof Element.prototype.animate === 'function') elements.forEach((element, index) => {
          const animation = element.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 520, delay: Math.min(index, 3) * 75, easing: 'cubic-bezier(.2,.65,.3,1)' });
          animations.add(animation);
          animation.onfinish = () => animations.delete(animation);
        });
      }
      if (entry.target === ordering && !interacted) {
        if (motion.matches) activate(4);
        else {
          activate(1);
          [2, 3, 4].forEach((stage, index) => timers.push(setTimeout(() => activate(stage), (index + 1) * 1000)));
        }
      }
    });
  }, { threshold: 0, rootMargin: '0px 0px -60px 0px' });
  groups.forEach(group => observer.observe(group));
})();
