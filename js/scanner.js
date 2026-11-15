// public/js/scanner.js - High-Performance USB Hardware Barcode Scanner & Camera Engine
// Specially optimized for USB Barcode Scanners (HID Keyboard Wedge) and Epson POS Receipt Printers

(function(window) {
  'use strict';

  let hardwareBuffer = '';
  let lastKeyTime = 0;
  let keyTimes = [];
  const SCANNER_BURST_MAX_MS = 50; // USB scanners transmit at 5-35ms per keystroke
  let autoFlushTimer = null;
  let testModeCallback = null;

  let videoStream = null;
  let barcodeDetector = null;
  let cameraScanInterval = null;

  // Initialize Barcode Detector if supported by browser
  if ('BarcodeDetector' in window) {
    try {
      barcodeDetector = new window.BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'itf']
      });
    } catch (e) {
      console.warn('BarcodeDetector format error, falling back:', e);
    }
  }

  // Sanitize scanned barcode (remove AIM symbology prefixes like ]C1, ]E0 and control chars)
  function cleanBarcode(raw) {
    if (!raw) return '';
    let code = raw.trim();
    // Remove AIM Symbology identifier prefixes (e.g., ]C1, ]e0, ]d2)
    if (code.startsWith(']') && code.length >= 4) {
      code = code.substring(3);
    }
    // Remove ASCII control characters (STX 0x02, ETX 0x03, etc.)
    code = code.replace(/[\x00-\x1F\x7F]/g, '');
    return code.trim();
  }

  // --- HARDWARE USB SCANNER LISTENER ---
  function initHardwareScanner() {
    window.addEventListener('keydown', (e) => {
      const target = e.target;
      const targetTag = target.tagName ? target.tagName.toLowerCase() : '';
      const isInput = targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select';
      const isSearchBox = target.id === 'posSearchInput';
      const isScannerTestInput = target.id === 'scannerTestInput';

      const now = Date.now();
      const interval = now - lastKeyTime;
      lastKeyTime = now;

      // Handle Enter or Tab suffixes from USB scanner
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (autoFlushTimer) {
          clearTimeout(autoFlushTimer);
          autoFlushTimer = null;
        }

        // Check if buffer contains a barcode
        if (hardwareBuffer.length >= 2) {
          e.preventDefault();
          const finalBarcode = cleanBarcode(hardwareBuffer);
          const avgInterval = keyTimes.length > 1
            ? Math.round((keyTimes[keyTimes.length - 1] - keyTimes[0]) / (keyTimes.length - 1))
            : interval;

          hardwareBuffer = '';
          keyTimes = [];

          if (finalBarcode) {
            handleSuccessfulScan(finalBarcode, 'USB Scanner', avgInterval);
          }
          return;
        }

        // If user manually pressed Enter inside POS search box
        if (isSearchBox && target.value.trim().length > 0) {
          e.preventDefault();
          const manualCode = cleanBarcode(target.value);
          target.value = '';
          handleSuccessfulScan(manualCode, 'Search Input', 0);
          return;
        }

        hardwareBuffer = '';
        keyTimes = [];
        return;
      }

      // Single printable character
      if (e.key.length === 1) {
        // If typing speed is human (> 60ms) and NOT in search box, reset buffer
        if (interval > SCANNER_BURST_MAX_MS) {
          hardwareBuffer = '';
          keyTimes = [];
        }

        hardwareBuffer += e.key;
        keyTimes.push(now);

        // If keystrokes are coming in fast (< 45ms), this is a USB scanner!
        // If an input like "Cash Tendered" or "Customer Name" was accidentally focused,
        // preventDefault() so the barcode numbers don't contaminate the form field!
        if (isInput && !isSearchBox && !isScannerTestInput) {
          if (hardwareBuffer.length >= 2 && interval < SCANNER_BURST_MAX_MS) {
            e.preventDefault();
            // Erase the first character that may have slipped into the input before burst was confirmed
            if (target.value && target.value.endsWith(e.key)) {
              target.value = target.value.slice(0, -1);
            }
          }
        }

        // Fallback Auto-flush: If scanner has no suffix configured, auto-dispatch after 80ms silence
        if (autoFlushTimer) clearTimeout(autoFlushTimer);
        autoFlushTimer = setTimeout(() => {
          if (hardwareBuffer.length >= 4) {
            const finalBarcode = cleanBarcode(hardwareBuffer);
            hardwareBuffer = '';
            keyTimes = [];
            if (finalBarcode) {
              handleSuccessfulScan(finalBarcode, 'USB Scanner (Auto-flush)', 20);
            }
          }
        }, 85);
      }
    }, true); // Use capture phase for immediate hardware interception
  }

  function handleSuccessfulScan(barcode, source = 'USB Scanner', speed = 0) {
    console.log(`[${source}] Barcode Captured: "${barcode}" (${speed}ms/char)`);

    // Notify test mode if modal is open
    if (typeof testModeCallback === 'function') {
      testModeCallback({ barcode, source, speed });
    }

    // Play scanner beep
    if (window.App && window.App.playSound) {
      window.App.playSound('scan');
    }

    // Pulse visual status indicator
    flashScannerIndicator(barcode);

    // Forward to POS
    if (window.POS && typeof window.POS.handleBarcodeScanned === 'function') {
      window.POS.handleBarcodeScanned(barcode);
    }
  }

  function flashScannerIndicator(barcode) {
    const statusText = document.getElementById('scannerStatusText');
    const dot = document.querySelector('.indicator-dot');

    if (statusText) {
      statusText.innerHTML = `<strong>USB Scanner:</strong> Scanned "${barcode}"`;
      statusText.style.color = '#059669';
    }
    if (dot) {
      dot.style.background = '#10b981';
      dot.style.transform = 'scale(1.4)';
      setTimeout(() => {
        dot.style.transform = 'scale(1)';
        if (statusText) {
          statusText.innerHTML = 'USB Barcode Scanner Ready • Epson Thermal Mode';
          statusText.style.color = '';
        }
      }, 2500);
    }
  }

  // --- CAMERA SCANNER ---
  async function startCameraScanner(videoElem, feedbackElem, onSuccess) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (feedbackElem) feedbackElem.innerHTML = '<span class="text-danger">Camera API not supported in this browser.</span>';
      return;
    }

    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } }
      });
      videoElem.srcObject = videoStream;
      await videoElem.play();

      if (feedbackElem) feedbackElem.innerHTML = '<span class="text-muted">Camera active. Hold barcode in front of camera...</span>';

      let lastScannedTime = 0;

      cameraScanInterval = setInterval(async () => {
        if (!barcodeDetector || videoElem.readyState < 2) return;

        try {
          const barcodes = await barcodeDetector.detect(videoElem);
          if (barcodes.length > 0) {
            const rawVal = barcodes[0].rawValue;
            const now = Date.now();
            if (now - lastScannedTime > 2000) {
              lastScannedTime = now;
              const cleaned = cleanBarcode(rawVal);
              if (feedbackElem) {
                feedbackElem.innerHTML = `<span class="text-success">✅ Scanned: ${cleaned}</span>`;
              }
              handleSuccessfulScan(cleaned, 'Camera Scanner', 0);
              if (typeof onSuccess === 'function') onSuccess(cleaned);
            }
          }
        } catch (scanErr) {
          // ignore detector skip frames
        }
      }, 200);

    } catch (err) {
      console.error('Camera access error:', err);
      if (feedbackElem) feedbackElem.innerHTML = `<span class="text-danger">Camera error: ${err.message}. Please check permissions.</span>`;
    }
  }

  function stopCameraScanner(videoElem) {
    if (cameraScanInterval) {
      clearInterval(cameraScanInterval);
      cameraScanInterval = null;
    }
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      videoStream = null;
    }
    if (videoElem) {
      videoElem.srcObject = null;
    }
  }

  function setTestCallback(cb) {
    testModeCallback = cb;
  }

  window.ScannerEngine = {
    init: initHardwareScanner,
    startCamera: startCameraScanner,
    stopCamera: stopCameraScanner,
    simulateScan: (code) => handleSuccessfulScan(cleanBarcode(code), 'Manual Simulation', 0),
    setTestCallback
  };
})(window);
