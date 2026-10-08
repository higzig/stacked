/* UI only. Authorization and remaining days come from the database RPC. */
window.renderCollectionEntitlement = (container, entitlement) => {
  if (!container) return;
  container.hidden = !entitlement;
  if (!entitlement) return;
  const locked = !entitlement.access_allowed;
  container.classList.toggle('entitlement-locked', locked);
  container.classList.toggle('entitlement-ending', !locked && entitlement.subscription_status === 'trialing' && entitlement.days_remaining <= 3);
  const signature = JSON.stringify([locked, entitlement.subscription_status, entitlement.days_remaining]);
  if (container.dataset.signature === signature) return;
  container.dataset.signature = signature;
  container.replaceChildren();
  if (!locked) {
    if (entitlement.subscription_status === 'trialing') {
      const text = document.createElement('p');
      text.textContent = `14-day free trial · ${entitlement.days_remaining} ${entitlement.days_remaining === 1 ? 'day' : 'days'} remaining`;
      container.append(text);
    } else {
      const text = document.createElement('p'); text.textContent = 'Collection access active'; container.append(text);
    }
    return;
  }
  const title = document.createElement('h2');
  title.textContent = entitlement.subscription_status === 'expired' ? 'Your free trial has ended.' : 'Collection access is paused.';
  const note = document.createElement('p');
  note.textContent = 'Your PopBia workspace and Collection data are still safe.';
  const pricing = document.createElement('p');
  pricing.textContent = 'Monthly: €39/month · Annual: €360/year. Save €108 per year compared with monthly.';
  const link = document.createElement('a');
  link.className = 'entitlement-contact';
  link.href = 'mailto:hello@popbia.com?subject=Continue%20PopBia%20Collection';
  link.textContent = 'Contact PopBia to continue';
  const help = document.createElement('p');
  help.textContent = 'Contact us to arrange continued access. Online payment is not available yet.';
  container.append(title, note, pricing, link, help);
};
