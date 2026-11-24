import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import {
  memberships,
  seatAllocations,
  seats,
  studentProfiles,
  supportTickets,
  ticketMessages,
} from '@/src/db/schema.ts';
import { authenticateStaff } from '@/src/lib/auth.ts';
import { recordAuditEvent } from '@/src/lib/domain.ts';

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;

    const tickets = await db
      .select({
        ticket: supportTickets,
        studentName: studentProfiles.fullName,
        studentCode: studentProfiles.studentCode,
      })
      .from(supportTickets)
      .innerJoin(studentProfiles, eq(supportTickets.studentId, studentProfiles.id))
      .where(eq(supportTickets.centerId, staff.centerId))
      .orderBy(desc(supportTickets.createdAt));

    const msgs = await db
      .select()
      .from(ticketMessages)
      .where(eq(ticketMessages.centerId, staff.centerId))
      .orderBy(ticketMessages.createdAt);

    const activeAllocs = await db
      .select({
        allocation: seatAllocations,
        seatNumber: seats.seatNumber,
        membershipId: memberships.id,
      })
      .from(seatAllocations)
      .innerJoin(seats, eq(seatAllocations.seatId, seats.id))
      .innerJoin(memberships, eq(seatAllocations.membershipId, memberships.id))
      .where(and(eq(seatAllocations.centerId, staff.centerId), eq(seatAllocations.status, 'ACTIVE')));

    return NextResponse.json({
      tickets: tickets.map((t) => {
        const alloc = activeAllocs.find((a) => a.allocation.studentId === t.ticket.studentId);
        return {
          ...t.ticket,
          studentName: t.studentName,
          studentCode: t.studentCode,
          currentMembershipId: alloc?.membershipId ?? null,
          currentSeatNumber: alloc?.seatNumber ?? null,
          messages: msgs.filter((m) => m.ticketId === t.ticket.id),
        };
      }),
    });
  } catch (err) {
    console.error('GET /api/admin/tickets error:', err);
    return NextResponse.json({ error: 'Unable to load helpdesk tickets.' }, { status: 500 });
  }
}

const TicketActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('REPLY'),
    ticketId: z.number().int().positive(),
    message: z.string().trim().min(1),
    nextStatus: z.enum(['PENDING', 'IN_PROGRESS', 'RESOLVED']).optional(),
  }),
  z.object({
    action: z.literal('UPDATE_STATUS'),
    ticketId: z.number().int().positive(),
    status: z.enum(['PENDING', 'IN_PROGRESS', 'RESOLVED']),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;

    const json = await req.json();
    const parsed = TicketActionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid ticket update.' }, { status: 400 });
    }

    if (parsed.data.action === 'REPLY') {
      const [msg] = await db
        .insert(ticketMessages)
        .values({
          centerId: staff.centerId,
          ticketId: parsed.data.ticketId,
          senderType: 'STAFF',
          senderName: staff.fullName,
          message: parsed.data.message,
        })
        .returning();

      if (parsed.data.nextStatus) {
        await db
          .update(supportTickets)
          .set({
            status: parsed.data.nextStatus,
            assignedToUserId: staff.userId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(supportTickets.id, parsed.data.ticketId),
              eq(supportTickets.centerId, staff.centerId)
            )
          );
      }

      return NextResponse.json({ message: msg });
    }

    const [updated] = await db
      .update(supportTickets)
      .set({
        status: parsed.data.status,
        assignedToUserId: staff.userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(supportTickets.id, parsed.data.ticketId),
          eq(supportTickets.centerId, staff.centerId)
        )
      )
      .returning();

    await recordAuditEvent({
      centerId: staff.centerId,
      actorType: 'STAFF',
      actorId: String(staff.userId),
      actorName: staff.fullName,
      action: 'TICKET_UPDATED',
      entityType: 'SUPPORT_TICKET',
      entityId: String(updated.id),
      summary: `Ticket ${updated.ticketNumber} marked ${parsed.data.status}.`,
    });

    return NextResponse.json({ ticket: updated });
  } catch (err) {
    console.error('POST /api/admin/tickets error:', err);
    return NextResponse.json({ error: 'Unable to update ticket.' }, { status: 500 });
  }
}
