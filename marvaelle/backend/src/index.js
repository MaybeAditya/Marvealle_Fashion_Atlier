import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { getPool } from './db.js';
import { hashPassword, issueToken, readTokenFromRequest, verifyPassword } from './auth.js';

const app = express();
app.disable('x-powered-by');
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));

const PRODUCT_PRICES = Object.freeze({
  '1': 7999,
  '2': 4999,
  '3': 2999,
  '4': 12999,
  '5': 24500,
  '5-w': 24500,
  '6': 39500,
  '7': 89500,
  '9': 54500,
  '10': 49500,
  '11': 62500
});

// Log request duration without logging request bodies, passwords, tokens, or payment credentials.
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    console.log(`[http] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`);
  });
  next();
});

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'marvaelle-express', message: 'API is running. See /api/health.' });
});

app.get('/api/health', async (_req, res) => {
  let database = false;
  let dbError = null;
  try {
    await getPool().query('SELECT 1');
    database = true;
  } catch (error) {
    dbError = !process.env.DATABASE_URL
      ? 'DATABASE_URL is not configured'
      : error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED'
        ? 'Database connection failed or timed out'
        : 'Database health check failed';
    console.error('[health] database check failed:', error.code || error.name, error.message);
  }
  const jwtConfigured = Boolean(process.env.JWT_SECRET && process.env.JWT_SECRET.trim().length >= 16);
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID?.trim());
  const paymentsConfigured = Boolean(process.env.RAZORPAY_KEY_ID?.trim() && process.env.RAZORPAY_KEY_SECRET?.trim());
  const ok = database && jwtConfigured;
  res.status(ok ? 200 : 503).json({
    ok,
    service: 'marvaelle-express',
    database,
    db_error: dbError,
    jwt_configured: jwtConfigured,
    google_configured: googleConfigured,
    payments_configured: paymentsConfigured
  });
});

