// public/js/app.js - Main Application Orchestrator, Audio Engine, Shortcuts & History

(function(window) {
  'use strict';

  let currentTab = 'pos';
  let soundEnabled = true;
  let audioCtx = null;
  let storeSettings = {};

  // Initialize Web Audio Context
  function getAudioContext() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  // Synthesize Sound Effects using Web Audio API (Zero external mp3 files required)
  function playSound(type) {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      if (!ctx) return;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === 'scan') {
        // High crisp barcode scanner beep
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1600, now);
        osc.frequency.exponentialRampToValueAtTime(1800, now + 0.06);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.07);
        osc.start(now);
        osc.stop(now + 0.08);

      } else if (type === 'cash') {
        // Cash register chime
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.setValueAtTime(1046.5, now + 0.08); // C6
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.36);

      } else if (type === 'warning') {
        // Alert buzzer
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(350, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.22);

      } else if (type === 'error') {
        // Error buzz
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.setValueAtTime(160, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.26);
      }
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // DOM Content Loaded
  document.addEventListener('DOMContentLoaded', async () => {
    initClock();
    await loadSettings();
    await initNetworkInfo();
    initNavigation();
    initModals();
    initGlobalShortcuts();

    // Initialize submodules
    if (window.ScannerEngine) window.ScannerEngine.init();
    if (window.POS) {
      window.POS.init();
      window.POS.setSettings(storeSettings);
    }
    if (window.Inventory) window.Inventory.init();
    if (window.Reports) window.Reports.init();

    initHistoryTab();
    initSettingsTab();
  });

  // Network & Mobile Access Info
  let networkData = null;

  async function initNetworkInfo() {
    try {
      const res = await fetch('/api/network-info');
      const data = await res.json();
      if (data.success) {
        networkData = data;
        const headerIpElem = document.getElementById('headerNetworkIp');
        const netModalUrlElem = document.getElementById('netModalUrl');
        const qrContainer = document.getElementById('qrCodeContainer');

        if (headerIpElem) {
          headerIpElem.textContent = `Wi-Fi: ${data.primaryIp}:${data.port}`;
        }
        if (netModalUrlElem) {
          netModalUrlElem.textContent = data.networkUrl;
        }
        if (qrContainer && window.QRCodeGen) {
          qrContainer.innerHTML = window.QRCodeGen.render(data.networkUrl, 180);
        }
      }
    } catch (err) {
      console.warn('Network info error:', err);
    }
  }

  // Live Header Clock
  function initClock() {
    const clockElem = document.getElementById('headerClock');
    function update() {
      const now = new Date();
      if (clockElem) {
        clockElem.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
    }
    update();
    setInterval(update, 1000);
  }

  // Load Store Settings from backend
  async function loadSettings() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.success && data.settings) {
        storeSettings = data.settings;
        populateSettingsForm(storeSettings);
      }
    } catch (err) {
      console.error('Failed to load store settings:', err);
    }
  }

  function populateSettingsForm(s) {
    const fName = document.getElementById('setStoreName');
    const fTagline = document.getElementById('setStoreTagline');
    const fAddress = document.getElementById('setStoreAddress');
    const fPhone = document.getElementById('setStorePhone');
    const fEmail = document.getElementById('setStoreEmail');
    const fCurrency = document.getElementById('setCurrencySymbol');
    const fTax = document.getElementById('setTaxRate');
    const fFooter = document.getElementById('setReceiptFooter');
    const fEpsonWidth = document.getElementById('setEpsonWidth');
    const fAutoPrint = document.getElementById('setAutoPrint');

    if (fName && s.store_name) fName.value = s.store_name;
    if (fTagline && s.store_tagline) fTagline.value = s.store_tagline;
    if (fAddress && s.store_address) fAddress.value = s.store_address;
    if (fPhone && s.store_phone) fPhone.value = s.store_phone;
    if (fEmail && s.store_email) fEmail.value = s.store_email;
    if (fCurrency && s.currency_symbol) fCurrency.value = s.currency_symbol;
    if (fTax && s.tax_rate) fTax.value = s.tax_rate;
    if (fFooter && s.receipt_footer) fFooter.value = s.receipt_footer;
    if (fEpsonWidth && s.epson_paper_width) fEpsonWidth.value = s.epson_paper_width;
    if (fAutoPrint && s.auto_print_receipt !== undefined) fAutoPrint.value = String(s.auto_print_receipt);
  }

  // Navigation Tab Switching
  function initNavigation() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const targetTab = tab.getAttribute('data-tab');
        switchTab(targetTab);
      });
    });

    // Sound toggle
    const btnToggleSound = document.getElementById('btnToggleSound');
    const soundIcon = document.getElementById('soundIcon');
    if (btnToggleSound) {
      btnToggleSound.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        if (soundIcon) soundIcon.textContent = soundEnabled ? '🔊' : '🔇';
      });
    }

    // Expiry alerts drawer trigger
    const btnAlerts = document.getElementById('btnOpenExpiryAlerts');
    if (btnAlerts) {
      btnAlerts.addEventListener('click', openAlertsModal);
    }

    // Shortcuts modal trigger
    const btnShortcuts = document.getElementById('btnHelpShortcuts');
    if (btnShortcuts) {
      btnShortcuts.addEventListener('click', () => {
        const m = document.getElementById('shortcutsModal');
        if (m) m.style.display = 'flex';
      });
    }
  }

  function switchTab(tabName) {
    currentTab = tabName;
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
    });

    document.querySelectorAll('.tab-view').forEach(v => {
      v.classList.toggle('active', v.id === `view-${tabName}`);
    });

    // Trigger tab-specific refreshes
    if (tabName === 'pos') {
      const searchBox = document.getElementById('posSearchInput');
      if (searchBox) setTimeout(() => searchBox.focus(), 50);
    } else if (tabName === 'inventory') {
      if (window.Inventory && window.Inventory.loadProducts) window.Inventory.loadProducts();
    } else if (tabName === 'reports') {
      if (window.Reports) {
        window.Reports.loadSummary();
        window.Reports.loadChart('daily');
        window.Reports.loadTopProducts();
        window.Reports.loadCategorySales();
      }
    } else if (tabName === 'history') {
      loadHistory();
    }
  }

  // Global Keyboard Shortcuts
  function initGlobalShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Allow F-keys to switch tabs
      if (e.key === 'F1') {
        e.preventDefault();
        switchTab('pos');
      } else if (e.key === 'F2') {
        e.preventDefault();
        switchTab('inventory');
      } else if (e.key === 'F3') {
        e.preventDefault();
        switchTab('reports');
      } else if (e.key === 'F4') {
        e.preventDefault();
        switchTab('history');
      } else if (e.key === 'F5') {
        // Prevent accidental page reload if inside POS
        e.preventDefault();
        switchTab('settings');
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (window.POS && window.POS.holdCart) window.POS.holdCart();
      } else if (e.key === 'F9') {
        e.preventDefault();
        if (window.POS && window.POS.completeSale) window.POS.completeSale();
      } else if (e.key === 'Escape') {
        // Close any open modal
        closeAllModals();
      } else if (e.key === '/' && currentTab === 'pos') {
        const targetTag = e.target.tagName.toLowerCase();
        if (targetTag !== 'input' && targetTag !== 'textarea') {
          e.preventDefault();
          const searchBox = document.getElementById('posSearchInput');
          if (searchBox) searchBox.focus();
        }
      }
    });
  }

  // Modals management
  function initModals() {
    // Close modal when clicking on backdrop
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          closeAllModals();
        }
      });
    });

    // Close buttons
    document.querySelectorAll('.btn-close').forEach(btn => {
      btn.addEventListener('click', closeAllModals);
    });

    // Receipt Modal Close & Print buttons
    const btnCloseRec = document.getElementById('btnCloseReceiptModal');
    const btnCloseRec2 = document.getElementById('btnCloseReceiptModalBtn');
    const btnPrintRec = document.getElementById('btnPrintReceiptBtn');
    if (btnCloseRec) btnCloseRec.addEventListener('click', closeAllModals);
    if (btnCloseRec2) btnCloseRec2.addEventListener('click', closeAllModals);
    if (btnPrintRec) {
      btnPrintRec.addEventListener('click', () => {
        if (window.ReceiptPrinter) window.ReceiptPrinter.print();
      });
    }

    // Product Modal cancel button
    const btnCancelProd = document.getElementById('btnCancelProductModal');
    if (btnCancelProd) btnCancelProd.addEventListener('click', closeAllModals);

    // Restock Modal cancel button
    const btnCancelRestock = document.getElementById('btnCancelRestockModal');
    if (btnCancelRestock) btnCancelRestock.addEventListener('click', closeAllModals);

    // Barcode label print button
    const btnPrintLabel = document.getElementById('btnPrintBarcodeLabelBtn');
    const btnCancelLabel = document.getElementById('btnCancelBarcodeLabelModal');
    if (btnPrintLabel) btnPrintLabel.addEventListener('click', () => window.print());
    if (btnCancelLabel) btnCancelLabel.addEventListener('click', closeAllModals);

    // Shortcuts modal button
    const btnCloseShortcuts = document.getElementById('btnCloseShortcutsModalBtn');
    if (btnCloseShortcuts) btnCloseShortcuts.addEventListener('click', closeAllModals);

    // Alerts modal button
    const btnCloseAlerts = document.getElementById('btnCloseAlertsModalBtn');
    if (btnCloseAlerts) btnCloseAlerts.addEventListener('click', closeAllModals);

    // Held carts modal button
    const btnCloseHeld = document.getElementById('btnCloseHeldModalBtn');
    if (btnCloseHeld) btnCloseHeld.addEventListener('click', closeAllModals);

    // Camera Scanner trigger
    const btnOpenCam = document.getElementById('btnOpenCamScanner');
    const camModal = document.getElementById('cameraScannerModal');
    const btnCloseCam = document.getElementById('btnCloseCamModal');
    const btnStopCam = document.getElementById('btnStopCamScanner');
    const videoElem = document.getElementById('cameraVideo');
    const feedbackElem = document.getElementById('camScanResult');

    if (btnOpenCam) {
      btnOpenCam.addEventListener('click', () => {
        if (camModal) camModal.style.display = 'flex';
        if (window.ScannerEngine) {
          window.ScannerEngine.startCamera(videoElem, feedbackElem, (barcode) => {
            // Success scan
            setTimeout(() => {
              window.ScannerEngine.stopCamera(videoElem);
              if (camModal) camModal.style.display = 'none';
            }, 800);
          });
        }
      });
    }

    function stopAndCloseCam() {
      if (window.ScannerEngine) window.ScannerEngine.stopCamera(videoElem);
      if (camModal) camModal.style.display = 'none';
    }

    if (btnCloseCam) btnCloseCam.addEventListener('click', stopAndCloseCam);
    if (btnStopCam) btnStopCam.addEventListener('click', stopAndCloseCam);

    // Hardware Setup & Diagnostics Modal
    const btnTestHw = document.getElementById('btnTestHardware');
    const hwModal = document.getElementById('hardwareTestModal');
    const btnCloseHw = document.getElementById('btnCloseHardwareModal');
    const btnCloseHw2 = document.getElementById('btnCloseHardwareModalBtn');
    const btnRunEpsonTest = document.getElementById('btnRunEpsonPrintTest');
    const scannerTestInput = document.getElementById('scannerTestInput');
    const scannerTestResult = document.getElementById('scannerTestResult');

    function openHardwareModal() {
      if (hwModal) hwModal.style.display = 'flex';
      if (scannerTestInput) {
        scannerTestInput.value = '';
        setTimeout(() => scannerTestInput.focus(), 100);
      }
    }

    if (btnTestHw) btnTestHw.addEventListener('click', openHardwareModal);
    if (btnCloseHw) btnCloseHw.addEventListener('click', closeAllModals);
    if (btnCloseHw2) btnCloseHw2.addEventListener('click', closeAllModals);

    if (btnRunEpsonTest) {
      btnRunEpsonTest.addEventListener('click', () => {
        if (window.ReceiptPrinter) {
          window.ReceiptPrinter.printTestSlip(storeSettings);
        }
      });
    }

    // Connect USB Scanner Test Callback
    if (window.ScannerEngine && window.ScannerEngine.setTestCallback) {
      window.ScannerEngine.setTestCallback(async ({ barcode, source, speed }) => {
        if (!scannerTestResult) return;

        let productInfo = '<span class="text-muted">Looking up product...</span>';
        try {
          const res = await fetch(`/api/products/lookup/${encodeURIComponent(barcode)}`);
          const data = await res.json();
          if (data.success && data.product) {
            const p = data.product;
            productInfo = `
              <div style="margin-top: 6px; padding: 6px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 4px;">
                <strong>✅ Match Found:</strong> ${p.name} ($${p.selling_price.toFixed(2)})<br>
                <span>Stock: <strong>${p.stock} ${p.unit}</strong> | Expiry: <strong>${p.expiry_date}</strong></span>
              </div>
            `;
          } else {
            productInfo = `<div style="margin-top: 6px; color: #b45309;">⚠️ Barcode not found in inventory. You can add it anytime.</div>`;
          }
        } catch (e) {
          productInfo = '';
        }

        scannerTestResult.innerHTML = `
          <div style="color: #047857; font-weight: bold; font-size: 0.95rem;">
            🟢 USB Barcode Received!
          </div>
          <div style="margin-top: 4px;">
            <strong>Barcode / SKU:</strong> <code style="font-size: 1rem; background: #f1f5f9; padding: 2px 6px; border-radius: 3px;">${barcode}</code>
          </div>
          <div style="font-size: 0.75rem; color: #64748b; margin-top: 2px;">
            Transmission Speed: <strong>${speed > 0 ? speed + 'ms/char' : 'Instant Wedge'}</strong> (${source})
          </div>
          ${productInfo}
        `;

        if (scannerTestInput) scannerTestInput.value = barcode;
      });
    }

    // Network & Mobile Devices Modal
    const btnNetModal = document.getElementById('btnNetworkModal');
    const netModal = document.getElementById('networkModal');
    const btnCloseNet = document.getElementById('btnCloseNetworkModal');
    const btnCloseNet2 = document.getElementById('btnCloseNetworkModalBtn');
    const btnCopyNet = document.getElementById('btnCopyNetworkUrl');
    const copyMsg = document.getElementById('copySuccessMsg');

    if (btnNetModal) {
      btnNetModal.addEventListener('click', () => {
        if (netModal) netModal.style.display = 'flex';
      });
    }
    if (btnCloseNet) btnCloseNet.addEventListener('click', closeAllModals);
    if (btnCloseNet2) btnCloseNet2.addEventListener('click', closeAllModals);

    if (btnCopyNet) {
      btnCopyNet.addEventListener('click', () => {
        const urlToCopy = networkData?.networkUrl || window.location.href;
        navigator.clipboard.writeText(urlToCopy).then(() => {
          if (copyMsg) {
            copyMsg.style.display = 'block';
            setTimeout(() => { copyMsg.style.display = 'none'; }, 2000);
          }
        }).catch(() => {
          alert(`Network URL: ${urlToCopy}`);
        });
      });
    }
  }

  function closeAllModals() {
    document.querySelectorAll('.modal-backdrop').forEach(m => {
      m.style.display = 'none';
    });
    const videoElem = document.getElementById('cameraVideo');
    if (window.ScannerEngine && videoElem) {
      window.ScannerEngine.stopCamera(videoElem);
    }
  }

  // Open Expiry & Inventory Alerts Drawer
  async function openAlertsModal() {
    const modal = document.getElementById('expiryAlertsModal');
    const listExp = document.getElementById('alertsExpiredList');
    const listSoon = document.getElementById('alertsExpiringList');
    const listLow = document.getElementById('alertsLowStockList');

    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (!data.success) return;

      const prods = data.products || [];
      const expired = prods.filter(p => p.expiry_status === 'expired');
      const expiringSoon = prods.filter(p => p.expiry_status === 'expiring_soon');
      const lowStock = prods.filter(p => p.is_low_stock);

      if (listExp) {
        listExp.innerHTML = expired.length === 0
          ? '<div class="text-muted" style="font-size:0.8rem;">No expired products. Everything is fresh!</div>'
          : expired.map(p => `
            <div class="alert-item alert-expired">
              <div>
                <strong>${p.name}</strong> (#${p.barcode})
                <div class="text-danger" style="font-size:0.75rem;">Expired on ${p.expiry_date} (${Math.abs(p.days_to_expiry)} days ago) • Stock: ${p.stock} ${p.unit}</div>
              </div>
              <button class="btn btn-xs btn-danger-outline" onclick="window.Inventory.openRestockModal(${p.id})">Restock / Update</button>
            </div>
          `).join('');
      }

      if (listSoon) {
        listSoon.innerHTML = expiringSoon.length === 0
          ? '<div class="text-muted" style="font-size:0.8rem;">No items expiring in the next 7 days.</div>'
          : expiringSoon.map(p => `
            <div class="alert-item alert-expiring">
              <div>
                <strong>${p.name}</strong> (#${p.barcode})
                <div class="text-warning" style="font-size:0.75rem;">Expires on ${p.expiry_date} (in ${p.days_to_expiry} days) • Stock: ${p.stock} ${p.unit}</div>
              </div>
              <button class="btn btn-xs btn-outline" onclick="window.Inventory.openRestockModal(${p.id})">Inspect</button>
            </div>
          `).join('');
      }

      if (listLow) {
        listLow.innerHTML = lowStock.length === 0
          ? '<div class="text-muted" style="font-size:0.8rem;">Stock levels are healthy across all products.</div>'
          : lowStock.map(p => `
            <div class="alert-item alert-lowstock">
              <div>
                <strong>${p.name}</strong> (#${p.barcode})
                <div class="text-amber" style="font-size:0.75rem;">Stock remaining: <strong>${p.stock} ${p.unit}</strong> (Min alert: ${p.low_stock_threshold})</div>
              </div>
              <button class="btn btn-xs btn-success" onclick="window.Inventory.openRestockModal(${p.id})">+ Restock</button>
            </div>
          `).join('');
      }

      modal.style.display = 'flex';
    } catch (err) {
      console.error('Failed to load alerts:', err);
    }
  }

  // --- SALES HISTORY TAB ---
  let historyOrders = [];

  function initHistoryTab() {
    const searchInput = document.getElementById('historySearchInput');
    const btnRefresh = document.getElementById('btnRefreshHistory');

    if (searchInput) {
      searchInput.addEventListener('input', () => renderHistoryTable());
    }
    if (btnRefresh) {
      btnRefresh.addEventListener('click', loadHistory);
    }
  }

  async function loadHistory() {
    try {
      const res = await fetch('/api/orders?limit=100');
      const data = await res.json();
      if (data.success) {
        historyOrders = data.orders || [];
        renderHistoryTable();
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }

  function renderHistoryTable() {
    const tbody = document.getElementById('historyTableBody');
    const empty = document.getElementById('historyEmptyMessage');
    const searchInput = document.getElementById('historySearchInput');
    const term = searchInput ? searchInput.value.toLowerCase().trim() : '';

    if (!tbody) return;

    const filtered = historyOrders.filter(o => {
      if (!term) return true;
      return o.receipt_no.toLowerCase().includes(term) ||
             (o.customer_name && o.customer_name.toLowerCase().includes(term)) ||
             (o.payment_method && o.payment_method.toLowerCase().includes(term));
    });

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }

    if (empty) empty.style.display = 'none';

    tbody.innerHTML = filtered.map(order => `
      <tr>
        <td><strong>${order.receipt_no}</strong></td>
        <td>${order.created_at}</td>
        <td>${order.customer_name || 'Walk-in'}</td>
        <td><span class="badge badge-info">${order.payment_method}</span></td>
        <td style="text-align: right;">${Math.round(order.subtotal).toLocaleString()} RWF</td>
        <td style="text-align: right;">${Math.round(order.tax).toLocaleString()} RWF</td>
        <td style="text-align: right; font-weight: bold; color: #047857;">${Math.round(order.total).toLocaleString()} RWF</td>
        <td>${order.cashier_name}</td>
        <td style="text-align: center;">
          <button class="btn btn-xs btn-outline" onclick="window.App.reprintReceipt(${order.id})">🧾 Reprint Receipt</button>
        </td>
      </tr>
    `).join('');
  }

  async function reprintReceipt(orderId) {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      const data = await res.json();
      if (data.success && data.order) {
        if (window.ReceiptPrinter) {
          window.ReceiptPrinter.preview(data.order, storeSettings);
        }
      }
    } catch (err) {
      console.error('Failed to reprint receipt:', err);
    }
  }

  // --- SETTINGS TAB ---
  function initSettingsTab() {
    const form = document.getElementById('settingsForm');
    const btnPrintEpson = document.getElementById('btnPrintEpsonTest');
    const btnOpenScan = document.getElementById('btnOpenScannerTest');

    if (btnPrintEpson) {
      btnPrintEpson.addEventListener('click', () => {
        if (window.ReceiptPrinter) {
          window.ReceiptPrinter.printTestSlip(storeSettings);
        }
      });
    }

    if (btnOpenScan) {
      btnOpenScan.addEventListener('click', () => {
        const hwModal = document.getElementById('hardwareTestModal');
        if (hwModal) hwModal.style.display = 'flex';
        const testInput = document.getElementById('scannerTestInput');
        if (testInput) setTimeout(() => testInput.focus(), 100);
      });
    }

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const payload = {
          store_name: document.getElementById('setStoreName').value.trim(),
          store_tagline: document.getElementById('setStoreTagline').value.trim(),
          store_address: document.getElementById('setStoreAddress').value.trim(),
          store_phone: document.getElementById('setStorePhone').value.trim(),
          store_email: document.getElementById('setStoreEmail').value.trim(),
          currency_symbol: document.getElementById('setCurrencySymbol').value.trim() || 'RWF',
          tax_rate: document.getElementById('setTaxRate').value.trim() || '18.0',
          epson_paper_width: document.getElementById('setEpsonWidth')?.value || '80mm',
          auto_print_receipt: document.getElementById('setAutoPrint')?.value || 'true',
          receipt_footer: document.getElementById('setReceiptFooter').value.trim()
        };

        try {
          const res = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          const data = await res.json();
          if (data.success) {
            storeSettings = payload;
            if (window.POS) window.POS.setSettings(storeSettings);
            alert('✅ Settings saved successfully!');
          }
        } catch (err) {
          console.error('Failed to save settings:', err);
          alert('Error saving settings.');
        }
      });
    }
  }

  window.App = {
    switchTab,
    playSound,
    reprintReceipt
  };
})(window);
