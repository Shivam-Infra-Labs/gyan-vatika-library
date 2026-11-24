import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

const COOKIE_NAME = 'gv_student_session';

function getSessionSecret(): string {
  return (
    process.env.STUDENT_SESSION_SECRET ||
    process.env.SQL_PASSWORD ||
    'gyan-vatika-preview-session-key'
  );
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin.trim(), 10);
}

export function hashPinSync(pin: string): string {
  return bcrypt.hashSync(pin.trim(), 10);
}

export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!storedHash || !storedHash.startsWith('$2')) {
    return false;
  }
  return bcrypt.compare(pin.trim(), storedHash);
}

export interface StudentSessionPayload {
  studentId: number;
  centerId: number;
  studentCode: string;
  exp: number;
}

export function signStudentToken(payload: Omit<StudentSessionPayload, 'exp'>): string {
  const full: StudentSessionPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 14, // 14 days
  };
  const data = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSessionSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function verifyStudentToken(token: string | undefined): StudentSessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expected = crypto.createHmac('sha256', getSessionSecret()).update(data).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as StudentSessionPayload;
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function getStudentSessionFromCookies(): Promise<StudentSessionPayload | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  return verifyStudentToken(raw);
}

export function getStudentCookieOptions(req?: NextRequest) {
  const isHttps =
    req?.headers.get('x-forwarded-proto') === 'https' ||
    req?.nextUrl?.protocol === 'https:' ||
    process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: isHttps,
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  };
}

export const STUDENT_COOKIE_NAME = COOKIE_NAME;
