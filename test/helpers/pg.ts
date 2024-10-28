import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5433,
  user: 'postgres',
  password: 'postgres',
  database: 'node_operator_keys_service_db',
});

// Function to truncate all tables using the pool
export async function truncateTables() {
  const client = await pool.connect();
  try {
    // Truncate tables
    await client.query(
      `TRUNCATE registry_key, registry_operator, el_meta_entity, sr_module_entity`,
    );
    console.log('All tables truncated successfully');
  } catch (error) {
    console.error('Error truncating tables:', error);
  } finally {
    try {
      await client.release(); // Release the client back to the pool
    } catch {
      console.log('release err');
    }
  }
}
