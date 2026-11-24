import { NextRequest, NextResponse } from 'next/server';
import { and, asc, desc, eq, inArray, like, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/src/db/index.ts';
import { ensureSeeded } from '@/src/db/seed.ts';
import {
  achievers,
  attendanceSessions,
  auditEvents,
  bookCopies,
  bookLoans,
  bookingRequests,
  centers,
  cmsStates,
  expenses,
  invoices,
  libraryEvents,
  lockerAllocations,
  memberships,
  paymentReversals,
  payments,
  plans,
  seatAllocations,
  shifts,
  staffAccess,
  studentProfiles,
  supportTickets,
  ticketMessages,
  users,
  vlogs,
  waitlistEntries,
} from '@/src/db/schema.ts';
import { authenticateStaff, isSuperAdmin } from '@/src/lib/auth.ts';
import { recordAuditEvent } from '@/src/lib/domain.ts';

export async function GET(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;

    const centerId = staff.centerId;
    const [centerRow] = await db.select().from(centers).where(eq(centers.id, centerId)).limit(1);
    const [draft] = await db
      .select()
      .from(cmsStates)
      .where(and(eq(cmsStates.centerId, centerId), eq(cmsStates.stage, 'DRAFT')))
      .limit(1);
    const [published] = await db
      .select()
      .from(cmsStates)
      .where(and(eq(cmsStates.centerId, centerId), eq(cmsStates.stage, 'PUBLISHED')))
      .limit(1);

    const allShifts = await db
      .select()
      .from(shifts)
      .where(eq(shifts.centerId, centerId))
      .orderBy(asc(shifts.sortOrder), asc(shifts.id));
    const allPlans = await db
      .select()
      .from(plans)
      .where(eq(plans.centerId, centerId))
      .orderBy(asc(plans.sortOrder), asc(plans.id));

    const allAchievers = await db
      .select()
      .from(achievers)
      .where(eq(achievers.centerId, centerId))
      .orderBy(asc(achievers.sortOrder), desc(achievers.id));

    const allVlogs = await db
      .select()
      .from(vlogs)
      .where(eq(vlogs.centerId, centerId))
      .orderBy(asc(vlogs.sortOrder), desc(vlogs.id));

    const allEvents = await db
      .select()
      .from(libraryEvents)
      .where(eq(libraryEvents.centerId, centerId))
      .orderBy(desc(libraryEvents.eventDate), desc(libraryEvents.id));

    const waitlist = await db
      .select({
        entry: waitlistEntries,
        shiftName: shifts.name,
      })
      .from(waitlistEntries)
      .leftJoin(shifts, eq(waitlistEntries.shiftId, shifts.id))
      .where(eq(waitlistEntries.centerId, centerId))
      .orderBy(desc(waitlistEntries.createdAt));

    const staffList = isSuperAdmin(staff)
      ? await db
          .select({
            id: users.id,
            email: users.email,
            fullName: users.fullName,
            role: users.role,
            isActive: users.isActive,
          })
          .from(users)
          .where(eq(users.centerId, centerId))
      : [];

    const staffWhitelist = isSuperAdmin(staff)
      ? await db
          .select()
          .from(staffAccess)
          .where(eq(staffAccess.centerId, centerId))
          .orderBy(asc(staffAccess.id))
      : [];

    const safeCenter = centerRow
      ? {
          ...centerRow,
          adminPinHash: undefined,
          hasAdminPin: Boolean(centerRow.adminPinHash),
        }
      : null;

    return NextResponse.json({
      center: safeCenter,
      draft,
      published,
      shifts: allShifts,
      plans: allPlans,
      achievers: allAchievers,
      vlogs: allVlogs,
      events: allEvents,
      waitlist: waitlist.map((w) => ({ ...w.entry, shiftName: w.shiftName || 'Any Shift' })),
      staffUsers: staffList,
      staffAccess: staffWhitelist,
    });
  } catch (err) {
    console.error('GET /api/admin/cms error:', err);
    return NextResponse.json({ error: 'Unable to load website content.' }, { status: 500 });
  }
}

const CmsPostSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('SAVE_DRAFT'),
    heroHeadline: z.string().min(4),
    heroSubheadline: z.string().min(4),
    facilitiesJson: z.array(z.any()),
    galleryJson: z.any().optional(),
    reviewsJson: z.array(z.any()),
    noticesJson: z.array(z.any()),
    examCountdownsJson: z.array(z.any()),
    faqsJson: z.array(z.any()),
    contactOverridesJson: z.any().optional(),
  }),
  z.object({ action: z.literal('PUBLISH_CMS') }),
  z.object({
    action: z.literal('UPDATE_PLANS_SHIFTS'),
    shifts: z.array(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(2),
        displayHours: z.string().min(2),
        startMinute: z.number().int().min(300).max(1380).optional(),
        endMinute: z.number().int().min(360).max(1440).optional(),
        monthlyFeePaise: z.number().int().min(0),
        isActive: z.boolean(),
      })
    ),
    plans: z.array(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(2),
        discountPercent: z.number().int().min(0).max(90),
        description: z.string(),
        isActive: z.boolean(),
      })
    ),
  }),
  z.object({
    action: z.literal('ADD_SHIFT'),
    name: z.string().trim().min(2),
    displayHours: z.string().trim().min(2),
    startMinute: z.number().int().min(300).max(1380),
    endMinute: z.number().int().min(360).max(1440),
    monthlyFeePaise: z.number().int().min(0),
    isFlexible: z.boolean().default(false),
  }),
  z.object({
    action: z.literal('DELETE_SHIFT'),
    id: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('UPDATE_SETTINGS'),
    isDemoMode: z.boolean(),
    whatsappEnabled: z.boolean(),
    whatsappNumber: z.string(),
    gracePeriodDays: z.number().int().min(0).max(30),
    phoneDisplay: z.string().min(6),
    address: z.string().min(8),
    geofenceEnabled: z.boolean().optional(),
    centerLat: z.string().optional(),
    centerLng: z.string().optional(),
    geofenceRadiusMeters: z.number().int().min(30).max(2000).optional(),
  }),
  z.object({
    action: z.literal('UPDATE_STAFF_ROLE'),
    targetUserId: z.number().int().positive(),
    role: z.enum(['SUPER_ADMIN', 'MANAGER']),
    isActive: z.boolean(),
  }),
  z.object({
    action: z.literal('UPSERT_STAFF_ACCESS'),
    email: z.string().trim().email(),
    fullName: z.string().trim().min(2),
    role: z.enum(['SUPER_ADMIN', 'MANAGER']),
    isActive: z.boolean().default(true),
  }),
  z.object({
    action: z.literal('DELETE_STAFF_ACCESS'),
    id: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('UPSERT_ACHIEVER'),
    id: z.number().int().positive().optional(),
    fullName: z.string().trim().min(2),
    examCleared: z.string().trim().min(2),
    postOrRank: z.string().trim().optional().default(''),
    selectionYear: z.string().trim().default('2026'),
    photoUrl: z.string().trim().max(1_500_000, 'Achiever photo is too large.').optional().default(''),
    quote: z.string().optional().default(''),
    isPublished: z.boolean().default(true),
  }),
  z.object({
    action: z.literal('DELETE_ACHIEVER'),
    id: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('UPSERT_VLOG'),
    id: z.number().int().positive().optional(),
    title: z.string().trim().min(2),
    description: z.string().optional().default(''),
    videoType: z.enum(['LOCAL', 'YOUTUBE']),
    videoUrl: z.string().trim().min(3),
    thumbnailUrl: z.string().optional().default(''),
    durationLabel: z.string().optional().default(''),
    isPublished: z.boolean().default(true),
  }),
  z.object({
    action: z.literal('DELETE_VLOG'),
    id: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('UPSERT_EVENT'),
    id: z.number().int().positive().optional(),
    title: z.string().trim().min(2),
    category: z.enum(['Festivals', 'Picnic & Camps', 'Student Meetups']),
    eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().optional().default(''),
    mediaUrl: z.string().optional().default(''),
    isPublished: z.boolean().default(true),
  }),
  z.object({
    action: z.literal('DELETE_EVENT'),
    id: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('UPDATE_WAITLIST_STATUS'),
    id: z.number().int().positive(),
    status: z.enum(['WAITING', 'CONTACTED', 'CONVERTED']),
  }),
  z.object({
    action: z.literal('CLEAR_DEMO_DATA'),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    await ensureSeeded();
    const auth = await authenticateStaff(req);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const staff = auth.staff;

    const json = await req.json();
    const parsed = CmsPostSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid content payload.' },
        { status: 400 }
      );
    }

    if (parsed.data.action === 'SAVE_DRAFT') {
      const [existingDraft] = await db
        .select()
        .from(cmsStates)
        .where(and(eq(cmsStates.centerId, staff.centerId), eq(cmsStates.stage, 'DRAFT')))
        .limit(1);

      const [updated] = await db
        .update(cmsStates)
        .set({
          heroHeadline: parsed.data.heroHeadline,
          heroSubheadline: parsed.data.heroSubheadline,
          facilitiesJson: parsed.data.facilitiesJson,
          galleryJson: parsed.data.galleryJson ?? existingDraft?.galleryJson ?? {},
          reviewsJson: parsed.data.reviewsJson,
          noticesJson: parsed.data.noticesJson,
          examCountdownsJson: parsed.data.examCountdownsJson,
          faqsJson: parsed.data.faqsJson,
          contactOverridesJson:
            parsed.data.contactOverridesJson ?? existingDraft?.contactOverridesJson ?? {},
          updatedByUserId: staff.userId,
          updatedAt: new Date(),
        })
        .where(and(eq(cmsStates.centerId, staff.centerId), eq(cmsStates.stage, 'DRAFT')))
        .returning();

      return NextResponse.json({ draft: updated });
    }

    if (parsed.data.action === 'PUBLISH_CMS') {
      const [draft] = await db
        .select()
        .from(cmsStates)
        .where(and(eq(cmsStates.centerId, staff.centerId), eq(cmsStates.stage, 'DRAFT')))
        .limit(1);
      if (!draft) return NextResponse.json({ error: 'Draft not found' }, { status: 404 });

      const [published] = await db
        .update(cmsStates)
        .set({
          heroHeadline: draft.heroHeadline,
          heroSubheadline: draft.heroSubheadline,
          facilitiesJson: draft.facilitiesJson,
          galleryJson: draft.galleryJson,
          reviewsJson: draft.reviewsJson,
          noticesJson: draft.noticesJson,
          examCountdownsJson: draft.examCountdownsJson,
          faqsJson: draft.faqsJson,
          contactOverridesJson: draft.contactOverridesJson,
          updatedByUserId: staff.userId,
          updatedAt: new Date(),
        })
        .where(and(eq(cmsStates.centerId, staff.centerId), eq(cmsStates.stage, 'PUBLISHED')))
        .returning();

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'CMS_PUBLISHED',
        entityType: 'CMS',
        entityId: String(published.id),
        summary: 'Published website draft changes to live public homepage.',
      });

      return NextResponse.json({ published });
    }

    if (parsed.data.action === 'UPDATE_WAITLIST_STATUS') {
      const [updated] = await db
        .update(waitlistEntries)
        .set({ status: parsed.data.status })
        .where(
          and(
            eq(waitlistEntries.id, parsed.data.id),
            eq(waitlistEntries.centerId, staff.centerId)
          )
        )
        .returning();
      return NextResponse.json({ entry: updated });
    }

    if (parsed.data.action === 'UPSERT_ACHIEVER') {
      const d = parsed.data;
      if (d.id) {
        const [updated] = await db
          .update(achievers)
          .set({
            fullName: d.fullName,
            examCleared: d.examCleared,
            postOrRank: d.postOrRank,
            selectionYear: d.selectionYear,
            photoUrl: d.photoUrl,
            quote: d.quote,
            isPublished: d.isPublished,
          })
          .where(and(eq(achievers.id, d.id), eq(achievers.centerId, staff.centerId)))
          .returning();
        if (!updated) {
          return NextResponse.json({ error: 'Achiever not found.' }, { status: 404 });
        }
        await recordAuditEvent({
          centerId: staff.centerId,
          actorType: 'STAFF',
          actorId: String(staff.userId),
          actorName: staff.fullName,
          action: 'ACHIEVER_UPDATED',
          entityType: 'ACHIEVER',
          entityId: String(updated.id),
          summary: `Updated achiever ${updated.fullName} (${updated.examCleared}).`,
        });
        return NextResponse.json({ achiever: updated });
      }
      const [created] = await db
        .insert(achievers)
        .values({
          centerId: staff.centerId,
          fullName: d.fullName,
          examCleared: d.examCleared,
          postOrRank: d.postOrRank,
          selectionYear: d.selectionYear,
          photoUrl: d.photoUrl,
          quote: d.quote,
          isPublished: d.isPublished,
        })
        .returning();
      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'ACHIEVER_CREATED',
        entityType: 'ACHIEVER',
        entityId: String(created.id),
        summary: `Added achiever ${created.fullName} (${created.examCleared}).`,
      });
      return NextResponse.json({ achiever: created }, { status: 201 });
    }

    if (parsed.data.action === 'DELETE_ACHIEVER') {
      await db
        .delete(achievers)
        .where(and(eq(achievers.id, parsed.data.id), eq(achievers.centerId, staff.centerId)));
      return NextResponse.json({ deleted: true });
    }

    if (parsed.data.action === 'UPSERT_VLOG') {
      const d = parsed.data;
      if (d.id) {
        const [updated] = await db
          .update(vlogs)
          .set({
            title: d.title,
            description: d.description,
            videoType: d.videoType,
            videoUrl: d.videoUrl,
            thumbnailUrl: d.thumbnailUrl,
            durationLabel: d.durationLabel,
            isPublished: d.isPublished,
          })
          .where(and(eq(vlogs.id, d.id), eq(vlogs.centerId, staff.centerId)))
          .returning();
        return NextResponse.json({ vlog: updated });
      }
      const [created] = await db
        .insert(vlogs)
        .values({
          centerId: staff.centerId,
          title: d.title,
          description: d.description,
          videoType: d.videoType,
          videoUrl: d.videoUrl,
          thumbnailUrl: d.thumbnailUrl,
          durationLabel: d.durationLabel,
          isPublished: d.isPublished,
        })
        .returning();
      return NextResponse.json({ vlog: created }, { status: 201 });
    }

    if (parsed.data.action === 'DELETE_VLOG') {
      await db
        .delete(vlogs)
        .where(and(eq(vlogs.id, parsed.data.id), eq(vlogs.centerId, staff.centerId)));
      return NextResponse.json({ deleted: true });
    }

    if (parsed.data.action === 'UPSERT_EVENT') {
      const d = parsed.data;
      if (d.id) {
        const [updated] = await db
          .update(libraryEvents)
          .set({
            title: d.title,
            category: d.category,
            eventDate: d.eventDate,
            description: d.description,
            mediaUrl: d.mediaUrl,
            isPublished: d.isPublished,
          })
          .where(and(eq(libraryEvents.id, d.id), eq(libraryEvents.centerId, staff.centerId)))
          .returning();
        return NextResponse.json({ event: updated });
      }
      const [created] = await db
        .insert(libraryEvents)
        .values({
          centerId: staff.centerId,
          title: d.title,
          category: d.category,
          eventDate: d.eventDate,
          description: d.description,
          mediaUrl: d.mediaUrl,
          isPublished: d.isPublished,
        })
        .returning();
      return NextResponse.json({ event: created }, { status: 201 });
    }

    if (parsed.data.action === 'DELETE_EVENT') {
      await db
        .delete(libraryEvents)
        .where(and(eq(libraryEvents.id, parsed.data.id), eq(libraryEvents.centerId, staff.centerId)));
      return NextResponse.json({ deleted: true });
    }

    // Owner-only mutations below
    if (!isSuperAdmin(staff)) {
      return NextResponse.json(
        { error: 'Only the Center Owner (SUPER_ADMIN) can change pricing, settings, or staff access.' },
        { status: 403 }
      );
    }

    if (parsed.data.action === 'UPDATE_PLANS_SHIFTS') {
      for (const sh of parsed.data.shifts) {
        await db
          .update(shifts)
          .set({
            name: sh.name,
            displayHours: sh.displayHours,
            ...(sh.startMinute !== undefined ? { startMinute: sh.startMinute } : {}),
            ...(sh.endMinute !== undefined ? { endMinute: sh.endMinute } : {}),
            monthlyFeePaise: sh.monthlyFeePaise,
            isActive: sh.isActive,
          })
          .where(and(eq(shifts.id, sh.id), eq(shifts.centerId, staff.centerId)));
      }
      for (const pl of parsed.data.plans) {
        await db
          .update(plans)
          .set({
            name: pl.name,
            discountPercent: pl.discountPercent,
            description: pl.description,
            isActive: pl.isActive,
          })
          .where(and(eq(plans.id, pl.id), eq(plans.centerId, staff.centerId)));
      }
      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'PLANS_SHIFTS_UPDATED',
        entityType: 'PRICING',
        entityId: String(staff.centerId),
        summary: 'Updated shift fees and plan discounts (historical invoices preserved).',
      });
      return NextResponse.json({ ok: true });
    }

    if (parsed.data.action === 'ADD_SHIFT') {
      const d = parsed.data;
      if (d.endMinute <= d.startMinute) {
        return NextResponse.json(
          { error: 'Shift end time must be after start time.' },
          { status: 400 }
        );
      }
      const existingShifts = await db
        .select()
        .from(shifts)
        .where(eq(shifts.centerId, staff.centerId));
      const baseCode = d.name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 20) || 'CUSTOM';
      const code = existingShifts.some((s) => s.code === baseCode)
        ? `${baseCode}_${existingShifts.length + 1}`
        : baseCode;
      const maxSort = existingShifts.reduce((m, s) => Math.max(m, s.sortOrder), 0);

      const [created] = await db
        .insert(shifts)
        .values({
          centerId: staff.centerId,
          name: d.name,
          code,
          displayHours: d.displayHours,
          startMinute: d.startMinute,
          endMinute: d.endMinute,
          monthlyFeePaise: d.monthlyFeePaise,
          isFlexible: d.isFlexible,
          sortOrder: maxSort + 1,
          isActive: true,
        })
        .returning();

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'SHIFT_ADDED',
        entityType: 'SHIFT',
        entityId: String(created.id),
        summary: `Added shift ${created.name} (${created.displayHours}).`,
      });
      return NextResponse.json({ shift: created }, { status: 201 });
    }

    if (parsed.data.action === 'DELETE_SHIFT') {
      const targetId = parsed.data.id;
      const [usedMembership] = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(eq(memberships.shiftId, targetId))
        .limit(1);
      const [usedAlloc] = await db
        .select({ id: seatAllocations.id })
        .from(seatAllocations)
        .where(eq(seatAllocations.shiftId, targetId))
        .limit(1);
      const [usedReq] = await db
        .select({ id: bookingRequests.id })
        .from(bookingRequests)
        .where(eq(bookingRequests.shiftId, targetId))
        .limit(1);

      if (usedMembership || usedAlloc || usedReq) {
        return NextResponse.json(
          {
            error:
              'This shift has existing memberships, allocations, or booking requests. Toggle it Inactive instead of deleting.',
          },
          { status: 409 }
        );
      }

      await db
        .delete(shifts)
        .where(and(eq(shifts.id, targetId), eq(shifts.centerId, staff.centerId)));

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'SHIFT_DELETED',
        entityType: 'SHIFT',
        entityId: String(targetId),
        summary: `Deleted unused shift #${targetId}.`,
      });
      return NextResponse.json({ deleted: true });
    }

    if (parsed.data.action === 'UPDATE_SETTINGS') {
      const cleanWa = parsed.data.whatsappNumber.replace(/\D/g, '');
      const waActive = parsed.data.whatsappEnabled && cleanWa.length >= 10;
      const [updatedCenter] = await db
        .update(centers)
        .set({
          isDemoMode: parsed.data.isDemoMode,
          whatsappEnabled: waActive,
          whatsappNumber: cleanWa,
          gracePeriodDays: parsed.data.gracePeriodDays,
          phoneDisplay: parsed.data.phoneDisplay,
          address: parsed.data.address,
          ...(parsed.data.geofenceEnabled !== undefined
            ? { geofenceEnabled: parsed.data.geofenceEnabled }
            : {}),
          ...(parsed.data.centerLat !== undefined ? { centerLat: parsed.data.centerLat } : {}),
          ...(parsed.data.centerLng !== undefined ? { centerLng: parsed.data.centerLng } : {}),
          ...(parsed.data.geofenceRadiusMeters !== undefined
            ? { geofenceRadiusMeters: parsed.data.geofenceRadiusMeters }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(centers.id, staff.centerId))
        .returning();

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'CENTER_SETTINGS_UPDATED',
        entityType: 'CENTER',
        entityId: String(staff.centerId),
        summary: `Updated center settings (Grace: ${updatedCenter.gracePeriodDays}d, Geofence: ${updatedCenter.geofenceEnabled}, WhatsApp: ${waActive}).`,
      });
      return NextResponse.json({
        center: {
          ...updatedCenter,
          adminPinHash: undefined,
          hasAdminPin: Boolean(updatedCenter.adminPinHash),
        },
      });
    }

    if (parsed.data.action === 'UPDATE_STAFF_ROLE') {
      const [updatedUser] = await db
        .update(users)
        .set({ role: parsed.data.role, isActive: parsed.data.isActive, updatedAt: new Date() })
        .where(
          and(
            eq(users.id, parsed.data.targetUserId),
            eq(users.centerId, staff.centerId)
          )
        )
        .returning();

      if (updatedUser?.email) {
        await db
          .update(staffAccess)
          .set({ role: parsed.data.role, isActive: parsed.data.isActive, updatedAt: new Date() })
          .where(
            and(
              eq(staffAccess.centerId, staff.centerId),
              eq(staffAccess.email, updatedUser.email.toLowerCase())
            )
          );
      }

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'STAFF_ROLE_UPDATED',
        entityType: 'USER',
        entityId: String(parsed.data.targetUserId),
        summary: `Updated staff role for ${updatedUser?.email} to ${parsed.data.role}.`,
      });
      return NextResponse.json({ user: updatedUser });
    }

    if (parsed.data.action === 'UPSERT_STAFF_ACCESS') {
      const cleanEmail = parsed.data.email.trim().toLowerCase();
      const [row] = await db
        .insert(staffAccess)
        .values({
          centerId: staff.centerId,
          email: cleanEmail,
          fullName: parsed.data.fullName,
          role: parsed.data.role,
          isActive: parsed.data.isActive,
          createdByUserId: staff.userId,
        })
        .onConflictDoUpdate({
          target: [staffAccess.centerId, staffAccess.email],
          set: {
            fullName: parsed.data.fullName,
            role: parsed.data.role,
            isActive: parsed.data.isActive,
            updatedAt: new Date(),
          },
        })
        .returning();

      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'STAFF_WHITELIST_UPDATED',
        entityType: 'STAFF_ACCESS',
        entityId: String(row.id),
        summary: `Whitelisted ${cleanEmail} as ${parsed.data.role} (${parsed.data.isActive ? 'active' : 'paused'}).`,
      });

      return NextResponse.json({ entry: row });
    }

    if (parsed.data.action === 'DELETE_STAFF_ACCESS') {
      const [target] = await db
        .select()
        .from(staffAccess)
        .where(and(eq(staffAccess.id, parsed.data.id), eq(staffAccess.centerId, staff.centerId)))
        .limit(1);
      if (!target) return NextResponse.json({ error: 'Staff entry not found.' }, { status: 404 });
      if (target.email.toLowerCase() === staff.email.toLowerCase()) {
        return NextResponse.json(
          { error: 'You cannot remove your own active owner email from the whitelist.' },
          { status: 400 }
        );
      }
      await db.delete(staffAccess).where(eq(staffAccess.id, target.id));
      await recordAuditEvent({
        centerId: staff.centerId,
        actorType: 'STAFF',
        actorId: String(staff.userId),
        actorName: staff.fullName,
        action: 'STAFF_WHITELIST_REMOVED',
        entityType: 'STAFF_ACCESS',
        entityId: String(target.id),
        summary: `Removed ${target.email} from staff access whitelist.`,
      });
      return NextResponse.json({ deleted: true });
    }

    if (parsed.data.action === 'CLEAR_DEMO_DATA') {
      const DEMO_CODES = [
        'GV-2026-001',
        'GV-2026-002',
        'GV-2026-003',
        'GV-2026-004',
        'GV-2026-005',
        'GV-2026-006',
      ];
      const DEMO_EXPENSE_TITLES = [
        'Sunful Complex Hall Monthly Rent',
        'JBVNL Electricity & AC Bill',
        'Dual Fiber Broadband (200 Mbps)',
        'Daily Cleaning & Drinking Water Supply',
      ];

      const summary = await db.transaction(async (tx) => {
        const demoStudents = await tx
          .select({ id: studentProfiles.id })
          .from(studentProfiles)
          .where(
            and(
              eq(studentProfiles.centerId, staff.centerId),
              or(
                inArray(studentProfiles.studentCode, DEMO_CODES),
                like(studentProfiles.email, '%@example.in')
              )
            )
          );

        const demoStudentIds = demoStudents.map((s) => s.id);

        if (demoStudentIds.length > 0) {
          await tx
            .update(bookingRequests)
            .set({ approvedStudentId: null, updatedAt: new Date() })
            .where(inArray(bookingRequests.approvedStudentId, demoStudentIds));

          const activeLoans = await tx
            .select({ copyId: bookLoans.copyId })
            .from(bookLoans)
            .where(
              and(
                inArray(bookLoans.studentId, demoStudentIds),
                inArray(bookLoans.status, ['ISSUED', 'OVERDUE'])
              )
            );
          if (activeLoans.length > 0) {
            await tx
              .update(bookCopies)
              .set({ status: 'AVAILABLE' })
              .where(inArray(bookCopies.id, activeLoans.map((l) => l.copyId)));
          }
          await tx.delete(bookLoans).where(inArray(bookLoans.studentId, demoStudentIds));

          const demoTickets = await tx
            .select({ id: supportTickets.id })
            .from(supportTickets)
            .where(inArray(supportTickets.studentId, demoStudentIds));
          if (demoTickets.length > 0) {
            await tx
              .delete(ticketMessages)
              .where(inArray(ticketMessages.ticketId, demoTickets.map((t) => t.id)));
            await tx.delete(supportTickets).where(inArray(supportTickets.studentId, demoStudentIds));
          }

          await tx
            .delete(attendanceSessions)
            .where(inArray(attendanceSessions.studentId, demoStudentIds));

          const demoPayments = await tx
            .select({ id: payments.id })
            .from(payments)
            .where(inArray(payments.studentId, demoStudentIds));
          const demoInvoices = await tx
            .select({ id: invoices.id })
            .from(invoices)
            .where(inArray(invoices.studentId, demoStudentIds));
          if (demoPayments.length > 0) {
            await tx
              .delete(paymentReversals)
              .where(inArray(paymentReversals.paymentId, demoPayments.map((p) => p.id)));
          }
          if (demoInvoices.length > 0) {
            await tx
              .delete(paymentReversals)
              .where(inArray(paymentReversals.invoiceId, demoInvoices.map((i) => i.id)));
          }

          await tx.delete(payments).where(inArray(payments.studentId, demoStudentIds));
          await tx.delete(invoices).where(inArray(invoices.studentId, demoStudentIds));
          await tx
            .delete(seatAllocations)
            .where(inArray(seatAllocations.studentId, demoStudentIds));
          await tx
            .delete(lockerAllocations)
            .where(inArray(lockerAllocations.studentId, demoStudentIds));
          await tx.delete(memberships).where(inArray(memberships.studentId, demoStudentIds));
          await tx
            .delete(studentProfiles)
            .where(inArray(studentProfiles.id, demoStudentIds));
        }

        const deletedReqs = await tx
          .delete(bookingRequests)
          .where(
            and(
              eq(bookingRequests.centerId, staff.centerId),
              inArray(bookingRequests.referenceCode, ['REQ-2026-1001', 'REQ-2026-1002'])
            )
          )
          .returning({ id: bookingRequests.id });

        await tx
          .delete(supportTickets)
          .where(
            and(
              eq(supportTickets.centerId, staff.centerId),
              eq(supportTickets.ticketNumber, 'TKT-1001')
            )
          );

        const deletedExpenses = await tx
          .delete(expenses)
          .where(
            and(
              eq(expenses.centerId, staff.centerId),
              inArray(expenses.title, DEMO_EXPENSE_TITLES)
            )
          )
          .returning({ id: expenses.id });

        await tx
          .update(centers)
          .set({ isDemoMode: false, updatedAt: new Date() })
          .where(eq(centers.id, staff.centerId));

        await tx.insert(auditEvents).values({
          centerId: staff.centerId,
          actorType: 'STAFF',
          actorId: String(staff.userId),
          actorName: staff.fullName,
          action: 'DEMO_DATA_CLEARED',
          entityType: 'CENTER',
          entityId: String(staff.centerId),
          summary: `Cleared ${demoStudentIds.length} demo students, ${deletedReqs.length} demo requests, and ${deletedExpenses.length} seeded expenses while preserving 50 desks, 4 shifts, CMS, and staff whitelist.`,
        });

        return {
          clearedStudents: demoStudentIds.length,
          clearedRequests: deletedReqs.length,
          clearedExpenses: deletedExpenses.length,
        };
      });

      return NextResponse.json({ ok: true, ...summary });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('POST /api/admin/cms error:', err);
    return NextResponse.json({ error: 'Unable to update CMS or settings.' }, { status: 500 });
  }
}
