  const contactForm = document.getElementById("contactForm");
  const contactSubmit = document.getElementById("contactSubmit");
  const contactStatus = document.getElementById("contactStatus");
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

  let submitting = false;
  contactForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (submitting || !contactForm.reportValidity()) return;
    submitting = true;
    contactSubmit.disabled = true;
    contactSubmit.textContent = "Submitting…";
    contactForm.setAttribute("aria-busy", "true");
    contactStatus.textContent = "Sending your query…";
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(new FormData(contactForm)))
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || "We couldn’t submit your query. Please try again.");
      }
      contactForm.reset();
      updateCollectionQuestion();
      contactStatus.textContent = "Query submitted";
    } catch (error) {
      contactStatus.textContent = error instanceof SyntaxError || error instanceof TypeError
        ? "We couldn’t confirm your submission. Please try again shortly or contact ryan@popbia.com."
        : error.message;
    } finally {
      submitting = false;
      contactSubmit.disabled = false;
      contactSubmit.textContent = "Let’s chat";
      contactForm.removeAttribute("aria-busy");
    }
  });

