// database.js - SQLite database initialization and queries using Node.js native sqlite
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const DB_PATH = isVercel ? path.join('/tmp', 'supermarket.db') : path.join(__dirname, 'supermarket.db');

if (isVercel && !fs.existsSync(DB_PATH)) {
  const seedPath = path.join(__dirname, 'supermarket.db');
  if (fs.existsSync(seedPath)) {
    try {
      fs.copyFileSync(seedPath, DB_PATH);
    } catch (e) {
      console.warn('Could not copy seed DB to /tmp:', e);
    }
  }
}

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

module.exports = {
  getDb,
  getDateString
};
