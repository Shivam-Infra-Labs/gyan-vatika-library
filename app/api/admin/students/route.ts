import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import {
  attendanceSessions,
  auditEvents,
  bookCopies,
  bookLoans,
  bookingRequests,
  books,
  invoices,
  lockerAllocations,
  memberships,
  paymentReversals,
  payments,
  plans,
  seatAllocations,
  seats,
  shifts,
  studentProfiles,
  supportTickets,
  ticketMessages,
} from '@/src/db/schema.ts';
import { authenticateStaff, isSuperAdmin } from '@/src/lib/auth.ts';
import {
  admitStudentTransactional,
  recordAuditEvent,
  SeatConflictError,
  syncMembershipStates,
} from '@/src/lib/domain.ts';

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const staff = auth.staff;
    const centerId = staff.centerId;
    await syncMembershipStates(centerId);

    const detailId = req.nextUrl.searchParams.get('id');
    if (detailId) {
      const studentId = Number(detailId);
      const [student] = await db
        .select()
        .from(studentProfiles)
        .where(
          and(
            eq(studentProfiles.id, studentId),
            eq(studentProfiles.centerId, centerId)
          )
        )
        .limit(1);

      if (!student) {
        return NextResponse.json({ error: 'Student not found' }, { status: 404 });
      }

      const studentMemberships = await db
        .select({
          membership: memberships,
          shift: shifts,
          plan: plans,
        })
        .from(memberships)
        .innerJoin(shifts, eq(memberships.shiftId, shifts.id))
        .innerJoin(plans, eq(memberships.planId, plans.id))
        .where(eq(memberships.studentId, student.id))
        .orderBy(desc(memberships.id));

      const seatHistory = await db
        .select({
          allocation: seatAllocations,
          seat: seats,
          shiftName: shifts.name,
        })
        .from(seatAllocations)
        .innerJoin(seats, eq(seatAllocations.seatId, seats.id))
        .innerJoin(shifts, eq(seatAllocations.shiftId, shifts.id))
        .where(eq(seatAllocations.studentId, student.id))
        .orderBy(desc(seatAllocations.id));

      const studentAttendance = await db
        .select()
        .from(attendanceSessions)
        .where(eq(attendanceSessions.studentId, student.id))
        .orderBy(desc(attendanceSessions.checkInAt))
        .limit(30);

      const studentInvoices = await db
        .select()
        .from(invoices)
        .where(eq(invoices.studentId, student.id))
        .orderBy(desc(invoices.id));

      const studentPayments = await db
        .select()
        .from(payments)
        .where(eq(payments.studentId, student.id))
        .orderBy(desc(payments.paidAt));

      const studentLoans = await db
        .select({
          loan: bookLoans,
          copy: bookCopies,
          book: books,
        })
        .from(bookLoans)
        .innerJoin(bookCopies, eq(bookLoans.copyId, bookCopies.id))
        .innerJoin(books, eq(bookCopies.bookId, books.id))
        .where(eq(bookLoans.studentId, student.id))
        .orderBy(desc(bookLoans.issuedAt));

      const studentTickets = await db
        .select()
        .from(supportTickets)
        .where(eq(supportTickets.studentId, student.id))
        .orderBy(desc(supportTickets.createdAt));

      return NextResponse.json({
        student: {
          ...student,
          pinHash: undefined,
          govIdDocData: undefined,
          hasGovIdDoc: Boolean(student.govIdDocData),
        },
        memberships: studentMemberships,
        seatHistory,
        attendance: studentAttendance,
        invoices: studentInvoices,
        payments: studentPayments,
        loans: studentLoans,
        tickets: studentTickets,
      });
    }

    const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
    const filter = req.nextUrl.searchParams.get('filter') || 'ALL';

    const students = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.centerId, centerId))
      .orderBy(desc(studentProfiles.id));

    const allMemberships = await db
      .select({
        membership: memberships,
        shift: shifts,
        plan: plans,
      })
      .from(memberships)
      .innerJoin(shifts, eq(memberships.shiftId, shifts.id))
      .innerJoin(plans, eq(memberships.planId, plans.id))
      .where(eq(memberships.centerId, centerId))
      .orderBy(desc(memberships.id));

    const activeAllocs = await db
      .select({
        allocation: seatAllocations,
        seatNumber: seats.seatNumber,
      })
      .from(seatAllocations)
      .innerJoin(seats, eq(seatAllocations.seatId, seats.id))
      .where(and(eq(seatAllocations.centerId, centerId), eq(seatAllocations.status, 'ACTIVE')));

    const allInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.centerId, centerId));

    const rows = students.map((s) => {
      const latestMembership = allMemberships.find((m) => m.membership.studentId === s.id);
      const activeAlloc = activeAllocs.find((a) => a.allocation.studentId === s.id);
      const stuInvoices = allInvoices.filter((inv) => inv.studentId === s.id && inv.status !== 'REVERSED');
      const totalBalancePaise = stuInvoices.reduce((acc, inv) => acc + inv.balancePaise, 0);
      const feeStatus =
        totalBalancePaise > 0
          ? stuInvoices.some((inv) => inv.paidPaise > 0)
            ? 'PARTIAL'
            : 'OVERDUE'
          : 'PAID';

      return {
        id: s.id,
        studentCode: s.studentCode,
        fullName: s.fullName,
        phone: s.phone,
        whatsappNumber: s.whatsappNumber,
        email: s.email,
        examTarget: s.examTarget,
        status: s.status,
        govIdType: s.govIdType,
        govIdLast4: s.govIdLast4,
        idProofMode: s.idProofMode,
        idVerificationStatus: s.idVerificationStatus,
        idVerificationNote: s.idVerificationNote,
        hasGovIdDoc: Boolean(s.govIdDocData),
        isLocked: Boolean(s.lockedUntil && new Date(s.lockedUntil) > new Date()),
        membershipId: latestMembership?.membership.id ?? null,
        membershipStatus: latestMembership?.membership.status ?? 'NONE',
        endDate: latestMembership?.membership.endDate ?? null,
        shiftId: latestMembership?.shift.id ?? null,
        shiftName: latestMembership?.shift.name ?? null,
        customSlotLabel: latestMembership?.membership.customSlotLabel || '',
        planName: latestMembership?.plan.name ?? null,
        seatId: activeAlloc?.allocation.seatId ?? null,
        seatNumber: activeAlloc?.seatNumber ?? null,
        balancePaise: totalBalancePaise,
        feeStatus,
      };
    });

    const filtered = rows.filter((r) => {
      if (q) {
        const match =
          r.fullName.toLowerCase().includes(q) ||
          r.phone.toLowerCase().includes(q) ||
          r.studentCode.toLowerCase().includes(q) ||
          (r.seatNumber !== null && String(r.seatNumber).includes(q));
        if (!match) return false;
      }
      if (filter === 'ACTIVE') return r.membershipStatus === 'ACTIVE';
      if (filter === 'EXPIRING_3D') return r.membershipStatus === 'EXPIRING_SOON';
      if (filter === 'IN_GRACE') return r.membershipStatus === 'IN_GRACE';
      if (filter === 'EXPIRED') return r.membershipStatus === 'EXPIRED';
      if (filter === 'OVERDUE_FEES') return r.balancePaise > 0;
      if (filter === 'INACTIVE') return r.status === 'INACTIVE';
      return true;
    });

    return NextResponse.json({ students: filtered });
  } catch (err) {
    console.error('GET /api/admin/students error:', err);
    return NextResponse.json({ error: 'Unable to load students.' }, { status: 500 });
  }
}

