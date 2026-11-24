import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import { bookingRequests, plans, shifts } from '@/src/db/schema.ts';
import {
  calculateQuote,
  computeSeatAvailability,
  recordAuditEvent,
  resolveShiftMinutes,
} from '@/src/lib/domain.ts';

const AdmissionSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required'),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit Indian mobile number'),
  whatsappNumber: z.string().trim().optional().default(''),
  email: z.string().trim().email('Valid email required').optional().or(z.literal('')),
  guardianName: z.string().trim().min(2, 'Guardian / Father name is required'),
  emergencyContactPhone: z.string().trim().min(10, 'Emergency contact number is required'),
  address: z.string().trim().min(5, 'Residential address is required'),
  examTarget: z.string().trim().min(2, 'Exam or course target is required'),
  photoUrl: z.string().max(1_500_000).optional().default(''),
  idProofMode: z.enum(['OFFLINE', 'ONLINE']).optional().default('OFFLINE'),
  govIdType: z.string().trim().optional().default(''),
  govIdLast4: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{4}$/.test(v), 'Enter 4 digits for ID last 4 if provided')
    .optional()
    .default(''),
  govIdDocData: z.string().max(2_500_000).optional().default(''),
  rulesAccepted: z.boolean().refine((v) => v === true, 'Please accept library silence & conduct rules'),
  shiftId: z.number().int().positive(),
  planId: z.number().int().positive(),
  seatId: z.number().int().positive().nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  customStartMinute: z.number().int().min(360).max(1380).nullable().optional(),
  customEndMinute: z.number().int().min(360).max(1380).nullable().optional(),
  customSlotLabel: z.string().trim().optional().default(''),
  idempotencyKey: z.string().min(6),
});

export async function POST(req: NextRequest) {
  try {
    const centerId = await ensureSeeded();
    const json = await req.json();
    const parsed = AdmissionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Please complete all required admission fields.' },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const existing = await db
      .select()
      .from(bookingRequests)
      .where(eq(bookingRequests.idempotencyKey, data.idempotencyKey))
      .limit(1);

    if (existing[0]) {
      return NextResponse.json({
        request: existing[0],
        statusLabel: 'Online admission submitted — awaiting reception verification',
      });
    }

    const [shiftRow] = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.id, data.shiftId), eq(shifts.centerId, centerId)))
      .limit(1);
    const [planRow] = await db
      .select()
      .from(plans)
      .where(and(eq(plans.id, data.planId), eq(plans.centerId, centerId)))
      .limit(1);

    if (!shiftRow || !planRow) {
      return NextResponse.json({ error: 'Selected shift or plan was not found.' }, { status: 404 });
    }

    const resolvedWindow = resolveShiftMinutes({
      shift: shiftRow,
      customStartMinute: data.customStartMinute,
      customEndMinute: data.customEndMinute,
      customSlotLabel: data.customSlotLabel,
    });

    let verifiedSeatId: number | null = null;
    let verifiedSeatNumber: number | null = null;
    if (data.seatId) {
      const availability = await computeSeatAvailability({
        centerId,
        shiftId: shiftRow.id,
        startDate: data.startDate,
        durationMonths: planRow.durationMonths,
        customStartMinute: resolvedWindow.startMinute,
        customEndMinute: resolvedWindow.endMinute,
      });
      const found = availability.seats.find((s) => s.seatId === data.seatId);
      if (!found || found.availability !== 'AVAILABLE') {
        return NextResponse.json(
          { error: `Desk #${found?.seatNumber ?? data.seatId} is not available for the chosen shift & date.` },
          { status: 409 }
        );
      }
      verifiedSeatId = found.seatId;
      verifiedSeatNumber = found.seatNumber;
    }

    const quote = calculateQuote({
      shiftMonthlyPaise: shiftRow.monthlyFeePaise,
      durationMonths: planRow.durationMonths,
      discountPercent: planRow.discountPercent,
    });

    const referenceCode = `ADM-${data.startDate.slice(0, 4)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}${String(Date.now()).slice(-2)}`;
    const idVerificationStatus =
      data.idProofMode === 'ONLINE' && Boolean(data.govIdDocData) ? 'UPLOADED' : 'PENDING_OFFLINE';

    const [created] = await db
      .insert(bookingRequests)
      .values({
        centerId,
        referenceCode,
        fullName: data.fullName,
        phone: data.phone,
        whatsappNumber: data.whatsappNumber || data.phone,
        email: data.email || '',
        guardianName: data.guardianName,
        emergencyContactPhone: data.emergencyContactPhone,
        address: data.address,
        examTarget: data.examTarget,
        photoUrl: data.photoUrl || '',
        govIdType: data.govIdType || '',
        govIdLast4: data.govIdLast4 || '',
        govIdDocData: data.govIdDocData || '',
        idProofMode: data.idProofMode,
        idVerificationStatus,
        rulesAccepted: data.rulesAccepted,
        requestSource: 'ADMISSION_FORM',
        shiftId: shiftRow.id,
        planId: planRow.id,
        seatId: verifiedSeatId,
        lockerRequested: false,
        startDate: data.startDate,
        customStartMinute: shiftRow.isFlexible ? resolvedWindow.startMinute : null,
        customEndMinute: shiftRow.isFlexible ? resolvedWindow.endMinute : null,
        customSlotLabel: shiftRow.isFlexible ? resolvedWindow.slotLabel : '',
        quotedTotalPaise: quote.totalPaise,
        status: 'PENDING',
        idempotencyKey: data.idempotencyKey,
      })
      .returning();

    await recordAuditEvent({
      centerId,
      actorType: 'SYSTEM',
      actorId: data.phone,
      actorName: data.fullName,
      action: 'ADMISSION_FORM_SUBMITTED',
      entityType: 'BOOKING_REQUEST',
      entityId: String(created.id),
      summary: `Online admission KYC form ${created.referenceCode} submitted by ${data.fullName} (${shiftRow.name}, ID mode: ${data.idProofMode}).`,
    });

    return NextResponse.json(
      {
        request: {
          ...created,
          govIdDocData: undefined,
          hasGovIdDoc: Boolean(created.govIdDocData),
        },
        seatNumber: verifiedSeatNumber,
        shiftName: shiftRow.name,
        shiftHours: resolvedWindow.slotLabel,
        planName: planRow.name,
        quote,
        statusLabel: 'Online admission submitted — awaiting reception approval',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/public/admission error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unable to submit online admission form.' },
      { status: 400 }
    );
  }
}
