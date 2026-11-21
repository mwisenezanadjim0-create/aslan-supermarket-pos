// database.js - Multi-engine Database: Neon Cloud PostgreSQL (Permanent) with SQLite & In-Memory Fallbacks
const path = require('node:path');
const fs = require('node:fs');

// 1. Auto-load .env if present (so DATABASE_URL is available locally)
if (fs.existsSync(path.join(__dirname, '.env'))) {
  try {
    const envLines = fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n');
    for (const line of envLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [k, ...v] = trimmed.split('=');
      if (k && v.length) {
        process.env[k.trim()] = v.join('=').trim();
      }
    }
  } catch (e) {}
}

const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL || 'postgresql://neondb_owner:npg_guKnWsq2BhO7@ep-cold-union-be8sop7o-pooler.c-9.us-east-2.aws.neon.tech/neondb?sslmode=require';
const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL_ENV);

// SQL Translator from SQLite dialect to PostgreSQL dialect
function translateToPg(sql) {
  let s = sql;
  s = s.replace(/INSERT OR REPLACE INTO settings\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i, 
    'INSERT INTO settings ($1) VALUES ($2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value');
  
  s = s.replace(/strftime\('%Y-%m',\s*created_at[^)]*\)/gi, "TO_CHAR(created_at, 'YYYY-MM')");
  s = s.replace(/strftime\('%Y-%W',\s*created_at[^)]*\)/gi, "TO_CHAR(created_at, 'YYYY-IW')");
  s = s.replace(/strftime\('%Y-W%W',\s*created_at[^)]*\)/gi, "TO_CHAR(created_at, 'YYYY-IW')");
  s = s.replace(/strftime\('%Y',\s*created_at[^)]*\)/gi, "TO_CHAR(created_at, 'YYYY')");
  s = s.replace(/strftime\('[^']+',\s*['"]now['"][^)]*\)/gi, (match) => {
    if (match.includes('%Y-%m')) return "TO_CHAR(CURRENT_DATE, 'YYYY-MM')";
    if (match.includes('%Y-%W') || match.includes('%Y-W%W')) return "TO_CHAR(CURRENT_DATE, 'YYYY-IW')";
    if (match.includes('%Y')) return "TO_CHAR(CURRENT_DATE, 'YYYY')";
    return "CURRENT_DATE";
  });

  s = s.replace(/date\('now',\s*'localtime',\s*'-6 days'\)/gi, "(CURRENT_DATE - INTERVAL '6 days')");
  s = s.replace(/date\('now',\s*'localtime',\s*'-56 days'\)/gi, "(CURRENT_DATE - INTERVAL '56 days')");
  s = s.replace(/date\('now',\s*'localtime',\s*'\+7 days'\)/gi, "(CURRENT_DATE + INTERVAL '7 days')");
  s = s.replace(/date\('now',\s*'localtime'\)/gi, "CURRENT_DATE");
  s = s.replace(/date\(created_at(?:,\s*'localtime')?\)/gi, "created_at::date");
  s = s.replace(/date\(expiry_date\)/gi, "expiry_date::date");
  s = s.replace(/date\(\?\)/gi, "CAST(? AS date)");

  let i = 1;
  s = s.replace(/\?/g, () => `$${i++}`);

  if (s.trim().toUpperCase().startsWith('INSERT') && !s.toUpperCase().includes('RETURNING')) {
    s += ' RETURNING id';
  }

  return s;
}

function mapNumericRow(row) {
  if (!row || typeof row !== 'object') return row;
  const numFields = [
    'cost_price', 'selling_price', 'stock', 'low_stock_threshold',
    'subtotal', 'discount', 'tax', 'total', 'cost_total', 'amount_paid', 'change_due',
    'unit_price', 'total_price', 'total_items', 'total_units', 'total_inventory_cost',
    'total_retail_value', 'low_stock_count', 'out_of_stock_count', 'expired_count',
    'expiring_soon_count', 'orders_count', 'total_sales', 'total_cost', 'gross_profit',
    'order_count', 'sales', 'cost', 'profit', 'units_sold', 'total_revenue'
  ];
  const res = { ...row };
  for (const f of numFields) {
    if (res[f] !== undefined && res[f] !== null) {
      res[f] = Number(res[f]);
    }
  }
  return res;
}

