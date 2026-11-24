import { eq, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { db } from '../db/index.ts';
import { rateLimits } from '../db/schema.ts';

export function getClientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'local-client';
}

export async function checkRateLimit(params: {
  req: NextRequest;
  bucket: string;
  maxRequests?: number;
  windowMs?: number;
}): Promise<{ allowed: boolean; retryAfterSec: number; remaining: number }> {
  const maxRequests = params.maxRequests ?? 5;
  const windowMs = params.windowMs ?? 15 * 60 * 1000;
  const ip = getClientIp(params.req);
  const key = `${params.bucket}:${ip}`;
  const now = new Date();
  const windowStartCutoff = new Date(now.getTime() - windowMs);

  const [existing] = await db
    .select()
    .from(rateLimits)
    .where(eq(rateLimits.key, key))
    .limit(1);

  if (!existing) {
    await db
      .insert(rateLimits)
      .values({ key, count: 1, windowStart: now })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: { count: 1, windowStart: now },
      });
    return { allowed: true, retryAfterSec: 0, remaining: Math.max(0, maxRequests - 1) };
  }

  const existingStart = new Date(existing.windowStart);
  if (existingStart < windowStartCutoff) {
    await db
      .update(rateLimits)
      .set({ count: 1, windowStart: now })
      .where(eq(rateLimits.key, key));
    return { allowed: true, retryAfterSec: 0, remaining: Math.max(0, maxRequests - 1) };
  }

  if (existing.count >= maxRequests) {
    const resetAt = existingStart.getTime() + windowMs;
    const retryAfterSec = Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000));
    return { allowed: false, retryAfterSec, remaining: 0 };
  }

  await db
    .update(rateLimits)
    .set({ count: sql`${rateLimits.count} + 1` })
    .where(eq(rateLimits.key, key));

  return {
    allowed: true,
    retryAfterSec: 0,
    remaining: Math.max(0, maxRequests - (existing.count + 1)),
  };
}
