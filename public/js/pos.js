// public/js/pos.js - Cashier Register, Barcode Scanner Handler, Cart & Checkout Engine

(function(window) {
  'use strict';

  let products = [];
  let currentCategory = 'All';
  let cart = []; // [{ id, barcode, name, category, cost_price, selling_price, stock, unit, expiry_date, quantity, days_to_expiry, expiry_status }]
  let heldCarts = [];
  let storeSettings = {};

  function formatMoney(amount) {
    const cur = storeSettings.currency_symbol || 'RWF';
    const num = Math.round(Number(amount) || 0);
    return `${num.toLocaleString()} ${cur}`;
  }

  // DOM Elements
  let searchInput, productsGrid, noProductsMsg, categoryPills;
  let cartTableBody, cartEmptyState, cartItemCount;
  let cartSubtotalElem, cartDiscountInput, cartDiscountType, cartDiscountValElem;
  let cartTaxRateDisplay, cartTaxValElem, cartGrandTotalElem;
  let cashTenderInput, changeDueDisplay, btnCompleteSale;
  let activePaymentMethod = 'Cash';

  function init() {
    // Cache DOM
    searchInput = document.getElementById('posSearchInput');
    productsGrid = document.getElementById('posProductsGrid');
    noProductsMsg = document.getElementById('posNoProducts');
    categoryPills = document.getElementById('posCategoryPills');

    cartTableBody = document.getElementById('cartTableBody');
    cartEmptyState = document.getElementById('cartEmptyState');
    cartItemCount = document.getElementById('cartItemCount');

    cartSubtotalElem = document.getElementById('cartSubtotal');
    cartDiscountInput = document.getElementById('cartDiscountInput');
    cartDiscountType = document.getElementById('cartDiscountType');
    cartDiscountValElem = document.getElementById('cartDiscountVal');
    cartTaxRateDisplay = document.getElementById('cartTaxRateDisplay');
    cartTaxValElem = document.getElementById('cartTaxVal');
    cartGrandTotalElem = document.getElementById('cartGrandTotal');

    cashTenderInput = document.getElementById('cashTenderInput');
    changeDueDisplay = document.getElementById('changeDueDisplay');
    btnCompleteSale = document.getElementById('btnCompleteSale');

    // Attach Event Listeners
    setupEventListeners();

    // Load initial data
    loadProducts();
  }

  function setSettings(settings) {
    storeSettings = settings || {};
    const taxRate = parseFloat(storeSettings.tax_rate) || 5.0;
    if (cartTaxRateDisplay) cartTaxRateDisplay.textContent = `${taxRate}%`;
    calculateTotals();
  }

  function setupEventListeners() {
    // Search input typing
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        renderProducts();
      });
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const query = searchInput.value.trim();
          if (query) {
            handleBarcodeScanned(query);
            searchInput.value = '';
          }
        }
      });
    }

    // Discount changes
    if (cartDiscountInput) cartDiscountInput.addEventListener('input', calculateTotals);
    if (cartDiscountType) cartDiscountType.addEventListener('change', calculateTotals);

    // Cash tender input
    if (cashTenderInput) {
      cashTenderInput.addEventListener('input', updateChangeDue);
    }

    // Quick cash buttons
    document.querySelectorAll('.btn-cash').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-cash');
        const grandTotal = getGrandTotal();
        if (type === 'exact') {
          cashTenderInput.value = Math.round(grandTotal);
        } else {
          cashTenderInput.value = parseInt(type, 10);
        }
        updateChangeDue();
      });
    });

    // Payment method tabs
    document.querySelectorAll('.pm-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.pm-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activePaymentMethod = tab.getAttribute('data-method');
        const cashBox = document.getElementById('cashTenderControls');
        if (activePaymentMethod === 'Cash') {
          if (cashBox) cashBox.style.display = 'block';
        } else {
          if (cashBox) cashBox.style.display = 'none';
          cashTenderInput.value = getGrandTotal().toFixed(2);
          updateChangeDue();
        }
      });
    });

    // Complete Sale button
    if (btnCompleteSale) {
      btnCompleteSale.addEventListener('click', completeSale);
    }

    // Clear cart button
    const btnClearCart = document.getElementById('btnClearCart');
    if (btnClearCart) {
      btnClearCart.addEventListener('click', () => {
        if (cart.length > 0 && confirm('Are you sure you want to clear the active cart?')) {
          clearCart();
        }
      });
    }

    // Hold & Recall Cart buttons
    const btnHoldCart = document.getElementById('btnHoldCart');
    if (btnHoldCart) btnHoldCart.addEventListener('click', holdCurrentCart);

    const btnRecallCart = document.getElementById('btnRecallCart');
    if (btnRecallCart) btnRecallCart.addEventListener('click', openRecallModal);
  }

  // Fetch products from server
  async function loadProducts() {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (data.success) {
        products = data.products || [];
        renderCategoryPills();
        renderProducts();
      }
    } catch (err) {
      console.error('Failed to load products:', err);
    }
  }

  // Render Category filter pills
  function renderCategoryPills() {
    if (!categoryPills) return;
    const categories = ['All', ...new Set(products.map(p => p.category).filter(Boolean))];
    categoryPills.innerHTML = categories.map(cat => `
      <button class="cat-pill ${cat === currentCategory ? 'active' : ''}" data-category="${cat}">
        ${cat}
      </button>
    `).join('');

    categoryPills.querySelectorAll('.cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        currentCategory = btn.getAttribute('data-category');
        categoryPills.querySelectorAll('.cat-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderProducts();
      });
    });
  }

  // Render products grid with Stock & Expiry indicators
  function renderProducts() {
    if (!productsGrid) return;

    const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const filtered = products.filter(p => {
      const matchesCat = currentCategory === 'All' || p.category === currentCategory;
      const matchesSearch = !searchTerm ||
        p.name.toLowerCase().includes(searchTerm) ||
        p.barcode.toLowerCase().includes(searchTerm) ||
        (p.supplier && p.supplier.toLowerCase().includes(searchTerm));
      return matchesCat && matchesSearch;
    });

    if (filtered.length === 0) {
      productsGrid.innerHTML = '';
      if (noProductsMsg) noProductsMsg.style.display = 'block';
      return;
    }

    if (noProductsMsg) noProductsMsg.style.display = 'none';

    productsGrid.innerHTML = filtered.map(prod => {
      // Stock status badge
      let stockBadgeClass = 'badge-stock-ok';
      let stockBadgeText = `🟢 ${prod.stock} in stock`;
      if (prod.stock <= 0) {
        stockBadgeClass = 'badge-stock-out';
        stockBadgeText = `🔴 Out of stock`;
      } else if (prod.stock <= prod.low_stock_threshold) {
        stockBadgeClass = 'badge-stock-low';
        stockBadgeText = `⚠️ Low stock: ${prod.stock} left`;
      }

      // Expiry status badge
      let expiryBadgeClass = 'badge-expiry-fresh';
      let expiryBadgeText = `Exp: ${prod.expiry_date}`;
      if (prod.expiry_status === 'expired') {
        expiryBadgeClass = 'badge-expiry-expired';
        expiryBadgeText = `🔴 EXPIRED (${Math.abs(prod.days_to_expiry)}d ago)`;
      } else if (prod.expiry_status === 'expiring_soon') {
        expiryBadgeClass = 'badge-expiry-soon';
        expiryBadgeText = `🟠 Expires in ${prod.days_to_expiry}d`;
      }

      const cardClasses = [
        'pos-product-card',
        prod.stock <= 0 ? 'out-of-stock' : '',
        prod.expiry_status === 'expired' ? 'is-expired' : ''
      ].filter(Boolean).join(' ');

      return `
        <div class="${cardClasses}" data-id="${prod.id}">
          <div>
            <div class="prod-card-top">
              <span class="prod-category-tag">${prod.category}</span>
              <span class="prod-barcode-tag">#${prod.barcode}</span>
            </div>
            <div class="prod-name" title="${prod.name}">${prod.name}</div>
            <div class="prod-card-meta">
              <span class="meta-badge ${stockBadgeClass}">${stockBadgeText}</span>
              <span class="meta-badge ${expiryBadgeClass}">${expiryBadgeText}</span>
            </div>
          </div>
          <div class="prod-card-bottom">
            <div>
              <span class="prod-price">${formatMoney(prod.selling_price)}</span>
              <span class="prod-unit">/${prod.unit}</span>
            </div>
            <button class="btn-add-card" title="Add to cart" ${prod.stock <= 0 ? 'disabled' : ''}>+</button>
          </div>
        </div>
      `;
    }).join('');

    // Attach click listeners to cards
    productsGrid.querySelectorAll('.pos-product-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = parseInt(card.getAttribute('data-id'), 10);
        const prod = products.find(p => p.id === id);
        if (prod) {
          addProductToCart(prod);
        }
      });
    });
  }

  // Handle scanned barcode (from hardware scanner, camera, or search input)
  async function handleBarcodeScanned(barcode) {
    const code = barcode.trim();
    if (!code) return;

    // First check local products cache
    let prod = products.find(p => p.barcode === code || p.barcode.endsWith(code));

    // If not in local list, lookup from backend API
    if (!prod) {
      try {
        const res = await fetch(`/api/products/lookup/${encodeURIComponent(code)}`);
        const data = await res.json();
        if (data.success && data.product) {
          prod = data.product;
          // Add to local cache if missing
          if (!products.some(p => p.id === prod.id)) {
            products.push(prod);
            renderProducts();
          }
        }
      } catch (err) {
        console.error('Barcode lookup failed:', err);
      }
    }

    if (prod) {
      addProductToCart(prod);
      // Refocus search box for next scan
      if (searchInput) searchInput.focus();
    } else {
      if (window.App && window.App.playSound) window.App.playSound('error');
      const addNow = confirm(`⚠️ Product with barcode "${code}" is not in the system.\nWould you like to add this product now?`);
      if (addNow) {
        if (window.Inventory && window.Inventory.openAddModalWithBarcode) {
          window.Inventory.openAddModalWithBarcode(code);
        }
      }
    }
  }

  // Add product to cart with validation for Out-of-Stock and Expired items
  function addProductToCart(prod) {
    // 1. Check out of stock
    if (prod.stock <= 0) {
      if (window.App && window.App.playSound) window.App.playSound('error');
      alert(`⚠️ Cannot add "${prod.name}": Out of Stock (0 remaining)!`);
      return;
    }

    // 2. Check if product is expired -> warn cashier!
    if (prod.expiry_status === 'expired') {
      if (window.App && window.App.playSound) window.App.playSound('warning');
      const proceed = confirm(`⚠️ WARNING: "${prod.name}" EXPIRED on ${prod.expiry_date} (${Math.abs(prod.days_to_expiry)} days ago)!\n\nDo you still wish to add it to the cart?`);
      if (!proceed) return;
    } else if (prod.expiry_status === 'expiring_soon') {
      // Gentle notification for soon expiring
      console.warn(`Notice: ${prod.name} expires in ${prod.days_to_expiry} days.`);
    }

    // 3. Find if already in cart
    const existing = cart.find(item => item.id === prod.id);
    if (existing) {
      if (existing.quantity + 1 > prod.stock) {
        if (window.App && window.App.playSound) window.App.playSound('error');
        alert(`⚠️ Cannot add more: Only ${prod.stock} units available in stock!`);
        return;
      }
      existing.quantity += 1;
    } else {
      cart.push({
        id: prod.id,
        barcode: prod.barcode,
        name: prod.name,
        category: prod.category,
        cost_price: prod.cost_price,
        selling_price: prod.selling_price,
        stock: prod.stock,
        unit: prod.unit,
        expiry_date: prod.expiry_date,
        days_to_expiry: prod.days_to_expiry,
        expiry_status: prod.expiry_status,
        quantity: 1
      });
    }

    if (window.App && window.App.playSound) window.App.playSound('scan');
    renderCart();
  }

  // Update quantity in cart
  function updateCartQuantity(index, delta) {
    const item = cart[index];
    if (!item) return;

    const newQty = item.quantity + delta;
    if (newQty <= 0) {
      cart.splice(index, 1);
    } else {
      if (newQty > item.stock) {
        alert(`⚠️ Only ${item.stock} units available in stock!`);
        return;
      }
      item.quantity = newQty;
    }
    renderCart();
  }

  function setCartQuantity(index, qty) {
    const item = cart[index];
    if (!item) return;
    const parsed = parseInt(qty, 10);
    if (isNaN(parsed) || parsed <= 0) {
      cart.splice(index, 1);
    } else if (parsed > item.stock) {
      alert(`⚠️ Only ${item.stock} units available in stock!`);
      item.quantity = item.stock;
    } else {
      item.quantity = parsed;
    }
    renderCart();
  }

  function removeFromCart(index) {
    cart.splice(index, 1);
    renderCart();
  }

  function clearCart() {
    cart = [];
    if (cashTenderInput) cashTenderInput.value = '';
    renderCart();
  }

  // Render active cart items
  function renderCart() {
    if (!cartTableBody) return;

    if (cart.length === 0) {
      cartTableBody.innerHTML = '';
      if (cartEmptyState) cartEmptyState.style.display = 'block';
      if (cartItemCount) cartItemCount.textContent = '0 items';
      calculateTotals();
      return;
    }

    if (cartEmptyState) cartEmptyState.style.display = 'none';

    const totalUnits = cart.reduce((sum, item) => sum + item.quantity, 0);
    if (cartItemCount) cartItemCount.textContent = `${totalUnits} items`;

    cartTableBody.innerHTML = cart.map((item, idx) => {
      const rowTotal = (item.quantity * item.selling_price).toFixed(2);

      let expiryNote = '';
      if (item.expiry_status === 'expired') {
        expiryNote = `<span class="badge badge-danger">Expired (${item.expiry_date})</span>`;
      } else if (item.expiry_status === 'expiring_soon') {
        expiryNote = `<span class="badge badge-warning">Exp: in ${item.days_to_expiry}d</span>`;
      }

      return `
        <tr>
          <td>
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-meta">
              <span>Stock left: <strong>${item.stock - item.quantity}</strong></span>
              ${expiryNote}
            </div>
          </td>
          <td>
            <div class="qty-control">
              <button class="qty-btn" onclick="window.POS.updateQty(${idx}, -1)">-</button>
              <input type="number" class="qty-input" value="${item.quantity}" min="1" max="${item.stock}"
                     onchange="window.POS.setQty(${idx}, this.value)">
              <button class="qty-btn" onclick="window.POS.updateQty(${idx}, 1)">+</button>
            </div>
          </td>
          <td style="text-align: right; font-weight: 600;">${formatMoney(item.selling_price)}</td>
          <td style="text-align: right; font-weight: 800; color: #064e3b;">${formatMoney(rowTotal)}</td>
          <td style="text-align: center;">
            <button class="btn-remove-item" onclick="window.POS.removeItem(${idx})" title="Remove item">&times;</button>
          </td>
        </tr>
      `;
    }).join('');

    calculateTotals();
  }

  // Calculate Subtotal, Discount, Tax, Grand Total
  function calculateTotals() {
    let subtotal = 0;
    for (const item of cart) {
      subtotal += item.selling_price * item.quantity;
    }

    // Discount
    let discount = 0;
    const discVal = parseFloat(cartDiscountInput ? cartDiscountInput.value : 0) || 0;
    const discType = cartDiscountType ? cartDiscountType.value : 'amount';

    if (discType === 'percent') {
      discount = (subtotal * discVal) / 100;
    } else {
      discount = discVal;
    }
    discount = Math.min(subtotal, Math.max(0, discount));

    const taxableAmount = Math.max(0, subtotal - discount);
    const taxRate = parseFloat(storeSettings.tax_rate) || 18.0;
    const tax = (taxableAmount * taxRate) / 100;
    const grandTotal = taxableAmount + tax;

    if (cartSubtotalElem) cartSubtotalElem.textContent = formatMoney(subtotal);
    if (cartDiscountValElem) cartDiscountValElem.textContent = '-' + formatMoney(discount);
    if (cartTaxValElem) cartTaxValElem.textContent = formatMoney(tax);
    if (cartGrandTotalElem) cartGrandTotalElem.textContent = formatMoney(grandTotal);

    updateChangeDue();
  }

  function getGrandTotal() {
    let subtotal = 0;
    for (const item of cart) {
      subtotal += item.selling_price * item.quantity;
    }
    let discount = 0;
    const discVal = parseFloat(cartDiscountInput ? cartDiscountInput.value : 0) || 0;
    const discType = cartDiscountType ? cartDiscountType.value : 'amount';
    if (discType === 'percent') discount = (subtotal * discVal) / 100;
    else discount = discVal;
    discount = Math.min(subtotal, Math.max(0, discount));

    const taxable = Math.max(0, subtotal - discount);
    const taxRate = parseFloat(storeSettings.tax_rate) || 18.0;
    const tax = (taxable * taxRate) / 100;
    return taxable + tax;
  }

  // Calculate live change due for cash payments
  function updateChangeDue() {
    if (!changeDueDisplay) return;

    const grandTotal = getGrandTotal();
    const tendered = parseFloat(cashTenderInput ? cashTenderInput.value : 0) || 0;

    if (activePaymentMethod !== 'Cash') {
      changeDueDisplay.textContent = '0 ' + (storeSettings.currency_symbol || 'RWF');
      changeDueDisplay.classList.remove('short');
      return;
    }

    const change = tendered - grandTotal;
    if (change < 0 && tendered > 0) {
      changeDueDisplay.textContent = `Short ${formatMoney(Math.abs(change))}`;
      changeDueDisplay.classList.add('short');
    } else {
      changeDueDisplay.textContent = formatMoney(Math.max(0, change));
      changeDueDisplay.classList.remove('short');
    }
  }

  // Complete checkout sale and trigger thermal receipt
  async function completeSale() {
    if (cart.length === 0) {
      alert('🛒 Cart is empty! Add products first.');
      return;
    }

    const grandTotal = getGrandTotal();
    let amountPaid = parseFloat(cashTenderInput ? cashTenderInput.value : 0) || 0;

    if (activePaymentMethod === 'Cash') {
      if (amountPaid < grandTotal) {
        const proceed = confirm(`⚠️ Amount tendered (${formatMoney(amountPaid)}) is less than total due (${formatMoney(grandTotal)}).\nSet amount paid to exact total (${formatMoney(grandTotal)})?`);
        if (proceed) {
          amountPaid = grandTotal;
          if (cashTenderInput) cashTenderInput.value = Math.round(grandTotal);
        } else {
          return;
        }
      }
    } else {
      amountPaid = grandTotal;
    }

    // Calculate discount and tax
    let subtotal = 0;
    for (const item of cart) subtotal += item.selling_price * item.quantity;
    let discount = 0;
    const discVal = parseFloat(cartDiscountInput ? cartDiscountInput.value : 0) || 0;
    const discType = cartDiscountType ? cartDiscountType.value : 'amount';
    if (discType === 'percent') discount = (subtotal * discVal) / 100;
    else discount = discVal;
    discount = Math.min(subtotal, Math.max(0, discount));

    const taxRate = parseFloat(storeSettings.tax_rate) || 5.0;
    const tax = ((subtotal - discount) * taxRate) / 100;

    const customerInput = document.getElementById('cartCustomerName');
    const customerName = customerInput ? customerInput.value.trim() : 'Walk-in Customer';

    const orderPayload = {
      items: cart.map(item => ({
        id: item.id,
        barcode: item.barcode,
        name: item.name,
        category: item.category,
        cost_price: item.cost_price,
        selling_price: item.selling_price,
        quantity: item.quantity
      })),
      discount,
      tax,
      payment_method: activePaymentMethod,
      amount_paid: amountPaid,
      customer_name: customerName,
      cashier_name: 'Cashier 1'
    };

    try {
      btnCompleteSale.disabled = true;
      btnCompleteSale.textContent = 'Processing...';

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderPayload)
      });

      const data = await res.json();
      if (!data.success) {
        alert(`❌ Checkout Failed: ${data.message}`);
        btnCompleteSale.disabled = false;
        btnCompleteSale.innerHTML = '<span class="btn-icon">✅</span><span>COMPLETE SALE & PRINT (F9)</span>';
        return;
      }

      // Play register bell sound
      if (window.App && window.App.playSound) window.App.playSound('cash');

      // Clear cart
      clearCart();
      if (customerInput) customerInput.value = 'Walk-in Customer';

      // Reload products to refresh stock counts
      loadProducts();
      if (window.Inventory && window.Inventory.loadProducts) {
        window.Inventory.loadProducts();
      }
      if (window.Reports && window.Reports.loadSummary) {
        window.Reports.loadSummary();
      }

      // Preview & Auto-Print Receipt to Epson Printer
      const shouldAutoPrint = storeSettings.auto_print_receipt === 'true' || storeSettings.auto_print_receipt === true;
      if (window.ReceiptPrinter) {
        window.ReceiptPrinter.preview(data.order, storeSettings, shouldAutoPrint);
      }

    } catch (err) {
      console.error('Checkout error:', err);
      alert('Error communicating with POS server.');
    } finally {
      btnCompleteSale.disabled = false;
      btnCompleteSale.innerHTML = '<span class="btn-icon">✅</span><span>COMPLETE SALE & PRINT (F9)</span>';
    }
  }

  // Hold current cart
  function holdCurrentCart() {
    if (cart.length === 0) {
      alert('Cannot hold an empty cart.');
      return;
    }

    const customerInput = document.getElementById('cartCustomerName');
    const name = customerInput ? customerInput.value.trim() : `Order #${heldCarts.length + 1}`;

    heldCarts.push({
      id: Date.now(),
      name,
      time: new Date().toLocaleTimeString(),
      cart: [...cart]
    });

    clearCart();
    updateHeldCount();
    alert(`Order held for "${name}". You can recall it anytime.`);
  }

  function updateHeldCount() {
    const badge = document.getElementById('heldCount');
    if (badge) badge.textContent = heldCarts.length;
  }

  function openRecallModal() {
    const modal = document.getElementById('heldCartsModal');
    const list = document.getElementById('heldCartsList');
    const empty = document.getElementById('noHeldCartsMsg');
    if (!modal || !list) return;

    if (heldCarts.length === 0) {
      list.innerHTML = '';
      if (empty) empty.style.display = 'block';
    } else {
      if (empty) empty.style.display = 'none';
      list.innerHTML = heldCarts.map((h, i) => `
        <div class="alert-item" style="margin-bottom: 0.5rem;">
          <div>
            <strong>${h.name}</strong> (${h.cart.length} items)
            <div class="text-muted" style="font-size: 0.75rem;">Held at: ${h.time}</div>
          </div>
          <button class="btn btn-sm btn-primary" onclick="window.POS.recallCart(${i})">Restore</button>
        </div>
      `).join('');
    }

    modal.style.display = 'flex';
  }

  function recallCart(index) {
    if (cart.length > 0) {
      const confirmReplace = confirm('Active cart has items. Replace with held cart?');
      if (!confirmReplace) return;
    }

    const held = heldCarts.splice(index, 1)[0];
    if (held) {
      cart = held.cart;
      const customerInput = document.getElementById('cartCustomerName');
      if (customerInput) customerInput.value = held.name;
      renderCart();
      updateHeldCount();
    }

    const modal = document.getElementById('heldCartsModal');
    if (modal) modal.style.display = 'none';
  }

  window.POS = {
    init,
    setSettings,
    loadProducts,
    handleBarcodeScanned,
    updateQty: updateCartQuantity,
    setQty: setCartQuantity,
    removeItem: removeFromCart,
    clearCart,
    completeSale,
    recallCart
  };
})(window);
