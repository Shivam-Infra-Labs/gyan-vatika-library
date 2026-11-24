import { NextRequest, NextResponse } from 'next/server';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import {
  attendanceSessions,
  auditEvents,
  bookingRequests,
  centers,
  memberships,
  rooms,
  seatAllocations,
  seats,
  shifts,
  studentProfiles,
  supportTickets,
} from '@/src/db/schema.ts';
import { authenticateStaff, isSuperAdmin } from '@/src/lib/auth.ts';
import {
  computeSeatAvailability,
  recordAuditEvent,
  SeatConflictError,
  syncMembershipStates,
} from '@/src/lib/domain.ts';
import {
  dateRangesOverlap,
  shiftIntervalsOverlap,
  todayIST,
} from '@/src/lib/format.ts';

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;
    const centerId = staff.centerId;
    await syncMembershipStates(centerId);

    const sp = req.nextUrl.searchParams;
    const shiftId = Number(sp.get('shiftId'));
    const startDate = sp.get('startDate') || todayIST();
    const customStartMinute = sp.get('customStartMinute')
      ? Number(sp.get('customStartMinute'))
      : null;
    const customEndMinute = sp.get('customEndMinute') ? Number(sp.get('customEndMinute')) : null;

    const allShifts = await db
      .select()
      .from(shifts)
      .where(eq(shifts.centerId, centerId))
      .orderBy(asc(shifts.sortOrder), asc(shifts.id));

    const targetShiftId = shiftId || allShifts[0]?.id;
    const availability = targetShiftId
      ? await computeSeatAvailability({
          centerId,
          shiftId: targetShiftId,
          startDate,
          durationMonths: 1,
          customStartMinute,
          customEndMinute,
        })
      : { seats: [], summary: { available: 0, occupied: 0, expiringSoon: 0, unavailable: 0 }, endDate: startDate };

    const allocRows = await db
      .select({
        allocation: seatAllocations,
        studentName: studentProfiles.fullName,
        studentCode: studentProfiles.studentCode,
        shiftName: shifts.name,
        shiftHours: shifts.displayHours,
        membershipStatus: memberships.status,
      })
      .from(seatAllocations)
      .innerJoin(studentProfiles, eq(seatAllocations.studentId, studentProfiles.id))
      .innerJoin(shifts, eq(seatAllocations.shiftId, shifts.id))
      .innerJoin(memberships, eq(seatAllocations.membershipId, memberships.id))
      .where(
        and(
          eq(seatAllocations.centerId, centerId),
          eq(seatAllocations.status, 'ACTIVE'),
          inArray(memberships.status, ['ACTIVE', 'EXPIRING_SOON', 'IN_GRACE'])
        )
      );

    return NextResponse.json({
      availability,
      assignmentsBySeat: allocRows,
    });
  } catch (err) {
    console.error('GET /api/admin/seats error:', err);
    return NextResponse.json({ error: 'Unable to load desk floor map.' }, { status: 500 });
  }
}

const SeatActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('TRANSFER_SEAT'),
    membershipId: z.number().int().positive(),
    targetSeatId: z.number().int().positive(),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    ticketId: z.number().int().positive().optional(),
  }),
  z.object({
    action: z.literal('UPDATE_SEAT_STATUS'),
    seatId: z.number().int().positive(),
    status: z.enum(['ACTIVE', 'MAINTENANCE', 'UNAVAILABLE']),
    notes: z.string().optional().default(''),
  }),
  z.object({
    action: z.literal('ADD_DESK'),
    seatNumber: z.number().int().positive().optional(),
    label: z.string().trim().min(2).optional(),
    zone: z.string().trim().default('Central Aisle'),
    gridX: z.number().int().min(0).max(15).optional(),
    gridY: z.number().int().min(0).max(15).optional(),
    hasPowerOutlet: z.boolean().default(true),
    nearWindow: z.boolean().default(false),
    nearAc: z.boolean().default(false),
    notes: z.string().optional().default(''),
  }),
  z.object({
    action: z.literal('EDIT_DESK'),
    seatId: z.number().int().positive(),
    label: z.string().trim().min(2),
    zone: z.string().trim().min(2),
    status: z.enum(['ACTIVE', 'MAINTENANCE', 'UNAVAILABLE']),
    hasPowerOutlet: z.boolean(),
    nearWindow: z.boolean(),
    nearAc: z.boolean(),
    notes: z.string().optional().default(''),
  }),
  z.object({
    action: z.literal('DELETE_DESK'),
    seatId: z.number().int().positive(),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;

    const json = await req.json();
    const parsed = SeatActionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid desk action.' },
        { status: 400 }
      );
    }

    if (parsed.data.action === 'UPDATE_SEAT_STATUS') {
      const [updated] = await db
        .update(seats)
        .set({ status: parsed.data.status, notes: parsed.data.notes })
        .where(and(eq(seats.id, parsed.data.seatId), eq(seats.centerId, staff.centerId)))
        .returning();

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'SEAT_STATUS_UPDATED',
        entityType: 'SEAT',
        entityId: String(parsed.data.seatId),
        summary: `Updated Desk #${updated.seatNumber} status to ${parsed.data.status}.`,
      });
      return NextResponse.json({ seat: updated });
    }

    if (parsed.data.action === 'ADD_DESK') {
      const addInput = parsed.data;
      const [room] = await db
        .select()
        .from(rooms)
        .where(and(eq(rooms.centerId, staff.centerId), eq(rooms.isActive, true)))
        .limit(1);
      if (!room) {
        return NextResponse.json({ error: 'No active reading room found.' }, { status: 404 });
      }

      const existingSeats = await db
        .select()
        .from(seats)
        .where(eq(seats.centerId, staff.centerId))
        .orderBy(asc(seats.seatNumber));

      const maxNum = existingSeats.reduce((m, s) => Math.max(m, s.seatNumber), 0);
      const nextNum = addInput.seatNumber ?? maxNum + 1;
      if (existingSeats.some((s) => s.seatNumber === nextNum)) {
        return NextResponse.json({ error: `Desk #${nextNum} already exists.` }, { status: 409 });
      }

      // Find next unoccupied grid cell or expand rows if grid is full
      const occupiedCells = new Set(existingSeats.map((s) => `${s.gridX},${s.gridY}`));
      let gx = addInput.gridX;
      let gy = addInput.gridY;
      let nextRows = room.rows;
      if (gx === undefined || gy === undefined) {
        outer: for (let y = 0; y <= room.rows + 4; y++) {
          for (let x = 0; x < room.cols; x++) {
            if (x === 4 && y >= 2 && y <= 5) continue;
            if (!occupiedCells.has(`${x},${y}`)) {
              gx = x;
              gy = y;
              if (y >= nextRows) nextRows = y + 1;
              break outer;
            }
          }
        }
      }

      const [created] = await db
        .insert(seats)
        .values({
          centerId: staff.centerId,
          roomId: room.id,
          seatNumber: nextNum,
          label: addInput.label || `Desk #${nextNum}`,
          gridX: gx ?? 0,
          gridY: gy ?? room.rows,
          zone: addInput.zone,
          hasPowerOutlet: addInput.hasPowerOutlet,
          nearWindow: addInput.nearWindow,
          nearAc: addInput.nearAc,
          status: 'ACTIVE',
          notes: addInput.notes,
        })
        .returning();

      if (nextRows > room.rows) {
        await db.update(rooms).set({ rows: nextRows }).where(eq(rooms.id, room.id));
      }

      const totalCount = existingSeats.length + 1;
      await db
        .update(centers)
        .set({ totalConfiguredSeats: totalCount, updatedAt: new Date() })
        .where(eq(centers.id, staff.centerId));

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'DESK_ADDED',
        entityType: 'SEAT',
        entityId: String(created.id),
        summary: `Added ${created.label} (#${created.seatNumber}) in ${created.zone}.`,
      });

      return NextResponse.json({ seat: created, totalSeats: totalCount }, { status: 201 });
    }

    if (parsed.data.action === 'EDIT_DESK') {
      const editInput = parsed.data;
      const [updated] = await db
        .update(seats)
        .set({
          label: editInput.label,
          zone: editInput.zone,
          status: editInput.status,
          hasPowerOutlet: editInput.hasPowerOutlet,
          nearWindow: editInput.nearWindow,
          nearAc: editInput.nearAc,
          notes: editInput.notes,
        })
        .where(and(eq(seats.id, editInput.seatId), eq(seats.centerId, staff.centerId)))
        .returning();

      if (!updated) {
        return NextResponse.json({ error: 'Desk not found.' }, { status: 404 });
      }

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'DESK_EDITED',
        entityType: 'SEAT',
        entityId: String(updated.id),
        summary: `Edited ${updated.label} (#${updated.seatNumber}, ${updated.zone}, ${updated.status}).`,
      });

      return NextResponse.json({ seat: updated });
    }

    if (parsed.data.action === 'DELETE_DESK') {
      if (!isSuperAdmin(staff)) {
        return NextResponse.json(
          { error: 'Only the Center Owner (SUPER_ADMIN) can permanently delete desks.' },
          { status: 403 }
        );
      }
      const seatId = parsed.data.seatId;
      const [seatRow] = await db
        .select()
        .from(seats)
        .where(and(eq(seats.id, seatId), eq(seats.centerId, staff.centerId)))
        .limit(1);

      if (!seatRow) {
        return NextResponse.json({ error: 'Desk not found.' }, { status: 404 });
      }

      const anyAlloc = await db
        .select({ id: seatAllocations.id })
        .from(seatAllocations)
        .where(eq(seatAllocations.seatId, seatId))
        .limit(1);
      const anyAtt = await db
        .select({ id: attendanceSessions.id })
        .from(attendanceSessions)
        .where(eq(attendanceSessions.seatId, seatId))
        .limit(1);

      if (anyAlloc.length > 0 || anyAtt.length > 0) {
        return NextResponse.json(
          {
            error: `Desk #${seatRow.seatNumber} has active or historical allocation/attendance records and cannot be deleted. Mark its status as Unavailable instead.`,
          },
          { status: 409 }
        );
      }

      await db
        .update(bookingRequests)
        .set({ seatId: null })
        .where(eq(bookingRequests.seatId, seatId));
      await db
        .update(supportTickets)
        .set({ targetSeatId: null })
        .where(eq(supportTickets.targetSeatId, seatId));

      await db.delete(seats).where(eq(seats.id, seatId));

      const remaining = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(seats)
        .where(eq(seats.centerId, staff.centerId));
      const totalCount = remaining[0]?.c ?? 0;

      await db
        .update(centers)
        .set({ totalConfiguredSeats: totalCount, updatedAt: new Date() })
        .where(eq(centers.id, staff.centerId));

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'DESK_DELETED',
        entityType: 'SEAT',
        entityId: String(seatId),
        summary: `Deleted vacant ${seatRow.label} (#${seatRow.seatNumber}).`,
      });

      return NextResponse.json({ deleted: true, totalSeats: totalCount });
    }

    // TRANSFER_SEAT
    const transferData = parsed.data;
    const result = await db.transaction(async (tx) => {
      const [membership] = await tx
        .select()
        .from(memberships)
        .where(
          and(
            eq(memberships.id, transferData.membershipId),
            eq(memberships.centerId, staff.centerId)
          )
        )
        .limit(1);

      if (!membership) throw new Error('Membership not found.');

      const [shiftRow] = await tx
        .select()
        .from(shifts)
        .where(eq(shifts.id, membership.shiftId))
        .limit(1);
      if (!shiftRow) throw new Error('Shift not found.');

      const effectiveStart = membership.customStartMinute ?? shiftRow.startMinute;
      const effectiveEnd = membership.customEndMinute ?? shiftRow.endMinute;
      const effectiveLabel = membership.customSlotLabel || shiftRow.displayHours;

      const lockedSeatRes = await tx.execute(
        sql`SELECT id, seat_number, status FROM seats WHERE id = ${transferData.targetSeatId} AND center_id = ${staff.centerId} FOR UPDATE`
      );
      const targetSeat = lockedSeatRes.rows[0] as
        | { id: number; seat_number: number; status: string }
        | undefined;

      if (!targetSeat || targetSeat.status !== 'ACTIVE') {
        throw new Error('Target desk is not active.');
      }

      const existingAllocs = await tx
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
            eq(seatAllocations.centerId, staff.centerId),
            eq(seatAllocations.seatId, transferData.targetSeatId),
            eq(seatAllocations.status, 'ACTIVE'),
            inArray(memberships.status, ['ACTIVE', 'EXPIRING_SOON', 'IN_GRACE'])
          )
        );

      const conflict = existingAllocs.find(
        (row) =>
          row.alloc.membershipId !== membership.id &&
          dateRangesOverlap(
            transferData.effectiveDate,
            membership.endDate,
            row.alloc.startDate,
            row.alloc.endDate
          ) &&
          shiftIntervalsOverlap(
            effectiveStart,
            effectiveEnd,
            row.alloc.startMinute,
            row.alloc.endMinute
          )
      );

      if (conflict) {
        const avail = await computeSeatAvailability({
          centerId: staff.centerId,
          shiftId: shiftRow.id,
          startDate: transferData.effectiveDate,
          durationMonths: 1,
          excludeMembershipId: membership.id,
          customStartMinute: effectiveStart,
          customEndMinute: effectiveEnd,
        });
        const conflictHours = conflict.alloc.customSlotLabel || conflict.shiftHours;
        throw new SeatConflictError(
          `Desk #${targetSeat.seat_number} conflicts with ${conflict.shiftName} (${conflictHours}).`,
          `${conflict.shiftName} (${conflictHours})`,
          avail.seats.filter((s) => s.availability === 'AVAILABLE').slice(0, 6)
        );
      }

      await tx
        .update(seatAllocations)
        .set({ status: 'TRANSFERRED', releasedAt: new Date() })
        .where(
          and(
            eq(seatAllocations.membershipId, membership.id),
            eq(seatAllocations.status, 'ACTIVE')
          )
        );

      const [newAlloc] = await tx
        .insert(seatAllocations)
        .values({
          centerId: staff.centerId,
          seatId: targetSeat.id,
          membershipId: membership.id,
          studentId: membership.studentId,
          shiftId: membership.shiftId,
          startDate: transferData.effectiveDate,
          endDate: membership.endDate,
          startMinute: effectiveStart,
          endMinute: effectiveEnd,
          customSlotLabel: membership.customSlotLabel || '',
          status: 'ACTIVE',
        })
        .returning();

      if (transferData.ticketId) {
        await tx
          .update(supportTickets)
          .set({
            status: 'RESOLVED',
            linkedTransferDone: true,
            targetSeatId: targetSeat.id,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(supportTickets.id, transferData.ticketId),
              eq(supportTickets.centerId, staff.centerId)
            )
          );
      }

      await tx.insert(auditEvents).values({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'SEAT_TRANSFERRED',
        entityType: 'SEAT_ALLOCATION',
        entityId: String(newAlloc.id),
        summary: `Transferred membership #${membership.id} (${effectiveLabel}) to Desk #${targetSeat.seat_number} effective ${transferData.effectiveDate}.`,
      });

      return { newAlloc, seatNumber: targetSeat.seat_number };
    });

    return NextResponse.json(result);
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
    console.error('POST /api/admin/seats error:', err);
    return NextResponse.json({ error: 'Unable to update desk assignment.' }, { status: 500 });
  }
}
