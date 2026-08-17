import bcrypt from 'bcrypt';
import { pool } from './db.js';

async function createOwner() {
  const name = 'Mihir Owner';
  const email = 'mihir@example.com';
  const password = 'supersecret123';
  const businessId = 1; // "Demo Barbershop", created by the businesses migration

  const passwordHash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, business_id)
     VALUES ($1, $2, $3, 'owner', $4)`,
    [name, email, passwordHash, businessId]
  );

  console.log('Owner account created successfully.');
  process.exit(0);
}

createOwner().catch((err) => {
  console.error('Failed to create owner:', err);
  process.exit(1);
});