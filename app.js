    const navToggle = document.getElementById("navToggle");
    const navLinks = document.getElementById("navLinks");
    const drawer = document.getElementById("drawer");
    const cartBody = document.getElementById("cartBody");
    const cartTotal = document.getElementById("cartTotal");
    const cartBadge = document.getElementById("cartBadge");
    const drawerPanel = drawer.querySelector(".drawer-panel");
    const clientConfig = window.CLIENT_CONFIG || {};
    let drawerTrigger = null;

    const cart = [];

    function formatCurrency(value) {
      return (clientConfig.currencySymbol || "€") + value.toFixed(2);
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"]/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;"
      })[character]);
    }

    function applyClientConfig() {
      const businessName = clientConfig.businessName || "Stacked";
      document.title = `${businessName} — Smash burgers on the move`;
      const metaDescription = clientConfig.metaDescription || "Food-truck menu, schedule, event enquiries and collection order requests.";
      document.querySelector('meta[name="description"]').setAttribute("content", metaDescription);
      document.querySelector('meta[property="og:title"]').setAttribute("content", document.title);
      document.querySelector('meta[property="og:description"]').setAttribute("content", metaDescription);
      document.querySelectorAll(".brand").forEach(brand => {
        brand.setAttribute("aria-label", `${businessName} home`);
      });

      document.querySelectorAll("[data-client-text]").forEach(element => {
        const value = clientConfig[element.dataset.clientText];
        if (typeof value === "string" && value.trim()) element.textContent = value;
      });

      const hoursParts = (clientConfig.openingHours || "").split("·");
      document.querySelectorAll('[data-client-text="openingHoursShort"]').forEach(element => {
        element.textContent = (hoursParts[1] || clientConfig.openingHours || "Sample hours").trim();
      });

      const collectionTime = document.getElementById("collectionTime");
      (clientConfig.collectionTimes || []).forEach(time => {
        const option = document.createElement("option");
        option.value = time;
        option.textContent = time;
        collectionTime.append(option);
      });
      cartTotal.textContent = formatCurrency(0);

      configureExternalAction({
        button: document.getElementById("directionsButton"),
        url: clientConfig.googleMapsUrl,
        placeholder: clientConfig.googleMapsPlaceholder,
        liveLabel: "Get directions",
        demoLabel: "Demo directions",
        demoMessage: "Directions are disabled until a client adds their verified Google Maps destination."
      });

      configureExternalAction({
        button: document.getElementById("instagramButton"),
        url: clientConfig.instagramUrl,
        placeholder: clientConfig.instagramPlaceholder,
        liveLabel: "Instagram",
        demoLabel: "Instagram (demo)",
        demoMessage: "Instagram is disabled until a client adds their verified profile URL."
      });

      const eventButton = document.getElementById("eventEnquiryButton");
      const emailReady = clientConfig.contactEmail && !clientConfig.contactEmailPlaceholder;
      eventButton.classList.toggle("demo-action", !emailReady);
      eventButton.addEventListener("click", () => {
        if (!emailReady) {
          showDemoMessage("Event enquiries are disabled until a client adds a verified contact email.");
          return;
        }
        const subject = encodeURIComponent(clientConfig.eventEmailSubject || "Event enquiry");
        window.location.href = `mailto:${clientConfig.contactEmail}?subject=${subject}`;
      });
    }

    function configureExternalAction({ button, url, placeholder, liveLabel, demoLabel, demoMessage }) {
      const ready = Boolean(url) && !placeholder;
      button.textContent = ready ? liveLabel : demoLabel;
      button.classList.toggle("demo-action", !ready);
      button.addEventListener("click", () => {
        if (!ready) {
          showDemoMessage(demoMessage);
          return;
        }
        window.open(url, "_blank", "noopener,noreferrer");
      });
    }

    applyClientConfig();

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

    function changeQty(index, delta) {
      const item = cart[index];
      if (!item) return;

      item.qty += delta;

      if (item.qty <= 0) {
        cart.splice(index, 1);
      }

      renderCart();
    }

    function renderCart() {
      const count = cart.reduce((sum, item) => sum + item.qty, 0);
      const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

      cartBadge.textContent = count;
      cartTotal.textContent = formatCurrency(total);

      if (!cart.length) {
        cartBody.innerHTML = '<div class="empty">Nothing added yet. Start with the Classic. It has never betrayed anyone.</div>';
        return;
      }

      cartBody.innerHTML = cart.map((item, index) => {
        const safeName = escapeHtml(item.name);
        return `
        <div class="cart-line">
          <strong>${safeName}</strong>
          <div class="qty">
            <button aria-label="Remove one ${safeName}" onclick="changeQty(${index}, -1)">−</button>
            <span aria-label="Quantity ${item.qty}">${item.qty}</span>
            <button aria-label="Add one ${safeName}" onclick="changeQty(${index}, 1)">+</button>
          </div>
          <span>${formatCurrency(item.price * item.qty)}</span>
        </div>
      `;
      }).join("");
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

      const lines = cart.map(item => {
        const lineTotal = item.price * item.qty;
        return `${item.qty} × ${item.name} — ${formatCurrency(item.price)} each (${formatCurrency(lineTotal)})`;
      });

      const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);

      const message =
        `Hi ${clientConfig.businessName || "Stacked"}! ${clientConfig.orderRequestIntro || "I'd like to request an order for collection:"}\n\n` +
        lines.join("\n") +
        "\n\nTotal: " + formatCurrency(total) +
        "\nPreferred collection time: " + time +
        "\n\n" + (clientConfig.orderConfirmationPrompt || "Please confirm item availability and the collection time. I understand this request is not accepted until you reply.");

      // WhatsApp requires an international number made only of digits.
      const whatsappNumber = String(clientConfig.whatsappNumber || "").replace(/[\s()+-]/g, "");
      const isValidNumber = /^\d{8,15}$/.test(whatsappNumber);
      const isDemoNumber = clientConfig.whatsappPlaceholder || !isValidNumber;

      if (isDemoNumber) {
        const reason = clientConfig.whatsappPlaceholder
          ? "WhatsApp is disabled until a client adds their verified number"
          : "the configured WhatsApp number is invalid";
        showDemoMessage(`This is a demo order request. ${reason}; no order has been sent.`);
        return;
      }

      const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    }

    function showDemoMessage(message) {
      alert(message);
    }
