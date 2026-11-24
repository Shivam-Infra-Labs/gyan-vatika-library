import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { centers, staffAccess, users } from '../db/schema.ts';
import { adminAuth } from './firebase-admin.ts';

export type StaffRole = 'SUPER_ADMIN' | 'MANAGER';

export interface StaffContext {
  userId: number;
  uid: string;
  email: string;
  fullName: string;
  role: StaffRole;
  centerId: number;
}

export type StaffAuthOutcome =
  | { ok: true; staff: StaffContext }
  | { ok: false; status: 401 | 403; error: string };

export function hashAdminPin(pin: string): string {
  return crypto.createHash('sha256').update(`gv-admin-pin:${pin.trim()}`).digest('hex');
}

export function verifyAdminPin(pin: string, hash: string): boolean {
  if (!hash) return false;
  const expected = hashAdminPin(pin);
  if (expected.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash));
}

export async function authenticateStaff(req: NextRequest): Promise<StaffAuthOutcome> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Unauthorized: sign in with Google to access staff controls.' };
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return { ok: false, status: 401, error: 'Unauthorized: missing authentication token.' };
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const email = (decoded.email || '').trim().toLowerCase();
    if (!email) {
      return { ok: false, status: 403, error: 'Access Denied: verified Google email is required.' };
    }
    const fullName = decoded.name || email.split('@')[0] || 'Center Staff';

    const allCenters = await db.select().from(centers).limit(1);
    const defaultCenterId = allCenters[0]?.id;
    if (!defaultCenterId) {
      return { ok: false, status: 401, error: 'Center configuration not initialized.' };
    }

    // Check explicit whitelist in staff_access
    const whitelistEntries = await db
      .select()
      .from(staffAccess)
      .where(eq(staffAccess.centerId, defaultCenterId));

    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.centerId, defaultCenterId));

    // Sync any existing active users into staff_access if staff_access is initially empty
    if (whitelistEntries.length === 0 && existingUsers.length > 0) {
      for (const u of existingUsers) {
        if (u.isActive && u.email) {
          await db
            .insert(staffAccess)
            .values({
              centerId: defaultCenterId,
              email: u.email.trim().toLowerCase(),
              fullName: u.fullName,
              role: u.role,
              isActive: true,
              createdByUserId: u.id,
            })
            .onConflictDoNothing();
        }
      }
    }

    const [whitelistMatch] = await db
      .select()
      .from(staffAccess)
      .where(
        and(
          eq(staffAccess.centerId, defaultCenterId),
          sql`lower(${staffAccess.email}) = ${email}`
        )
      )
      .limit(1);

    const anyAccessRows = await db
      .select({ id: staffAccess.id })
      .from(staffAccess)
      .where(eq(staffAccess.centerId, defaultCenterId))
      .limit(1);

    // Bootstrap only if literally zero staff exist in both tables
    let assignedRole: StaffRole = 'MANAGER';
    if (anyAccessRows.length === 0 && existingUsers.length === 0) {
      assignedRole = 'SUPER_ADMIN';
      await db
        .insert(staffAccess)
        .values({
          centerId: defaultCenterId,
          email,
          fullName,
          role: 'SUPER_ADMIN',
          isActive: true,
        })
        .onConflictDoNothing();
    } else if (!whitelistMatch || !whitelistMatch.isActive) {
      return {
        ok: false,
        status: 403,
        error: `Access Denied: ${email} is not authorized on the Gyan Vatika Library staff whitelist.`,
      };
    } else {
      assignedRole = (whitelistMatch.role as StaffRole) || 'MANAGER';
    }

    const existingByUid = await db
      .select()
      .from(users)
      .where(eq(users.uid, decoded.uid))
      .limit(1);

    if (existingByUid[0]) {
      if (!existingByUid[0].isActive) {
        return {
          ok: false,
          status: 403,
          error: 'Access Denied: this staff profile has been deactivated by the owner.',
        };
      }
      if (existingByUid[0].role !== assignedRole) {
        await db
          .update(users)
          .set({ role: assignedRole, email, updatedAt: new Date() })
          .where(eq(users.id, existingByUid[0].id));
      }
      return {
        ok: true,
        staff: {
          userId: existingByUid[0].id,
          uid: existingByUid[0].uid,
          email,
          fullName: existingByUid[0].fullName || fullName,
          role: assignedRole,
          centerId: existingByUid[0].centerId,
        },
      };
    }

    const inserted = await db
      .insert(users)
      .values({
        uid: decoded.uid,
        centerId: defaultCenterId,
        email,
        fullName: whitelistMatch?.fullName || fullName,
        role: assignedRole,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: { email, fullName, role: assignedRole, updatedAt: new Date() },
      })
      .returning();

    const userRow = inserted[0];
    return {
      ok: true,
      staff: {
        userId: userRow.id,
        uid: userRow.uid,
        email: userRow.email,
        fullName: userRow.fullName,
        role: (userRow.role as StaffRole) || assignedRole,
        centerId: userRow.centerId,
      },
    };
  } catch (err) {
    console.error('Staff auth verification failed:', err);
    return { ok: false, status: 401, error: 'Unauthorized: invalid or expired session.' };
  }
}

export async function getStaffFromRequest(req: NextRequest): Promise<StaffContext | null> {
  const res = await authenticateStaff(req);
  return res.ok ? res.staff : null;
}

export function isSuperAdmin(staff: StaffContext): boolean {
  return staff.role === 'SUPER_ADMIN';
}
