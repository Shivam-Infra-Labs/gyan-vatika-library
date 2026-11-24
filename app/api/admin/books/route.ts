import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import { bookCopies, bookLoans, books, studentProfiles } from '@/src/db/schema.ts';
import { authenticateStaff } from '@/src/lib/auth.ts';
import { recordAuditEvent } from '@/src/lib/domain.ts';

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;

    const centerId = staff.centerId;
    const allBooks = await db
      .select()
      .from(books)
      .where(eq(books.centerId, centerId))
      .orderBy(books.title);

    const allCopies = await db
      .select()
      .from(bookCopies)
      .where(eq(bookCopies.centerId, centerId))
      .orderBy(bookCopies.copyCode);

    const loans = await db
      .select({
        loan: bookLoans,
        copyCode: bookCopies.copyCode,
        bookTitle: books.title,
        bookAuthor: books.author,
        studentName: studentProfiles.fullName,
        studentCode: studentProfiles.studentCode,
      })
      .from(bookLoans)
      .innerJoin(bookCopies, eq(bookLoans.copyId, bookCopies.id))
      .innerJoin(books, eq(bookCopies.bookId, books.id))
      .innerJoin(studentProfiles, eq(bookLoans.studentId, studentProfiles.id))
      .where(eq(bookLoans.centerId, centerId))
      .orderBy(desc(bookLoans.issuedAt));

    return NextResponse.json({
      books: allBooks.map((b) => ({
        ...b,
        copies: allCopies.filter((c) => c.bookId === b.id),
      })),
      loans,
    });
  } catch (err) {
    console.error('GET /api/admin/books error:', err);
    return NextResponse.json({ error: 'Unable to load book catalog.' }, { status: 500 });
  }
}

const BookActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('ADD_BOOK'),
    title: z.string().trim().min(2),
    author: z.string().trim().min(2),
    category: z.string().trim().default('General'),
    shelfLocation: z.string().trim().default('Tree Shelf'),
    copyCount: z.number().int().min(1).max(20).default(1),
  }),
  z.object({
    action: z.literal('ISSUE_COPY'),
    copyId: z.number().int().positive(),
    studentId: z.number().int().positive(),
    dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    notes: z.string().optional().default(''),
  }),
  z.object({
    action: z.literal('RETURN_COPY'),
    loanId: z.number().int().positive(),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;

    const json = await req.json();
    const parsed = BookActionSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid book action.' },
        { status: 400 }
      );
    }

    if (parsed.data.action === 'ADD_BOOK') {
      const bookInput = parsed.data;
      const created = await db.transaction(async (tx) => {
        const [book] = await tx
          .insert(books)
          .values({
            centerId: staff.centerId,
            title: bookInput.title,
            author: bookInput.author,
            category: bookInput.category,
            shelfLocation: bookInput.shelfLocation,
          })
          .returning();

        const countRes = await tx
          .select({ c: sql<number>`count(*)::int` })
          .from(bookCopies)
          .where(eq(bookCopies.centerId, staff.centerId));
        const baseIdx = countRes[0]?.c ?? 0;

        const copies = [];
        for (let i = 0; i < bookInput.copyCount; i++) {
          const [copy] = await tx
            .insert(bookCopies)
            .values({
              centerId: staff.centerId,
              bookId: book.id,
              copyCode: `GV-BK-${String(baseIdx + i + 1).padStart(3, '0')}`,
              condition: 'GOOD',
              status: 'AVAILABLE',
            })
            .returning();
          copies.push(copy);
        }
        return { book, copies };
      });
      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'BOOK_ADDED',
        entityType: 'BOOK',
        entityId: String(created.book.id),
        summary: `Added "${parsed.data.title}" (${parsed.data.copyCount} copies).`,
      });
      return NextResponse.json(created, { status: 201 });
    }

    if (parsed.data.action === 'ISSUE_COPY') {
      const issueInput = parsed.data;
      const loan = await db.transaction(async (tx) => {
        const lockedRes = await tx.execute(
          sql`SELECT id, copy_code, status FROM book_copies WHERE id = ${issueInput.copyId} AND center_id = ${staff.centerId} FOR UPDATE`
        );
        const copy = lockedRes.rows[0] as
          | { id: number; copy_code: string; status: string }
          | undefined;

        if (!copy) throw new Error('Book copy not found.');
        if (copy.status !== 'AVAILABLE') {
          throw new Error(`Copy ${copy.copy_code} is already ${copy.status.toLowerCase()} and cannot be issued twice.`);
        }

        await tx
          .update(bookCopies)
          .set({ status: 'ISSUED' })
          .where(eq(bookCopies.id, copy.id));

        const [createdLoan] = await tx
          .insert(bookLoans)
          .values({
            centerId: staff.centerId,
            copyId: copy.id,
            studentId: issueInput.studentId,
            dueDate: issueInput.dueDate,
            status: 'ISSUED',
            issuedByUserId: staff.userId,
            notes: issueInput.notes,
          })
          .returning();

        return createdLoan;
      });
      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'BOOK_ISSUED',
        entityType: 'BOOK_LOAN',
        entityId: String(loan.id),
        summary: `Issued book copy #${parsed.data.copyId} to student #${parsed.data.studentId}.`,
      });
      return NextResponse.json({ loan }, { status: 201 });
    }

    // RETURN_COPY
    const returnInput = parsed.data;
    const returned = await db.transaction(async (tx) => {
      const [loan] = await tx
        .select()
        .from(bookLoans)
        .where(
          and(
            eq(bookLoans.id, returnInput.loanId),
            eq(bookLoans.centerId, staff.centerId)
          )
        )
        .limit(1);
      if (!loan || loan.status === 'RETURNED') {
        throw new Error('Active loan not found.');
      }
      const [updatedLoan] = await tx
        .update(bookLoans)
        .set({
          status: 'RETURNED',
          returnedAt: new Date(),
          returnedToUserId: staff.userId,
        })
        .where(eq(bookLoans.id, loan.id))
        .returning();

      await tx
        .update(bookCopies)
        .set({ status: 'AVAILABLE' })
        .where(eq(bookCopies.id, loan.copyId));

      return updatedLoan;
    });

    await recordAuditEvent({
      centerId: staff.centerId,
      actorType: 'STAFF',
      actorId: String(staff.userId),
      actorName: staff.fullName,
      action: 'BOOK_RETURNED',
      entityType: 'BOOK_LOAN',
      entityId: String(returned.id),
      summary: `Marked loan #${returned.id} returned.`,
    });

    return NextResponse.json({ loan: returned });
  } catch (err) {
    console.error('POST /api/admin/books error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unable to process book lending action.' },
      { status: 400 }
    );
  }
}
