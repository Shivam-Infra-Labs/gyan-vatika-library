import crypto from 'node:crypto';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db, withDbRetry } from '../db/index.ts';
import {
  auditEvents,
  centers,
  invoices,
  memberships,
  payments,
  plans,
  rooms,
  seatAllocations,
  seats,
  shifts,
  studentProfiles,
} from '../db/schema.ts';
import {
  addDaysDateStr,
  addMonthsDateStr,
  dateRangesOverlap,
  formatMinuteRangeLabel,
  shiftIntervalsOverlap,
  todayIST,
} from './format.ts';
import { hashPin } from './student-session.ts';

export type SeatVisualStatus = 'AVAILABLE' | 'OCCUPIED' | 'EXPIRING_SOON' | 'UNAVAILABLE';

export interface SeatAvailabilityItem {
  seatId: number;
  seatNumber: number;
  label: string;
  gridX: number;
  gridY: number;
  zone: string;
  hasPowerOutlet: boolean;
  nearWindow: boolean;
  nearAc: boolean;
  seatStatus: string;
  notes: string;
  availability: SeatVisualStatus;
  conflictReason?: string;
  expiringOn?: string;
}

function getQrSecret(): string {
  return (
    process.env.STUDENT_SESSION_SECRET ||
    process.env.SQL_PASSWORD ||
    'gyan-vatika-reception-qr-secret'
  );
}

export function generateRotatingReceptionQr(centerId: number, nowMs = Date.now()) {
  const bucket = Math.floor(nowMs / 60000);
  const expiresMs = (bucket + 1) * 60000;
  const payload = `${centerId}:${bucket}`;
  const sig = crypto.createHmac('sha256', getQrSecret()).update(payload).digest('hex').slice(0, 16).toUpperCase();
  const token = `GV-RECP-${centerId}-${bucket}-${sig}`;
  return {
    token,
    expiresAt: new Date(expiresMs).toISOString(),
    secondsRemaining: Math.max(1, Math.ceil((expiresMs - nowMs) / 1000)),
  };
}

export function verifyRotatingReceptionQr(centerId: number, token: string, nowMs = Date.now()): boolean {
  const match = /^GV-RECP-(\d+)-(\d+)-([A-F0-9]{16})$/.exec(token.trim());
  if (!match) return false;
  const tokenCenterId = Number(match[1]);
  const tokenBucket = Number(match[2]);
  const tokenSig = match[3];
  if (tokenCenterId !== centerId) return false;

  const currentBucket = Math.floor(nowMs / 60000);
  // Allow current 60s window and immediate previous 60s window to absorb boundary scan lag
  if (tokenBucket < currentBucket - 1 || tokenBucket > currentBucket) return false;

  const expectedSig = crypto
    .createHmac('sha256', getQrSecret())
    .update(`${tokenCenterId}:${tokenBucket}`)
    .digest('hex')
    .slice(0, 16)
    .toUpperCase();

  return crypto.timingSafeEqual(Buffer.from(tokenSig), Buffer.from(expectedSig));
}

export function resolveShiftMinutes(params: {
  shift: {
    startMinute: number;
    endMinute: number;
    displayHours: string;
    isFlexible?: boolean;
    minMinutes?: number;
    maxMinutes?: number;
  };
  customStartMinute?: number | null;
  customEndMinute?: number | null;
  customSlotLabel?: string;
}) {
  if (!params.shift.isFlexible) {
    return {
      startMinute: params.shift.startMinute,
      endMinute: params.shift.endMinute,
      slotLabel: params.shift.displayHours,
    };
  }
  const s = params.customStartMinute ?? params.shift.startMinute;
  const e = params.customEndMinute ?? params.shift.endMinute;
  const minMins = params.shift.minMinutes ?? 120;
  const maxMins = params.shift.maxMinutes ?? 180;
  const duration = e - s;
  if (s < 360 || e > 1380 || duration < minMins || duration > maxMins) {
    throw new Error(
      `Flexible Short Pass window must be between ${Math.round(minMins / 60)} and ${Math.round(maxMins / 60)} hours within library hours (06:00 AM – 11:00 PM).`
    );
  }
  return {
    startMinute: s,
    endMinute: e,
    slotLabel: params.customSlotLabel?.trim() || formatMinuteRangeLabel(s, e),
  };
}

