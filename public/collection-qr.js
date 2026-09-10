/* Presentation only: use the same destination as the customer board QR. */
(() => {
  const canvas = document.getElementById("collectionQrCode");
  const destination = window.CLIENT_CONFIG?.publicBoardUrl || new URL("board.html", window.location.href).href;
  if (!canvas || !window.QRCode) return;
  window.QRCode.toCanvas(canvas, destination, {
    width: 200,
    margin: 4,
    color: { dark: "#10243d", light: "#ffffff" }
  }, error => {
    if (error) {
      canvas.hidden = true;
      document.getElementById("collectionQrCaption").textContent = "QR preview unavailable. Explore the customer board below.";
    }
  });
})();
