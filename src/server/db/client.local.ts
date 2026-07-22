/**
 * Local-dev DB client.
 *
 * Identical to client.ts but uses config.local.ts so the server starts
 * cleanly on developer machines without /local/config.json.
 *
 * In the builder the immutable client.ts is used directly (production path).
 * Locally, any file that needs the DB client can import from './client.local'
 * instead of './client' to get the env-var fallback behaviour.
 *
 * NOTE: This file is intentionally NOT marked immutable.
 */
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { getDatabaseCredentials } from "./config.local";
import * as schema from "./schema";

// Get database configuration (env-var aware for local dev)
const dbConfig = getDatabaseCredentials();

// Create MySQL connection pool
const poolConnection = mysql.createPool({
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  ssl: {
    rejectUnauthorized: false,
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Create Drizzle instance
export const db = drizzle(poolConnection, { schema, mode: "default" });

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    const connection = await poolConnection.getConnection();
    await connection.ping();
    connection.release();
    return true;
  } catch {
    return false;
  }
}

/**
 * Close database connection pool
 */
export async function closeConnection(): Promise<void> {
  await poolConnection.end();
}
