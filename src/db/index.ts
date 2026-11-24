import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  var _postgresPool: Pool | undefined;
}

const TRANSIENT_CODES = new Set([
  '57P01',
  '57P02',
  '57P03',
  '53300',
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  'ECONNRESET',
  'ECONNREFUSED',
  'ECONNABORTED',
  'ENOENT',
  'EPIPE',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

const TRANSIENT_MESSAGE_SNIPPETS = [
  'connection terminated',
  'connection ended',
  'connection reset',
  'connection refused',
  'connection aborted',
  'timeout exceeded when trying to connect',
  'connect enoent',
  'enoent',
  'econnrefused',
  'econnreset',
  'epipe',
  'etimedout',
  'econnaborted',
  'socket hang up',
  'terminating connection',
  'the database system is starting up',
  'database system is starting up',
  'the database system is shutting down',
  'client has encountered a connection error',
  'sorry, too many clients already',
  'remaining connection slots are reserved',
  'could not connect to server',
];

function extractCauseMeta(
  err: unknown,
  visited = new Set<unknown>()
): { code: string | null; message: string; causeCode: string | null; causeMessage: string | null } {
  if (!err || typeof err !== 'object') {
    return { code: null, message: String(err ?? ''), causeCode: null, causeMessage: null };
  }
  const e = err as { code?: unknown; message?: unknown; cause?: unknown; errors?: unknown[] };
  const topCode = typeof e.code === 'string' ? e.code : null;
  const topMessage = typeof e.message === 'string' ? e.message : String(err);

  let leafCode: string | null = null;
  let leafMessage: string | null = null;
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object' || visited.has(node)) return;
    visited.add(node);
    const n = node as { code?: unknown; message?: unknown; cause?: unknown; errors?: unknown[] };
    if (typeof n.code === 'string' && !leafCode) leafCode = n.code;
    if (typeof n.message === 'string' && n.message && n !== err) leafMessage = n.message;
    if (n.cause) walk(n.cause);
    if (Array.isArray(n.errors)) {
      for (const inner of n.errors) walk(inner);
    }
  };
  if (e.cause) walk(e.cause);
  if (Array.isArray(e.errors)) {
    for (const inner of e.errors) walk(inner);
  }

  return {
    code: topCode,
    message: topMessage,
    causeCode: leafCode,
    causeMessage: leafMessage,
  };
}

export function isTransientDbError(err: unknown, visited = new Set<unknown>()): boolean {
  if (!err || typeof err !== 'object' || visited.has(err)) return false;
  visited.add(err);
  const e = err as { code?: unknown; message?: unknown; cause?: unknown; errors?: unknown[] };
  if (typeof e.code === 'string' && TRANSIENT_CODES.has(e.code)) return true;

  const msg = String(e.message || '').toLowerCase();
  if (msg && TRANSIENT_MESSAGE_SNIPPETS.some((snippet) => msg.includes(snippet))) {
    return true;
  }

  if (e.cause && isTransientDbError(e.cause, visited)) return true;
  if (Array.isArray(e.errors)) {
    for (const inner of e.errors) {
      if (isTransientDbError(inner, visited)) return true;
    }
  }
  return false;
}

export async function withDbRetry<T>(
  operation: () => Promise<T>,
  label = 'db-query',
  maxRetries = 4
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastErr = err;
      const transient = isTransientDbError(err);
      const meta = extractCauseMeta(err);
      console.error(`[DB ${label}] attempt=${attempt + 1}/${maxRetries + 1} transient=${transient}`, {
        code: meta.code,
        causeCode: meta.causeCode,
        causeMessage: meta.causeMessage,
        message: meta.message,
      });
      if (!transient || attempt === maxRetries) {
        throw err;
      }
      const delayMs = Math.min(250 * 2 ** attempt, 2000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 20000,
      idleTimeoutMillis: 20000,
      allowExitOnIdle: false,
      keepAlive: true,
      keepAliveInitialDelayMillis: 5000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', {
        code: (err as { code?: string })?.code || null,
        message: err.message,
      });
    });
  }
  return global._postgresPool;
};

export const pool = createPool();
export const db = drizzle(pool, { schema });
