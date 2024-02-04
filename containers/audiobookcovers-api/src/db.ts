import { Pool } from 'pg';

const pool: Pool = new Pool({
  connectionString: process.env.DATABASE,
});

export const query = async (text: string, params: Array<any>) => {
  const start = performance.now();
  const res = await pool.query(text, params);
  const duration = Math.trunc(performance.now() - start);
  console.log(`Executed query: { rows: ${res.rowCount}, duration: ${duration}} `);
  return res;
};

export const getClient = () => {
  return pool.connect();
};