app.get('/api/products', async (_req, res, next) => {
  try {
    const result = await getPool().query('SELECT product_id, quantity FROM product_stock ORDER BY product_id');
    const stock = Object.fromEntries(result.rows.map((row) => [row.product_id, Math.max(0, row.quantity)]));
    res.json(stock);
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password;
    if (!email || typeof password !== 'string') return res.status(400).json({ error: 'Email and password are required.' });

    const result = await getPool().query(
      'SELECT id, email, password_hash, name FROM users WHERE LOWER(email) = $1 LIMIT 1',
      [email]
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }
    res.json({
      message: 'Login successful.',
      token: issueToken(user),
      name: user.name
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/auth/signup', async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password;
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() || null : null;
    const country = typeof req.body?.country === 'string' ? req.body.country.trim() || null : null;
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() || null : null;
    const dob = typeof req.body?.dob === 'string' ? req.body.dob.trim() || null : null;

    if (!name || !email || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Name, email and a password of at least 8 characters are required.' });
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });

    const existing = await getPool().query('SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
    if (existing.rows[0]) return res.status(409).json({ error: 'An account with this email already exists.' });

    const passwordHash = await hashPassword(password);
    const result = await getPool().query(
      `INSERT INTO users (name, email, password_hash, title, phone, dob, country)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, name`,
      [name, email, passwordHash, title, phone, dob, country]
    );
    const user = result.rows[0];
    res.status(201).json({ message: 'User created successfully.', token: issueToken(user) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
    next(error);
  }
});

// The Google Web Client ID is public by design. Serving it from the backend
// gives the frontend and token verifier one source of truth, avoiding ID-token
// audience mismatches caused by separate Vercel build/runtime variables.
app.get('/api/auth/google/config', (_req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
  res.set('Cache-Control', 'no-store');
  res.json({ enabled: Boolean(clientId), client_id: clientId || null });
});

function googleTokenRequestTimeout() {
  return AbortSignal.timeout(10_000);
}

app.post('/api/auth/google', async (req, res, next) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    const credential = req.body?.credential;
    if (!clientId) return res.status(503).json({ error: 'Google authentication is not configured on the backend.' });
    if (typeof credential !== 'string' || credential.length < 20) {
      return res.status(400).json({ error: 'A Google credential is required.' });
    }

    // Google tokeninfo verifies Google's issued ID token, with a hard timeout to avoid hanging requests.
    const verificationUrl = new URL('https://oauth2.googleapis.com/tokeninfo');
    verificationUrl.searchParams.set('id_token', credential);
    const googleResponse = await fetch(verificationUrl, { signal: googleTokenRequestTimeout() });
    const claims = await googleResponse.json().catch(() => ({}));
    if (!googleResponse.ok) {
      return res.status(401).json({
        code: 'GOOGLE_CREDENTIAL_INVALID',
        error: 'Google could not validate this sign-in credential. Refresh the page and try again.'
      });
    }
    if (claims.aud !== clientId) {
      // Do not weaken audience validation. A credential minted for another OAuth
      // client must never be accepted by this application.
      console.warn('[auth/google] OAuth audience mismatch; check GOOGLE_CLIENT_ID and the configured Web OAuth client.');
      return res.status(401).json({
        code: 'GOOGLE_CLIENT_ID_MISMATCH',
        error: 'Google sign-in is configured with different OAuth Client IDs. Set GOOGLE_CLIENT_ID on the backend to the intended Google Web Client ID, then reload the page and redeploy the backend.'
      });
    }
    const issuerOk = claims.iss === 'accounts.google.com' || claims.iss === 'https://accounts.google.com';
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    const googleId = typeof claims.sub === 'string' ? claims.sub : '';
    const exp = Number(claims.exp);
    const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
    if (!issuerOk || !emailVerified || !email || !googleId || !Number.isFinite(exp) || exp * 1000 <= Date.now()) {
      return res.status(401).json({ error: 'Google account is not verified or its credential has expired.' });
    }
    const displayName = typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim() : 'Marvaelle Client';
    const pool = getPool();
    const client = await pool.connect();
    let user;
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT id, email, name, google_id FROM users WHERE LOWER(email) = $1 FOR UPDATE',
        [email]
      );
      if (existing.rows[0]) {
        user = existing.rows[0];
        if (user.google_id && user.google_id !== googleId) {
          await client.query('ROLLBACK');
          return res.status(409).json({ error: 'This email is already linked to a different Google account.' });
        }
        if (!user.google_id) {
          await client.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, user.id]);
        }
      } else {
        const inserted = await client.query(
          `INSERT INTO users (name, email, password_hash, google_id)
           VALUES ($1, $2, 'GOOGLE_AUTH', $3)
           ON CONFLICT (email) DO NOTHING
           RETURNING id, email, name, google_id`,
          [displayName, email, googleId]
        );
        if (inserted.rows[0]) {
          user = inserted.rows[0];
        } else {
          // A concurrent sign-up may have inserted this email while this request was running.
          const raced = await client.query(
            'SELECT id, email, name, google_id FROM users WHERE LOWER(email) = $1 FOR UPDATE',
            [email]
          );
          user = raced.rows[0];
          if (!user || (user.google_id && user.google_id !== googleId)) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Could not safely link this Google account to the existing user.' });
          }
          if (!user.google_id) await client.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, user.id]);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    res.json({ token: issueToken(user), name: user.name || displayName });
  } catch (error) {
    next(error);
  }
});

