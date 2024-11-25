import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const POSTGRES_PORT = process.env.POSTGRES_PORT || 5432;

export async function truncateTables() {
  const client = new Client({
    host: 'localhost',
    port: POSTGRES_PORT,
    user: 'postgres',
    password: 'postgres',
    database: 'node_operator_keys_service_db',
  });

  try {
    await client.connect();
    await client.query(
      `TRUNCATE registry_key, registry_operator, el_meta_entity, sr_module_entity`,
    );
    console.log('All tables truncated successfully');
  } catch (error) {
    console.error('Error truncating tables:', error);
  } finally {
    await client.end();
    console.log('Database connection closed');
  }
}
