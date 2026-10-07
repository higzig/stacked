(() => {
  const form = document.getElementById('demoRequestForm');
  if (!form) return;
  form.noValidate = true;
  const fields = [...form.querySelectorAll('input')];
  const status = document.getElementById('demoRequestStatus');
  function validate(field) {
    const valid = field.value.trim() !== '' && field.validity.valid;
    field.setAttribute('aria-invalid', String(!valid));
    document.getElementById(`${field.id}-error`).textContent = valid ? '' : field.type === 'email' ? 'Enter a valid email address.' : 'Please fill in this field.';
    return valid;
  }
  fields.forEach(field => field.addEventListener('input', () => {
    status.textContent = '';
    if (field.hasAttribute('aria-invalid')) validate(field);
  }));
  form.addEventListener('submit', event => {
    event.preventDefault();
    const invalid = fields.filter(field => !validate(field));
    if (invalid.length) {
      status.textContent = 'Please check the highlighted fields.';
      invalid[0].focus();
      return;
    }
    const data = new FormData(form);
    const body = `Hi PopBia,\n\nI’d like a Collection demo.\n\nName: ${data.get('name').trim()}\nBusiness: ${data.get('business').trim()}\nWhat we sell: ${data.get('sell').trim()}\nEmail: ${data.get('email').trim()}\n\nThanks!`;
    const url = `mailto:hello@popbia.com?subject=${encodeURIComponent('PopBia Collection demo')}&body=${encodeURIComponent(body)}`;
    document.getElementById('demoEmailFallback').href = url;
    status.textContent = 'Your email draft is ready. Review and send it in your email app. Nothing has been sent by this site. If your app didn’t open, use the email link below.';
    window.location.href = url;
  });
})();