export async function recordAuditEvent(params: {
  centerId: number;
  actorType: 'STAFF' | 'STUDENT' | 'SYSTEM';
  actorId: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(auditEvents).values({
    centerId: params.centerId,
    actorType: params.actorType,
    actorId: params.actorId,
    actorName: params.actorName,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    summary: params.summary,
    metadataJson: params.metadata ?? {},
  });
}

export async function syncMembershipStates(centerId: number) {
  const today = todayIST();
  const soonCutoff = addDaysDateStr(today, 3);

  const activeRows = await withDbRetry(
    () =>
      db
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.centerId, centerId),
            inArray(memberships.status, ['ACTIVE', 'EXPIRING_SOON', 'IN_GRACE'])
          )
        ),
    'sync-membership-states'
  );

  for (const m of activeRows) {
    let nextStatus = m.status;
    if (today > m.graceEndDate) {
      nextStatus = 'EXPIRED';
    } else if (today > m.endDate) {
      nextStatus = 'IN_GRACE';
    } else if (m.endDate <= soonCutoff) {
      nextStatus = 'EXPIRING_SOON';
    } else {
      nextStatus = 'ACTIVE';
    }

    if (nextStatus !== m.status) {
      await withDbRetry(
        () =>
          db.transaction(async (tx) => {
            await tx
              .update(memberships)
              .set({ status: nextStatus, updatedAt: new Date() })
              .where(eq(memberships.id, m.id));

            if (nextStatus === 'EXPIRED') {
              await tx
                .update(seatAllocations)
                .set({ status: 'EXPIRED', releasedAt: new Date() })
                .where(
                  and(eq(seatAllocations.membershipId, m.id), eq(seatAllocations.status, 'ACTIVE'))
                );
            }
          }),
        'sync-membership-transition'
      );
    }
  }
}

