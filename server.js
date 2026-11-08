// server.js - Fast, zero-dependency Node.js HTTP server with native SQLite API
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const os = require('node:os');
const { getDb } = require('./database');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

function getLocalIpAddresses() {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

// MIME types for static assets
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) { // 2MB limit
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON format'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let safePath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(PUBLIC_DIR, safePath);

  // Security check: prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback to index.html for SPA if not an api call
      filePath = path.join(PUBLIC_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(404);
        return res.end('File not found');
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // --- API ROUTER ---
  if (pathname.startsWith('/api/')) {
    const db = getDb();

    try {
      // 1. GET /api/settings - Fetch store configuration
      if (pathname === '/api/settings' && method === 'GET') {
        const rows = db.prepare('SELECT key, value FROM settings').all();
        const settings = {};
        for (const r of rows) settings[r.key] = r.value;
        return sendJson(res, 200, { success: true, settings });
      }

      // POST /api/settings - Update store configuration
      if (pathname === '/api/settings' && method === 'POST') {
        const body = await parseJsonBody(req);
        const updateStmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        for (const [k, v] of Object.entries(body)) {
          updateStmt.run(k, String(v));
        }
        return sendJson(res, 200, { success: true, message: 'Settings saved' });
      }

      // 2. GET /api/products - List products with search & filters
      if (pathname === '/api/products' && method === 'GET') {
        const search = parsedUrl.query.search ? parsedUrl.query.search.trim() : '';
        const category = parsedUrl.query.category || '';
        const filter = parsedUrl.query.filter || 'all'; // all, expiring_soon, expired, low_stock

        let query = 'SELECT * FROM products WHERE 1=1';
        const params = [];

        if (search) {
          query += ' AND (name LIKE ? OR barcode LIKE ? OR supplier LIKE ?)';
          const term = `%${search}%`;
          params.push(term, term, term);
        }

        if (category && category !== 'All') {
          query += ' AND category = ?';
          params.push(category);
        }

        const today = new Date().toISOString().split('T')[0];
        const next7Days = new Date();
        next7Days.setDate(next7Days.getDate() + 7);
        const next7DaysStr = next7Days.toISOString().split('T')[0];

        if (filter === 'expired') {
          query += ' AND expiry_date < ?';
          params.push(today);
        } else if (filter === 'expiring_soon') {
          query += ' AND expiry_date >= ? AND expiry_date <= ?';
          params.push(today, next7DaysStr);
        } else if (filter === 'low_stock') {
          query += ' AND stock <= low_stock_threshold';
        }

        query += ' ORDER BY name ASC';
        const products = db.prepare(query).all(...params);

        // Add computed expiry & stock flags
        const enriched = products.map(p => {
          const expDate = new Date(p.expiry_date + 'T00:00:00');
          const todayDate = new Date(today + 'T00:00:00');
          const diffDays = Math.ceil((expDate - todayDate) / (1000 * 60 * 60 * 24));

          let expiryStatus = 'fresh'; // fresh, expiring_soon, expired
          if (diffDays < 0) expiryStatus = 'expired';
          else if (diffDays <= 7) expiryStatus = 'expiring_soon';
          else if (diffDays <= 30) expiryStatus = 'expiring_month';

          return {
            ...p,
            days_to_expiry: diffDays,
            expiry_status: expiryStatus,
            is_low_stock: p.stock <= p.low_stock_threshold,
            is_out_of_stock: p.stock <= 0
          };
        });

        return sendJson(res, 200, { success: true, count: enriched.length, products: enriched });
      }

      // 3. GET /api/products/lookup/:barcode - Barcode instant scanner lookup
      const barcodeLookupMatch = pathname.match(/^\/api\/products\/lookup\/(.+)$/);
      if (barcodeLookupMatch && method === 'GET') {
        const barcode = decodeURIComponent(barcodeLookupMatch[1]).trim();
        const product = db.prepare('SELECT * FROM products WHERE barcode = ?').get(barcode);

        if (!product) {
          return sendJson(res, 404, { success: false, message: `Product with barcode "${barcode}" not found.` });
        }

        const today = new Date().toISOString().split('T')[0];
        const expDate = new Date(product.expiry_date + 'T00:00:00');
        const todayDate = new Date(today + 'T00:00:00');
        const diffDays = Math.ceil((expDate - todayDate) / (1000 * 60 * 60 * 24));

        let expiryStatus = 'fresh';
        if (diffDays < 0) expiryStatus = 'expired';
        else if (diffDays <= 7) expiryStatus = 'expiring_soon';

        return sendJson(res, 200, {
          success: true,
          product: {
            ...product,
            days_to_expiry: diffDays,
            expiry_status: expiryStatus,
            is_low_stock: product.stock <= product.low_stock_threshold,
            is_out_of_stock: product.stock <= 0
          }
        });
      }

      // 4. POST /api/products - Create a new product
      if (pathname === '/api/products' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { barcode, name, category, cost_price, selling_price, stock, low_stock_threshold, unit, expiry_date, supplier } = body;

        if (!barcode || !name || selling_price === undefined || !expiry_date) {
          return sendJson(res, 400, { success: false, message: 'Missing required fields: barcode, name, selling_price, expiry_date' });
        }

        // Check duplicate barcode
        const existing = db.prepare('SELECT id FROM products WHERE barcode = ?').get(barcode.trim());
        if (existing) {
          return sendJson(res, 409, { success: false, message: `A product with barcode "${barcode}" already exists!` });
        }

        const insertStmt = db.prepare(`
          INSERT INTO products (barcode, name, category, cost_price, selling_price, stock, low_stock_threshold, unit, expiry_date, supplier)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = insertStmt.run(
          barcode.trim(),
          name.trim(),
          category || 'General',
          parseFloat(cost_price) || 0,
          parseFloat(selling_price) || 0,
          parseInt(stock, 10) || 0,
          parseInt(low_stock_threshold, 10) || 5,
          unit || 'pcs',
          expiry_date,
          supplier ? supplier.trim() : ''
        );

        return sendJson(res, 201, { success: true, id: result.lastInsertRowid, message: 'Product added successfully!' });
      }

      // 5. PUT /api/products/:id - Update product or restock
      const productUpdateMatch = pathname.match(/^\/api\/products\/(\d+)$/);
      if (productUpdateMatch && method === 'PUT') {
        const id = parseInt(productUpdateMatch[1], 10);
        const body = await parseJsonBody(req);

        const current = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
        if (!current) {
          return sendJson(res, 404, { success: false, message: 'Product not found' });
        }

        // Check barcode collision if barcode changed
        if (body.barcode && body.barcode !== current.barcode) {
          const dup = db.prepare('SELECT id FROM products WHERE barcode = ? AND id != ?').get(body.barcode.trim(), id);
          if (dup) {
            return sendJson(res, 409, { success: false, message: 'Barcode is already assigned to another product' });
          }
        }

        const updateStmt = db.prepare(`
          UPDATE products
          SET barcode = ?, name = ?, category = ?, cost_price = ?, selling_price = ?,
              stock = ?, low_stock_threshold = ?, unit = ?, expiry_date = ?, supplier = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);

        updateStmt.run(
          (body.barcode || current.barcode).trim(),
          (body.name || current.name).trim(),
          body.category || current.category,
          body.cost_price !== undefined ? parseFloat(body.cost_price) : current.cost_price,
          body.selling_price !== undefined ? parseFloat(body.selling_price) : current.selling_price,
          body.stock !== undefined ? parseInt(body.stock, 10) : current.stock,
          body.low_stock_threshold !== undefined ? parseInt(body.low_stock_threshold, 10) : current.low_stock_threshold,
          body.unit || current.unit,
          body.expiry_date || current.expiry_date,
          body.supplier !== undefined ? body.supplier.trim() : current.supplier,
          id
        );

        return sendJson(res, 200, { success: true, message: 'Product updated successfully' });
      }

      // 6. DELETE /api/products/:id - Delete product
      if (productUpdateMatch && method === 'DELETE') {
        const id = parseInt(productUpdateMatch[1], 10);
        db.prepare('DELETE FROM products WHERE id = ?').run(id);
        return sendJson(res, 200, { success: true, message: 'Product deleted' });
      }

      // 7. POST /api/orders - Checkout / Process Sale
      if (pathname === '/api/orders' && method === 'POST') {
        const body = await parseJsonBody(req);
        const { items, discount = 0, tax = 0, payment_method = 'Cash', amount_paid = 0, customer_name = 'Walk-in Customer', cashier_name = 'Cashier 1' } = body;

        if (!items || !Array.isArray(items) || items.length === 0) {
          return sendJson(res, 400, { success: false, message: 'Cart cannot be empty' });
        }

        // Validate stock for all items
        for (const item of items) {
          const prod = db.prepare('SELECT id, name, stock FROM products WHERE id = ?').get(item.id);
          if (!prod) {
            return sendJson(res, 400, { success: false, message: `Product "${item.name}" no longer exists in inventory.` });
          }
          if (prod.stock < item.quantity) {
            return sendJson(res, 400, { success: false, message: `Insufficient stock for "${prod.name}". Only ${prod.stock} remaining!` });
          }
        }

        // Calculate totals
        let subtotal = 0;
        let costTotal = 0;
        for (const item of items) {
          subtotal += item.selling_price * item.quantity;
          costTotal += item.cost_price * item.quantity;
        }

        subtotal = Math.round(subtotal * 100) / 100;
        costTotal = Math.round(costTotal * 100) / 100;
        const disc = Math.round(Number(discount) * 100) / 100;
        const taxable = Math.max(0, subtotal - disc);
        const taxVal = Math.round(Number(tax) * 100) / 100;
        const total = Math.round((taxable + taxVal) * 100) / 100;

        const paid = Math.round(Number(amount_paid) * 100) / 100;
        const changeDue = Math.max(0, Math.round((paid - total) * 100) / 100);

        // Generate receipt number REC-YYYYMMDD-XXXX
        const todayStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
        const countToday = db.prepare("SELECT COUNT(*) as count FROM orders WHERE receipt_no LIKE ?").get(`REC-${todayStr}-%`);
        const nextNum = String(countToday.count + 1).padStart(4, '0');
        const receiptNo = `REC-${todayStr}-${nextNum}`;

        // Insert order
        const insertOrder = db.prepare(`
          INSERT INTO orders (receipt_no, cashier_name, customer_name, subtotal, discount, tax, total, cost_total, payment_method, amount_paid, change_due, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
        `);

        const orderResult = insertOrder.run(
          receiptNo,
          cashier_name,
          customer_name,
          subtotal,
          disc,
          taxVal,
          total,
          costTotal,
          payment_method,
          paid,
          changeDue
        );

        const orderId = orderResult.lastInsertRowid;

        // Insert order items & deduct stock
        const insertOrderItem = db.prepare(`
          INSERT INTO order_items (order_id, product_id, barcode, product_name, category, cost_price, unit_price, quantity, total_price)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const deductStock = db.prepare(`
          UPDATE products
          SET stock = stock - ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `);

        for (const item of items) {
          const itemTotal = Math.round(item.selling_price * item.quantity * 100) / 100;
          insertOrderItem.run(
            orderId,
            item.id,
            item.barcode,
            item.name,
            item.category || 'General',
            item.cost_price || 0,
            item.selling_price,
            item.quantity,
            itemTotal
          );
          deductStock.run(item.quantity, item.id);
        }

        // Return order with receipt information
        const createdOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
        const orderItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);

        return sendJson(res, 201, {
          success: true,
          message: 'Sale completed successfully!',
          order: {
            ...createdOrder,
            items: orderItems
          }
        });
      }

      // 8. GET /api/orders - List sales history
      if (pathname === '/api/orders' && method === 'GET') {
        const limit = parseInt(parsedUrl.query.limit, 10) || 50;
        const fromDate = parsedUrl.query.from;
        const toDate = parsedUrl.query.to;

        let query = 'SELECT * FROM orders WHERE 1=1';
        const params = [];

        if (fromDate) {
          query += ' AND date(created_at) >= date(?)';
          params.push(fromDate);
        }
        if (toDate) {
          query += ' AND date(created_at) <= date(?)';
          params.push(toDate);
        }

        query += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);

        const orders = db.prepare(query).all(...params);
        return sendJson(res, 200, { success: true, count: orders.length, orders });
      }

      // 9. GET /api/orders/:id - Get full order details & items for receipt reprinting
      const orderDetailsMatch = pathname.match(/^\/api\/orders\/(\d+)$/);
      if (orderDetailsMatch && method === 'GET') {
        const id = parseInt(orderDetailsMatch[1], 10);
        const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
        if (!order) return sendJson(res, 404, { success: false, message: 'Order not found' });
        const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
        return sendJson(res, 200, { success: true, order: { ...order, items } });
      }

      // 10. GET /api/reports/summary - Key statistics for Day, Week, Month, Year
      if (pathname === '/api/reports/summary' && method === 'GET') {
        // Daily stats (Today)
        const daily = db.prepare(`
          SELECT
            COUNT(*) as orders_count,
            COALESCE(SUM(total), 0) as total_sales,
            COALESCE(SUM(cost_total), 0) as total_cost,
            COALESCE(SUM(total - cost_total), 0) as gross_profit
          FROM orders
          WHERE date(created_at) = date('now', 'localtime') AND status = 'completed'
        `).get();

        // Weekly stats (Current Week: Monday to Sunday)
        const weekly = db.prepare(`
          SELECT
            COUNT(*) as orders_count,
            COALESCE(SUM(total), 0) as total_sales,
            COALESCE(SUM(cost_total), 0) as total_cost,
            COALESCE(SUM(total - cost_total), 0) as gross_profit
          FROM orders
          WHERE strftime('%Y-%W', created_at, 'localtime') = strftime('%Y-%W', 'now', 'localtime')
            AND status = 'completed'
        `).get();

        // Monthly stats (Current Month)
        const monthly = db.prepare(`
          SELECT
            COUNT(*) as orders_count,
            COALESCE(SUM(total), 0) as total_sales,
            COALESCE(SUM(cost_total), 0) as total_cost,
            COALESCE(SUM(total - cost_total), 0) as gross_profit
          FROM orders
          WHERE strftime('%Y-%m', created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime')
            AND status = 'completed'
        `).get();

        // Yearly stats (Current Year)
        const yearly = db.prepare(`
          SELECT
            COUNT(*) as orders_count,
            COALESCE(SUM(total), 0) as total_sales,
            COALESCE(SUM(cost_total), 0) as total_cost,
            COALESCE(SUM(total - cost_total), 0) as gross_profit
          FROM orders
          WHERE strftime('%Y', created_at, 'localtime') = strftime('%Y', 'now', 'localtime')
            AND status = 'completed'
        `).get();

        // Inventory health stats
        const inventory = db.prepare(`
          SELECT
            COUNT(*) as total_items,
            SUM(stock) as total_units,
            COALESCE(SUM(stock * cost_price), 0) as total_inventory_cost,
            COALESCE(SUM(stock * selling_price), 0) as total_retail_value,
            SUM(CASE WHEN stock <= low_stock_threshold THEN 1 ELSE 0 END) as low_stock_count,
            SUM(CASE WHEN stock <= 0 THEN 1 ELSE 0 END) as out_of_stock_count,
            SUM(CASE WHEN date(expiry_date) < date('now', 'localtime') THEN 1 ELSE 0 END) as expired_count,
            SUM(CASE WHEN date(expiry_date) >= date('now', 'localtime') AND date(expiry_date) <= date('now', 'localtime', '+7 days') THEN 1 ELSE 0 END) as expiring_soon_count
          FROM products
        `).get();

        return sendJson(res, 200, {
          success: true,
          summary: {
            daily,
            weekly,
            monthly,
            yearly,
            inventory
          }
        });
      }

      // 11. GET /api/reports/chart - Time series breakdown
      if (pathname === '/api/reports/chart' && method === 'GET') {
        const period = parsedUrl.query.period || 'daily'; // daily, weekly, monthly, yearly

        let rows = [];
        if (period === 'daily') {
          // Last 7 days breakdown
          rows = db.prepare(`
            SELECT
              date(created_at, 'localtime') as period_label,
              COUNT(*) as order_count,
              ROUND(SUM(total), 2) as sales,
              ROUND(SUM(cost_total), 2) as cost,
              ROUND(SUM(total - cost_total), 2) as profit
            FROM orders
            WHERE date(created_at, 'localtime') >= date('now', 'localtime', '-6 days')
              AND status = 'completed'
            GROUP BY date(created_at, 'localtime')
            ORDER BY period_label ASC
          `).all();
        } else if (period === 'weekly') {
          // Last 8 weeks breakdown
          rows = db.prepare(`
            SELECT
              strftime('%Y-W%W', created_at, 'localtime') as period_label,
              COUNT(*) as order_count,
              ROUND(SUM(total), 2) as sales,
              ROUND(SUM(cost_total), 2) as cost,
              ROUND(SUM(total - cost_total), 2) as profit
            FROM orders
            WHERE created_at >= date('now', 'localtime', '-56 days')
              AND status = 'completed'
            GROUP BY strftime('%Y-W%W', created_at, 'localtime')
            ORDER BY period_label ASC
          `).all();
        } else if (period === 'monthly') {
          // All 12 months for current year
          rows = db.prepare(`
            SELECT
              strftime('%Y-%m', created_at, 'localtime') as period_label,
              COUNT(*) as order_count,
              ROUND(SUM(total), 2) as sales,
              ROUND(SUM(cost_total), 2) as cost,
              ROUND(SUM(total - cost_total), 2) as profit
            FROM orders
            WHERE strftime('%Y', created_at, 'localtime') = strftime('%Y', 'now', 'localtime')
              AND status = 'completed'
            GROUP BY strftime('%Y-%m', created_at, 'localtime')
            ORDER BY period_label ASC
          `).all();
        } else if (period === 'yearly') {
          // Year by year
          rows = db.prepare(`
            SELECT
              strftime('%Y', created_at, 'localtime') as period_label,
              COUNT(*) as order_count,
              ROUND(SUM(total), 2) as sales,
              ROUND(SUM(cost_total), 2) as cost,
              ROUND(SUM(total - cost_total), 2) as profit
            FROM orders
            WHERE status = 'completed'
            GROUP BY strftime('%Y', created_at, 'localtime')
            ORDER BY period_label ASC
          `).all();
        }

        return sendJson(res, 200, { success: true, period, data: rows });
      }

      // 12. GET /api/reports/top-products
      if (pathname === '/api/reports/top-products' && method === 'GET') {
        const topProducts = db.prepare(`
          SELECT
            product_name,
            barcode,
            category,
            SUM(quantity) as units_sold,
            ROUND(SUM(total_price), 2) as total_revenue,
            ROUND(SUM(total_price - (cost_price * quantity)), 2) as total_profit
          FROM order_items
          GROUP BY product_name, barcode, category
          ORDER BY units_sold DESC
          LIMIT 10
        `).all();

        return sendJson(res, 200, { success: true, topProducts });
      }

      // 13. GET /api/reports/categories
      if (pathname === '/api/reports/categories' && method === 'GET') {
        const categories = db.prepare(`
          SELECT
            category,
            SUM(quantity) as units_sold,
            ROUND(SUM(total_price), 2) as total_revenue
          FROM order_items
          WHERE category IS NOT NULL AND category != ''
          GROUP BY category
          ORDER BY total_revenue DESC
        `).all();

        return sendJson(res, 200, { success: true, categories });
      }

      // 14. GET /api/categories - List distinct categories
      if (pathname === '/api/categories' && method === 'GET') {
        const cats = db.prepare('SELECT DISTINCT category FROM products ORDER BY category ASC').all();
        return sendJson(res, 200, { success: true, categories: cats.map(c => c.category) });
      }

      // 15. GET /api/network-info - Network IP address & mobile access
      if (pathname === '/api/network-info' && method === 'GET') {
        const ips = getLocalIpAddresses();
        const primaryIp = ips[0] || 'localhost';
        return sendJson(res, 200, {
          success: true,
          port: PORT,
          primaryIp,
          allIps: ips,
          localUrl: `http://localhost:${PORT}`,
          networkUrl: `http://${primaryIp}:${PORT}`
        });
      }

      // Fallback for unmatched API routes
      return sendJson(res, 404, { success: false, message: 'API route not found' });
    } catch (err) {
      console.error('API Error:', err);
      return sendJson(res, 500, { success: false, message: err.message });
    }
  }

  // --- STATIC FILES ---
  serveStatic(req, res, pathname);
});

// Explicitly bind to '0.0.0.0' so it is available across the entire local Wi-Fi / LAN network
server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  const primaryIp = ips[0] || 'localhost';

  console.log(`====================================================`);
  console.log(`  🛒 ASLAN SUPERMARKET POS SYSTEM ONLINE ON NETWORK!`);
  console.log(`  Local Terminal:   http://localhost:${PORT}`);
  if (primaryIp !== 'localhost') {
    console.log(`  Wi-Fi / LAN URL:  http://${primaryIp}:${PORT}`);
  }
  console.log(`  Other devices on the same Wi-Fi can connect directly!`);
  console.log(`====================================================`);
});