const AdmitSchema = z.object({
  existingStudentId: z.number().int().positive().optional(),
  fullName: z.string().trim().min(2),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Valid 10-digit mobile number required'),
  whatsappNumber: z.string().trim().optional().default(''),
  email: z.string().trim().optional().default(''),
  guardianName: z.string().trim().optional().default(''),
  emergencyContactName: z.string().trim().optional().default(''),
  emergencyContactPhone: z.string().trim().optional().default(''),
  address: z.string().trim().optional().default(''),
  examTarget: z.string().trim().optional().default('General'),
  photoUrl: z.string().optional().default(''),
  govIdType: z.string().optional().default(''),
  govIdLast4: z.string().optional().default(''),
  govIdDocData: z.string().optional().default(''),
  idProofMode: z.enum(['OFFLINE', 'ONLINE']).optional(),
  idVerificationStatus: z.enum(['PENDING_OFFLINE', 'UPLOADED', 'VERIFIED']).optional(),
  idVerificationNote: z.string().trim().optional().default(''),
  shiftId: z.number().int().positive(),
  planId: z.number().int().positive(),
  seatId: z.number().int().positive(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  customStartMinute: z.number().int().min(360).max(1380).nullable().optional(),
  customEndMinute: z.number().int().min(360).max(1380).nullable().optional(),
  customSlotLabel: z.string().trim().optional().default(''),
  negotiatedMonthlyFeePaise: z.number().int().positive().nullable().optional(),
  negotiationNote: z.string().trim().optional().default(''),
  extraDiscountPaise: z.number().int().min(0).optional().default(0),
  amountReceivedPaise: z.number().int().min(0),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD']),
  paymentReference: z.string().optional().default(''),
  idempotencyKey: z.string().min(6),
});

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const staff = auth.staff;

    const json = await req.json();
    const parsed = AdmitSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid admission details.' },
        { status: 400 }
      );
    }

    const result = await admitStudentTransactional({
      ...parsed.data,
      centerId: staff.centerId,
      staffUserId: staff.userId,
      staffName: staff.fullName,
      staffRole: staff.role,
      ...(parsed.data.idVerificationStatus === 'VERIFIED'
        ? { idVerifiedAt: new Date(), idVerifiedByUserId: staff.userId }
        : {}),
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof SeatConflictError) {
      return NextResponse.json(
        {
          error: err.message,
          conflictWindow: err.conflictWindow,
          alternatives: err.alternatives,
        },
        { status: 409 }
      );
    }
    console.error('POST /api/admin/students error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unable to complete admission.' },
      { status: 400 }
    );
  }
}

const PatchStudentSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('EDIT_STUDENT'),
    studentId: z.number().int().positive(),
    fullName: z.string().trim().min(2),
    phone: z.string().trim().regex(/^[6-9]\d{9}$/),
    whatsappNumber: z.string().trim().optional().default(''),
    email: z.string().trim().optional().default(''),
    guardianName: z.string().trim().optional().default(''),
    emergencyContactPhone: z.string().trim().optional().default(''),
    address: z.string().trim().optional().default(''),
    examTarget: z.string().trim().optional().default('General'),
    govIdType: z.string().trim().optional().default(''),
    govIdLast4: z.string().trim().optional().default(''),
  }),
  z.object({
    action: z.literal('ARCHIVE_STUDENT'),
    studentId: z.number().int().positive(),
    releaseSeat: z.boolean().default(true),
  }),
  z.object({
    action: z.literal('REACTIVATE_STUDENT'),
    studentId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('UNLOCK_PIN'),
    studentId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('VERIFY_ID_PROOF'),
    studentId: z.number().int().positive(),
    govIdType: z.string().trim().optional(),
    govIdLast4: z
      .string()
      .trim()
      .refine((v) => !v || /^\d{4}$/.test(v), 'ID Last 4 must be 4 digits')
      .optional(),
    idVerificationNote: z.string().trim().optional().default(''),
  }),
  z.object({
    action: z.literal('DELETE_STUDENT'),
    studentId: z.number().int().positive(),
  }),
]);

