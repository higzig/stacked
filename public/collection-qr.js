/* Presentation only: a real board needs a business display link, so the sample opens this demo. */
(() => {
  const canvas = document.getElementById("collectionQrCode");
  const destination = new URL("#flow-title", window.location.href).href;
  if (!canvas || !window.QRCode) return;
  window.QRCode.toCanvas(canvas, destination, {
    width: 200,
    margin: 4,
    color: { dark: "#10243d", light: "#ffffff" }
  }, error => {
    if (error) {
      canvas.hidden = true;
      document.getElementById("collectionQrCaption").textContent = "QR preview unavailable. Try the demo above.";
    }
  });
})();
