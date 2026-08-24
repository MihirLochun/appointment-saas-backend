import express from 'express';
import { pool } from './db.js';
import { notifyNewAppointment } from './notifications.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cors from 'cors';


function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // The JWT now carries business_id alongside user_id and role, set at
    // login time. This means every route below can scope its queries to
    // req.user.business_id without an extra database lookup.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.user_id || !decoded.business_id || !decoded.role) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireOwner(req, res) {
  if (req.user.role !== 'owner') {
    res.status(403).json({ error: 'Only the owner can perform this action' });
    return true;
  }
  return false;
}

function requireSuperAdmin(req, res) {
  if (req.user.role !== 'super_admin') {
    res.status(403).json({ error: 'Only a super admin can perform this action' });
    return true;
  }
  return false;
}

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Appointment SaaS API is running');
});

// ===== AUTH =====

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { user_id: user.user_id, role: user.role, business_id: user.business_id },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        business_id: user.business_id,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong logging in' });
  }
});

// An owner creates staff accounts for THEIR OWN business only -- the new
// user's business_id always comes from the logged-in owner's own token,
// never from the request body, so an owner can never accidentally (or
// deliberately) create an account under a different business.
app.post('/register', requireAuth, async (req, res) => {
  if (requireOwner(req, res)) return;

  const { name, email, password, role, employee_id } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, employee_id, business_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING user_id, name, email, role, employee_id, business_id, created_at`,
      [name, email, passwordHash, role || 'staff', employee_id || null, req.user.business_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the account' });
  }
});

// ===== SUPER ADMIN =====
// Platform-level routes for creating, listing, and managing businesses.
// Only accessible to the super_admin role -- ordinary owners/staff never
// see or reach these.

app.get('/admin/businesses', requireAuth, async (req, res) => {
  if (requireSuperAdmin(req, res)) return;

  try {
    const result = await pool.query('SELECT * FROM businesses ORDER BY business_id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching businesses' });
  }
});

app.get('/admin/businesses/:id', requireAuth, async (req, res) => {
  if (requireSuperAdmin(req, res)) return;

  try {
    const result = await pool.query(
      'SELECT * FROM businesses WHERE business_id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching the business' });
  }
});

// Creates a brand-new business AND its first owner account together, in a
// single transaction. This is the "allocate a dashboard" action: a new
// businesses row plus a new users row (role 'owner') linked to it.
app.post('/admin/businesses', requireAuth, async (req, res) => {
  if (requireSuperAdmin(req, res)) return;

  const { businessName, slug, description, ownerName, ownerEmail, ownerPassword } = req.body;

  if (!businessName || !slug || !ownerName || !ownerEmail || !ownerPassword) {
    return res.status(400).json({
      error: 'businessName, slug, ownerName, ownerEmail, and ownerPassword are required',
    });
  }

  const client = await pool.connect();

  try {
    // A transaction ensures BOTH the business and its owner are created
    // together, or neither is -- we never want a business with no owner,
    // or an owner account pointing at a business that doesn't exist.
    await client.query('BEGIN');

    const businessResult = await client.query(
      `INSERT INTO businesses (name, slug, description)
       VALUES ($1, $2, $3)
       RETURNING business_id, name, slug`,
      [businessName, slug, description || null]
    );
    const businessId = businessResult.rows[0].business_id;

    const passwordHash = await bcrypt.hash(ownerPassword, 10);

    await client.query(
      `INSERT INTO users (name, email, password_hash, role, business_id)
       VALUES ($1, $2, $3, 'owner', $4)`,
      [ownerName, ownerEmail, passwordHash, businessId]
    );

    await client.query('COMMIT');

    res.status(201).json(businessResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That business slug or owner email is already taken' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the business' });
  } finally {
    client.release();
  }
});

// Edit a business's core details (name/slug/description). Used by the
// "Edit" button in BusinessTable.jsx.
//
// NOTE: this assumes `businesses.name`, `.slug`, and `.description`
// already exist (they do, per the original schema). If you see a
// "column does not exist" error here, check your migrations.
app.patch('/admin/businesses/:id', requireAuth, async (req, res) => {
  if (requireSuperAdmin(req, res)) return;

  const { name, slug, description } = req.body;

  try {
    const result = await pool.query(
      `UPDATE businesses
       SET name = $1,
           slug = $2,
           description = $3,
           updated_at = now()
       WHERE business_id = $4
       RETURNING *`,
      [name, slug, description, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);

    if (err.code === '23505') {
      return res.status(409).json({ error: 'Slug already exists' });
    }

    res.status(500).json({ error: 'Something went wrong updating the business' });
  }
});

// Suspend/activate a business. Used by the "Suspend"/"Activate" button
// in BusinessTable.jsx.
//
// IMPORTANT: this requires an `is_active` column on `businesses`. That
// column is NOT in the original schema list from the handoff doc
// (business_id, name, slug, description, logo_url, settings). If this
// route 500s with something like `column "is_active" does not exist`,
// you need a migration to add it first, e.g.:
//
//   pgm.addColumn('businesses', {
//     is_active: { type: 'boolean', notNull: true, default: true },
//   });
app.patch('/admin/businesses/:id/status', requireAuth, async (req, res) => {
  if (requireSuperAdmin(req, res)) return;

  const { is_active } = req.body;

  try {
    const result = await pool.query(
      `UPDATE businesses
       SET is_active = $1,
           updated_at = now()
       WHERE business_id = $2
       RETURNING *`,
      [is_active, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Business not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong updating status' });
  }
});

app.get('/business', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM businesses WHERE business_id = $1', [req.user.business_id]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching your business' });
  }
});

app.patch('/business', requireAuth, async (req, res) => {
  if (requireOwner(req, res)) return;

  const { description, logo_url } = req.body;

  try {
    const result = await pool.query(
      `UPDATE businesses SET description = $1, logo_url = $2, updated_at = now()
       WHERE business_id = $3 RETURNING *`,
      [description || null, logo_url || null, req.user.business_id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong updating your business' });
  }
});

// ===== CUSTOMERS =====
// Every query below is scoped to req.user.business_id -- this is the
// actual multi-tenancy enforcement. Same pattern repeats across every
// entity: WHERE business_id = $N on every SELECT/UPDATE/DELETE, and
// business_id included on every INSERT.

app.get('/customers', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM customers WHERE business_id = $1 ORDER BY customer_id',
      [req.user.business_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching customers' });
  }
});

app.get('/customers/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM customers WHERE customer_id = $1 AND business_id = $2',
      [id, req.user.business_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching the customer' });
  }
});

app.post('/customers', requireAuth, async (req, res) => {
  const { name, phone, address } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO customers (name, phone, address, business_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, phone, address, req.user.business_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the customer' });
  }
});

app.put('/customers/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, phone, address } = req.body;

  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone are required' });
  }

  try {
    const result = await pool.query(
      `UPDATE customers SET name = $1, phone = $2, address = $3, updated_at = now()
       WHERE customer_id = $4 AND business_id = $5 RETURNING *`,
      [name, phone, address, id, req.user.business_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong updating the customer' });
  }
});

app.delete('/customers/:id', requireAuth, async (req, res) => {
  if (requireOwner(req, res)) return;

  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM customers WHERE customer_id = $1 AND business_id = $2 RETURNING *',
      [id, req.user.business_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting the customer' });
  }
});

// ===== EMPLOYEES =====

app.get('/employees', requireAuth, async (req, res) => {
  if (requireOwner(req, res)) return;

  try {
    const result = await pool.query(
      'SELECT * FROM employees WHERE business_id = $1 ORDER BY employee_id',
      [req.user.business_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching employees' });
  }
});

app.get('/employees/:id', requireAuth, async (req, res) => {
  if (requireOwner(req, res)) return;

  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM employees WHERE employee_id = $1 AND business_id = $2',
      [id, req.user.business_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching the employee' });
  }
});

app.post('/employees', requireAuth, async (req, res) => {
  if (requireOwner(req, res)) return;

  const { name, phone, address } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO employees (name, phone, address, business_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, phone, address, req.user.business_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the employee' });
  }
});

app.put('/employees/:id', requireAuth, async (req, res) => {
  if (requireOwner(req, res)) return;

  const { id } = req.params;
  const { name, phone, address } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const result = await pool.query(
      `UPDATE employees SET name = $1, phone = $2, address = $3, updated_at = now()
       WHERE employee_id = $4 AND business_id = $5 RETURNING *`,
      [name, phone, address, id, req.user.business_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong updating the employee' });
  }
});

app.delete('/employees/:id', requireAuth, async (req, res) => {
  if (requireOwner(req, res)) return;

  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM employees WHERE employee_id = $1 AND business_id = $2 RETURNING *',
      [id, req.user.business_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting the employee' });
  }
});

// ===== SERVICES =====
// Both roles can VIEW services within their own business. Only the owner
// can create/edit/delete.

app.get('/services', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM services WHERE business_id = $1 ORDER BY service_id',
      [req.user.business_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching services' });
  }
});

app.get('/services/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM services WHERE service_id = $1 AND business_id = $2',
      [id, req.user.business_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching the service' });
  }
});

app.post('/services', requireAuth, async (req, res) => {
  if (requireOwner(req, res)) return;

  const { name, duration_min, price } = req.body;

  if (!name || duration_min === undefined || price === undefined) {
    return res.status(400).json({ error: 'Name, duration_min, and price are required' });
  }

  if (duration_min <= 0) {
    return res.status(400).json({ error: 'duration_min must be greater than 0' });
  }

  if (price < 0) {
    return res.status(400).json({ error: 'price cannot be negative' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO services (name, duration_min, price, business_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [name, duration_min, price, req.user.business_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the service' });
  }
});

app.put('/services/:id', requireAuth, async (req, res) => {
  if (requireOwner(req, res)) return;

  const { id } = req.params;
  const { name, duration_min, price } = req.body;

  if (!name || duration_min === undefined || price === undefined) {
    return res.status(400).json({ error: 'Name, duration_min, and price are required' });
  }

  if (duration_min <= 0) {
    return res.status(400).json({ error: 'duration_min must be greater than 0' });
  }

  if (price < 0) {
    return res.status(400).json({ error: 'price cannot be negative' });
  }

  try {
    const result = await pool.query(
      `UPDATE services SET name = $1, duration_min = $2, price = $3, updated_at = now()
       WHERE service_id = $4 AND business_id = $5 RETURNING *`,
      [name, duration_min, price, id, req.user.business_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong updating the service' });
  }
});

app.delete('/services/:id', requireAuth, async (req, res) => {
  if (requireOwner(req, res)) return;

  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM services WHERE service_id = $1 AND business_id = $2 RETURNING *',
      [id, req.user.business_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting the service' });
  }
});

// ===== PUBLIC (slug-based) =====
// No auth here -- a public visitor isn't logged in, so there's no
// business_id on a token to read. Instead, the URL itself names the
// business by its slug, and we resolve that to a business_id first,
// before touching any other table.

async function resolveBusinessBySlug(slug) {
  const result = await pool.query('SELECT business_id FROM businesses WHERE slug = $1', [slug]);
  return result.rows.length > 0 ? result.rows[0].business_id : null;
}

app.get('/public/:slug/services', async (req, res) => {
  try {
    const businessId = await resolveBusinessBySlug(req.params.slug);
    if (!businessId) return res.status(404).json({ error: 'Business not found' });

    const result = await pool.query(
      'SELECT service_id, name, duration_min, price FROM services WHERE business_id = $1 ORDER BY name',
      [businessId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching services' });
  }
});

app.get('/public/:slug/employees', async (req, res) => {
  try {
    const businessId = await resolveBusinessBySlug(req.params.slug);
    if (!businessId) return res.status(404).json({ error: 'Business not found' });

    const result = await pool.query(
      'SELECT employee_id, name FROM employees WHERE business_id = $1 ORDER BY name',
      [businessId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching employees' });
  }
});

app.get('/public/:slug/availability', async (req, res) => {
  const { service_id, employee_id, date } = req.query;

  if (!service_id || !date) {
    return res.status(400).json({ error: 'service_id and date are required' });
  }

  try {
    const businessId = await resolveBusinessBySlug(req.params.slug);
    if (!businessId) return res.status(404).json({ error: 'Business not found' });

    const serviceResult = await pool.query(
      'SELECT duration_min FROM services WHERE service_id = $1 AND business_id = $2',
      [service_id, businessId]
    );
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    const durationMin = serviceResult.rows[0].duration_min;

    const dayOfWeek = new Date(date).getDay();

    const hoursResult = await pool.query(
      'SELECT is_closed, open_time, close_time FROM business_hours WHERE business_id = $1 AND day_of_week = $2',
      [businessId, dayOfWeek]
    );
    const hours = hoursResult.rows[0];

    if (!hours || hours.is_closed) {
      return res.json({ slots: [] });
    }

    const openTime = new Date(`${date}T${hours.open_time}`);
    const closeTime = new Date(`${date}T${hours.close_time}`);

    const slots = [];
    const SLOT_INTERVAL_MINUTES = 15;

    for (
      let slotStart = new Date(openTime);
      new Date(slotStart.getTime() + durationMin * 60000) <= closeTime;
      slotStart = new Date(slotStart.getTime() + SLOT_INTERVAL_MINUTES * 60000)
    ) {
      const conflict = employee_id
        ? await hasConflict(employee_id, slotStart.toISOString(), durationMin)
        : false;

      if (!conflict) {
        slots.push(slotStart.toISOString());
      }
    }

    res.json({ slots });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong computing availability' });
  }
});

app.post('/public/:slug/appointments', async (req, res) => {
  const { name, phone, service_id, employee_id, start_time } = req.body;

  if (!name || !phone || !service_id || !start_time) {
    return res.status(400).json({ error: 'name, phone, service_id, and start_time are required' });
  }

  if (new Date(start_time) < new Date()) {
    return res.status(400).json({ error: 'Cannot book an appointment in the past' });
  }

  try {
    const businessId = await resolveBusinessBySlug(req.params.slug);
    if (!businessId) return res.status(404).json({ error: 'Business not found' });

    const serviceCheck = await pool.query(
      'SELECT duration_min FROM services WHERE service_id = $1 AND business_id = $2',
      [service_id, businessId]
    );
    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    const durationMin = serviceCheck.rows[0].duration_min;

    if (employee_id) {
      const employeeCheck = await pool.query(
        'SELECT employee_id FROM employees WHERE employee_id = $1 AND business_id = $2',
        [employee_id, businessId]
      );
      if (employeeCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
    }

    if (await hasConflict(employee_id, start_time, durationMin)) {
      return res.status(409).json({ error: 'That time slot is no longer available' });
    }

    // Customers are matched by phone WITHIN this business only -- the
    // same phone number at two different businesses correctly creates
    // two separate customer rows, one per business.
    let customerResult = await pool.query(
      'SELECT customer_id FROM customers WHERE phone = $1 AND business_id = $2',
      [phone, businessId]
    );

    let customerId;
    if (customerResult.rows.length > 0) {
      customerId = customerResult.rows[0].customer_id;
    } else {
      const newCustomer = await pool.query(
        'INSERT INTO customers (name, phone, business_id) VALUES ($1, $2, $3) RETURNING customer_id',
        [name, phone, businessId]
      );
      customerId = newCustomer.rows[0].customer_id;
    }

    const insertResult = await pool.query(
      `INSERT INTO appointments (customer_id, employee_id, service_id, start_time, business_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING appointment_id`,
      [customerId, employee_id || null, service_id, start_time, businessId]
    );

    const newId = insertResult.rows[0].appointment_id;
    const fullResult = await pool.query(`${APPOINTMENT_SELECT} WHERE a.appointment_id = $1`, [newId]);
    const appointment = formatAppointment(fullResult.rows[0]);

    res.status(201).json(appointment);
    notifyNewAppointment(appointment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the appointment' });
  }
});

// ===== APPOINTMENTS =====

const APPOINTMENT_SELECT = `
  SELECT
    a.appointment_id,
    a.start_time,
    a.status,
    a.created_at,
    a.updated_at,
    a.business_id,
    c.customer_id,
    c.name AS customer_name,
    c.phone AS customer_phone,
    e.employee_id,
    e.name AS employee_name,
    s.service_id,
    s.name AS service_name,
    s.duration_min,
    s.price
  FROM appointments a
  JOIN customers c ON a.customer_id = c.customer_id
  LEFT JOIN employees e ON a.employee_id = e.employee_id
  JOIN services s ON a.service_id = s.service_id
`;

function formatAppointment(row) {
  return {
    appointment_id: row.appointment_id,
    customer: { customer_id: row.customer_id, name: row.customer_name, phone: row.customer_phone },
    employee: row.employee_id
      ? { employee_id: row.employee_id, name: row.employee_name }
      : null,
    service: {
      service_id: row.service_id,
      name: row.service_name,
      duration_min: row.duration_min,
      price: row.price,
    },
    start_time: row.start_time,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function staffFilterClause(req, params) {
  if (req.user.role !== 'staff') return '';
  params.push(req.user.user_id);
  return ` AND a.employee_id = (SELECT employee_id FROM users WHERE user_id = $${params.length})`;
}

app.get('/appointments', requireAuth, async (req, res) => {
  try {
    const params = [req.user.business_id];
    let query = `${APPOINTMENT_SELECT} WHERE a.business_id = $1`;
    query += staffFilterClause(req, params);
    query += ' ORDER BY a.start_time';

    const result = await pool.query(query, params);
    res.json(result.rows.map(formatAppointment));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching appointments' });
  }
});

app.get('/appointments/today', requireAuth, async (req, res) => {
  try {
    const params = [req.user.business_id];
    let query = `${APPOINTMENT_SELECT}
       WHERE a.business_id = $1
         AND a.start_time >= date_trunc('day', now())
         AND a.start_time < date_trunc('day', now()) + interval '1 day'`;
    query += staffFilterClause(req, params);
    query += ' ORDER BY a.start_time';

    const result = await pool.query(query, params);
    res.json(result.rows.map(formatAppointment));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong fetching today's appointments" });
  }
});

app.get('/appointments/week', requireAuth, async (req, res) => {
  try {
    const params = [req.user.business_id];
    let query = `${APPOINTMENT_SELECT}
       WHERE a.business_id = $1
         AND a.start_time >= date_trunc('day', now())
         AND a.start_time < date_trunc('day', now()) + interval '7 days'`;
    query += staffFilterClause(req, params);
    query += ' ORDER BY a.start_time';

    const result = await pool.query(query, params);
    res.json(result.rows.map(formatAppointment));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong fetching this week's appointments" });
  }
});

app.get('/appointments/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `${APPOINTMENT_SELECT} WHERE a.appointment_id = $1 AND a.business_id = $2`,
      [id, req.user.business_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.json(formatAppointment(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching the appointment' });
  }
});

async function hasConflict(employeeId, startTime, durationMin, excludeAppointmentId = null) {
  if (!employeeId) return false;

  const result = await pool.query(
    `SELECT a.appointment_id
     FROM appointments a
     JOIN services s ON a.service_id = s.service_id
     WHERE a.employee_id = $1
       AND a.status != 'cancelled'
       AND ($4::int IS NULL OR a.appointment_id != $4)
       AND a.start_time < ($2::timestamp + ($3 || ' minutes')::interval)
       AND $2::timestamp < (a.start_time + (s.duration_min || ' minutes')::interval)`,
    [employeeId, startTime, durationMin, excludeAppointmentId]
  );

  return result.rows.length > 0;
}

app.post('/appointments', requireAuth, async (req, res) => {
  const { customer_id, employee_id, service_id, start_time } = req.body;

  if (!customer_id || !service_id || !start_time) {
    return res.status(400).json({ error: 'customer_id, service_id, and start_time are required' });
  }

  if (new Date(start_time) < new Date()) {
    return res.status(400).json({ error: 'Cannot book an appointment in the past' });
  }

  try {
    const customerCheck = await pool.query(
      'SELECT customer_id FROM customers WHERE customer_id = $1 AND business_id = $2',
      [customer_id, req.user.business_id]
    );
    if (customerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const serviceCheck = await pool.query(
      'SELECT duration_min FROM services WHERE service_id = $1 AND business_id = $2',
      [service_id, req.user.business_id]
    );
    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    const durationMin = serviceCheck.rows[0].duration_min;

    if (employee_id) {
      const employeeCheck = await pool.query(
        'SELECT employee_id FROM employees WHERE employee_id = $1 AND business_id = $2',
        [employee_id, req.user.business_id]
      );
      if (employeeCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
    }

    if (await hasConflict(employee_id, start_time, durationMin)) {
      return res.status(409).json({ error: 'This employee already has an appointment during that time' });
    }

    const insertResult = await pool.query(
      `INSERT INTO appointments (customer_id, employee_id, service_id, start_time, business_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING appointment_id`,
      [customer_id, employee_id || null, service_id, start_time, req.user.business_id]
    );

    const newId = insertResult.rows[0].appointment_id;
    const fullResult = await pool.query(`${APPOINTMENT_SELECT} WHERE a.appointment_id = $1`, [newId]);
    const appointment = formatAppointment(fullResult.rows[0]);

    res.status(201).json(appointment);

    notifyNewAppointment(appointment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the appointment' });
  }
});

app.put('/appointments/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { customer_id, employee_id, service_id, start_time } = req.body;

  if (!customer_id || !service_id || !start_time) {
    return res.status(400).json({ error: 'customer_id, service_id, and start_time are required' });
  }

  try {
    const serviceCheck = await pool.query(
      'SELECT duration_min FROM services WHERE service_id = $1 AND business_id = $2',
      [service_id, req.user.business_id]
    );
    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    const durationMin = serviceCheck.rows[0].duration_min;

    if (await hasConflict(employee_id, start_time, durationMin, id)) {
      return res.status(409).json({ error: 'This employee already has an appointment during that time' });
    }

    const result = await pool.query(
      `UPDATE appointments
       SET customer_id = $1, employee_id = $2, service_id = $3, start_time = $4, updated_at = now()
       WHERE appointment_id = $5 AND business_id = $6
       RETURNING appointment_id`,
      [customer_id, employee_id || null, service_id, start_time, id, req.user.business_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const fullResult = await pool.query(`${APPOINTMENT_SELECT} WHERE a.appointment_id = $1`, [id]);
    res.json(formatAppointment(fullResult.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong updating the appointment' });
  }
});

// This route was the one that had the bug: two unrelated admin/businesses
// routes were accidentally pasted INSIDE this handler's try block. They've
// been moved back up to the SUPER ADMIN section above, as standalone
// top-level app.patch(...) calls. This handler is now self-contained again.
app.patch('/appointments/:id/cancel', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE appointments SET status = 'cancelled', updated_at = now()
       WHERE appointment_id = $1 AND business_id = $2 RETURNING appointment_id`,
      [id, req.user.business_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    const fullResult = await pool.query(`${APPOINTMENT_SELECT} WHERE a.appointment_id = $1`, [id]);
    res.json(formatAppointment(fullResult.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong cancelling the appointment' });
  }
});

app.delete('/appointments/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM appointments WHERE appointment_id = $1 AND business_id = $2 RETURNING *',
      [id, req.user.business_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting the appointment' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});