export async function computeSeatAvailability(params: {
  centerId: number;
  roomId?: number;
  shiftId: number;
  startDate: string;
  durationMonths: number;
  excludeMembershipId?: number;
  customStartMinute?: number | null;
  customEndMinute?: number | null;
}): Promise<{
  seats: SeatAvailabilityItem[];
  summary: { available: number; occupied: number; expiringSoon: number; unavailable: number };
  endDate: string;
}> {
  await syncMembershipStates(params.centerId);

  const [shiftRow] = await withDbRetry(
    () =>
      db
        .select()
        .from(shifts)
        .where(and(eq(shifts.id, params.shiftId), eq(shifts.centerId, params.centerId)))
        .limit(1),
    'avail-shift'
  );

  if (!shiftRow) {
    throw new Error('Selected shift not found.');
  }

  const resolvedWindow = resolveShiftMinutes({
    shift: shiftRow,
    customStartMinute: params.customStartMinute,
    customEndMinute: params.customEndMinute,
  });

  const endDate = addMonthsDateStr(params.startDate, params.durationMonths);

  const roomRows = await withDbRetry(
    () =>
      db
        .select()
        .from(rooms)
        .where(and(eq(rooms.centerId, params.centerId), eq(rooms.isActive, true)))
        .limit(1),
    'avail-rooms'
  );

  const targetRoomId = params.roomId ?? roomRows[0]?.id;
  if (!targetRoomId) {
    return {
      seats: [],
      summary: { available: 0, occupied: 0, expiringSoon: 0, unavailable: 0 },
      endDate,
    };
  }

  const seatList = await withDbRetry(
    () =>
      db
        .select()
        .from(seats)
        .where(and(eq(seats.centerId, params.centerId), eq(seats.roomId, targetRoomId)))
        .orderBy(seats.seatNumber),
    'avail-seats'
  );

  const activeAllocations = await withDbRetry(
    () =>
      db
        .select({
          alloc: seatAllocations,
          membershipStatus: memberships.status,
          membershipEndDate: memberships.endDate,
          shiftName: shifts.name,
          shiftHours: shifts.displayHours,
        })
        .from(seatAllocations)
        .innerJoin(memberships, eq(seatAllocations.membershipId, memberships.id))
        .innerJoin(shifts, eq(seatAllocations.shiftId, shifts.id))
        .where(
          and(
            eq(seatAllocations.centerId, params.centerId),
            eq(seatAllocations.status, 'ACTIVE'),
            inArray(memberships.status, ['ACTIVE', 'EXPIRING_SOON', 'IN_GRACE'])
          )
        ),
    'avail-allocations'
  );

  const summary = { available: 0, occupied: 0, expiringSoon: 0, unavailable: 0 };

  const items: SeatAvailabilityItem[] = seatList.map((seat) => {
    if (seat.status !== 'ACTIVE') {
      summary.unavailable++;
      return {
        seatId: seat.id,
        seatNumber: seat.seatNumber,
        label: seat.label,
        gridX: seat.gridX,
        gridY: seat.gridY,
        zone: seat.zone,
        hasPowerOutlet: seat.hasPowerOutlet,
        nearWindow: seat.nearWindow,
        nearAc: seat.nearAc,
        seatStatus: seat.status,
        notes: seat.notes,
        availability: 'UNAVAILABLE',
        conflictReason: seat.status === 'MAINTENANCE' ? 'Under maintenance' : 'Unavailable',
      };
    }

    const overlapping = activeAllocations.filter((row) => {
      if (row.alloc.seatId !== seat.id) return false;
      if (params.excludeMembershipId && row.alloc.membershipId === params.excludeMembershipId) {
        return false;
      }
      const dOverlap = dateRangesOverlap(
        params.startDate,
        endDate,
        row.alloc.startDate,
        row.alloc.endDate
      );
      if (!dOverlap) return false;
      return shiftIntervalsOverlap(
        resolvedWindow.startMinute,
        resolvedWindow.endMinute,
        row.alloc.startMinute,
        row.alloc.endMinute
      );
    });

    if (overlapping.length === 0) {
      summary.available++;
      return {
        seatId: seat.id,
        seatNumber: seat.seatNumber,
        label: seat.label,
        gridX: seat.gridX,
        gridY: seat.gridY,
        zone: seat.zone,
        hasPowerOutlet: seat.hasPowerOutlet,
        nearWindow: seat.nearWindow,
        nearAc: seat.nearAc,
        seatStatus: seat.status,
        notes: seat.notes,
        availability: 'AVAILABLE',
      };
    }

    const anyExpiringOrGrace = overlapping.every(
      (o) => o.membershipStatus === 'EXPIRING_SOON' || o.membershipStatus === 'IN_GRACE'
    );

    const firstConflictLabel = overlapping[0].alloc.customSlotLabel || overlapping[0].shiftHours;

    if (anyExpiringOrGrace) {
      summary.expiringSoon++;
      return {
        seatId: seat.id,
        seatNumber: seat.seatNumber,
        label: seat.label,
        gridX: seat.gridX,
        gridY: seat.gridY,
        zone: seat.zone,
        hasPowerOutlet: seat.hasPowerOutlet,
        nearWindow: seat.nearWindow,
        nearAc: seat.nearAc,
        seatStatus: seat.status,
        notes: seat.notes,
        availability: 'EXPIRING_SOON',
        conflictReason: `Reserved in ${overlapping[0].shiftName} (${firstConflictLabel}) until ${overlapping[0].membershipEndDate}`,
        expiringOn: overlapping[0].membershipEndDate,
      };
    }

    summary.occupied++;
    return {
      seatId: seat.id,
      seatNumber: seat.seatNumber,
      label: seat.label,
      gridX: seat.gridX,
      gridY: seat.gridY,
      zone: seat.zone,
      hasPowerOutlet: seat.hasPowerOutlet,
      nearWindow: seat.nearWindow,
      nearAc: seat.nearAc,
      seatStatus: seat.status,
      notes: seat.notes,
      availability: 'OCCUPIED',
      conflictReason: `Occupied in ${overlapping[0].shiftName} (${firstConflictLabel})`,
    };
  });

  return { seats: items, summary, endDate };
}

