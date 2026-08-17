import bcrypt from 'bcrypt';
import { pool } from './db.js';

async function createSuperAdmin() {
  const name = 'Platform Admin';
  const email = 'mihirlochun@gmail.com'; // change this to your real email
  const password = 'superSecret123'; // change this to a real password
  const businessId = 1; // required by the NOT NULL constraint, but never
                          // actually used for anything -- super_admin routes
                          // never filter by business_id

  const passwordHash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, business_id)
     VALUES ($1, $2, $3, 'super_admin', $4)`,
    [name, email, passwordHash, businessId]
  );

  console.log('Super admin account created successfully.');
  process.exit(0);
}

createSuperAdmin().catch((err) => {
  console.error('Failed to create super admin:', err);
  process.exit(1);
});