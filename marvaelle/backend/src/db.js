import pg from 'pg';

const { Pool } = pg;
let pool;
let poolUrl;

export function getPool() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is not configured for this deployment.');
  }

  if (!pool || poolUrl !== connectionString) {
    if (pool) {
      // A changed URL is mainly relevant in local development; don't block request startup.
      pool.end().catch((error) => console.error('[db] old pool shutdown failed:', error.message));
    }
    poolUrl = connectionString;
    pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
      statement_timeout: 10_000,
      query_timeout: 12_000,
      keepAlive: true
    });
    pool.on('error', (error) => {
      console.error('[db] idle client error:', error.message);
    });
  }

  return pool;
}
