import { Pool } from 'pg';

const pool: Pool = new Pool({
  connectionString: process.env.DATABASE,
});

export default pool;