// ==================== ENGINE 1: NEON CLOUD POSTGRESQL (FIXED, PERMANENT DATABASE) ====================
class NeonPgDb {
  constructor(connectionString) {
    const { Pool } = require('pg');
    this.pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
  }

  prepare(sql) {
    const pgSql = translateToPg(sql);
    const self = this;
    return {
      all: async (...params) => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const res = await self.pool.query(pgSql, flatParams);
        return res.rows.map(mapNumericRow);
      },
      get: async (...params) => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const res = await self.pool.query(pgSql, flatParams);
        return res.rows[0] ? mapNumericRow(res.rows[0]) : null;
      },
      run: async (...params) => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        const res = await self.pool.query(pgSql, flatParams);
        return {
          lastInsertRowid: res.rows[0] ? res.rows[0].id : null,
          changes: res.rowCount
        };
      }
    };
  }

  async exec(sql) {
    return this.pool.query(translateToPg(sql));
  }
}

// ==================== ENGINE 2: SQLITE DATABASE (FOR OFFLINE / LOCAL TERMINAL) ====================
let DatabaseSync = null;
if (!isVercel) {
  try {
    DatabaseSync = require('node:sqlite').DatabaseSync;
  } catch (e) {
    DatabaseSync = null;
  }
}

const DB_PATH = isVercel ? path.join('/tmp', 'supermarket.db') : path.join(__dirname, 'supermarket.db');

class SqliteAsyncWrapper {
  constructor(syncDb) {
    this.db = syncDb;
  }

  prepare(sql) {
    const stmt = this.db.prepare(sql);
    return {
      all: async (...params) => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        return stmt.all(...flatParams);
      },
      get: async (...params) => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        return stmt.get(...flatParams) || null;
      },
      run: async (...params) => {
        const flatParams = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
        return stmt.run(...flatParams);
      }
    };
  }

  async exec(sql) {
    return this.db.exec(sql);
  }
}

