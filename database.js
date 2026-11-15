// database.js - SQLite database with fallback for serverless environments (Vercel)
const path = require('node:path');
const fs = require('node:fs');

const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL_ENV);

let DatabaseSync = null;
// Only attempt native SQLite when running locally (not in serverless environment)
if (!isVercel) {
  try {
    DatabaseSync = require('node:sqlite').DatabaseSync;
  } catch (e) {
    DatabaseSync = null;
  }
}

const DB_PATH = isVercel ? path.join('/tmp', 'supermarket.db') : path.join(__dirname, 'supermarket.db');

// In-Memory & JSON fallback DB for serverless runtimes lacking native sqlite
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
    } catch (e) {
      console.warn('FallbackDb load error:', e);
    }
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
    } catch (e) {
      console.warn('FallbackDb save error:', e);
    }
  }

  exec(sql) {}

  prepare(sql) {
    const s = sql.trim().replace(/\s+/g, ' ');
    const self = this;

    // 1. Settings Queries
    if (s.includes('SELECT key, value FROM settings')) {
      return {
        all: () => Object.entries(self.settings).map(([key, value]) => ({ key, value }))
      };
    }
    if (s.includes('SELECT value FROM settings WHERE key = ?')) {
      return {
        get: (key) => self.settings[key] !== undefined ? { value: self.settings[key] } : undefined
      };
    }
    if (s.startsWith('INSERT OR REPLACE INTO settings') || s.startsWith('INSERT INTO settings')) {
      return {
        run: (k, v) => {
          self.settings[k] = String(v);
          self.save();
          return { changes: 1 };
        }
      };
    }

    // 2. Products Queries
    if (s === 'SELECT * FROM products WHERE barcode = ?') {
      return {
        get: (barcode) => self.products.find(p => p.barcode === String(barcode)) || null
      };
    }
    if (s === 'SELECT id FROM products WHERE barcode = ?') {
      return {
        get: (barcode) => {
          const p = self.products.find(x => x.barcode === String(barcode));
          return p ? { id: p.id } : undefined;
        }
      };
    }
    if (s === 'SELECT id FROM products WHERE barcode = ? AND id != ?') {
      return {
        get: (barcode, id) => {
          const p = self.products.find(x => x.barcode === String(barcode) && x.id !== Number(id));
          return p ? { id: p.id } : undefined;
        }
      };
    }
    if (s === 'SELECT * FROM products WHERE id = ?' || s === 'SELECT id, name, stock FROM products WHERE id = ?') {
      return {
        get: (id) => self.products.find(p => p.id === Number(id)) || null
      };
    }
    if (s.startsWith('INSERT INTO products')) {
      return {
        run: (barcode, name, category, cost_price, selling_price, stock, low_stock_threshold, unit, expiry_date, supplier) => {
          const newProd = {
            id: self.prodIdSeq++,
            barcode: String(barcode).trim(),
            name: String(name).trim(),
            category: category || 'General',
            cost_price: Number(cost_price) || 0,
            selling_price: Number(selling_price) || 0,
            stock: Number(stock) || 0,
            low_stock_threshold: Number(low_stock_threshold) || 5,
            unit: unit || 'pcs',
            expiry_date,
            supplier: supplier ? String(supplier).trim() : '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          self.products.push(newProd);
          self.save();
          return { lastInsertRowid: newProd.id, changes: 1 };
        }
      };
    }
    if (s.startsWith('UPDATE products SET')) {
      return {
        run: (...params) => {
          const id = Number(params[params.length - 1]);
          const prod = self.products.find(p => p.id === id);
          if (!prod) return { changes: 0 };
          if (s.includes('stock = stock - ?')) {
            prod.stock -= Number(params[0]) || 0;
            self.save();
            return { changes: 1 };
          }
          if (params.length >= 10) {
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
            prod.updated_at = new Date().toISOString();
          }
          self.save();
          return { changes: 1 };
        }
      };
    }
    if (s.startsWith('DELETE FROM products WHERE id = ?')) {
      return {
        run: (id) => {
          const idx = self.products.findIndex(p => p.id === Number(id));
          if (idx !== -1) {
            self.products.splice(idx, 1);
            self.save();
            return { changes: 1 };
          }
          return { changes: 0 };
        }
      };
    }
    if (s.startsWith('SELECT * FROM products WHERE 1=1') || s.startsWith('SELECT * FROM products')) {
      return {
        all: (...params) => {
          let list = [...self.products];
          let paramIdx = 0;
          if (s.includes('AND (name LIKE ? OR barcode LIKE ? OR supplier LIKE ?)')) {
            const term = (params[paramIdx] || '').replace(/%/g, '').toLowerCase();
            paramIdx += 3;
            list = list.filter(p => p.name.toLowerCase().includes(term) || p.barcode.toLowerCase().includes(term) || (p.supplier && p.supplier.toLowerCase().includes(term)));
          }
          if (s.includes('AND category = ?')) {
            const cat = params[paramIdx++];
            list = list.filter(p => p.category === cat);
          }
          const today = new Date().toISOString().split('T')[0];
          if (s.includes('AND expiry_date < ?')) {
            list = list.filter(p => p.expiry_date < today);
          } else if (s.includes('AND expiry_date >= ? AND expiry_date <= ?')) {
            const next7 = new Date(); next7.setDate(next7.getDate() + 7);
            const next7Str = next7.toISOString().split('T')[0];
            list = list.filter(p => p.expiry_date >= today && p.expiry_date <= next7Str);
          } else if (s.includes('AND stock <= low_stock_threshold')) {
            list = list.filter(p => p.stock <= p.low_stock_threshold);
          }
          return list.sort((a,b) => a.name.localeCompare(b.name));
        }
      };
    }
    if (s.includes('SELECT DISTINCT category FROM products')) {
      return {
        all: () => {
          const cats = [...new Set(self.products.map(p => p.category).filter(Boolean))].sort();
          return cats.map(c => ({ category: c }));
        }
      };
    }

    // 3. Orders Queries
    if (s.includes('SELECT COUNT(*) as count FROM orders WHERE receipt_no LIKE ?')) {
      return {
        get: (pattern) => {
          const prefix = pattern.replace(/%/g, '');
          const count = self.orders.filter(o => o.receipt_no.startsWith(prefix)).length;
          return { count };
        }
      };
    }
    if (s.startsWith('INSERT INTO orders')) {
      return {
        run: (receipt_no, cashier_name, customer_name, subtotal, discount, tax, total, cost_total, payment_method, amount_paid, change_due) => {
          const newOrder = {
            id: self.orderIdSeq++,
            receipt_no,
            cashier_name: cashier_name || 'Cashier 1',
            customer_name: customer_name || 'Walk-in Customer',
            subtotal: Number(subtotal) || 0,
            discount: Number(discount) || 0,
            tax: Number(tax) || 0,
            total: Number(total) || 0,
            cost_total: Number(cost_total) || 0,
            payment_method: payment_method || 'Cash',
            amount_paid: Number(amount_paid) || 0,
            change_due: Number(change_due) || 0,
            status: 'completed',
            created_at: new Date().toISOString()
          };
          self.orders.push(newOrder);
          self.save();
          return { lastInsertRowid: newOrder.id, changes: 1 };
        }
      };
    }
    if (s.startsWith('INSERT INTO order_items')) {
      return {
        run: (order_id, product_id, barcode, product_name, category, cost_price, unit_price, quantity, total_price) => {
          const newItem = {
            id: self.itemIdSeq++,
            order_id: Number(order_id),
            product_id: product_id ? Number(product_id) : null,
            barcode,
            product_name,
            category: category || 'General',
            cost_price: Number(cost_price) || 0,
            unit_price: Number(unit_price) || 0,
            quantity: Number(quantity) || 0,
            total_price: Number(total_price) || 0
          };
          self.orderItems.push(newItem);
          self.save();
          return { lastInsertRowid: newItem.id, changes: 1 };
        }
      };
    }
    if (s.includes('SELECT * FROM orders WHERE id = ?')) {
      return {
        get: (id) => self.orders.find(o => o.id === Number(id)) || null
      };
    }
    if (s.includes('SELECT * FROM order_items WHERE order_id = ?')) {
      return {
        all: (orderId) => self.orderItems.filter(item => item.order_id === Number(orderId))
      };
    }
    if (s.startsWith('SELECT * FROM orders')) {
      return {
        all: (...params) => {
          let list = [...self.orders];
          if (params.length > 0 && params[0]) {
            const term = params[0].replace(/%/g, '').toLowerCase();
            list = list.filter(o => o.receipt_no.toLowerCase().includes(term) || (o.customer_name && o.customer_name.toLowerCase().includes(term)));
          }
          return list.sort((a,b) => b.id - a.id);
        }
      };
    }

    // 4. Reports Queries
    if (s.includes('COUNT(*) as orders_count') && s.includes('FROM orders')) {
      return {
        get: (...params) => {
          let list = [...self.orders];
          const count = list.length;
          const sales = list.reduce((sum, o) => sum + (o.total || 0), 0);
          const cost = list.reduce((sum, o) => sum + (o.cost_total || 0), 0);
          const profit = sales - cost;
          return {
            orders_count: count,
            total_sales: sales,
            total_cost: cost,
            gross_profit: profit
          };
        }
      };
    }
    if (s.includes('FROM order_items') && s.includes('SUM(quantity) as units_sold')) {
      return {
        all: () => {
          const map = {};
          for (const it of self.orderItems) {
            if (!map[it.barcode]) {
              map[it.barcode] = {
                product_name: it.product_name,
                barcode: it.barcode,
                category: it.category,
                units_sold: 0,
                total_revenue: 0,
                total_cost: 0,
                total_profit: 0
              };
            }
            map[it.barcode].units_sold += it.quantity;
            map[it.barcode].total_revenue += it.total_price;
            map[it.barcode].total_cost += (it.cost_price * it.quantity);
            map[it.barcode].total_profit = map[it.barcode].total_revenue - map[it.barcode].total_cost;
          }
          return Object.values(map).sort((a,b) => b.units_sold - a.units_sold).slice(0, 10);
        }
      };
    }
    if (s.includes('category, COUNT(id) as count') || s.includes('GROUP BY category')) {
      return {
        all: () => {
          const map = {};
          for (const it of self.orderItems) {
            const cat = it.category || 'General';
            if (!map[cat]) map[cat] = { category: cat, units_sold: 0, total_revenue: 0 };
            map[cat].units_sold += it.quantity;
            map[cat].total_revenue += it.total_price;
          }
          return Object.values(map);
        }
      };
    }

    return {
      all: () => [],
      get: () => null,
      run: () => ({ changes: 0 })
    };
  }
}

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    if (DatabaseSync) {
      try {
        dbInstance = new DatabaseSync(DB_PATH);
        dbInstance.exec('PRAGMA foreign_keys = ON;');
        initSchema(dbInstance);
      } catch (err) {
        console.warn('DatabaseSync initialization failed, using FallbackDb:', err.message);
        dbInstance = new FallbackDb();
      }
    } else {
      dbInstance = new FallbackDb();
    }
  }
  return dbInstance;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

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

  const defaultSettings = [
    ['store_name', 'Aslan Supermarket'],
    ['store_tagline', 'Freshness & Quality Daily'],
    ['store_address', 'Kigali, Rwanda'],
    ['store_phone', '+250 700 000 000'],
    ['store_email', 'info@aslansupermarket.rw'],
    ['currency_symbol', 'RWF'],
    ['tax_rate', '18.0'],
    ['auto_print_receipt', 'true'],
    ['epson_paper_width', '80mm'],
    ['receipt_footer', 'Murakoze guhahira muri Aslan Supermarket!\nThank you for shopping at Aslan Supermarket!\nHave a wonderful day!'],
    ['db_initialized', 'true']
  ];

  const checkSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
  const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

  for (const [key, value] of defaultSettings) {
    const existing = checkSetting.get(key);
    if (!existing) {
      insertSetting.run(key, value);
    }
  }

  insertSetting.run('currency_symbol', 'RWF');
  insertSetting.run('tax_rate', '18.0');
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
