import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Local Postgres (Docker on localhost) never needs SSL. Any other host
// (Render's internal network, or anywhere else we deploy to) does.
const isLocal = process.env.DATABASE_URL.includes('localhost');

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});