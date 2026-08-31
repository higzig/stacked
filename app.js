    const navToggle = document.getElementById("navToggle");
    const navLinks = document.getElementById("navLinks");
    const drawer = document.getElementById("drawer");
    const cartBody = document.getElementById("cartBody");
    const cartTotal = document.getElementById("cartTotal");
    const cartBadge = document.getElementById("cartBadge");
    const drawerPanel = drawer.querySelector(".drawer-panel");
    let drawerTrigger = null;

    const cart = [];

    navToggle.addEventListener("click", () => {
      const open = navLinks.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", open);
      navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      navToggle.textContent = open ? "✕" : "☰";
    });

    document.querySelectorAll("#navLinks a").forEach(link => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
        navToggle.setAttribute("aria-label", "Open menu");
        navToggle.textContent = "☰";
      });
    });

    const menuTabs = [...document.querySelectorAll(".menu-tab")];

    function activateMenuTab(tab) {
      menuTabs.forEach(item => {
        const selected = item === tab;
        item.classList.toggle("active", selected);
        item.setAttribute("aria-selected", selected);
        item.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(item.dataset.tab);
        panel.classList.toggle("active", selected);
        panel.hidden = !selected;
      });
    }

    menuTabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activateMenuTab(tab));
      tab.addEventListener("keydown", event => {
        let nextIndex;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % menuTabs.length;
        else if (event.key === "ArrowLeft") nextIndex = (index - 1 + menuTabs.length) % menuTabs.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = menuTabs.length - 1;
        else return;
        event.preventDefault();
        activateMenuTab(menuTabs[nextIndex]);
        menuTabs[nextIndex].focus();
      });
    });

    document.querySelectorAll(".faq-question").forEach(button => {
      button.addEventListener("click", () => {
        const item = button.closest(".faq-item");
        const open = item.classList.toggle("open");
        button.setAttribute("aria-expanded", open);
        document.getElementById(button.getAttribute("aria-controls")).hidden = !open;
        button.querySelector("span").textContent = open ? "−" : "+";
      });
    });

    function openDrawer(trigger) {
      drawerTrigger = trigger || document.activeElement;
      navLinks.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
      navToggle.setAttribute("aria-label", "Open menu");
      navToggle.textContent = "☰";
      drawer.classList.add("open");
      drawer.setAttribute("aria-hidden", "false");
      document.body.classList.add("locked");
      drawerPanel.focus();
    }

    function closeDrawer() {
      drawer.classList.remove("open");
      drawer.setAttribute("aria-hidden", "true");
      document.body.classList.remove("locked");
      if (drawerTrigger && document.contains(drawerTrigger)) drawerTrigger.focus();
      drawerTrigger = null;
    }

    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && drawer.classList.contains("open")) {
        closeDrawer();
        return;
      }

      if (event.key === "Escape" && navLinks.classList.contains("open")) {
        navLinks.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
        navToggle.setAttribute("aria-label", "Open menu");
        navToggle.textContent = "☰";
        navToggle.focus();
      }

      if (event.key === "Tab" && drawer.classList.contains("open")) {
        const focusable = [...drawerPanel.querySelectorAll('button:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === drawerPanel)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    function addToCart(name, price, button) {
      const existing = cart.find(item => item.name === name);

      if (existing) existing.qty += 1;
      else cart.push({ name, price, qty: 1 });

      button.textContent = "Added ✓";
      button.classList.add("added");

      setTimeout(() => {
        button.textContent = "+ Add";
        button.classList.remove("added");
      }, 900);

      renderCart();
    }

    function changeQty(name, delta) {
      const item = cart.find(entry => entry.name === name);
      if (!item) return;

      item.qty += delta;

      if (item.qty <= 0) {
        cart.splice(cart.indexOf(item), 1);
      }

      renderCart();
    }

    function renderCart() {
      const count = cart.reduce((sum, item) => sum + item.qty, 0);
      const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

      cartBadge.textContent = count;
      cartTotal.textContent = "€" + total.toFixed(2).replace(/\.00$/, "");

      if (!cart.length) {
        cartBody.innerHTML = '<div class="empty">Nothing added yet. Start with the Classic. It has never betrayed anyone.</div>';
        return;
      }

      cartBody.innerHTML = cart.map(item => `
        <div class="cart-line">
          <strong>${item.name}</strong>
          <div class="qty">
            <button aria-label="Remove one ${item.name}" onclick="changeQty('${item.name.replace(/'/g, "\\'")}', -1)">−</button>
            <span aria-label="Quantity ${item.qty}">${item.qty}</span>
            <button aria-label="Add one ${item.name}" onclick="changeQty('${item.name.replace(/'/g, "\\'")}', 1)">+</button>
          </div>
          <span>€${(item.price * item.qty).toFixed(2).replace(/\.00$/, "")}</span>
        </div>
      `).join("");
    }

    function sendOrder() {
      if (!cart.length) {
        alert("Add at least one item first.");
        return;
      }

      const time = document.getElementById("collectionTime").value;

      if (!time) {
        alert("Choose a collection time.");
        return;
      }

      const lines = cart.map(item =>
        `${item.qty}x ${item.name} (€${(item.price * item.qty).toFixed(2).replace(/\.00$/, "")})`
      );

      const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

      const message =
        "Hi Stacked! I'd like to request an order for collection:\n\n" +
        lines.join("\n") +
        "\n\nTotal: €" + total.toFixed(2).replace(/\.00$/, "") +
        "\nPreferred collection time: " + time +
        "\n\nPlease confirm item availability and the collection time. I understand this request is not accepted until you reply.";

      // DEMO PLACEHOLDER: replace with a verified client number before enabling WhatsApp.
      const whatsappNumber = "353000000000";
      const isDemoNumber = whatsappNumber === "353000000000";

      if (isDemoNumber) {
        showDemoMessage("This is a demo order request. WhatsApp is disabled until a client adds their verified number; no order has been sent.");
        return;
      }

      window.open("https://wa.me/" + whatsappNumber + "?text=" + encodeURIComponent(message), "_blank", "noopener");
    }

    function showDemoMessage(message) {
      alert(message);
    }
