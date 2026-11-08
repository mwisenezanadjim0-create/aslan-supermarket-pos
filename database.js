// database.js - SQLite database initialization and queries using Node.js native sqlite
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'supermarket.db');
let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    dbInstance = new DatabaseSync(DB_PATH);
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    initSchema(dbInstance);
  }
  return dbInstance;
}

function initSchema(db) {
  // 1. Settings Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 2. Products Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      cost_price REAL NOT NULL,
      selling_price REAL NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER NOT NULL DEFAULT 5,
      unit TEXT NOT NULL DEFAULT 'pcs',
      expiry_date TEXT NOT NULL,
      supplier TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 3. Orders / Sales Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      receipt_no TEXT UNIQUE NOT NULL,
      cashier_name TEXT DEFAULT 'Cashier 1',
      customer_name TEXT DEFAULT 'Walk-in Customer',
      subtotal REAL NOT NULL,
      discount REAL DEFAULT 0,
      tax REAL DEFAULT 0,
      total REAL NOT NULL,
      cost_total REAL NOT NULL DEFAULT 0,
      payment_method TEXT NOT NULL,
      amount_paid REAL NOT NULL,
      change_due REAL DEFAULT 0,
      status TEXT DEFAULT 'completed',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 4. Order Items Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER,
      barcode TEXT NOT NULL,
      product_name TEXT NOT NULL,
      category TEXT,
      cost_price REAL NOT NULL,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      total_price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
  `);

  // 5. Initialize Default Settings if empty
  const defaultSettings = [
    ['store_name', 'Aslan Supermarket'],
    ['store_tagline', 'Freshness & Quality Daily'],
    ['store_address', '124 Main Boulevard, Suite 10, Downtown'],
    ['store_phone', '+1 (555) 234-5678'],
    ['store_email', 'contact@aslansupermarket.com'],
    ['currency_symbol', 'RWF'],
    ['tax_rate', '18.0'], // 18% standard VAT in Rwanda (customizable in settings)
    ['auto_print_receipt', 'true'],
    ['epson_paper_width', '80mm'],
    ['receipt_footer', 'Murakoze guhahira muri Aslan Supermarket!\nThank you for shopping at Aslan Supermarket!\nHave a wonderful day!']
  ];

  const checkSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  for (const [key, value] of defaultSettings) {
    const existing = checkSetting.get(key);
    if (!existing) {
      insertSetting.run(key, value);
    }
  }

  // Ensure currency is set to RWF
  insertSetting.run('currency_symbol', 'RWF');

  // 6. Check if database has already been initialized
  const initFlag = checkSetting.get('db_initialized');
  if (!initFlag) {
    insertSetting.run('db_initialized', 'true');
  }
}

// Helper to get formatted dates relative to today
function getDateString(daysOffset) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

function getIsoDateTime(daysOffset, hours = 10, minutes = 15) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

function seedDatabase(db) {
  console.log('Seeding initial supermarket products and historical sales...');

  const insertProduct = db.prepare(`
    INSERT INTO products (barcode, name, category, cost_price, selling_price, stock, low_stock_threshold, unit, expiry_date, supplier)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Realistic sample supermarket products
  const products = [
    // Dairy
    ['8901001', 'Fresh Whole Milk 1L', 'Dairy', 1.20, 1.99, 28, 8, 'bottle', getDateString(4), 'Apex Dairy Co.'], // Expiring in 4 days!
    ['8901002', 'Cheddar Cheese Block 250g', 'Dairy', 2.50, 4.29, 15, 5, 'pack', getDateString(45), 'Farmhouse Foods'],
    ['8901003', 'Greek Plain Yogurt 500g', 'Dairy', 1.80, 2.99, 6, 5, 'tub', getDateString(2), 'Apex Dairy Co.'], // Expiring in 2 days!
    ['8901004', 'Salted Butter 200g', 'Dairy', 1.90, 3.49, 22, 6, 'pack', getDateString(60), 'Meadow Lands'],
    ['8901005', 'Artisan Blue Cheese 150g', 'Dairy', 3.00, 5.99, 4, 3, 'pack', getDateString(-2), 'Alpine Dairy'], // Expired 2 days ago! (demo)

    // Bakery
    ['8902001', 'Sliced White Bread 800g', 'Bakery', 0.90, 1.89, 14, 5, 'loaf', getDateString(3), 'Golden Crust Bakery'], // Expiring in 3 days
    ['8902002', 'Whole Grain Bread 700g', 'Bakery', 1.20, 2.49, 18, 5, 'loaf', getDateString(5), 'Golden Crust Bakery'],
    ['8902003', 'Butter Croissant (4 Pack)', 'Bakery', 2.00, 3.99, 8, 4, 'pack', getDateString(2), 'Sweet Morning Bakery'], // Expiring in 2 days
    ['8902004', 'Chocolate Chip Muffins (2 Pack)', 'Bakery', 1.50, 2.99, 12, 4, 'pack', getDateString(6), 'Sweet Morning Bakery'],

    // Beverages
    ['8903001', 'Coca-Cola Original 1.5L', 'Beverages', 1.10, 2.29, 45, 10, 'bottle', getDateString(240), 'Beverage Express'],
    ['8903002', 'Fresh Orange Juice 1L', 'Beverages', 1.80, 3.49, 16, 5, 'bottle', getDateString(12), 'Sunny Groves'],
    ['8903003', 'Natural Mineral Water 500ml', 'Beverages', 0.30, 0.99, 60, 15, 'bottle', getDateString(365), 'Pure Springs'],
    ['8903004', 'Premium Roast Instant Coffee 200g', 'Beverages', 4.50, 7.99, 19, 5, 'jar', getDateString(300), 'Bean & Roast Co.'],
    ['8903005', 'Organic Green Tea (50 Bags)', 'Beverages', 2.20, 4.49, 25, 6, 'box', getDateString(360), 'Zen Leaf'],

    // Snacks & Confectionery
    ['8904001', 'Crispy Potato Chips BBQ 150g', 'Snacks', 0.85, 1.99, 32, 8, 'bag', getDateString(120), 'Snack Attack'],
    ['8904002', 'Dark Chocolate Bar 70% 100g', 'Snacks', 1.30, 2.79, 40, 10, 'bar', getDateString(180), 'Swiss Treats'],
    ['8904003', 'Roasted Salted Peanuts 200g', 'Snacks', 1.10, 2.19, 24, 6, 'bag', getDateString(150), 'Nutty Delight'],
    ['8904004', 'Classic Digestive Biscuits 400g', 'Snacks', 1.00, 2.29, 30, 8, 'pack', getDateString(90), 'Baker Street'],

    // Groceries & Staples
    ['8905001', 'Long Grain Basmati Rice 2kg', 'Groceries', 3.20, 5.99, 20, 5, 'bag', getDateString(500), 'Global Grains'],
    ['8905002', 'Italian Spaghetti Pasta 500g', 'Groceries', 0.70, 1.49, 35, 10, 'pack', getDateString(400), 'Milano Pasta'],
    ['8905003', 'Extra Virgin Olive Oil 750ml', 'Groceries', 5.50, 9.99, 15, 4, 'bottle', getDateString(360), 'Mediterranean Harvest'],
    ['8905004', 'Solid Light Canned Tuna in Oil 185g', 'Groceries', 1.10, 2.39, 42, 8, 'can', getDateString(600), 'Ocean Catch'],
    ['8905005', 'Organic Free-Range Eggs (12 Pack)', 'Groceries', 2.40, 4.19, 3, 5, 'carton', getDateString(14), 'Sunny Farm'], // LOW STOCK (3 left!)

    // Produce & Fresh
    ['8906001', 'Fresh Bananas (1kg)', 'Produce', 0.90, 1.79, 18, 5, 'kg', getDateString(5), 'Fresh Fields Ltd.'],
    ['8906002', 'Red Gala Apples (1kg)', 'Produce', 1.50, 2.99, 22, 6, 'kg', getDateString(10), 'Valley Orchards'],
    ['8906003', 'Yellow Onions Bag (1kg)', 'Produce', 0.80, 1.59, 25, 5, 'kg', getDateString(25), 'Fresh Fields Ltd.'],

    // Household & Hygiene
    ['8907001', 'Lemon Dishwashing Liquid 750ml', 'Household', 1.40, 2.89, 18, 5, 'bottle', getDateString(700), 'CleanHome Supplies'],
    ['8907002', 'Ultra Clean Laundry Liquid 1.5L', 'Household', 4.50, 8.49, 11, 4, 'bottle', getDateString(720), 'CleanHome Supplies'],
    ['8907003', 'Moisturizing Hand Soap 250ml', 'Household', 0.95, 1.99, 26, 6, 'bottle', getDateString(500), 'PureCare'],
    ['8907004', 'Extra Soft Paper Towels (2 Rolls)', 'Household', 1.20, 2.49, 2, 5, 'pack', getDateString(999), 'SoftPaper Co.'] // LOW STOCK (2 left!)
  ];

  for (const p of products) {
    insertProduct.run(...p);
  }

  // Pre-seed realistic orders for:
  // - Today (several sales)
  // - This week (daily sales)
  // - This month
  // - Throughout the year
  seedHistoricalSales(db);
}

