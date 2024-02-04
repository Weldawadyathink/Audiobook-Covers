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

process.on("SIGINT", async () => {
  console.log("SIGINT signal received: closing HTTP server");
  try {
    await pool.end();
    console.log("Database pool has been closed");
  } catch (error) {
    console.error("Error closing the database pool", error);
  }
});
