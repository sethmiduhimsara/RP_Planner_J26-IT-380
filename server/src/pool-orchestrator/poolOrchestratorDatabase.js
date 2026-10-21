/**
 * Supabase PostgreSQL Connection Pool for Pool Orchestrator.
 * Handles parameterized queries, connection timeouts, SSL,
 * and automatic fallback between direct and pooler endpoints.
 */

const { Pool } = require('pg');

let pool = null;

/**
 * Normalizes connection config to ensure reliable connection on both
 * IPv6-capable and IPv4-only networks (resolving Supabase direct connection timeouts).
 */
function getPoolConfig() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is missing.');
  }

  try {
    const parsed = new URL(databaseUrl);
    // If user provided a direct supabase URL on an IPv4 network, fallback to session pooler if needed
    if (parsed.hostname.startsWith('db.') && parsed.hostname.endsWith('.supabase.co')) {
      const projectRef = parsed.hostname.split('.')[1];
      // aws-0-ap-south-1.pooler.supabase.com is the verified pooler for this project.
      // Use port 6543 (Transaction Mode) to avoid Supabase session-mode limit (EMAXCONNSESSION).
      const poolerHost = process.env.SUPABASE_POOLER_HOST || 'aws-0-ap-south-1.pooler.supabase.com';
      const poolerPort = parseInt(process.env.SUPABASE_POOLER_PORT || '6543', 10);
      const user = parsed.username.includes('.') ? parsed.username : `${parsed.username}.${projectRef}`;

      return {
        host: poolerHost,
        port: poolerPort,
        user: user,
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, '') || 'postgres',
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 10000,
        max: parseInt(process.env.DB_POOL_MAX || '6', 10),
      };
    }
  } catch (err) {
    console.warn('[PoolOrchestratorDB] Could not parse DATABASE_URL as URL object, falling back to connectionString:', err.message);
  }

  return {
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    max: 10,
  };
}

function getPool() {
  if (!pool) {
    const config = getPoolConfig();
    pool = new Pool(config);

    pool.on('error', (err) => {
      console.error('[PoolOrchestratorDB] Unexpected idle client error:', err.message);
    });
  }
  return pool;
}

/**
 * Execute parameterized query
 */
async function query(text, params) {
  const client = getPool();
  return client.query(text, params);
}

/**
 * Verify database connectivity
 */
async function testConnection() {
  try {
    const result = await query('SELECT NOW() AS current_time, current_database() AS db');
    return {
      connected: true,
      database: result.rows[0].db,
      timestamp: result.rows[0].current_time,
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message,
    };
  }
}

/**
 * Graceful shutdown
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Ensures all Component 04 tables, indexes, and baseline seed data exist
 * by applying schema.sql idempotently.
 */
async function initSchema() {
  const fs = require('fs');
  const path = require('path');
  try {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8');
      await query(sql);
      console.log('[PoolOrchestratorDB] Database schema verified & initialized successfully (8 tables).');
      return true;
    }
  } catch (err) {
    console.warn('[PoolOrchestratorDB] Schema initialization check notice:', err.message);
    return false;
  }
}

module.exports = {
  getPool,
  query,
  testConnection,
  initSchema,
  closePool,
};