function seedHistoricalSales(db) {
  const insertOrder = db.prepare(`
    INSERT INTO orders (receipt_no, cashier_name, customer_name, subtotal, discount, tax, total, cost_total, payment_method, amount_paid, change_due, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
  `);

  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (order_id, product_id, barcode, product_name, category, cost_price, unit_price, quantity, total_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Sample sales scenario templates
  const salesTemplates = [
    {
      items: [
        { barcode: '8901001', name: 'Fresh Whole Milk 1L', cat: 'Dairy', cost: 1.20, price: 1.99, qty: 2 },
        { barcode: '8902001', name: 'Sliced White Bread 800g', cat: 'Bakery', cost: 0.90, price: 1.89, qty: 1 },
        { barcode: '8905005', name: 'Organic Free-Range Eggs (12 Pack)', cat: 'Groceries', cost: 2.40, price: 4.19, qty: 1 }
      ],
      paymentMethod: 'Cash',
      tender: 20.00
    },
    {
      items: [
        { barcode: '8903001', name: 'Coca-Cola Original 1.5L', cat: 'Beverages', cost: 1.10, price: 2.29, qty: 2 },
        { barcode: '8904001', name: 'Crispy Potato Chips BBQ 150g', cat: 'Snacks', cost: 0.85, price: 1.99, qty: 2 },
        { barcode: '8904002', name: 'Dark Chocolate Bar 70% 100g', cat: 'Snacks', cost: 1.30, price: 2.79, qty: 1 }
      ],
      paymentMethod: 'Card',
      tender: 11.35
    },
    {
      items: [
        { barcode: '8905001', name: 'Long Grain Basmati Rice 2kg', cat: 'Groceries', cost: 3.20, price: 5.99, qty: 1 },
        { barcode: '8905003', name: 'Extra Virgin Olive Oil 750ml', cat: 'Groceries', cost: 5.50, price: 9.99, qty: 1 },
        { barcode: '8905002', name: 'Italian Spaghetti Pasta 500g', cat: 'Groceries', cost: 0.70, price: 1.49, qty: 3 }
      ],
      paymentMethod: 'Cash',
      tender: 30.00
    },
    {
      items: [
        { barcode: '8907002', name: 'Ultra Clean Laundry Liquid 1.5L', cat: 'Household', cost: 4.50, price: 8.49, qty: 1 },
        { barcode: '8907001', name: 'Lemon Dishwashing Liquid 750ml', cat: 'Household', cost: 1.40, price: 2.89, qty: 1 },
        { barcode: '8907003', name: 'Moisturizing Hand Soap 250ml', cat: 'Household', cost: 0.95, price: 1.99, qty: 2 }
      ],
      paymentMethod: 'Mobile',
      tender: 15.36
    },
    {
      items: [
        { barcode: '8903004', name: 'Premium Roast Instant Coffee 200g', cat: 'Beverages', cost: 4.50, price: 7.99, qty: 1 },
        { barcode: '8901004', name: 'Salted Butter 200g', cat: 'Dairy', cost: 1.90, price: 3.49, qty: 1 },
        { barcode: '8902003', name: 'Butter Croissant (4 Pack)', cat: 'Bakery', cost: 2.00, price: 3.99, qty: 2 }
      ],
      paymentMethod: 'Card',
      tender: 19.46
    }
  ];

  let receiptCounter = 1000;

  // Function to create a historical sale
  function recordHistoricOrder(templateIndex, daysOffset, hour, minute) {
    receiptCounter++;
    const template = salesTemplates[templateIndex % salesTemplates.length];
    const receiptNo = `REC-${new Date().getFullYear()}${String(receiptCounter).padStart(5, '0')}`;
    const createdAt = getIsoDateTime(daysOffset, hour, minute);

    let subtotal = 0;
    let costTotal = 0;

    for (const item of template.items) {
      subtotal += item.price * item.qty;
      costTotal += item.cost * item.qty;
    }

    subtotal = Math.round(subtotal * 100) / 100;
    costTotal = Math.round(costTotal * 100) / 100;
    const tax = Math.round(subtotal * 0.05 * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;
    const amountPaid = template.tender >= total ? template.tender : total;
    const changeDue = Math.round((amountPaid - total) * 100) / 100;

    const result = insertOrder.run(
      receiptNo,
      'Cashier 1',
      'Walk-in Customer',
      subtotal,
      0,
      tax,
      total,
      costTotal,
      template.paymentMethod,
      amountPaid,
      changeDue,
      createdAt
    );

    const orderId = result.lastInsertRowid;

    for (const item of template.items) {
      insertOrderItem.run(
        orderId,
        null,
        item.barcode,
        item.name,
        item.cat,
        item.cost,
        item.price,
        item.qty,
        Math.round(item.price * item.qty * 100) / 100
      );
    }
  }

  // 1. Sales for Today (0 days offset)
  recordHistoricOrder(0, 0, 8, 15);
  recordHistoricOrder(1, 0, 8, 42);
  recordHistoricOrder(2, 0, 9, 05);
  recordHistoricOrder(4, 0, 9, 20);

  // 2. Sales for This Week (Days -1 to -6)
  recordHistoricOrder(1, -1, 10, 15);
  recordHistoricOrder(2, -1, 14, 30);
  recordHistoricOrder(3, -1, 18, 20);

  recordHistoricOrder(0, -2, 11, 00);
  recordHistoricOrder(4, -2, 15, 45);
  recordHistoricOrder(1, -2, 19, 10);

  recordHistoricOrder(2, -3, 9, 30);
  recordHistoricOrder(3, -3, 13, 15);
  recordHistoricOrder(0, -3, 17, 50);

  recordHistoricOrder(4, -4, 10, 45);
  recordHistoricOrder(1, -4, 16, 20);

  recordHistoricOrder(2, -5, 12, 10);
  recordHistoricOrder(3, -5, 18, 00);

  recordHistoricOrder(0, -6, 11, 30);
  recordHistoricOrder(1, -6, 15, 50);

  // 3. Sales across earlier weeks this month (Days -8, -12, -15, -20, -25)
  recordHistoricOrder(2, -8, 14, 00);
  recordHistoricOrder(3, -10, 16, 30);
  recordHistoricOrder(0, -12, 10, 20);
  recordHistoricOrder(1, -15, 13, 40);
  recordHistoricOrder(4, -18, 15, 10);
  recordHistoricOrder(2, -22, 11, 55);
  recordHistoricOrder(3, -25, 17, 30);

  // 4. Sales across earlier months this year (Days -40, -70, -100, -140, -180, -220, -260)
  recordHistoricOrder(0, -40, 12, 00);
  recordHistoricOrder(1, -70, 14, 00);
  recordHistoricOrder(2, -100, 10, 30);
  recordHistoricOrder(3, -140, 15, 00);
  recordHistoricOrder(4, -180, 11, 00);
  recordHistoricOrder(1, -220, 16, 30);
  recordHistoricOrder(2, -260, 13, 15);

  console.log(`Successfully seeded ${receiptCounter - 1000} historical sales records.`);
}

module.exports = {
  getDb,
  getDateString
};
