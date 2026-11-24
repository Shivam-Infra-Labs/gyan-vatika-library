import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import { bookingRequests } from '@/src/db/schema.ts';
import { authenticateStaff } from '@/src/lib/auth.ts';
import {
  admitStudentTransactional,
  recordAuditEvent,
  SeatConflictError,
} from '@/src/lib/domain.ts';

const ActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('APPROVE'),
    requestId: z.number().int().positive(),
    seatId: z.number().int().positive().optional(),
    shiftId: z.number().int().positive().optional(),
    planId: z.number().int().positive().optional(),
    customStartMinute: z.number().int().min(360).max(1380).nullable().optional(),
    customEndMinute: z.number().int().min(360).max(1380).nullable().optional(),
    customSlotLabel: z.string().trim().optional(),
    negotiatedMonthlyFeePaise: z.number().int().positive().nullable().optional(),
    negotiationNote: z.string().trim().optional(),
    extraDiscountPaise: z.number().int().min(0).optional().default(0),
    amountReceivedPaise: z.number().int().min(0),
    paymentMethod: z.enum(['CASH', 'UPI', 'CARD']),
    paymentReference: z.string().optional().default(''),
    idempotencyKey: z.string().min(6),
  }),
  z.object({
    action: z.literal('REJECT'),
    requestId: z.number().int().positive(),
    reviewNote: z.string().trim().min(2),
  }),
  z.object({
    action: z.literal('VERIFY_ID_PROOF'),
    requestId: z.number().int().positive(),
    govIdType: z.string().trim().optional(),
    govIdLast4: z
      .string()
      .trim()
      .refine((v) => !v || /^\d{4}$/.test(v), 'ID Last 4 must be 4 digits')
      .optional(),
    idVerificationNote: z.string().trim().optional().default(''),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;

    const json = await req.json();
    const parsed = ActionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request action.' },
        { status: 400 }
      );
    }

    const [reqRow] = await db
      .select()
      .from(bookingRequests)
      .where(
        and(
          eq(bookingRequests.id, parsed.data.requestId),
          eq(bookingRequests.centerId, staff.centerId)
        )
      )
      .limit(1);

    if (!reqRow) {
      return NextResponse.json({ error: 'Booking request not found.' }, { status: 404 });
    }
    if (reqRow.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Request ${reqRow.referenceCode} has already been ${reqRow.status.toLowerCase()}.` },
        { status: 409 }
      );
    }

    if (parsed.data.action === 'REJECT') {
      const [updated] = await db
        .update(bookingRequests)
        .set({
          status: 'REJECTED',
          reviewNote: parsed.data.reviewNote,
          updatedAt: new Date(),
        })
        .where(eq(bookingRequests.id, reqRow.id))
        .returning();

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'BOOKING_REQUEST_REJECTED',
        entityType: 'BOOKING_REQUEST',
        entityId: String(reqRow.id),
        summary: `Rejected booking request ${reqRow.referenceCode}: ${parsed.data.reviewNote}`,
      });

      return NextResponse.json({ request: updated });
    }

    if (parsed.data.action === 'VERIFY_ID_PROOF') {
      const verifiedAt = new Date();
      const [updated] = await db
        .update(bookingRequests)
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
        .where(eq(bookingRequests.id, reqRow.id))
        .returning();

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'OFFLINE_ID_VERIFIED',
        entityType: 'BOOKING_REQUEST',
        entityId: String(reqRow.id),
        summary: `Verified offline ID proof at counter for admission request ${reqRow.referenceCode} (${reqRow.fullName}).`,
      });

      return NextResponse.json({
        request: {
          ...updated,
          govIdDocData: undefined,
          hasGovIdDoc: Boolean(updated.govIdDocData),
        },
      });
    }

    const targetSeatId = parsed.data.seatId ?? reqRow.seatId;
    if (!targetSeatId) {
      return NextResponse.json({ error: 'Select a desk before approving.' }, { status: 400 });
    }

    const admission = await admitStudentTransactional({
      centerId: staff.centerId,
      fullName: reqRow.fullName,
      phone: reqRow.phone,
      whatsappNumber: reqRow.whatsappNumber || reqRow.phone,
      email: reqRow.email,
      guardianName: reqRow.guardianName,
      emergencyContactPhone: reqRow.emergencyContactPhone,
      address: reqRow.address,
      examTarget: reqRow.examTarget,
      photoUrl: reqRow.photoUrl,
      govIdType: reqRow.govIdType,
      govIdLast4: reqRow.govIdLast4,
      govIdDocData: reqRow.govIdDocData,
      idProofMode: reqRow.idProofMode === 'ONLINE' ? 'ONLINE' : 'OFFLINE',
      idVerificationStatus:
        reqRow.idVerificationStatus === 'VERIFIED' ||
        reqRow.idVerificationStatus === 'UPLOADED' ||
        reqRow.idVerificationStatus === 'PENDING_OFFLINE'
          ? reqRow.idVerificationStatus
          : 'PENDING_OFFLINE',
      idVerificationNote: reqRow.idVerificationNote,
      idVerifiedAt: reqRow.idVerifiedAt,
      idVerifiedByUserId: reqRow.idVerifiedByUserId,
      rulesAccepted: reqRow.rulesAccepted,
      shiftId: parsed.data.shiftId ?? reqRow.shiftId,
      planId: parsed.data.planId ?? reqRow.planId,
      seatId: targetSeatId,
      startDate: reqRow.startDate,
      customStartMinute: parsed.data.customStartMinute ?? reqRow.customStartMinute,
      customEndMinute: parsed.data.customEndMinute ?? reqRow.customEndMinute,
      customSlotLabel: parsed.data.customSlotLabel ?? reqRow.customSlotLabel,
      negotiatedMonthlyFeePaise:
        parsed.data.negotiatedMonthlyFeePaise ?? reqRow.negotiatedMonthlyFeePaise,
      negotiationNote: parsed.data.negotiationNote ?? reqRow.negotiationNote,
      extraDiscountPaise: parsed.data.extraDiscountPaise,
      amountReceivedPaise: parsed.data.amountReceivedPaise,
      paymentMethod: parsed.data.paymentMethod,
      paymentReference: parsed.data.paymentReference,
      idempotencyKey: parsed.data.idempotencyKey,
      staffUserId: staff.userId,
      staffName: staff.fullName,
      staffRole: staff.role,
    });

    await db
      .update(bookingRequests)
      .set({
        status: 'APPROVED',
        approvedStudentId: admission.student.id,
        seatId: targetSeatId,
        negotiatedMonthlyFeePaise:
          parsed.data.negotiatedMonthlyFeePaise ?? reqRow.negotiatedMonthlyFeePaise,
        negotiationNote: parsed.data.negotiationNote ?? reqRow.negotiationNote,
        updatedAt: new Date(),
      })
      .where(eq(bookingRequests.id, reqRow.id));

    return NextResponse.json({
      approved: true,
      requestCode: reqRow.referenceCode,
      ...admission,
    });
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
    console.error('POST /api/admin/booking-requests error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unable to process request.' },
      { status: 400 }
    );
  }
}
