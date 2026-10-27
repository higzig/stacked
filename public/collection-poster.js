/* Printable QR poster. Uses the same anonymous display projection as the customer screen;
   the QR encodes only the public phone view for this business's display ID. */
(async () => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const display = params.get('display');
  const message = $('posterMessage');
  $('posterPrint').addEventListener('click', () => window.print());
  try {
    if (!display || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(display)) {
      throw new Error('This poster link isn’t complete. Open it from Customer screen in staff controls.');
    }
    const customerUrl = new URL(`board.html?display=${display}&phone=1`, location.href).href;
    const { data, error } = await window.createPopBiaClient(true).rpc('collection_display', { display });
    if (error) throw new Error('We couldn’t load your poster. Check your internet connection and try again.');
    if (!data) throw new Error('This poster link doesn’t match a business. Open it from Customer screen in staff controls.');
    $('posterBusiness').textContent = data.name;
    $('poster').classList.toggle('long-name', data.name.length > 28);
    document.title = `${data.name} — QR poster`;
    $('posterQr').innerHTML = await window.QRCode.toString(customerUrl, {
      type: 'svg', margin: 4, errorCorrectionLevel: 'M', color: { dark: '#10243d', light: '#ffffff' }
    });
    $('poster').hidden = false;
    message.textContent = data.inactive
      ? 'Collection access is paused for this business, so customers who scan will see an inactive screen until access is restored.'
      : '';
    if (params.get('print') === '1') {
      await document.fonts?.ready;
      window.print();
    }
  } catch (error) {
    message.textContent = error.message;
    $('posterPrint').hidden = true;
  }
})();