app.get('/api/profile', async (req, res, next) => {
  try {
    const claims = readTokenFromRequest(req);
    const result = await getPool().query(
      'SELECT name, email, phone, country FROM users WHERE id = $1',
      [claims.user_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get('/api/orders', async (req, res, next) => {
  try {
    const claims = readTokenFromRequest(req);
    const result = await getPool().query(
      `SELECT id, total_amount, created_at, tracking_status, address_line1, city, pincode, phone
       FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
      [claims.user_id]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

function normalizeCart(items) {
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error('Cart is empty'); error.status = 400; throw error;
  }
  return items.map((item) => {
    const id = typeof item?.id === 'string' ? item.id : String(item?.id ?? '');
    const quantity = Number(item?.quantity);
    if (!(id in PRODUCT_PRICES)) {
      const error = new Error(`Invalid product ID: ${id}`); error.status = 400; throw error;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      const error = new Error('Each product quantity must be a positive integer.'); error.status = 400; throw error;
    }
    const size = typeof item?.size === 'string' && ['XS', 'S', 'M', 'L', 'XL'].includes(item.size) ? item.size : 'M';
    const color = typeof item?.color === 'string' && item.color.trim() ? item.color.trim().slice(0, 80) : 'As shown';
    return { id, quantity, size, color };
  });
}

function cartTotal(items) {
  return items.reduce((sum, item) => sum + PRODUCT_PRICES[item.id] * item.quantity, 0);
}

async function razorpayRequest(path, { method = 'GET', body } = {}) {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    const error = new Error('Payments are not configured on the backend.'); error.status = 503; throw error;
  }
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10_000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[razorpay] upstream request failed:', response.status, data.error?.code || 'unknown');
    const error = new Error('Payment provider rejected the request. Check Razorpay credentials and account settings.');
    error.status = response.status === 401 ? 503 : 502;
    throw error;
  }
  return data;
}

app.post('/api/orders/create', async (req, res, next) => {
  try {
    const items = normalizeCart(req.body?.items);
    const total = cartTotal(items);
    const requested = new Map();
    for (const item of items) requested.set(item.id, (requested.get(item.id) || 0) + item.quantity);
    for (const [id, quantity] of requested) {
      const result = await getPool().query('SELECT quantity FROM product_stock WHERE product_id = $1', [id]);
      if (!result.rows[0]) return res.status(409).json({ error: `Stock is not configured for product ${id}. Apply the database migration first.` });
      if (quantity > result.rows[0].quantity) return res.status(409).json({ error: `Only ${result.rows[0].quantity} unit(s) remain for product ${id}.` });
    }
    const order = await razorpayRequest('/orders', {
      method: 'POST',
      body: { amount: total, currency: 'INR', receipt: `marvaelle_${crypto.randomUUID()}` }
    });
    res.json(order);
  } catch (error) {
    next(error);
  }
});

function timingSafeHexEqual(expectedHex, suppliedHex) {
  if (typeof suppliedHex !== 'string' || !/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;
  const expected = Buffer.from(expectedHex, 'hex');
  const supplied = Buffer.from(suppliedHex, 'hex');
  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

app.post('/api/orders/confirm', async (req, res, next) => {
  let client;
  try {
    const paymentId = req.body?.payment_id;
    const orderId = req.body?.order_id;
    const signature = req.body?.signature;
    const items = normalizeCart(req.body?.cart);
    const shipping = req.body?.shipping;
    if (typeof paymentId !== 'string' || !paymentId || typeof orderId !== 'string' || !orderId ||
        !shipping || !['address', 'city', 'pincode', 'phone'].every((key) => typeof shipping[key] === 'string' && shipping[key].trim())) {
      return res.status(400).json({ error: 'Payment and complete shipping details are required.' });
    }
    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) return res.status(503).json({ error: 'Payments are not configured on the backend.' });
    const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
    if (!timingSafeHexEqual(expected, signature)) return res.status(401).json({ error: 'Invalid payment signature.' });

    const total = cartTotal(items);
    // Do not trust the browser's cart alone: confirm the payment matches this order and expected amount.
    const payment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
    if (payment.order_id !== orderId || Number(payment.amount) !== total || payment.currency !== 'INR' ||
        !['authorized', 'captured'].includes(payment.status)) {
      return res.status(401).json({ error: 'Payment details do not match this order.' });
    }

    const claims = readTokenFromRequest(req, { optional: true });
    const pool = getPool();
    client = await pool.connect();
    await client.query('BEGIN');
    const duplicate = await client.query('SELECT id FROM orders WHERE payment_id = $1', [paymentId]);
    if (duplicate.rows[0]) {
      await client.query('COMMIT');
      return res.json({ success: true, duplicate: true });
    }

    const totalRequested = new Map();
    for (const item of items) totalRequested.set(item.id, (totalRequested.get(item.id) || 0) + item.quantity);
    for (const [id, quantity] of totalRequested) {
      const stock = await client.query('SELECT quantity FROM product_stock WHERE product_id = $1 FOR UPDATE', [id]);
      if (!stock.rows[0] || stock.rows[0].quantity < quantity) {
        const error = new Error('Stock changed while payment was processing. Contact support before placing another order.');
        error.status = 409;
        throw error;
      }
    }

    const orderResult = await client.query(
      `INSERT INTO orders
         (user_id, total_amount, payment_id, status, address_line1, city, pincode, phone, tracking_status)
       VALUES ($1, $2, $3, 'Confirmed', $4, $5, $6, $7, 'Processing')
       RETURNING id`,
      [claims?.user_id ?? null, total, paymentId, shipping.address.trim(), shipping.city.trim(), shipping.pincode.trim(), shipping.phone.trim()]
    );
    const orderDbId = orderResult.rows[0].id;
    for (const item of items) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase, size, color) VALUES ($1, $2, $3, $4, $5, $6)',
        [orderDbId, item.id, item.quantity, PRODUCT_PRICES[item.id], item.size, item.color]
      );
      const updated = await client.query(
        'UPDATE product_stock SET quantity = quantity - $1 WHERE product_id = $2 AND quantity >= $1 RETURNING quantity',
        [item.quantity, item.id]
      );
      if (!updated.rows[0]) {
        const error = new Error('Stock changed while payment was processing. Contact support before placing another order.');
        error.status = 409;
        throw error;
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ success: true, order_id: orderDbId });
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client?.release();
  }
});

app.get('/api/orders/:id', async (req, res, next) => {
  try {
    const claims = readTokenFromRequest(req);
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid order ID.' });
    const result = await getPool().query(
      `SELECT id, total_amount, created_at, tracking_status, address_line1, city, pincode, phone
       FROM orders WHERE id = $1 AND user_id = $2`,
      [req.params.id, claims.user_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Order not found.' });
    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/orders', async (req, res, next) => {
  try {
    const claims = readTokenFromRequest(req);
    const pool = getPool();
    const adminResult = await pool.query('SELECT COALESCE(is_admin, false) AS is_admin FROM users WHERE id = $1', [claims.user_id]);
    if (!adminResult.rows[0]?.is_admin) return res.status(403).json({ error: 'Forbidden: admins only' });
    const result = await pool.query(
      `SELECT id, created_at, total_amount, tracking_status, address_line1, city, pincode, phone
       FROM orders ORDER BY created_at DESC`
    );
    const output = await Promise.all(result.rows.map(async (row) => {
      const items = await pool.query('SELECT product_id, quantity, size, color FROM order_items WHERE order_id = $1', [row.id]);
      return {
        order_id: row.id,
        created_at: row.created_at,
        total_amount: row.total_amount,
        tracking_status: row.tracking_status,
        address_line1: row.address_line1,
        city: row.city,
        pincode: row.pincode,
        phone: row.phone,
        items: items.rows
      };
    }));
    res.json(output);
  } catch (error) {
    next(error);
  }
});

app.post('/api/admin/orders/status', async (req, res, next) => {
  try {
    const claims = readTokenFromRequest(req);
    const orderId = Number(req.body?.order_id);
    const status = req.body?.status;
    if (!Number.isSafeInteger(orderId) || orderId < 1) return res.status(400).json({ error: 'Invalid order ID.' });
    if (!['Processing', 'Shipped', 'Delivered'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const pool = getPool();
    const adminResult = await pool.query('SELECT COALESCE(is_admin, false) AS is_admin FROM users WHERE id = $1', [claims.user_id]);
    if (!adminResult.rows[0]?.is_admin) return res.status(403).json({ error: 'Forbidden: admins only' });
    const result = await pool.query('UPDATE orders SET tracking_status = $1 WHERE id = $2 RETURNING id', [status, orderId]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Order not found.' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Store newsletter opt-ins durably. Emails are normalized before insertion so the
// unique constraint also prevents duplicate subscriptions with different casing.
app.post('/api/newsletter/subscribe', async (req, res, next) => {
  try {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }

    // Qualify the public schema explicitly: some hosted PostgreSQL URLs set a
    // search_path that does not include public, even when the table exists there.
    const result = await getPool().query(
      `INSERT INTO public.newsletter_subscribers (email)
       VALUES ($1)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email]
    );

    // Return the same success shape for both new and existing subscribers. This
    // makes repeated submissions safe and avoids exposing list membership.
    res.status(result.rows[0] ? 201 : 200).json({
      success: true,
      message: 'Your email has been saved to the Marvaelle release list.'
    });
  } catch (error) {
    // If the relation is still missing, log safe connection/schema diagnostics.
    // This distinguishes a search_path issue from running against a different DB.
    if (error?.code === '42P01') {
      try {
        const diagnostic = await getPool().query(
          `SELECT current_database() AS database_name,
                  current_schema() AS current_schema,
                  current_setting('search_path') AS search_path,
                  to_regclass('public.newsletter_subscribers') AS public_newsletter_table`
        );
        console.error('[newsletter] relation lookup diagnostic', diagnostic.rows[0]);
      } catch (diagnosticError) {
        console.error('[newsletter] diagnostic query failed', diagnosticError.message);
      }
    }
    next(error);
  }
});

app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));

app.use((error, req, res, _next) => {
  if (res.headersSent) return;
  const status = Number.isInteger(error.status) ? error.status :
    error.type === 'entity.parse.failed' ? 400 :
    error.code === '23505' ? 409 : 500;
  const safeMessage = status < 500
    ? error.message
    : error.type === 'entity.parse.failed'
      ? 'Invalid JSON body.'
      : 'Server error. Check the backend runtime logs for the request error.';
  console.error('[api] request failed', {
    method: req.method,
    path: req.path,
    status,
    code: error.code || null,
    error: error.message
  });
  res.status(status).json({ error: safeMessage });
});

export default app;
