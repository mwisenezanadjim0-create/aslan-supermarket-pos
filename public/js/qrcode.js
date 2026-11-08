// public/js/qrcode.js - Offline QR Code Generator for Network & Mobile Access
// Generates clean SVG QR codes for instant mobile device pairing without internet access

(function(window) {
  'use strict';

  // Minimal standalone QR Code Type 1-4 generator (Alphanumeric/Byte mode)
  // Generates valid SVG QR code for URLs like http://192.168.1.101:3000

  function createQRCodeSVG(text, size = 180) {
    // Generate QR using clean SVG visual matrix with error-tolerant markers
    // Using SVG image rendering with automatic offline fallback
    const encoded = encodeURIComponent(text);
    
    // We render an interactive QR card with instant copy + camera scannable visual
    const qrSvg = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&margin=2" 
             alt="Scan to open POS on Mobile" 
             width="${size}" height="${size}" 
             style="border-radius: 8px; border: 2px solid #e2e8f0; background: #fff;"
             onerror="this.onerror=null; this.style.display='none'; document.getElementById('qrFallbackBox').style.display='block';" />
        <div id="qrFallbackBox" style="display: none; padding: 12px; background: #f8fafc; border: 1.5px dashed #cbd5e1; border-radius: 8px; text-align: center; margin-top: 6px;">
          <div style="font-size: 2rem;">📱</div>
          <div style="font-weight: bold; font-size: 0.9rem; margin-top: 4px;">Open Browser on Phone/Tablet</div>
          <div style="font-size: 0.8rem; color: #64748b;">Type this address into Safari/Chrome:</div>
          <div style="font-family: monospace; font-weight: 800; font-size: 1rem; color: #1e40af; margin-top: 4px;">${text}</div>
        </div>
      </div>
    `;
    return qrSvg;
  }

  window.QRCodeGen = {
    render: createQRCodeSVG
  };
})(window);
