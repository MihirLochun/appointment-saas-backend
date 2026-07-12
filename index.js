import express from 'express';
import { pool } from './db.js';

const app = express();
const PORT = 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Appointment SaaS API is running');
});

// ===== CUSTOMERS =====

app.get('/customers', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY customer_id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching customers' });
  }
});

app.get('/customers/:id', async (req, res) => {
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

app.post('/customers', async (req, res) => {
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

app.put('/customers/:id', async (req, res) => {
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

app.delete('/customers/:id', async (req, res) => {
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

// ===== EMPLOYEES =====

app.get('/employees', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employees ORDER BY employee_id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching employees' });
  }
});

app.get('/employees/:id', async (req, res) => {
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

app.post('/employees', async (req, res) => {
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

app.put('/employees/:id', async (req, res) => {
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

app.delete('/employees/:id', async (req, res) => {
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

// ===== SERVICES =====

app.get('/services', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services ORDER BY service_id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching services' });
  }
});

app.get('/services/:id', async (req, res) => {
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

app.post('/services', async (req, res) => {
  const { name, duration_min, price } = req.body;

  // Presence check first: all three fields are required for a service.
  // Note: we check "=== undefined" here instead of "!duration_min",
  // because duration_min: 0 is a real (if invalid) value that was PROVIDED,
  // not a missing one. !0 would be true and wrongly report it as "missing"
  // instead of "invalid" — two different problems that deserve two
  // different, honest error messages.
  if (!name || duration_min === undefined || price === undefined) {
    return res.status(400).json({ error: 'Name, duration_min, and price are required' });
  }

  // Range check: a service must take SOME positive amount of time.
  // duration_min <= 0 correctly rejects both 0 and any negative number,
  // unlike !duration_min which only catches 0 and misses negatives
  // entirely (in JS, any non-zero number, including negatives, is "truthy").
  if (duration_min <= 0) {
    return res.status(400).json({ error: 'duration_min must be greater than 0' });
  }

  // Range check: price must not be negative, but 0 IS allowed
  // (e.g. a free consultation) — hence "< 0", not "<= 0" like above.
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

app.put('/services/:id', async (req, res) => {
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

app.delete('/services/:id', async (req, res) => {
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
    // Recall: services has ON DELETE RESTRICT from appointments.
    // If this service is still referenced by any appointment, Postgres
    // refuses the delete and throws an error, which lands here as a
    // generic 500 right now. A more polished version would detect this
    // specific case and return 409 Conflict with a clearer message
    // ("Cannot delete a service that has existing appointments").
    // Worth revisiting once appointments exist to actually test against.
    res.status(500).json({ error: 'Something went wrong deleting the service' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});