export async function PATCH(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;

    const json = await req.json();
    const parsed = PatchStudentSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid student update.' },
        { status: 400 }
      );
    }

    if (parsed.data.action === 'EDIT_STUDENT') {
      const d = parsed.data;
      const [updated] = await db
        .update(studentProfiles)
        .set({
          fullName: d.fullName,
          phone: d.phone,
          whatsappNumber: d.whatsappNumber || d.phone,
          email: d.email,
          guardianName: d.guardianName,
          emergencyContactPhone: d.emergencyContactPhone,
          address: d.address,
          examTarget: d.examTarget,
          govIdType: d.govIdType,
          govIdLast4: d.govIdLast4,
          updatedAt: new Date(),
        })
        .where(
          and(eq(studentProfiles.id, d.studentId), eq(studentProfiles.centerId, staff.centerId))
        )
        .returning();

      if (!updated) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'STUDENT_PROFILE_EDITED',
        entityType: 'STUDENT',
        entityId: String(updated.id),
        summary: `Updated profile for ${updated.fullName} (${updated.studentCode}).`,
      });
      return NextResponse.json({ student: updated });
    }

    if (parsed.data.action === 'ARCHIVE_STUDENT') {
      const d = parsed.data;
      const [updated] = await db
        .update(studentProfiles)
        .set({ status: 'INACTIVE', updatedAt: new Date() })
        .where(
          and(eq(studentProfiles.id, d.studentId), eq(studentProfiles.centerId, staff.centerId))
        )
        .returning();

      if (!updated) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });

      if (d.releaseSeat) {
        await db
          .update(seatAllocations)
          .set({ status: 'RELEASED', releasedAt: new Date() })
          .where(
            and(
              eq(seatAllocations.studentId, d.studentId),
              eq(seatAllocations.centerId, staff.centerId),
              eq(seatAllocations.status, 'ACTIVE')
            )
          );
        await db
          .update(memberships)
          .set({ status: 'CANCELLED', updatedAt: new Date() })
          .where(
            and(
              eq(memberships.studentId, d.studentId),
              eq(memberships.centerId, staff.centerId)
            )
          );
      }

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'STUDENT_ARCHIVED',
        entityType: 'STUDENT',
        entityId: String(updated.id),
        summary: `Marked ${updated.fullName} (${updated.studentCode}) INACTIVE${d.releaseSeat ? ' and released assigned desk' : ''}.`,
      });

      return NextResponse.json({ student: updated });
    }

    if (parsed.data.action === 'REACTIVATE_STUDENT') {
      const [updated] = await db
        .update(studentProfiles)
        .set({ status: 'ACTIVE', updatedAt: new Date() })
        .where(
          and(
            eq(studentProfiles.id, parsed.data.studentId),
            eq(studentProfiles.centerId, staff.centerId)
          )
        )
        .returning();

      return NextResponse.json({ student: updated });
    }

    if (parsed.data.action === 'UNLOCK_PIN') {
      const [unlocked] = await db
        .update(studentProfiles)
        .set({ failedLoginAttempts: 0, lockedUntil: null, updatedAt: new Date() })
        .where(
          and(
            eq(studentProfiles.id, parsed.data.studentId),
            eq(studentProfiles.centerId, staff.centerId)
          )
        )
        .returning();

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'STUDENT_PIN_UNLOCKED',
        entityType: 'STUDENT',
        entityId: String(parsed.data.studentId),
        summary: `Cleared PIN lockout for ${unlocked?.fullName || parsed.data.studentId}.`,
      });

      return NextResponse.json({ ok: true });
    }

    if (parsed.data.action === 'VERIFY_ID_PROOF') {
      const verifiedAt = new Date();
      const [updated] = await db
        .update(studentProfiles)
        .set({
          idVerificationStatus: 'VERIFIED',
          idVerifiedAt: verifiedAt,
          idVerifiedByUserId: staff.userId,
          ...(parsed.data.govIdType !== undefined ? { govIdType: parsed.data.govIdType } : {}),
          ...(parsed.data.govIdLast4 !== undefined ? { govIdLast4: parsed.data.govIdLast4 } : {}),
          ...(parsed.data.idVerificationNote !== undefined
            ? { idVerificationNote: parsed.data.idVerificationNote }
            : {}),
          updatedAt: verifiedAt,
        })
        .where(
          and(
            eq(studentProfiles.id, parsed.data.studentId),
            eq(studentProfiles.centerId, staff.centerId)
          )
        )
        .returning();

      if (!updated) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'OFFLINE_ID_VERIFIED',
        entityType: 'STUDENT',
        entityId: String(updated.id),
        summary: `Verified offline ID proof at counter for ${updated.fullName} (${updated.studentCode}).`,
      });

      return NextResponse.json({
        student: {
          ...updated,
          pinHash: undefined,
          govIdDocData: undefined,
          hasGovIdDoc: Boolean(updated.govIdDocData),
        },
      });
    }

    // DELETE_STUDENT (SUPER_ADMIN permanent cascade delete)
    if (!isSuperAdmin(staff)) {
      return NextResponse.json(
        { error: 'Only the Center Owner (SUPER_ADMIN) can permanently delete student records.' },
        { status: 403 }
      );
    }

    const targetId = parsed.data.studentId;
    const deletedMeta = await db.transaction(async (tx) => {
      const [student] = await tx
        .select()
        .from(studentProfiles)
        .where(
          and(eq(studentProfiles.id, targetId), eq(studentProfiles.centerId, staff.centerId))
        )
        .limit(1);

      if (!student) return null;

      await tx
        .update(bookingRequests)
        .set({ approvedStudentId: null, updatedAt: new Date() })
        .where(eq(bookingRequests.approvedStudentId, targetId));

      const activeLoans = await tx
        .select()
        .from(bookLoans)
        .where(
          and(
            eq(bookLoans.studentId, targetId),
            inArray(bookLoans.status, ['ISSUED', 'OVERDUE'])
          )
        );
      if (activeLoans.length > 0) {
        await tx
          .update(bookCopies)
          .set({ status: 'AVAILABLE' })
          .where(
            inArray(
              bookCopies.id,
              activeLoans.map((l) => l.copyId)
            )
          );
      }
      await tx.delete(bookLoans).where(eq(bookLoans.studentId, targetId));

      const studentTickets = await tx
        .select({ id: supportTickets.id })
        .from(supportTickets)
        .where(eq(supportTickets.studentId, targetId));
      if (studentTickets.length > 0) {
        await tx
          .delete(ticketMessages)
          .where(
            inArray(
              ticketMessages.ticketId,
              studentTickets.map((t) => t.id)
            )
          );
        await tx.delete(supportTickets).where(eq(supportTickets.studentId, targetId));
      }

      await tx.delete(attendanceSessions).where(eq(attendanceSessions.studentId, targetId));

      const studentPayments = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.studentId, targetId));
      const studentInvoices = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(eq(invoices.studentId, targetId));

      if (studentPayments.length > 0) {
        await tx
          .delete(paymentReversals)
          .where(
            inArray(
              paymentReversals.paymentId,
              studentPayments.map((p) => p.id)
            )
          );
      }
      if (studentInvoices.length > 0) {
        await tx
          .delete(paymentReversals)
          .where(
            inArray(
              paymentReversals.invoiceId,
              studentInvoices.map((i) => i.id)
            )
          );
      }

      await tx.delete(payments).where(eq(payments.studentId, targetId));
      await tx.delete(invoices).where(eq(invoices.studentId, targetId));
      await tx.delete(seatAllocations).where(eq(seatAllocations.studentId, targetId));
      await tx.delete(lockerAllocations).where(eq(lockerAllocations.studentId, targetId));
      await tx.delete(memberships).where(eq(memberships.studentId, targetId));
      await tx.delete(studentProfiles).where(eq(studentProfiles.id, targetId));

      await tx.insert(auditEvents).values({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'STUDENT_PERMANENTLY_DELETED',
        entityType: 'STUDENT',
        entityId: String(targetId),
        summary: `Permanently deleted student ${student.fullName} (${student.studentCode}) and cascaded linked records.`,
      });

      return { id: targetId, fullName: student.fullName, studentCode: student.studentCode };
    });

    if (!deletedMeta) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, student: deletedMeta });
  } catch (err) {
    console.error('PATCH /api/admin/students error:', err);
    return NextResponse.json({ error: 'Unable to update student.' }, { status: 500 });
  }
}
