import express from 'express';
import { pool } from './db.js';
import { notifyNewAppointment } from './notifications.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cors from 'cors';

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  // Tokens are sent as: "Authorization: Bearer <token>"
  // If there's no header, or it doesn't start with "Bearer ", reject immediately.
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // jwt.verify checks the signature AND expiry in one step. If the token
    // was tampered with, or signed with a different secret, or expired,
    // this throws -- caught below.
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the decoded user info to the request object itself, so any
    // route handler further down the chain can access req.user without
    // needing to re-verify anything.
    req.user = decoded;

    next(); // proceed to the actual route handler
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Public health check -- no auth needed.
app.get('/', (req, res) => {
  res.send('Appointment SaaS API is running');
});

// ===== AUTH (public -- these are how you GET a token in the first place) =====

app.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING user_id, name, email, role, created_at`,
      [name, email, passwordHash, role || 'staff']
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
      { user_id: user.user_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: { user_id: user.user_id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong logging in' });
  }
});

// ===== CUSTOMERS (protected -- requireAuth added as 2nd argument) =====

app.get('/customers', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY customer_id');
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
      'SELECT * FROM customers WHERE customer_id = $1',
      [id]
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
      'INSERT INTO customers (name, phone, address) VALUES ($1, $2, $3) RETURNING *',
      [name, phone, address]
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
      'UPDATE customers SET name = $1, phone = $2, address = $3, updated_at = now() WHERE customer_id = $4 RETURNING *',
      [name, phone, address, id]
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
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM customers WHERE customer_id = $1 RETURNING *',
      [id]
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

// ===== EMPLOYEES (protected) =====

app.get('/employees', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employees ORDER BY employee_id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching employees' });
  }
});

app.get('/employees/:id', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM employees WHERE employee_id = $1',
      [id]
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
  const { name, phone, address } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO employees (name, phone, address) VALUES ($1, $2, $3) RETURNING *',
      [name, phone, address]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the employee' });
  }
});

app.put('/employees/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { name, phone, address } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const result = await pool.query(
      'UPDATE employees SET name = $1, phone = $2, address = $3, updated_at = now() WHERE employee_id = $4 RETURNING *',
      [name, phone, address, id]
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
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM employees WHERE employee_id = $1 RETURNING *',
      [id]
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

// ===== SERVICES (protected) =====

app.get('/services', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services ORDER BY service_id');
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
      'SELECT * FROM services WHERE service_id = $1',
      [id]
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
      'INSERT INTO services (name, duration_min, price) VALUES ($1, $2, $3) RETURNING *',
      [name, duration_min, price]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the service' });
  }
});

app.put('/services/:id', requireAuth, async (req, res) => {
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
      'UPDATE services SET name = $1, duration_min = $2, price = $3, updated_at = now() WHERE service_id = $4 RETURNING *',
      [name, duration_min, price, id]
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
  const { id } = req.params;

  try {
    const result = await pool.query(
      'DELETE FROM services WHERE service_id = $1 RETURNING *',
      [id]
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

// ===== APPOINTMENTS (protected) =====
//
// This section is more involved than customers/employees/services because
// an appointment (a) references three other tables at once, (b) needs a
// real business rule enforced (no double-booking an employee), and (c) is
// where the notification side-effect is triggered after a successful save.

const APPOINTMENT_SELECT = `
  SELECT
    a.appointment_id,
    a.start_time,
    a.status,
    a.created_at,
    a.updated_at,
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

app.get('/appointments', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`${APPOINTMENT_SELECT} ORDER BY a.start_time`);
    res.json(result.rows.map(formatAppointment));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching appointments' });
  }
});

app.get('/appointments/today', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `${APPOINTMENT_SELECT}
       WHERE a.start_time >= date_trunc('day', now())
         AND a.start_time < date_trunc('day', now()) + interval '1 day'
       ORDER BY a.start_time`
    );
    res.json(result.rows.map(formatAppointment));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong fetching today's appointments" });
  }
});

app.get('/appointments/week', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `${APPOINTMENT_SELECT}
       WHERE a.start_time >= date_trunc('day', now())
         AND a.start_time < date_trunc('day', now()) + interval '7 days'
       ORDER BY a.start_time`
    );
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
      `${APPOINTMENT_SELECT} WHERE a.appointment_id = $1`,
      [id]
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
    const customerCheck = await pool.query('SELECT customer_id FROM customers WHERE customer_id = $1', [customer_id]);
    if (customerCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const serviceCheck = await pool.query('SELECT duration_min FROM services WHERE service_id = $1', [service_id]);
    if (serviceCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    const durationMin = serviceCheck.rows[0].duration_min;

    if (employee_id) {
      const employeeCheck = await pool.query('SELECT employee_id FROM employees WHERE employee_id = $1', [employee_id]);
      if (employeeCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
    }

    if (await hasConflict(employee_id, start_time, durationMin)) {
      return res.status(409).json({ error: 'This employee already has an appointment during that time' });
    }

    const insertResult = await pool.query(
      `INSERT INTO appointments (customer_id, employee_id, service_id, start_time)
       VALUES ($1, $2, $3, $4)
       RETURNING appointment_id`,
      [customer_id, employee_id || null, service_id, start_time]
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
    const serviceCheck = await pool.query('SELECT duration_min FROM services WHERE service_id = $1', [service_id]);
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
       WHERE appointment_id = $5
       RETURNING appointment_id`,
      [customer_id, employee_id || null, service_id, start_time, id]
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

app.patch('/appointments/:id/cancel', requireAuth, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE appointments SET status = 'cancelled', updated_at = now()
       WHERE appointment_id = $1 RETURNING appointment_id`,
      [id]
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
      'DELETE FROM appointments WHERE appointment_id = $1 RETURNING *',
      [id]
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