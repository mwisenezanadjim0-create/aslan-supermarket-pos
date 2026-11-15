// public/js/receipt.js - Epson Thermal Receipt Formatter & Printer Engine
// Tailored for Epson TM-T88, TM-T20, TM-m30, TM-T70 and compatible ESC/POS thermal printers

(function(window) {
  'use strict';

  function formatCurrency(num, symbol = 'RWF') {
    const val = Math.round(parseFloat(num || 0));
    return `${val.toLocaleString()} ${symbol}`;
  }

  function formatDateTime(dtStr) {
    if (!dtStr) return new Date().toLocaleString();
    const d = new Date(dtStr);
    return isNaN(d.getTime()) ? dtStr : d.toLocaleString();
  }

  function generateReceiptHTML(order, settings = {}) {
    const storeName = settings.store_name || 'ASLAN SUPERMARKET';
    const storeTagline = settings.store_tagline || 'Freshness & Quality Daily';
    const storeAddress = settings.store_address || '124 Main Boulevard, Downtown';
    const storePhone = settings.store_phone || '+1 (555) 234-5678';
    const currency = settings.currency_symbol || 'RWF';
    const footerText = settings.receipt_footer || 'Murakoze guhahira muri Aslan Supermarket!\nThank you for shopping at Aslan Supermarket!\nHave a wonderful day!';
    const paperWidth = settings.epson_paper_width || '80mm';

    const items = order.items || [];
    let itemsRows = '';

    for (const item of items) {
      const itemTotal = (item.quantity * item.unit_price).toFixed(2);
      itemsRows += `
        <tr>
          <td style="padding: 3px 0; vertical-align: top;">
            <div style="font-weight: 800; font-size: 13px; color: #000;">${item.product_name}</div>
            <div style="font-size: 11px; color: #111;">${item.quantity} x ${formatCurrency(item.unit_price, currency)}</div>
          </td>
          <td style="text-align: right; vertical-align: top; font-weight: 800; font-size: 13px; padding: 3px 0; color: #000;">
            ${formatCurrency(itemTotal, currency)}
          </td>
        </tr>
      `;
    }

    const discountRow = order.discount > 0 ? `
      <div class="receipt-row-summary">
        <span>DISCOUNT:</span>
        <span>-${formatCurrency(order.discount, currency)}</span>
      </div>
    ` : '';

    const taxRow = order.tax > 0 ? `
      <div class="receipt-row-summary">
        <span>TAX (${settings.tax_rate || 5}%):</span>
        <span>${formatCurrency(order.tax, currency)}</span>
      </div>
    ` : '';

    // High contrast barcode for Epson thermal heads
    const barcodeSvg = window.BarcodeGen ? window.BarcodeGen.generateSVG(order.receipt_no, {
      height: 38,
      barWidth: 1.8,
      showText: false
    }) : '';

    return `
      <div class="thermal-receipt-paper epson-receipt" style="${paperWidth === '58mm' ? 'width: 48mm !important;' : 'width: 72mm !important;'}">
        <div class="receipt-center">
          <div class="receipt-store-title">${storeName.toUpperCase()}</div>
          <div class="receipt-tagline">${storeTagline}</div>
          <div class="receipt-info-line">${storeAddress}</div>
          <div class="receipt-info-line">TEL: ${storePhone}</div>
        </div>

        <div class="receipt-divider"></div>

        <div style="font-size: 11px; line-height: 1.3;">
          <div style="display: flex; justify-content: space-between;">
            <span><strong>RECEIPT:</strong> ${order.receipt_no}</span>
          </div>
          <div><strong>DATE:</strong> ${formatDateTime(order.created_at)}</div>
          <div style="display: flex; justify-content: space-between;">
            <span><strong>CASHIER:</strong> ${order.cashier_name || 'Cashier 1'}</span>
            <span><strong>CUST:</strong> ${order.customer_name || 'Walk-in'}</span>
          </div>
        </div>

        <div class="receipt-divider"></div>

        <table class="receipt-table">
          <thead>
            <tr>
              <th style="font-size: 11px; text-transform: uppercase;">ITEM & QTY</th>
              <th style="text-align: right; font-size: 11px; text-transform: uppercase;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <div class="receipt-divider"></div>

        <div class="receipt-row-summary">
          <span>SUBTOTAL:</span>
          <span>${formatCurrency(order.subtotal, currency)}</span>
        </div>
        ${discountRow}
        ${taxRow}

        <div class="receipt-double-divider"></div>

        <div class="receipt-row-summary receipt-grand-total">
          <span>TOTAL DUE:</span>
          <span>${formatCurrency(order.total, currency)}</span>
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-row-summary">
          <span>PAID [${(order.payment_method || 'CASH').toUpperCase()}]:</span>
          <span>${formatCurrency(order.amount_paid, currency)}</span>
        </div>
        <div class="receipt-row-summary" style="font-weight: bold;">
          <span>CHANGE DUE:</span>
          <span>${formatCurrency(order.change_due, currency)}</span>
        </div>

        <div class="receipt-divider"></div>

        <div class="receipt-barcode-box">
          ${barcodeSvg}
          <div style="font-size: 10px; font-weight: bold; letter-spacing: 2px; margin-top: 3px;">* ${order.receipt_no} *</div>
        </div>

        <div class="receipt-center receipt-footer-text">
          ${footerText}
        </div>

        <!-- Epson Auto-Cutter Margin Feed: ensures text/barcode is past the cutter blade -->
        <div class="epson-cutter-feed"></div>
      </div>
    `;
  }

  function previewReceipt(order, settings, autoPrint = false) {
    const html = generateReceiptHTML(order, settings);
    const container = document.getElementById('receiptContainer');
    const printContainer = document.getElementById('printOnlyReceipt');

    if (container) container.innerHTML = html;
    if (printContainer) printContainer.innerHTML = html;

    const modal = document.getElementById('receiptModal');
    if (modal) modal.style.display = 'flex';

    // If auto-print enabled, automatically trigger printer
    if (autoPrint) {
      setTimeout(() => {
        window.print();
      }, 300);
    }
  }

  function printCurrentReceipt() {
    window.print();
  }

  // Generate an Epson alignment test slip
  function printEpsonTestSlip(settings = {}) {
    const testOrder = {
      receipt_no: `EPSON-TEST-${new Date().getFullYear()}`,
      created_at: new Date().toISOString(),
      cashier_name: 'Admin',
      customer_name: 'Epson TM Printer Test',
      subtotal: 10.00,
      discount: 1.00,
      tax: 0.45,
      total: 9.45,
      payment_method: 'Cash',
      amount_paid: 10.00,
      change_due: 0.55,
      items: [
        { product_name: 'Epson TM Thermal Test Item 1', quantity: 1, unit_price: 6.00 },
        { product_name: 'Epson Auto-Cutter Test Item 2', quantity: 2, unit_price: 2.00 }
      ]
    };

    const html = generateReceiptHTML(testOrder, settings);
    const container = document.getElementById('receiptContainer');
    const printContainer = document.getElementById('printOnlyReceipt');

    if (container) container.innerHTML = html;
    if (printContainer) printContainer.innerHTML = html;

    const modal = document.getElementById('receiptModal');
    if (modal) modal.style.display = 'flex';

    setTimeout(() => {
      window.print();
    }, 200);
  }

  window.ReceiptPrinter = {
    generateHTML: generateReceiptHTML,
    preview: previewReceipt,
    print: printCurrentReceipt,
    printTestSlip: printEpsonTestSlip
  };
})(window);