export function calculateQuote(params: {
  shiftMonthlyPaise: number;
  negotiatedMonthlyFeePaise?: number | null;
  durationMonths: number;
  discountPercent: number;
  extraDiscountPaise?: number;
}) {
  const effectiveMonthly =
    typeof params.negotiatedMonthlyFeePaise === 'number' && params.negotiatedMonthlyFeePaise > 0
      ? params.negotiatedMonthlyFeePaise
      : params.shiftMonthlyPaise;

  const subtotalPaise = effectiveMonthly * params.durationMonths;
  const planDiscountPaise = Math.round((subtotalPaise * params.discountPercent) / 100);
  const extraDiscount = Math.max(0, params.extraDiscountPaise ?? 0);
  const totalDiscountPaise = Math.min(subtotalPaise, planDiscountPaise + extraDiscount);
  const totalPaise = Math.max(0, subtotalPaise - totalDiscountPaise);

  return {
    effectiveMonthlyPaise: effectiveMonthly,
    subtotalPaise,
    discountPaise: totalDiscountPaise,
    lockerFeePaise: 0,
    totalPaise,
  };
}

export async function nextSequentialCode(
  prefix: string,
  table: 'student' | 'invoice' | 'receipt' | 'ticket'
) {
  const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
  const stamp = String(Date.now()).slice(-4);
  if (table === 'student') {
    const countRows = await db.select({ c: sql<number>`count(*)::int` }).from(studentProfiles);
    const num = (countRows[0]?.c ?? 0) + 1;
    return `${prefix}-${String(num).padStart(3, '0')}`;
  }
  return `${prefix}-${stamp}${rand}`;
}

export interface AdmitStudentInput {
  centerId: number;
  existingStudentId?: number;
  fullName: string;
  phone: string;
  whatsappNumber?: string;
  email?: string;
  guardianName?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  address?: string;
  examTarget?: string;
  photoUrl?: string;
  govIdType?: string;
  govIdLast4?: string;
  govIdDocData?: string;
  idProofMode?: 'OFFLINE' | 'ONLINE';
  idVerificationStatus?: 'PENDING_OFFLINE' | 'UPLOADED' | 'VERIFIED';
  idVerificationNote?: string;
  idVerifiedAt?: Date | null;
  idVerifiedByUserId?: number | null;
  rulesAccepted?: boolean;
  shiftId: number;
  planId: number;
  seatId: number;
  startDate: string;
  customStartMinute?: number | null;
  customEndMinute?: number | null;
  customSlotLabel?: string;
  negotiatedMonthlyFeePaise?: number | null;
  negotiationNote?: string;
  extraDiscountPaise?: number;
  amountReceivedPaise: number;
  paymentMethod: 'CASH' | 'UPI' | 'CARD';
  paymentReference?: string;
  idempotencyKey: string;
  staffUserId: number;
  staffName: string;
  staffRole?: 'SUPER_ADMIN' | 'MANAGER';
}

export class SeatConflictError extends Error {
  alternatives: SeatAvailabilityItem[];
  conflictWindow: string;
  constructor(message: string, conflictWindow: string, alternatives: SeatAvailabilityItem[]) {
    super(message);
    this.name = 'SeatConflictError';
    this.conflictWindow = conflictWindow;
    this.alternatives = alternatives;
  }
}