// ==================== ENGINE 3: FALLBACK IN-MEMORY DB ====================
class FallbackDb {
  constructor() {
    this.storageFile = isVercel ? '/tmp/aslan-pos-data.json' : path.join(__dirname, 'aslan-pos-data.json');
    this.settings = {
      store_name: 'Aslan Supermarket',
      store_tagline: 'Freshness & Quality Daily',
      store_address: 'Kigali, Rwanda',
      store_phone: '+250 700 000 000',
      store_email: 'info@aslansupermarket.rw',
      currency_symbol: 'RWF',
      tax_rate: '18.0',
      auto_print_receipt: 'true',
      epson_paper_width: '80mm',
      receipt_footer: 'Murakoze guhahira muri Aslan Supermarket!\nThank you for shopping at Aslan Supermarket!\nHave a wonderful day!',
      db_initialized: 'true'
    };
    this.products = [];
    this.orders = [];
    this.orderItems = [];
    this.prodIdSeq = 1;
    this.orderIdSeq = 1;
    this.itemIdSeq = 1;

    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.storageFile)) {
        const raw = JSON.parse(fs.readFileSync(this.storageFile, 'utf8'));
        if (raw.settings) this.settings = { ...this.settings, ...raw.settings };
        if (raw.products) this.products = raw.products;
        if (raw.orders) this.orders = raw.orders;
        if (raw.orderItems) this.orderItems = raw.orderItems;
        if (raw.prodIdSeq) this.prodIdSeq = raw.prodIdSeq;
        if (raw.orderIdSeq) this.orderIdSeq = raw.orderIdSeq;
        if (raw.itemIdSeq) this.itemIdSeq = raw.itemIdSeq;
      }
    } catch (e) {}
  }

  save() {
    try {
      fs.writeFileSync(this.storageFile, JSON.stringify({
        settings: this.settings,
        products: this.products,
        orders: this.orders,
        orderItems: this.orderItems,
        prodIdSeq: this.prodIdSeq,
        orderIdSeq: this.orderIdSeq,
        itemIdSeq: this.itemIdSeq
      }));
    } catch (e) {}
  }

  exec(sql) {}

  prepare(sql) {
    const s = sql.trim().replace(/\s+/g, ' ');
    const self = this;

    return {
      all: async (...params) => {
        if (s.includes('SELECT key, value FROM settings')) {
          return Object.entries(self.settings).map(([key, value]) => ({ key, value }));
        }
        if (s.includes('SELECT DISTINCT category FROM products')) {
          const cats = [...new Set(self.products.map(p => p.category).filter(Boolean))].sort();
          return cats.map(c => ({ category: c }));
        }
        if (s.startsWith('SELECT * FROM products')) {
          let list = [...self.products];
          return list.sort((a,b) => a.name.localeCompare(b.name));
        }
        if (s.includes('SELECT * FROM order_items WHERE order_id = ?')) {
          return self.orderItems.filter(item => item.order_id === Number(params[0]));
        }
        if (s.startsWith('SELECT * FROM order_items')) {
          return [...self.orderItems];
        }
        if (s.startsWith('SELECT * FROM orders')) {
          return [...self.orders].sort((a,b) => b.id - a.id);
        }
        return [];
      },
      get: async (...params) => {
        if (s.includes('SELECT value FROM settings WHERE key = ?')) {
          return self.settings[params[0]] !== undefined ? { value: self.settings[params[0]] } : null;
        }
        if (s === 'SELECT * FROM products WHERE barcode = ?') {
          return self.products.find(p => p.barcode === String(params[0])) || null;
        }
        if (s === 'SELECT id FROM products WHERE barcode = ?') {
          const p = self.products.find(x => x.barcode === String(params[0]));
          return p ? { id: p.id } : null;
        }
        if (s.includes('SELECT * FROM products WHERE id = ?') || s.includes('SELECT id, name, stock FROM products WHERE id = ?')) {
          return self.products.find(p => p.id === Number(params[0])) || null;
        }
        if (s.includes('SELECT * FROM orders WHERE id = ?')) {
          return self.orders.find(o => o.id === Number(params[0])) || null;
        }
        if (s.includes('SELECT COUNT(*) as count FROM orders WHERE receipt_no LIKE ?')) {
          const prefix = String(params[0]).replace(/%/g, '');
          const count = self.orders.filter(o => o.receipt_no.startsWith(prefix)).length;
          return { count };
        }
        if (s.includes('COUNT(*) as total_items') && s.includes('FROM products')) {
          return {
            total_items: self.products.length,
            total_units: self.products.reduce((acc, p) => acc + (p.stock || 0), 0),
            total_inventory_cost: self.products.reduce((acc, p) => acc + ((p.stock || 0) * (p.cost_price || 0)), 0),
            total_retail_value: self.products.reduce((acc, p) => acc + ((p.stock || 0) * (p.selling_price || 0)), 0),
            low_stock_count: self.products.filter(p => p.stock <= p.low_stock_threshold).length,
            out_of_stock_count: self.products.filter(p => p.stock <= 0).length,
            expired_count: 0,
            expiring_soon_count: 0
          };
        }
        return null;
      },
      run: async (...params) => {
        if (s.startsWith('INSERT OR REPLACE INTO settings') || s.startsWith('INSERT INTO settings')) {
          self.settings[params[0]] = String(params[1]);
          self.save();
          return { changes: 1 };
        }
        if (s.startsWith('INSERT INTO products')) {
          const newProd = {
            id: self.prodIdSeq++,
            barcode: String(params[0]).trim(),
            name: String(params[1]).trim(),
            category: params[2] || 'General',
            cost_price: Number(params[3]) || 0,
            selling_price: Number(params[4]) || 0,
            stock: Number(params[5]) || 0,
            low_stock_threshold: Number(params[6]) || 5,
            unit: params[7] || 'pcs',
            expiry_date: params[8],
            supplier: params[9] ? String(params[9]).trim() : '',
            created_at: new Date().toISOString()
          };
          self.products.push(newProd);
          self.save();
          return { lastInsertRowid: newProd.id, changes: 1 };
        }
        if (s.startsWith('UPDATE products')) {
          const id = Number(params[params.length - 1]);
          const prod = self.products.find(p => p.id === id);
          if (!prod) return { changes: 0 };
          if (s.includes('stock = stock - ?')) {
            prod.stock -= Number(params[0]) || 0;
          } else if (params.length >= 10) {
            prod.barcode = String(params[0]).trim();
            prod.name = String(params[1]).trim();
            prod.category = params[2] || 'General';
            prod.cost_price = Number(params[3]) || 0;
            prod.selling_price = Number(params[4]) || 0;
            prod.stock = Number(params[5]) || 0;
            prod.low_stock_threshold = Number(params[6]) || 5;
            prod.unit = params[7] || 'pcs';
            prod.expiry_date = params[8];
            prod.supplier = params[9] ? String(params[9]).trim() : '';
          }
          self.save();
          return { changes: 1 };
        }
        if (s.startsWith('DELETE FROM products WHERE id = ?')) {
          const idx = self.products.findIndex(p => p.id === Number(params[0]));
          if (idx !== -1) {
            self.products.splice(idx, 1);
            self.save();
            return { changes: 1 };
          }
          return { changes: 0 };
        }
        if (s.startsWith('INSERT INTO orders')) {
          const newOrder = {
            id: self.orderIdSeq++,
            receipt_no: params[0],
            cashier_name: params[1],
            customer_name: params[2],
            subtotal: Number(params[3]),
            discount: Number(params[4]),
            tax: Number(params[5]),
            total: Number(params[6]),
            cost_total: Number(params[7]),
            payment_method: params[8],
            amount_paid: Number(params[9]),
            change_due: Number(params[10]),
            status: 'completed',
            created_at: new Date().toISOString()
          };
          self.orders.push(newOrder);
          self.save();
          return { lastInsertRowid: newOrder.id, changes: 1 };
        }
        if (s.startsWith('INSERT INTO order_items')) {
          const newItem = {
            id: self.itemIdSeq++,
            order_id: Number(params[0]),
            product_id: params[1] ? Number(params[1]) : null,
            barcode: params[2],
            product_name: params[3],
            category: params[4],
            cost_price: Number(params[5]),
            unit_price: Number(params[6]),
            quantity: Number(params[7]),
            total_price: Number(params[8])
          };
          self.orderItems.push(newItem);
          self.save();
          return { lastInsertRowid: newItem.id, changes: 1 };
        }
        return { changes: 0 };
      }
    };
  }
}

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    if (DATABASE_URL) {
      console.log('Connecting to Neon PostgreSQL Cloud Database...');
      dbInstance = new NeonPgDb(DATABASE_URL);
    } else if (DatabaseSync) {
      try {
        const syncDb = new DatabaseSync(DB_PATH);
        syncDb.exec('PRAGMA foreign_keys = ON;');
        syncDb.exec('PRAGMA journal_mode = WAL;');
        syncDb.exec('PRAGMA synchronous = NORMAL;');
        initSqliteSchema(syncDb);
        dbInstance = new SqliteAsyncWrapper(syncDb);
      } catch (err) {
        console.warn('SQLite init failed, using FallbackDb:', err.message);
        dbInstance = new FallbackDb();
      }
    } else {
      dbInstance = new FallbackDb();
    }
  }
  return dbInstance;
}

function initSqliteSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
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
}

function getDateString(daysOffset) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split('T')[0];
}

module.exports = {
  getDb,
  getDateString
};
