import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db/index.ts';
import { studentProfiles, supportTickets, ticketMessages } from '@/src/db/schema.ts';
import { getStudentSessionFromCookies } from '@/src/lib/student-session.ts';

const CreateOrReplySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('CREATE'),
    category: z.enum(['SEAT_CHANGE', 'WIFI', 'AC', 'BOOK_REQUEST', 'GENERAL']),
    subject: z.string().trim().min(3),
    description: z.string().trim().min(5),
  }),
  z.object({
    mode: z.literal('REPLY'),
    ticketId: z.number().int().positive(),
    message: z.string().trim().min(1),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    const session = await getStudentSessionFromCookies();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const json = await req.json();
    const parsed = CreateOrReplySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid ticket details.' },
        { status: 400 }
      );
    }

    const [student] = await db
      .select()
      .from(studentProfiles)
      .where(
        and(
          eq(studentProfiles.id, session.studentId),
          eq(studentProfiles.centerId, session.centerId)
        )
      )
      .limit(1);

    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    if (parsed.data.mode === 'CREATE') {
      const ticketNumber = `TKT-${crypto.randomBytes(2).toString('hex').toUpperCase()}${String(Date.now()).slice(-2)}`;
      const [ticket] = await db
        .insert(supportTickets)
        .values({
          centerId: student.centerId,
          ticketNumber,
          studentId: student.id,
          category: parsed.data.category,
          subject: parsed.data.subject,
          description: parsed.data.description,
          status: 'PENDING',
        })
        .returning();

      await db.insert(ticketMessages).values({
        centerId: student.centerId,
        ticketId: ticket.id,
        senderType: 'STUDENT',
        senderName: student.fullName,
        message: parsed.data.description,
      });

      return NextResponse.json({ ticket }, { status: 201 });
    }

    const [ticket] = await db
      .select()
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.id, parsed.data.ticketId),
          eq(supportTickets.studentId, student.id),
          eq(supportTickets.centerId, student.centerId)
        )
      )
      .limit(1);

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found.' }, { status: 404 });
    }

    const [msg] = await db
      .insert(ticketMessages)
      .values({
        centerId: student.centerId,
        ticketId: ticket.id,
        senderType: 'STUDENT',
        senderName: student.fullName,
        message: parsed.data.message,
      })
      .returning();

    return NextResponse.json({ message: msg });
  } catch (err) {
    console.error('POST /api/student/tickets error:', err);
    return NextResponse.json({ error: 'Unable to submit support message.' }, { status: 500 });
  }
}
