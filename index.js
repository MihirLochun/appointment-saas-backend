import express from 'express';
import { pool } from './db.js';
import { notifyNewAppointment } from './notifications.js';

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
    res.status(500).json({ error: 'Something went wrong deleting the service' });
  }
});

// ===== APPOINTMENTS =====
//
// This section is more involved than customers/employees/services because
// an appointment (a) references three other tables at once, (b) needs a
// real business rule enforced (no double-booking an employee), and (c) is
// where the notification side-effect is triggered after a successful save.

// Shared SQL fragment: JOIN pulls in the related customer, employee, and
// service data so the API returns nested objects (per API_DESIGN.md)
// instead of forcing the frontend to make 3 extra requests per appointment
// just to display names. LEFT JOIN is used for employees specifically
// because employee_id is nullable (an appointment can be unassigned).
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

// Reshapes one flat SQL row (with joined columns) into the nested JSON
// shape defined in API_DESIGN.md.
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

app.get('/appointments', async (req, res) => {
  try {
    const result = await pool.query(`${APPOINTMENT_SELECT} ORDER BY a.start_time`);
    res.json(result.rows.map(formatAppointment));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong fetching appointments' });
  }
});

app.get('/appointments/today', async (req, res) => {
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

app.get('/appointments/week', async (req, res) => {
  try {
    // "This week" = the next 7 days starting from today. A calendar UI
    // might later want a proper Mon-Sun week instead -- easy to adjust
    // this WHERE clause once the frontend defines exactly what it needs.
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

app.get('/appointments/:id', async (req, res) => {
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

// Checks whether a proposed [start, start + duration) window overlaps any
// EXISTING, non-cancelled appointment for the same employee. Two time
// ranges [A_start, A_end) and [B_start, B_end) overlap exactly when:
//   A_start < B_end  AND  B_start < A_end
// excludeAppointmentId lets PUT (editing an appointment) ignore the
// appointment's own existing row when checking for conflicts.
async function hasConflict(employeeId, startTime, durationMin, excludeAppointmentId = null) {
  if (!employeeId) return false; // unassigned appointments can't conflict

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

app.post('/appointments', async (req, res) => {
  const { customer_id, employee_id, service_id, start_time } = req.body;

  if (!customer_id || !service_id || !start_time) {
    return res.status(400).json({ error: 'customer_id, service_id, and start_time are required' });
  }

  if (new Date(start_time) < new Date()) {
    return res.status(400).json({ error: 'Cannot book an appointment in the past' });
  }

  try {
    // Verify the referenced customer and service actually exist.
    // The database's foreign key constraints would catch this too, but
    // checking explicitly here lets us return a clear 404 instead of a
    // generic 500 from a raw constraint violation.
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

    // Business rule: cannot double-book an employee.
    if (await hasConflict(employee_id, start_time, durationMin)) {
      return res.status(409).json({ error: 'This employee already has an appointment during that time' });
    }

    // status is deliberately NOT accepted from the client -- it always
    // starts as 'scheduled' via the column's DEFAULT, set server-side only.
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

    // Fire-and-forget: this happens AFTER the response is already sent.
    // If this fails, the appointment still exists -- exactly per our
    // architecture decision that notifications never affect booking success.
    notifyNewAppointment(appointment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the appointment' });
  }
});

app.put('/appointments/:id', async (req, res) => {
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

    // Business rule: cannot move this appointment onto a slot that
    // conflicts with a DIFFERENT appointment (excludeAppointmentId lets it
    // ignore a conflict with its own current row).
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

// Cancelling is a distinct business ACTION, not a generic field edit --
// it has its own endpoint (per API_DESIGN.md) so it's easy to attach
// cancel-specific logic later (e.g. freeing the slot is automatic, since
// hasConflict() already ignores rows with status = 'cancelled').
app.patch('/appointments/:id/cancel', async (req, res) => {
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

app.delete('/appointments/:id', async (req, res) => {
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