// public/js/inventory.js - Product Catalog, Expiry Tracking & Stock Management

(function(window) {
  'use strict';

  let products = [];
  let currentFilter = 'all'; // all, expired, expiring_soon, low_stock
  let currentCategory = 'All';

  // DOM Elements
  let invTableBody, invEmptyMessage, invSearchInput, invCategorySelect;
  let invTotalProducts, invTotalStockUnits, invLowStockCount, invExpiringSoonCount, invExpiredCount;
  let filterCountExpired, filterCountExpSoon, filterCountLowStock;

  function init() {
    invTableBody = document.getElementById('inventoryTableBody');
    invEmptyMessage = document.getElementById('invEmptyMessage');
    invSearchInput = document.getElementById('invSearchInput');
    invCategorySelect = document.getElementById('invCategorySelect');

    invTotalProducts = document.getElementById('invTotalProducts');
    invTotalStockUnits = document.getElementById('invTotalStockUnits');
    invLowStockCount = document.getElementById('invLowStockCount');
    invExpiringSoonCount = document.getElementById('invExpiringSoonCount');
    invExpiredCount = document.getElementById('invExpiredCount');

    filterCountExpired = document.getElementById('filterCountExpired');
    filterCountExpSoon = document.getElementById('filterCountExpSoon');
    filterCountLowStock = document.getElementById('filterCountLowStock');

    setupEventListeners();
    loadProducts();
  }

  function setupEventListeners() {
    // Filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.getAttribute('data-filter');
        loadProducts();
      });
    });

    // Search input
    if (invSearchInput) {
      invSearchInput.addEventListener('input', () => {
        renderTable();
      });
    }

    // Category select
    if (invCategorySelect) {
      invCategorySelect.addEventListener('change', () => {
        currentCategory = invCategorySelect.value;
        renderTable();
      });
    }

    // Refresh button
    const btnRefresh = document.getElementById('btnRefreshInventory');
    if (btnRefresh) btnRefresh.addEventListener('click', loadProducts);

    // Add Product Modal trigger
    const btnAdd = document.getElementById('btnAddNewProduct');
    if (btnAdd) btnAdd.addEventListener('click', () => openProductModal());

    // Export CSV
    const btnExportCSV = document.getElementById('btnExportInventoryCSV');
    if (btnExportCSV) btnExportCSV.addEventListener('click', exportInventoryCSV);

    // Product Form Submit
    const productForm = document.getElementById('productForm');
    if (productForm) productForm.addEventListener('submit', handleProductFormSubmit);

    // Generate random barcode button
    const btnGenBarcode = document.getElementById('btnGenRandomBarcode');
    if (btnGenBarcode) {
      btnGenBarcode.addEventListener('click', () => {
        const input = document.getElementById('prodFormBarcode');
        if (input) input.value = '890' + Math.floor(1000 + Math.random() * 9000);
      });
    }

    // Restock modal button
    const btnConfirmRestock = document.getElementById('btnConfirmRestock');
    if (btnConfirmRestock) btnConfirmRestock.addEventListener('click', handleRestockSubmit);
  }

  async function loadProducts() {
    try {
      const url = `/api/products?filter=${currentFilter}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        products = data.products || [];
        updateKPIs();
        populateCategories();
        renderTable();
      }
    } catch (err) {
      console.error('Failed to load inventory:', err);
    }
  }

  function updateKPIs() {
    const totalItems = products.length;
    const totalUnits = products.reduce((sum, p) => sum + p.stock, 0);

    const expired = products.filter(p => p.expiry_status === 'expired').length;
    const expiringSoon = products.filter(p => p.expiry_status === 'expiring_soon').length;
    const lowStock = products.filter(p => p.is_low_stock).length;

    if (invTotalProducts) invTotalProducts.textContent = totalItems;
    if (invTotalStockUnits) invTotalStockUnits.textContent = totalUnits;
    if (invLowStockCount) invLowStockCount.textContent = lowStock;
    if (invExpiringSoonCount) invExpiringSoonCount.textContent = expiringSoon;
    if (invExpiredCount) invExpiredCount.textContent = expired;

    if (filterCountExpired) filterCountExpired.textContent = expired;
    if (filterCountExpSoon) filterCountExpSoon.textContent = expiringSoon;
    if (filterCountLowStock) filterCountLowStock.textContent = lowStock;

    // Update notification bell count in top header
    const totalAlerts = expired + expiringSoon + lowStock;
    const badge = document.getElementById('alertsSummaryCount');
    const navBadge = document.getElementById('navExpiringBadge');
    if (badge) badge.textContent = totalAlerts;
    if (navBadge) {
      navBadge.textContent = expired + expiringSoon;
      navBadge.style.display = (expired + expiringSoon > 0) ? 'inline-flex' : 'none';
    }
  }

  function populateCategories() {
    if (!invCategorySelect) return;
    const existingVal = invCategorySelect.value;
    const categories = ['All', ...new Set(products.map(p => p.category).filter(Boolean))];
    invCategorySelect.innerHTML = categories.map(c => `
      <option value="${c}" ${c === existingVal ? 'selected' : ''}>${c === 'All' ? 'All Categories' : c}</option>
    `).join('');
  }

  function renderTable() {
    if (!invTableBody) return;

    const searchTerm = invSearchInput ? invSearchInput.value.toLowerCase().trim() : '';

    const filtered = products.filter(p => {
      const matchCat = currentCategory === 'All' || p.category === currentCategory;
      const matchSearch = !searchTerm ||
        p.name.toLowerCase().includes(searchTerm) ||
        p.barcode.toLowerCase().includes(searchTerm) ||
        (p.supplier && p.supplier.toLowerCase().includes(searchTerm));
      return matchCat && matchSearch;
    });

    if (filtered.length === 0) {
      invTableBody.innerHTML = '';
      if (invEmptyMessage) invEmptyMessage.style.display = 'block';
      return;
    }

    if (invEmptyMessage) invEmptyMessage.style.display = 'none';

    invTableBody.innerHTML = filtered.map(p => {
      // Stock badge
      let stockBadge = `<span class="badge badge-success">🟢 ${p.stock} ${p.unit}</span>`;
      if (p.stock <= 0) {
        stockBadge = `<span class="badge badge-danger">🔴 Out of Stock (0)</span>`;
      } else if (p.stock <= p.low_stock_threshold) {
        stockBadge = `<span class="badge badge-warning">⚠️ Low: ${p.stock} ${p.unit}</span>`;
      }

      // Expiry badge
      let expiryBadge = `<span class="badge badge-info">📅 ${p.expiry_date}</span>`;
      if (p.expiry_status === 'expired') {
        expiryBadge = `<span class="badge badge-danger" title="Expired ${Math.abs(p.days_to_expiry)} days ago">🔴 EXPIRED (${Math.abs(p.days_to_expiry)}d ago)</span>`;
      } else if (p.expiry_status === 'expiring_soon') {
        expiryBadge = `<span class="badge badge-warning" title="Expires in ${p.days_to_expiry} days">🟠 In ${p.days_to_expiry} days</span>`;
      }

      const hasCost = p.cost_price > 0;
      const margin = (hasCost && p.selling_price > 0) ? (((p.selling_price - p.cost_price) / p.selling_price) * 100).toFixed(0) : null;
      const costDisplay = hasCost ? `Cost: ${Math.round(p.cost_price).toLocaleString()} RWF (${margin}% profit)` : 'Cost: Not set (Recommended)';

      return `
        <tr>
          <td>
            <div style="font-family: var(--font-mono); font-weight: bold;">${p.barcode}</div>
            <button class="btn btn-xs btn-outline" style="margin-top: 3px;" onclick="window.Inventory.printLabel(${p.id})">🏷️ Sticker</button>
          </td>
          <td>
            <div style="font-weight: 700;">${p.name}</div>
            <div class="text-muted" style="font-size: 0.75rem;">Supplier: ${p.supplier || 'N/A'}</div>
          </td>
          <td><span class="badge badge-info">${p.category}</span></td>
          <td>
            <div><strong>${Math.round(p.selling_price).toLocaleString()} RWF</strong></div>
            <div class="text-muted" style="font-size: 0.75rem;">${costDisplay}</div>
          </td>
          <td>
            <div>${stockBadge}</div>
            <div class="text-muted" style="font-size: 0.72rem; margin-top: 2px;">Min Alert: ${p.low_stock_threshold}</div>
          </td>
          <td>
            ${expiryBadge}
            <div class="text-muted" style="font-size: 0.72rem; margin-top: 2px;">Date: ${p.expiry_date}</div>
          </td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 4px; justify-content: center;">
              <button class="btn btn-xs btn-success" onclick="window.Inventory.openRestockModal(${p.id})" title="Add Stock">➕ Restock</button>
              <button class="btn btn-xs btn-outline" onclick="window.Inventory.openEditModal(${p.id})" title="Edit Product">✏️ Edit</button>
              <button class="btn btn-xs btn-danger-outline" onclick="window.Inventory.deleteProduct(${p.id})" title="Delete">&times;</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Open Product Modal (Add or Edit)
  function openProductModal(prod = null) {
    const modal = document.getElementById('productModal');
    const title = document.getElementById('productModalTitle');
    const form = document.getElementById('productForm');

    form.reset();

    if (prod) {
      title.textContent = '✏️ Edit Product';
      document.getElementById('prodFormId').value = prod.id;
      document.getElementById('prodFormBarcode').value = prod.barcode;
      document.getElementById('prodFormName').value = prod.name;
      document.getElementById('prodFormCategory').value = prod.category;
      document.getElementById('prodFormSupplier').value = prod.supplier || '';
      document.getElementById('prodFormCostPrice').value = prod.cost_price;
      document.getElementById('prodFormSellingPrice').value = prod.selling_price;
      document.getElementById('prodFormStock').value = prod.stock;
      document.getElementById('prodFormLowStock').value = prod.low_stock_threshold;
      document.getElementById('prodFormUnit').value = prod.unit;
      document.getElementById('prodFormExpiryDate').value = prod.expiry_date;
    } else {
      title.textContent = '➕ Add New Product';
      document.getElementById('prodFormId').value = '';
      // Default expiry date 3 months in future
      const defaultExp = new Date();
      defaultExp.setMonth(defaultExp.getMonth() + 3);
      document.getElementById('prodFormExpiryDate').value = defaultExp.toISOString().split('T')[0];
    }

    modal.style.display = 'flex';
  }

  function openAddModalWithBarcode(barcode) {
    openProductModal();
    const barcodeInput = document.getElementById('prodFormBarcode');
    if (barcodeInput) barcodeInput.value = barcode;
    const nameInput = document.getElementById('prodFormName');
    if (nameInput) nameInput.focus();
  }

  function openEditModal(id) {
    const prod = products.find(p => p.id === id);
    if (prod) openProductModal(prod);
  }

  // Handle Product Form Submit (Create / Update)
  async function handleProductFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('prodFormId').value;
    const payload = {
      barcode: document.getElementById('prodFormBarcode').value.trim(),
      name: document.getElementById('prodFormName').value.trim(),
      category: document.getElementById('prodFormCategory').value.trim() || 'General',
      supplier: document.getElementById('prodFormSupplier').value.trim(),
      cost_price: parseFloat(document.getElementById('prodFormCostPrice').value) || 0,
      selling_price: parseFloat(document.getElementById('prodFormSellingPrice').value) || 0,
      stock: parseInt(document.getElementById('prodFormStock').value, 10) || 0,
      low_stock_threshold: parseInt(document.getElementById('prodFormLowStock').value, 10) || 5,
      unit: document.getElementById('prodFormUnit').value || 'pcs',
      expiry_date: document.getElementById('prodFormExpiryDate').value
    };

    try {
      const url = id ? `/api/products/${id}` : '/api/products';
      const method = id ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!data.success) {
        alert(`Error: ${data.message}`);
        return;
      }

      document.getElementById('productModal').style.display = 'none';
      loadProducts();
      if (window.POS && window.POS.loadProducts) window.POS.loadProducts();

    } catch (err) {
      console.error('Failed to save product:', err);
      alert('Network error saving product.');
    }
  }

  // Delete product
  async function deleteProduct(id) {
    const prod = products.find(p => p.id === id);
    if (!prod) return;

    if (!confirm(`Are you sure you want to delete "${prod.name}" (${prod.barcode})?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        loadProducts();
        if (window.POS && window.POS.loadProducts) window.POS.loadProducts();
      }
    } catch (err) {
      console.error('Delete product failed:', err);
    }
  }

  // Restock Modal
  let activeRestockProd = null;

  function openRestockModal(id) {
    const prod = products.find(p => p.id === id);
    if (!prod) return;
    activeRestockProd = prod;

    document.getElementById('restockProdName').textContent = `${prod.name} (#${prod.barcode})`;
    document.getElementById('restockCurrentStock').textContent = `${prod.stock} ${prod.unit}`;
    document.getElementById('restockAddUnits').value = 10;
    document.getElementById('restockNewExpiry').value = prod.expiry_date;

    document.getElementById('restockModal').style.display = 'flex';
  }

  async function handleRestockSubmit() {
    if (!activeRestockProd) return;

    const addUnits = parseInt(document.getElementById('restockAddUnits').value, 10) || 0;
    if (addUnits <= 0) {
      alert('Please enter a positive number of units to add.');
      return;
    }

    const newExpiry = document.getElementById('restockNewExpiry').value;
    const newStock = activeRestockProd.stock + addUnits;

    try {
      const res = await fetch(`/api/products/${activeRestockProd.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stock: newStock,
          expiry_date: newExpiry || activeRestockProd.expiry_date
        })
      });

      const data = await res.json();
      if (data.success) {
        document.getElementById('restockModal').style.display = 'none';
        loadProducts();
        if (window.POS && window.POS.loadProducts) window.POS.loadProducts();
        if (window.App && window.App.playSound) window.App.playSound('cash');
      }
    } catch (err) {
      console.error('Restock error:', err);
    }
  }

  // Print Barcode Sticker Label
  function printLabel(id) {
    const prod = products.find(p => p.id === id);
    if (!prod) return;

    const modal = document.getElementById('barcodeLabelModal');
    const container = document.getElementById('barcodeLabelPaper');
    const printContainer = document.getElementById('printOnlyReceipt');

    const barcodeSvg = window.BarcodeGen ? window.BarcodeGen.generateSVG(prod.barcode, { height: 45, barWidth: 2, showText: true }) : '';

    const labelHtml = `
      <div class="barcode-sticker-sheet">
        <div class="label-store-name">ASLAN SUPERMARKET</div>
        <div class="label-product-name">${prod.name}</div>
        <div class="label-price">${Math.round(prod.selling_price).toLocaleString()} RWF</div>
        <div style="margin: 8px 0;">${barcodeSvg}</div>
        <div class="label-expiry">EXPIRY: ${prod.expiry_date} | Stock: ${prod.stock} ${prod.unit}</div>
      </div>
    `;

    container.innerHTML = labelHtml;
    if (printContainer) printContainer.innerHTML = labelHtml;
    modal.style.display = 'flex';
  }

  // Export inventory to CSV
  function exportInventoryCSV() {
    if (products.length === 0) return alert('No products to export.');

    let csv = 'Barcode,Product Name,Category,Cost Price,Selling Price,Stock,Unit,Low Stock Threshold,Expiry Date,Days to Expiry,Expiry Status,Supplier\n';

    for (const p of products) {
      const name = `"${p.name.replace(/"/g, '""')}"`;
      const supplier = `"${(p.supplier || '').replace(/"/g, '""')}"`;
      csv += `${p.barcode},${name},${p.category},${p.cost_price},${p.selling_price},${p.stock},${p.unit},${p.low_stock_threshold},${p.expiry_date},${p.days_to_expiry},${p.expiry_status},${supplier}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `aslan_supermarket_inventory_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  window.Inventory = {
    init,
    loadProducts,
    openAddModalWithBarcode,
    openEditModal,
    openRestockModal,
    deleteProduct,
    printLabel
  };
})(window);
