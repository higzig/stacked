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

  const screenLinks = document.querySelector(".collection-screen-links");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  if (screenLinks && !reducedMotion.matches && "IntersectionObserver" in window) {
    const frames = screenLinks.querySelectorAll(".collection-screen-frame");
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        screenLinks.classList.add("is-revealed");
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.15 });

    screenLinks.classList.add("has-screen-reveal");
    frames.forEach(frame => observer.observe(frame));

    reducedMotion.addEventListener("change", event => {
      if (!event.matches) return;
      observer.disconnect();
      screenLinks.classList.remove("has-screen-reveal");
    });
  }
  const revealTargets = document.querySelectorAll(".flow-steps, .collection-qr");
  if (!reducedMotion.matches && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.15 });
    revealTargets.forEach(target => {
      target.classList.add("has-entrance");
      observer.observe(target);
    });
    reducedMotion.addEventListener("change", event => {
      if (!event.matches) return;
      observer.disconnect();
      revealTargets.forEach(target => target.classList.remove("has-entrance"));
    });
  }
})();
