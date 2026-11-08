# 🛒 Aslan Supermarket POS & Inventory Management System

A complete, high-performance Point of Sale (POS) system designed specifically for supermarkets and retail grocery stores. Built with **Node.js** and **native SQLite** (`node:sqlite`), requiring **zero external npm dependencies** and offering instantaneous startup and 100% offline reliability.

---

## 🚀 Quick Start (One-Click Launch)

Open your terminal in this directory and run:

```bash
# Option 1: Direct launcher (automatically opens browser)
./start.sh

# Option 2: Standard npm command
npm start

# Option 3: Direct node command
node server.js
```

Then open your browser at **[http://localhost:3000](http://localhost:3000)**.

---

## 🔌 Hardware Setup: USB Barcode Scanner & Epson Receipt Printer

### 1. 🔍 USB Barcode Scanner (Plug & Play)
- **Connection**: Plug any standard USB handheld barcode scanner (Honeywell, Zebra, Netum, Tera, Symcode, Datalogic, etc.) into your Mac or PC USB port.
- **How it works**:
  - The scanner acts as an **HID Keyboard Wedge**.
  - You do **not** need to click on the search bar before scanning. The system's hardware listener captures incoming rapid keystrokes from anywhere on screen.
  - An audio beep confirms the scan, and the product is automatically added to the active cart (or quantity incremented by `+1`).
  - If a cashier is in the middle of typing a customer name or tender amount, the engine detects the scanner's burst speed (< 45ms/char) and safely intercepts it so the barcode does not contaminate your input field.
  - Supports standard barcodes: EAN-13, UPC-A, Code 128, Code 39, QR code.
- **Hardware Diagnostics**:
  - Click the **🔌 Hardware Setup** button in the top navigation to test your USB scanner and see exact scan speed and live database matching.

### 2. 🖨️ Epson Thermal Receipt Printer (TM-T88 / TM-T20 / TM-m30 / TM-T70)
- **Paper Roll Sizing**:
  - Pre-calibrated for **80mm standard thermal rolls** (72mm active print width, 42-48 monospace characters per line) and **58mm compact rolls**.
  - Configurable in the **Settings** tab.
- **Auto-Cutter Margin**:
  - Includes an engineered 20mm bottom feed margin so the Epson auto-cutter cuts cleanly below the footer without clipping the barcode or return policy.
- **Instant Auto-Print on Checkout**:
  - When finishing a sale (<kbd>F9</kbd> or "Complete Sale"), the system automatically sends the formatted thermal receipt to your Epson printer.
- **⚡ Pro-Tip: Silent Kiosk Printing (No Print Dialog Popups)**:
  - In a supermarket checkout lane, you want the receipt to print immediately without clicking "Print" in the browser dialog.
  - Launch Chrome with the kiosk printing flag:
    ```bash
    # On macOS:
    open -a "Google Chrome" --args --kiosk-printing "http://localhost:3000"
    ```
  - Chrome will instantly route the receipt directly to your default Epson printer and cut the slip with zero popups!

---

## ✨ Full Feature Overview

### 1. 📅 Expiry Date Tracking & Warnings ("Product Day of Expired")
- Every product tracks its exact **Day of Expiry** (`YYYY-MM-DD`).
- **Real-Time Expiry Status Badges**:
  - 🟢 **Fresh**: More than 30 days remaining.
  - 🟡 **Expiring within Month**: 8 to 30 days remaining.
  - 🟠 **Expiring Soon**: 7 days or less countdown badge (e.g. `Expires in 3d`).
  - 🔴 **Expired**: Highlighted in red with days since expired (e.g. `EXPIRED (2d ago)`).
- **Cashier Checkout Alert**:
  - Prevents accidental sale of expired goods: if a cashier scans an expired item, a warning prompt appears before adding it to the cart.
- **Inventory Filter**:
  - One-click filter for `🔴 Expired` and `🟠 Expiring Soon` to pull expired goods from shelves.

### 2. 📦 Stock Remaining & Low-Stock Alerts ("How Much Remaining")
- **Live Stock Tracking**:
  - Real-time stock display on both POS register and Inventory table.
  - Live stock deduction upon finalizing checkout.
- **Low Stock Threshold Alert**:
  - Automatically flags items when remaining stock falls below threshold (e.g. `≤ 5 units`).
  - Visual notification badge in the header bell (`🔔`).
- **Quick Restock Modal**:
  - Add `+10`, `+50`, or custom units with an optional updated expiration date.

### 3. 🧾 Thermal Receipt Printing
- Itemized table with quantity, unit price, and item totals.
- Subtotal, discounts, tax (5% VAT configurable), and Grand Total.
- Tendered cash and calculated change due.
- Scannable Code 128 barcode of receipt number at the bottom.
- Custom return policy footer.
- Reprint any past receipt from the **Sales History** tab anytime.

### 4. 📊 Daily, Weekly, Monthly & Yearly Reports ("Money Made in a Day, Month, Year")
- **KPI Summary Cards**:
  - 📅 **Today's Revenue, Profit & Orders**
  - 📆 **This Week's Revenue, Profit & Orders**
  - 🗓️ **This Month's Revenue, Profit & Orders**
  - 📈 **This Year's Revenue, Profit & Orders**
- **Interactive High-DPI Canvas Chart**:
  - Toggle between **Daily** (last 7 days), **Weekly** (last 8 weeks), **Monthly** (Jan - Dec), and **Yearly**.
  - Dual-bar visualization: **Sales Revenue (Blue)** vs **Gross Profit (Green)**.
- **Top 10 Best-Selling Products** & **Category Breakdown** (Dairy, Bakery, Beverages, Snacks, Groceries, Produce, Household).
- One-click **Export to CSV** and **Print Report** buttons.

---

## ⌨️ Cashier Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| <kbd>F1</kbd> | Switch to **POS Register** |
| <kbd>F2</kbd> | Switch to **Inventory & Stock** |
| <kbd>F3</kbd> | Switch to **Reports & Analytics** |
| <kbd>F4</kbd> | Switch to **Sales History** |
| <kbd>F5</kbd> | Switch to **Settings** |
| <kbd>F8</kbd> | **Hold Current Order** |
| <kbd>F9</kbd> or <kbd>Enter</kbd> | **Complete Sale & Auto-Print Receipt** |
| <kbd>Esc</kbd> | Clear Cart / Close Modal |
| <kbd>/</kbd> | Instant Focus Barcode Search Box |