export async function admitStudentTransactional(input: AdmitStudentInput) {
  const existingPay = await db
    .select()
    .from(payments)
    .where(eq(payments.idempotencyKey, input.idempotencyKey))
    .limit(1);

  if (existingPay[0]) {
    const [inv] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, existingPay[0].invoiceId))
      .limit(1);
    const [stu] = await db
      .select()
      .from(studentProfiles)
      .where(eq(studentProfiles.id, existingPay[0].studentId))
      .limit(1);
    return {
      duplicatePrevented: true,
      student: stu,
      invoice: inv,
      payment: existingPay[0],
    };
  }

  return await db.transaction(async (tx) => {
    const [centerRow] = await tx
      .select()
      .from(centers)
      .where(eq(centers.id, input.centerId))
      .limit(1);
    if (!centerRow) throw new Error('Center not found');

    const [shiftRow] = await tx
      .select()
      .from(shifts)
      .where(and(eq(shifts.id, input.shiftId), eq(shifts.centerId, input.centerId)))
      .limit(1);
    const [planRow] = await tx
      .select()
      .from(plans)
      .where(and(eq(plans.id, input.planId), eq(plans.centerId, input.centerId)))
      .limit(1);

    if (!shiftRow || !planRow) throw new Error('Invalid shift or plan selected.');

    if (
      typeof input.negotiatedMonthlyFeePaise === 'number' &&
      input.negotiatedMonthlyFeePaise > 0 &&
      input.negotiatedMonthlyFeePaise < shiftRow.monthlyFeePaise &&
      input.staffRole !== 'SUPER_ADMIN'
    ) {
      throw new Error('Only Super Admin (Owner) can lower monthly fees below standard shift rates.');
    }

    const resolvedWindow = resolveShiftMinutes({
      shift: shiftRow,
      customStartMinute: input.customStartMinute,
      customEndMinute: input.customEndMinute,
      customSlotLabel: input.customSlotLabel,
    });

    const lockedSeatResult = await tx.execute(
      sql`SELECT id, seat_number, status FROM seats WHERE id = ${input.seatId} AND center_id = ${input.centerId} FOR UPDATE`
    );
    const seatRow = lockedSeatResult.rows[0] as
      | { id: number; seat_number: number; status: string }
      | undefined;

    if (!seatRow || seatRow.status !== 'ACTIVE') {
      const avail = await computeSeatAvailability({
        centerId: input.centerId,
        shiftId: input.shiftId,
        startDate: input.startDate,
        durationMonths: planRow.durationMonths,
        customStartMinute: resolvedWindow.startMinute,
        customEndMinute: resolvedWindow.endMinute,
      });
      throw new SeatConflictError(
        'Selected desk is unavailable.',
        'Desk inactive or under maintenance',
        avail.seats.filter((s) => s.availability === 'AVAILABLE').slice(0, 6)
      );
    }

    const endDate = addMonthsDateStr(input.startDate, planRow.durationMonths);
    const graceEndDate = addDaysDateStr(endDate, centerRow.gracePeriodDays);

    const existingSeatAllocs = await tx
      .select({
        alloc: seatAllocations,
        shiftName: shifts.name,
        shiftHours: shifts.displayHours,
      })
      .from(seatAllocations)
      .innerJoin(memberships, eq(seatAllocations.membershipId, memberships.id))
      .innerJoin(shifts, eq(seatAllocations.shiftId, shifts.id))
      .where(
        and(
          eq(seatAllocations.centerId, input.centerId),
          eq(seatAllocations.seatId, input.seatId),
          eq(seatAllocations.status, 'ACTIVE'),
          inArray(memberships.status, ['ACTIVE', 'EXPIRING_SOON', 'IN_GRACE'])
        )
      );

    const conflict = existingSeatAllocs.find(
      (row) =>
        dateRangesOverlap(input.startDate, endDate, row.alloc.startDate, row.alloc.endDate) &&
        shiftIntervalsOverlap(
          resolvedWindow.startMinute,
          resolvedWindow.endMinute,
          row.alloc.startMinute,
          row.alloc.endMinute
        )
    );

    if (conflict) {
      const avail = await computeSeatAvailability({
        centerId: input.centerId,
        shiftId: input.shiftId,
        startDate: input.startDate,
        durationMonths: planRow.durationMonths,
        customStartMinute: resolvedWindow.startMinute,
        customEndMinute: resolvedWindow.endMinute,
      });
      const conflictTime = conflict.alloc.customSlotLabel || conflict.shiftHours;
      throw new SeatConflictError(
        `Desk ${seatRow.seat_number} conflicts with an active ${conflict.shiftName} allocation (${conflictTime}).`,
        `${conflict.shiftName} (${conflictTime}) · ${conflict.alloc.startDate} to ${conflict.alloc.endDate}`,
        avail.seats.filter((s) => s.availability === 'AVAILABLE').slice(0, 6)
      );
    }

    let studentRecord;
    const defaultPin = input.phone.slice(-4) || '1234';
    if (input.existingStudentId) {
      const [updated] = await tx
        .update(studentProfiles)
        .set({
          fullName: input.fullName,
          phone: input.phone,
          whatsappNumber: input.whatsappNumber ?? input.phone,
          email: input.email ?? '',
          guardianName: input.guardianName ?? '',
          emergencyContactName: input.emergencyContactName ?? '',
          emergencyContactPhone: input.emergencyContactPhone ?? '',
          address: input.address ?? '',
          examTarget: input.examTarget ?? 'General',
          rulesAccepted: Boolean(input.rulesAccepted),
          ...(input.photoUrl ? { photoUrl: input.photoUrl } : {}),
          ...(input.govIdType ? { govIdType: input.govIdType } : {}),
          ...(input.govIdLast4 ? { govIdLast4: input.govIdLast4 } : {}),
          ...(input.govIdDocData ? { govIdDocData: input.govIdDocData } : {}),
          ...(input.idProofMode ? { idProofMode: input.idProofMode } : {}),
          ...(input.idVerificationStatus
            ? { idVerificationStatus: input.idVerificationStatus }
            : {}),
          ...(input.idVerificationNote !== undefined
            ? { idVerificationNote: input.idVerificationNote }
            : {}),
          ...(input.idVerifiedAt !== undefined ? { idVerifiedAt: input.idVerifiedAt } : {}),
          ...(input.idVerifiedByUserId !== undefined
            ? { idVerifiedByUserId: input.idVerifiedByUserId }
            : {}),
          status: 'ACTIVE',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(studentProfiles.id, input.existingStudentId),
            eq(studentProfiles.centerId, input.centerId)
          )
        )
        .returning();
      studentRecord = updated;
    } else {
      const year = todayIST().slice(0, 4);
      const countRows = await tx
        .select({ c: sql<number>`count(*)::int` })
        .from(studentProfiles)
        .where(eq(studentProfiles.centerId, input.centerId));
      const nextNum = (countRows[0]?.c ?? 0) + 1;
      const studentCode = `GV-${year}-${String(nextNum).padStart(3, '0')}`;
      const resolvedIdMode = input.idProofMode ?? (input.govIdDocData ? 'ONLINE' : 'OFFLINE');
      const resolvedIdStatus =
        input.idVerificationStatus ?? (input.govIdDocData ? 'UPLOADED' : 'PENDING_OFFLINE');

      const [inserted] = await tx
        .insert(studentProfiles)
        .values({
          centerId: input.centerId,
          studentCode,
          fullName: input.fullName,
          phone: input.phone,
          whatsappNumber: input.whatsappNumber ?? input.phone,
          email: input.email ?? '',
          guardianName: input.guardianName ?? '',
          emergencyContactName: input.emergencyContactName ?? '',
          emergencyContactPhone: input.emergencyContactPhone ?? '',
          address: input.address ?? '',
          examTarget: input.examTarget ?? 'General',
          photoUrl: input.photoUrl ?? '',
          govIdType: input.govIdType ?? '',
          govIdLast4: input.govIdLast4 ?? '',
          govIdDocData: input.govIdDocData ?? '',
          idProofMode: resolvedIdMode,
          idVerificationStatus: resolvedIdStatus,
          idVerificationNote: input.idVerificationNote ?? '',
          idVerifiedAt: input.idVerifiedAt ?? null,
          idVerifiedByUserId: input.idVerifiedByUserId ?? null,
          rulesAccepted: Boolean(input.rulesAccepted),
          pinHash: await hashPin(defaultPin),
          qrSecret: `GVQR-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
          status: 'ACTIVE',
        })
        .returning();
      studentRecord = inserted;
    }

    if (!studentRecord) throw new Error('Failed to resolve student record.');

    const today = todayIST();
    const soonCutoff = addDaysDateStr(today, 3);
    const membershipStatus = endDate <= soonCutoff ? 'EXPIRING_SOON' : 'ACTIVE';

    const negotiatedFee =
      typeof input.negotiatedMonthlyFeePaise === 'number' && input.negotiatedMonthlyFeePaise > 0
        ? input.negotiatedMonthlyFeePaise
        : null;

    const [membership] = await tx
      .insert(memberships)
      .values({
        centerId: input.centerId,
        studentId: studentRecord.id,
        shiftId: shiftRow.id,
        planId: planRow.id,
        startDate: input.startDate,
        endDate,
        graceEndDate,
        customStartMinute: shiftRow.isFlexible ? resolvedWindow.startMinute : null,
        customEndMinute: shiftRow.isFlexible ? resolvedWindow.endMinute : null,
        customSlotLabel: shiftRow.isFlexible ? resolvedWindow.slotLabel : '',
        negotiatedMonthlyFeePaise: negotiatedFee,
        negotiationNote: input.negotiationNote ?? '',
        status: membershipStatus,
      })
      .returning();

    const [allocation] = await tx
      .insert(seatAllocations)
      .values({
        centerId: input.centerId,
        seatId: input.seatId,
        membershipId: membership.id,
        studentId: studentRecord.id,
        shiftId: shiftRow.id,
        startDate: input.startDate,
        endDate,
        startMinute: resolvedWindow.startMinute,
        endMinute: resolvedWindow.endMinute,
        customSlotLabel: shiftRow.isFlexible ? resolvedWindow.slotLabel : '',
        status: 'ACTIVE',
      })
      .returning();

    const quote = calculateQuote({
      shiftMonthlyPaise: shiftRow.monthlyFeePaise,
      negotiatedMonthlyFeePaise: negotiatedFee,
      durationMonths: planRow.durationMonths,
      discountPercent: planRow.discountPercent,
      extraDiscountPaise: input.extraDiscountPaise ?? 0,
    });

    const received = Math.min(quote.totalPaise, Math.max(0, input.amountReceivedPaise));
    const balance = quote.totalPaise - received;
    const invStatus = balance === 0 ? 'PAID' : received > 0 ? 'PARTIAL' : 'UNPAID';

    const invCode = `INV-${today.slice(0, 4)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const [invoice] = await tx
      .insert(invoices)
      .values({
        centerId: input.centerId,
        invoiceNumber: invCode,
        studentId: studentRecord.id,
        membershipId: membership.id,
        subtotalPaise: quote.subtotalPaise,
        discountPaise: quote.discountPaise,
        lockerFeePaise: 0,
        totalPaise: quote.totalPaise,
        paidPaise: received,
        balancePaise: balance,
        status: invStatus,
        dueDate: input.startDate,
        snapshotJson: {
          planName: planRow.name,
          durationMonths: planRow.durationMonths,
          discountPercent: planRow.discountPercent,
          shiftName: shiftRow.name,
          shiftHours: resolvedWindow.slotLabel,
          monthlyFeePaise: quote.effectiveMonthlyPaise,
          standardMonthlyFeePaise: shiftRow.monthlyFeePaise,
          negotiationNote: input.negotiationNote ?? '',
          seatNumber: seatRow.seat_number,
        },
      })
      .returning();

    let payment = null;
    if (received > 0) {
      const rcpCode = `RCP-${today.slice(0, 4)}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      const [payRow] = await tx
        .insert(payments)
        .values({
          centerId: input.centerId,
          invoiceId: invoice.id,
          studentId: studentRecord.id,
          receiptNumber: rcpCode,
          amountPaise: received,
          method: input.paymentMethod,
          referenceCode: input.paymentReference ?? '',
          status: 'POSTED',
          idempotencyKey: input.idempotencyKey,
          collectedByUserId: input.staffUserId,
        })
        .returning();
      payment = payRow;
    }

    await tx.insert(auditEvents).values({
      centerId: input.centerId,
      actorType: 'STAFF',
      actorId: String(input.staffUserId),
      actorName: input.staffName,
      action: 'STUDENT_ADMITTED',
      entityType: 'MEMBERSHIP',
      entityId: String(membership.id),
      summary: `Admitted ${studentRecord.fullName} (${studentRecord.studentCode}) to Desk ${seatRow.seat_number} · ${shiftRow.name} (${resolvedWindow.slotLabel}). Collected ${received} paise; balance ${balance} paise.`,
      metadataJson: {
        studentId: studentRecord.id,
        seatId: input.seatId,
        seatNumber: seatRow.seat_number,
        invoiceId: invoice.id,
        negotiatedMonthlyFeePaise: negotiatedFee,
      },
    });

    return {
      duplicatePrevented: false,
      student: studentRecord,
      membership,
      allocation,
      invoice,
      payment,
      seatNumber: seatRow.seat_number,
      shiftName: shiftRow.name,
      shiftHours: resolvedWindow.slotLabel,
      defaultPin,
    };
  });
}

export async function ensureActiveAdmissionHelper(
  centerId: number,
  studentId: number,
  excludeMembershipId?: number
) {
  return db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.centerId, centerId),
        eq(memberships.studentId, studentId),
        excludeMembershipId ? ne(memberships.id, excludeMembershipId) : sql`true`
      )
    );
}
