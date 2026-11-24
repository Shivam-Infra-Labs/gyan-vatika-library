import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, withDbRetry } from './index.ts';
import {
  achievers,
  attendanceSessions,
  auditEvents,
  bookCopies,
  bookLoans,
  bookingRequests,
  books,
  centers,
  cmsStates,
  expenses,
  invoices,
  libraryEvents,
  memberships,
  payments,
  plans,
  rooms,
  seatAllocations,
  seats,
  shifts,
  staffAccess,
  studentProfiles,
  supportTickets,
  ticketMessages,
  users,
  vlogs,
} from './schema.ts';
import { addDaysDateStr, addMonthsDateStr, todayIST } from '../lib/format.ts';
import { hashPin } from '../lib/student-session.ts';
import { GALLERY_PHOTOS, LIBRARY_VIDEOS } from '../lib/media.ts';

declare global {
  var _gvSeedPromise: Promise<number> | undefined;
  var _gvSeededCenterId: number | undefined;
}

export async function ensureSeeded(): Promise<number> {
  if (global._gvSeededCenterId) {
    return global._gvSeededCenterId;
  }
  if (global._gvSeedPromise) {
    return global._gvSeedPromise;
  }
  global._gvSeedPromise = runSeed()
    .then((centerId) => {
      global._gvSeededCenterId = centerId;
      return centerId;
    })
    .catch((err) => {
      global._gvSeedPromise = undefined;
      global._gvSeededCenterId = undefined;
      throw err;
    });
  return global._gvSeedPromise;
}

export async function runSeed(): Promise<number> {
  const existing = await withDbRetry(
    () =>
      db
        .select()
        .from(centers)
        .where(eq(centers.slug, 'gyan-vatika-chota-gamaria'))
        .limit(1),
    'seed-check-center'
  );

  if (existing[0]) {
    const centerId = existing[0].id;
    // Non-destructive sync: ensure any active users are present in staff_access if staff_access is empty
    const accessRows = await withDbRetry(
      () =>
        db
          .select({ id: staffAccess.id })
          .from(staffAccess)
          .where(eq(staffAccess.centerId, centerId))
          .limit(1),
      'seed-check-staff-access'
    );
    if (accessRows.length === 0) {
      const existingUsers = await withDbRetry(
        () => db.select().from(users).where(eq(users.centerId, centerId)),
        'seed-sync-users'
      );
      for (const u of existingUsers) {
        if (u.isActive && u.email) {
          await db
            .insert(staffAccess)
            .values({
              centerId,
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
    return centerId;
  }

  const today = todayIST();

  // 1. Center (50 seats, live configuration)
  const [center] = await db
    .insert(centers)
    .values({
      slug: 'gyan-vatika-chota-gamaria',
      name: 'Gyan Vatika Library',
      category: 'Library and self-study center',
      phoneDisplay: '08580103307',
      callLink: 'tel:+918580103307',
      address:
        'SUNFUL COMPLEX Service Road, Tata Kandra Rd, near Manish Net Cafe, Chota Gamaria, Jharkhand 832108',
      landmark: 'Near Manish Net Cafe',
      instagramUrl: 'https://www.instagram.com/gyanvatika_library/',
      googleBusinessUrl: 'https://share.google/KY3QtX1E2olCugnhw',
      googleRating: '4.9',
      googleReviewCount: 83,
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      isDemoMode: false,
      whatsappEnabled: false,
      whatsappNumber: '918580103307',
      gracePeriodDays: 3,
      totalConfiguredSeats: 50,
      geofenceEnabled: false,
      centerLat: '22.8152',
      centerLng: '86.0914',
      geofenceRadiusMeters: 150,
    })
    .returning();

  const centerId = center.id;

  // 2. Room & Architectural 50-Seat Map (9 cols x 6 rows with central aisle x=4, entrance x=4,y=5)
  const [room] = await db
    .insert(rooms)
    .values({
      centerId,
      name: 'Main Reading Hall',
      code: 'HALL-A',
      floorLabel: 'Sunful Complex · Main Hall',
      rows: 6,
      cols: 9,
      layoutMeta: {
        entrance: { x: 4, y: 5, label: 'Silence Zone Entrance' },
        walkwayCols: [4],
        windows: [
          { side: 'right', startRow: 0, endRow: 4, label: 'Daylight Window Curtain Wall' },
        ],
        acVents: [
          { x: 4, y: 0, label: 'Split AC Unit' },
          { x: 8, y: 2, label: 'Air Circulation' },
        ],
        bookshelfZone: { x: 1, y: 0, label: 'Tree Bookshelf & Collection' },
      },
      isActive: true,
    })
    .returning();

  const gridSlots: Array<{ x: number; y: number; zone: string; win: boolean; ac: boolean }> = [];
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 9; x++) {
      // 9x6 = 54 cells. Skip 4 walkway cells on column 4 (rows 2..5) => exact 50 desks!
      if (x === 4 && y >= 2 && y <= 5) continue;
      const zone =
        x >= 7 ? 'Window Wing' : x <= 1 && y <= 1 ? 'Tree Shelf Corner' : 'Central Aisle';
      gridSlots.push({
        x,
        y,
        zone,
        win: x === 8 && y <= 4,
        ac: (x >= 3 && x <= 5 && y <= 1) || (x === 8 && y === 2),
      });
    }
  }

  const insertedSeats = await db
    .insert(seats)
    .values(
      gridSlots.slice(0, 50).map((slot, idx) => {
        const seatNumber = idx + 1;
        return {
          centerId,
          roomId: room.id,
          seatNumber,
          label: `Desk #${seatNumber}`,
          gridX: slot.x,
          gridY: slot.y,
          zone: slot.zone,
          hasPowerOutlet: true,
          nearWindow: slot.win,
          nearAc: slot.ac,
          status: seatNumber === 13 ? 'MAINTENANCE' : 'ACTIVE',
          notes:
            seatNumber === 41 || seatNumber === 42
              ? 'Located directly beneath the handcrafted tree-shaped bookshelf.'
              : seatNumber === 24
              ? 'Window-side cubicle desk featured in the reading room tour.'
              : seatNumber === 13
              ? 'Power socket maintenance scheduled.'
              : '',
        };
      })
    )
    .returning();

  const seatByNum = new Map<number, number>();
  for (const s of insertedSeats) seatByNum.set(s.seatNumber, s.id);

  // 3. Real Shifts (4 exact shifts)
  const insertedShifts = await db
    .insert(shifts)
    .values([
      {
        centerId,
        code: 'MORNING',
        name: 'Morning Shift',
        startMinute: 540, // 09:00 AM
        endMinute: 900, // 03:00 PM
        displayHours: '09:00 AM - 03:00 PM',
        monthlyFeePaise: 70000,
        isFlexible: false,
        minMinutes: 360,
        maxMinutes: 360,
        isActive: true,
        sortOrder: 1,
      },
      {
        centerId,
        code: 'EVENING',
        name: 'Evening Shift',
        startMinute: 900, // 03:00 PM
        endMinute: 1260, // 09:00 PM
        displayHours: '03:00 PM - 09:00 PM',
        monthlyFeePaise: 70000,
        isFlexible: false,
        minMinutes: 360,
        maxMinutes: 360,
        isActive: true,
        sortOrder: 2,
      },
      {
        centerId,
        code: 'FULL_DAY',
        name: 'Full Day Shift',
        startMinute: 540, // 09:00 AM
        endMinute: 1260, // 09:00 PM
        displayHours: '09:00 AM - 09:00 PM',
        monthlyFeePaise: 120000,
        isFlexible: false,
        minMinutes: 720,
        maxMinutes: 720,
        isActive: true,
        sortOrder: 3,
      },
      {
        centerId,
        code: 'FLEXIBLE',
        name: 'Flexible Short Pass',
        startMinute: 540, // default 09:00 AM
        endMinute: 720, // default 12:00 PM
        displayHours: '2–3 Hours Custom Slot',
        monthlyFeePaise: 40000,
        isFlexible: true,
        minMinutes: 120,
        maxMinutes: 180,
        isActive: true,
        sortOrder: 4,
      },
    ])
    .returning();

  const shiftByCode = new Map<string, (typeof insertedShifts)[number]>();
  for (const sh of insertedShifts) shiftByCode.set(sh.code, sh);

  // 4. Plans
  const insertedPlans = await db
    .insert(plans)
    .values([
      {
        centerId,
        code: 'MONTHLY',
        name: 'Monthly',
        durationMonths: 1,
        discountPercent: 0,
        description: 'Flexible 1-month study desk membership with reserved shift slot.',
        isActive: true,
        sortOrder: 1,
      },
      {
        centerId,
        code: 'QUARTERLY',
        name: 'Quarterly',
        durationMonths: 3,
        discountPercent: 10,
        description: '3-month dedicated desk pass with 10% term savings.',
        isActive: true,
        sortOrder: 2,
      },
      {
        centerId,
        code: 'HALF_YEARLY',
        name: 'Half-Yearly',
        durationMonths: 6,
        discountPercent: 15,
        description: '6-month exam-prep pass with 15% term savings.',
        isActive: true,
        sortOrder: 3,
      },
    ])
    .returning();

  const planByCode = new Map<string, (typeof insertedPlans)[number]>();
  for (const pl of insertedPlans) planByCode.set(pl.code, pl);

  // 5. Initial Students (without lockers)
  const demoStudentsInput = [
    {
      code: 'GV-2026-001',
      name: 'Aarav Kumar',
      phone: '9835100101',
      email: 'aarav.student@example.in',
      exam: 'UPSC CSE',
      seatNum: 42,
      shiftCode: 'FULL_DAY',
      planCode: 'QUARTERLY',
      startOffset: -20,
      paidRatio: 1,
      insideNow: true,
    },
    {
      code: 'GV-2026-002',
      name: 'Priya Kumari',
      phone: '9835100102',
      email: 'priya.student@example.in',
      exam: 'SSC CGL',
      seatNum: 24,
      shiftCode: 'MORNING',
      planCode: 'MONTHLY',
      startOffset: -10,
      paidRatio: 0.5,
      insideNow: true,
    },
    {
      code: 'GV-2026-003',
      name: 'Rohan Mahto',
      phone: '9835100103',
      email: 'rohan.student@example.in',
      exam: 'GATE ME',
      seatNum: 24, // Evening shift cleanly sharing Desk #24 with Priya (Morning)!
      shiftCode: 'EVENING',
      planCode: 'MONTHLY',
      startOffset: -28,
      paidRatio: 1,
      insideNow: false,
    },
    {
      code: 'GV-2026-004',
      name: 'Ananya Singh',
      phone: '9835100104',
      email: 'ananya.student@example.in',
      exam: 'NEET UG',
      seatNum: 41,
      shiftCode: 'MORNING',
      planCode: 'HALF_YEARLY',
      startOffset: -35,
      paidRatio: 1,
      insideNow: true,
    },
    {
      code: 'GV-2026-005',
      name: 'Vikram Das',
      phone: '9835100105',
      email: 'vikram.student@example.in',
      exam: 'JPSC',
      seatNum: 8,
      shiftCode: 'EVENING',
      planCode: 'MONTHLY',
      startOffset: -32,
      paidRatio: 0,
      insideNow: false,
    },
    {
      code: 'GV-2026-006',
      name: 'Sneha Patel',
      phone: '9835100106',
      email: 'sneha.student@example.in',
      exam: 'Banking PO',
      seatNum: 15,
      shiftCode: 'FLEXIBLE',
      planCode: 'MONTHLY',
      startOffset: -5,
      paidRatio: 1,
      insideNow: false,
    },
  ];

  const createdStudents: Array<{ id: number; code: string; name: string; seatId: number; membershipId: number }> = [];

  for (let i = 0; i < demoStudentsInput.length; i++) {
    const item = demoStudentsInput[i];
    const [student] = await db
      .insert(studentProfiles)
      .values({
        centerId,
        studentCode: item.code,
        fullName: item.name,
        phone: item.phone,
        whatsappNumber: item.phone,
        email: item.email,
        guardianName: 'Guardian',
        emergencyContactName: 'Family Contact',
        emergencyContactPhone: `983520010${i + 1}`,
        address: 'Chota Gamaria, Seraikela Kharsawan, Jharkhand',
        examTarget: item.exam,
        govIdType: 'Aadhaar',
        govIdLast4: `${4100 + i}`,
        rulesAccepted: true,
        pinHash: await hashPin('1234'),
        qrSecret: `GVQR-${crypto.randomBytes(8).toString('hex').toUpperCase()}`,
        status: 'ACTIVE',
      })
      .returning();

    const sh = shiftByCode.get(item.shiftCode)!;
    const pl = planByCode.get(item.planCode)!;
    const startDate = addDaysDateStr(today, item.startOffset);
    const endDate = addMonthsDateStr(startDate, pl.durationMonths);
    const graceEndDate = addDaysDateStr(endDate, center.gracePeriodDays);

    let mStatus = 'ACTIVE';
    if (today > graceEndDate) mStatus = 'EXPIRED';
    else if (today > endDate) mStatus = 'IN_GRACE';
    else if (addDaysDateStr(today, 3) >= endDate) mStatus = 'EXPIRING_SOON';

    const slotLabel = sh.isFlexible ? '09:00 AM - 12:00 PM' : sh.displayHours;

    const [membership] = await db
      .insert(memberships)
      .values({
        centerId,
        studentId: student.id,
        shiftId: sh.id,
        planId: pl.id,
        startDate,
        endDate,
        graceEndDate,
        customStartMinute: sh.isFlexible ? sh.startMinute : null,
        customEndMinute: sh.isFlexible ? sh.endMinute : null,
        customSlotLabel: sh.isFlexible ? slotLabel : '',
        status: mStatus,
      })
      .returning();

    const seatId = seatByNum.get(item.seatNum)!;
    await db.insert(seatAllocations).values({
      centerId,
      seatId,
      membershipId: membership.id,
      studentId: student.id,
      shiftId: sh.id,
      startDate,
      endDate,
      startMinute: sh.startMinute,
      endMinute: sh.endMinute,
      customSlotLabel: sh.isFlexible ? slotLabel : '',
      status: 'ACTIVE',
    });

    const subtotalPaise = sh.monthlyFeePaise * pl.durationMonths;
    const discountPaise = Math.round((subtotalPaise * pl.discountPercent) / 100);
    const totalPaise = subtotalPaise - discountPaise;
    const paidPaise = Math.round(totalPaise * item.paidRatio);
    const balancePaise = totalPaise - paidPaise;
    const invStatus = balancePaise === 0 ? 'PAID' : paidPaise > 0 ? 'PARTIAL' : 'UNPAID';

    const [invoice] = await db
      .insert(invoices)
      .values({
        centerId,
        invoiceNumber: `INV-2026-000${i + 1}`,
        studentId: student.id,
        membershipId: membership.id,
        subtotalPaise,
        discountPaise,
        lockerFeePaise: 0,
        totalPaise,
        paidPaise,
        balancePaise,
        status: invStatus,
        dueDate: startDate,
        snapshotJson: {
          planName: pl.name,
          durationMonths: pl.durationMonths,
          discountPercent: pl.discountPercent,
          shiftName: sh.name,
          shiftHours: slotLabel,
          monthlyFeePaise: sh.monthlyFeePaise,
          seatNumber: item.seatNum,
        },
      })
      .returning();

    if (paidPaise > 0) {
      await db.insert(payments).values({
        centerId,
        invoiceId: invoice.id,
        studentId: student.id,
        receiptNumber: `RCP-2026-000${i + 1}`,
        amountPaise: paidPaise,
        method: i % 2 === 0 ? 'UPI' : 'CASH',
        referenceCode: i % 2 === 0 ? `UPI-GV-${3201 + i}` : 'COUNTER-CASH',
        status: 'POSTED',
        idempotencyKey: `seed-pay-${i + 1}`,
        paidAt: new Date(Date.now() - Math.abs(item.startOffset) * 86400000),
      });
    }

    const checkInToday = new Date();
    checkInToday.setHours(9, 10 + i * 5, 0, 0);
    if (item.insideNow) {
      await db.insert(attendanceSessions).values({
        centerId,
        studentId: student.id,
        membershipId: membership.id,
        seatId,
        checkInAt: checkInToday,
        source: 'STUDENT_SCAN',
        status: 'OPEN',
      });
    }
    const yIn = new Date(Date.now() - 86400000);
    yIn.setHours(9, 15, 0, 0);
    const yOut = new Date(yIn.getTime() + (210 + i * 35) * 60000);
    await db.insert(attendanceSessions).values({
      centerId,
      studentId: student.id,
      membershipId: membership.id,
      seatId,
      checkInAt: yIn,
      checkOutAt: yOut,
      durationMinutes: 210 + i * 35,
      source: 'STUDENT_SCAN',
      status: 'CLOSED',
    });

    createdStudents.push({
      id: student.id,
      code: student.studentCode,
      name: student.fullName,
      seatId,
      membershipId: membership.id,
    });
  }

  // 6. Pending Online Seat Requests
  await db.insert(bookingRequests).values([
    {
      centerId,
      referenceCode: 'REQ-2026-1001',
      fullName: 'Karan Mahato',
      phone: '9835400201',
      whatsappNumber: '9835400201',
      email: 'karan.req@example.in',
      emergencyContactPhone: '9835400299',
      examTarget: 'SSC CGL',
      shiftId: shiftByCode.get('MORNING')!.id,
      planId: planByCode.get('QUARTERLY')!.id,
      seatId: seatByNum.get(18)!,
      lockerRequested: false,
      startDate: addDaysDateStr(today, 1),
      quotedTotalPaise: Math.round(70000 * 3 * 0.9),
      status: 'PENDING',
      idempotencyKey: 'seed-req-1001',
    },
    {
      centerId,
      referenceCode: 'REQ-2026-1002',
      fullName: 'Meera Kumari',
      phone: '9835400202',
      whatsappNumber: '9835400202',
      email: 'meera.req@example.in',
      emergencyContactPhone: '9835400288',
      examTarget: 'UPSC CSE',
      shiftId: shiftByCode.get('FULL_DAY')!.id,
      planId: planByCode.get('MONTHLY')!.id,
      seatId: seatByNum.get(22)!,
      lockerRequested: false,
      startDate: today,
      quotedTotalPaise: 120000,
      status: 'PENDING',
      idempotencyKey: 'seed-req-1002',
    },
  ]);

  // 7. Books & Copies
  const bookSeed = [
    { title: '1984', author: 'George Orwell', category: 'Novels', shelf: 'Tree Shelf' },
    { title: 'Of Human Bondage', author: 'William Somerset Maugham', category: 'Novels', shelf: 'Main Collection' },
    { title: 'Kamayani', author: 'Jaishankar Prasad', category: 'Hindi Literature', shelf: 'Main Collection' },
    { title: 'Sapiens: A Brief History of Humankind', author: 'Yuval Noah Harari', category: 'Humanity', shelf: 'Main Collection' },
    { title: 'White Nights', author: 'Fyodor Dostoevsky', category: 'Novels', shelf: 'Main Collection' },
    { title: 'Shoe Dog', author: 'Phil Knight', category: 'Biographies', shelf: 'Main Collection' },
  ];

  const insertedBooks = await db
    .insert(books)
    .values(
      bookSeed.map((b) => ({
        centerId,
        title: b.title,
        author: b.author,
        category: b.category,
        shelfLocation: b.shelf,
      }))
    )
    .returning();

  const copyRows: Array<{ id: number; bookId: number }> = [];
  for (let i = 0; i < insertedBooks.length; i++) {
    const bk = insertedBooks[i];
    const [c1] = await db
      .insert(bookCopies)
      .values({
        centerId,
        bookId: bk.id,
        copyCode: `GV-BK-${String(i * 2 + 1).padStart(3, '0')}`,
        condition: 'GOOD',
        status: i === 0 || i === 1 ? 'ISSUED' : 'AVAILABLE',
      })
      .returning();
    copyRows.push({ id: c1.id, bookId: bk.id });

    await db.insert(bookCopies).values({
      centerId,
      bookId: bk.id,
      copyCode: `GV-BK-${String(i * 2 + 2).padStart(3, '0')}`,
      condition: 'GOOD',
      status: 'AVAILABLE',
    });
  }

  await db.insert(bookLoans).values([
    {
      centerId,
      copyId: copyRows[0].id,
      studentId: createdStudents[0].id,
      dueDate: addDaysDateStr(today, 9),
      status: 'ISSUED',
      notes: 'Issued from reading room shelf.',
    },
    {
      centerId,
      copyId: copyRows[1].id,
      studentId: createdStudents[1].id,
      dueDate: addDaysDateStr(today, -2),
      status: 'OVERDUE',
      notes: 'Due 2 days ago.',
    },
  ]);

  // 8. Support Tickets
  const [ticket1] = await db
    .insert(supportTickets)
    .values({
      centerId,
      ticketNumber: 'TKT-1001',
      studentId: createdStudents[1].id,
      category: 'SEAT_CHANGE',
      subject: 'Request transfer to Desk 29 near window',
      description: 'Looking to shift from Desk 24 to Desk 29 for natural light during morning hours.',
      status: 'IN_PROGRESS',
      targetSeatId: seatByNum.get(29)!,
    })
    .returning();

  await db.insert(ticketMessages).values([
    {
      centerId,
      ticketId: ticket1.id,
      senderType: 'STUDENT',
      senderName: createdStudents[1].name,
      message: 'Please let me know if Desk 29 is open for the Morning shift from tomorrow.',
    },
    {
      centerId,
      ticketId: ticket1.id,
      senderType: 'STAFF',
      senderName: 'Reception Desk',
      message: 'Desk 29 is available for Morning shift. We can process this transfer right away.',
    },
  ]);

  // 9. Expenses
  await db.insert(expenses).values([
    {
      centerId,
      category: 'RENT',
      title: 'Sunful Complex Hall Monthly Rent',
      amountPaise: 1800000,
      expenseDate: `${today.slice(0, 7)}-01`,
      paymentMethod: 'UPI',
      vendorName: 'Sunful Complex Management',
    },
    {
      centerId,
      category: 'ELECTRICITY',
      title: 'JBVNL Electricity & AC Bill',
      amountPaise: 485000,
      expenseDate: `${today.slice(0, 7)}-05`,
      paymentMethod: 'UPI',
      vendorName: 'JBVNL',
    },
    {
      centerId,
      category: 'INTERNET',
      title: 'Dual Fiber Broadband (200 Mbps)',
      amountPaise: 149900,
      expenseDate: `${today.slice(0, 7)}-06`,
      paymentMethod: 'UPI',
      vendorName: 'JioFiber',
    },
    {
      centerId,
      category: 'HOUSEKEEPING',
      title: 'Daily Cleaning & Drinking Water Supply',
      amountPaise: 240000,
      expenseDate: `${today.slice(0, 7)}-10`,
      paymentMethod: 'CASH',
      vendorName: 'Local Maintenance',
    },
  ]);

  // 10. Achievers, Vlogs, Events
  await db.insert(achievers).values([
    {
      centerId,
      fullName: 'Rahul Mahato',
      examCleared: 'SSC CGL',
      postOrRank: 'Inspector (CBIC)',
      selectionYear: '2026',
      quote: 'Consistent morning blocks at Gyan Vatika kept my mock test schedule uninterrupted.',
      sortOrder: 1,
      isPublished: true,
    },
    {
      centerId,
      fullName: 'Shreya Kumari',
      examCleared: 'Banking (IBPS / SBI PO & Clerk)',
      postOrRank: 'SBI Junior Associate',
      selectionYear: '2026',
      quote: 'Quiet partitioned desks and fast Wi-Fi made daily speed drills effortless.',
      sortOrder: 2,
      isPublished: true,
    },
    {
      centerId,
      fullName: 'Aman Verma',
      examCleared: 'Railway (RRB NTPC / Group D / ALP)',
      postOrRank: 'RRB Station Master',
      selectionYear: '2025',
      quote: 'Full-day focus from 9 AM to 9 PM without home distractions helped me clear CBT-2.',
      sortOrder: 3,
      isPublished: true,
    },
  ]);

  await db.insert(vlogs).values([
    {
      centerId,
      title: 'Inside the Reading Hall — Quiet Study Tour',
      description: 'Walkthrough past our 50 partitioned study cubicles and window wing.',
      videoType: 'LOCAL',
      videoUrl: '/assets/aistudio/videoplayback_a11fb523.mp4',
      thumbnailUrl: '/assets/posters/videoplayback_poster.jpg',
      durationLabel: '0:12',
      sortOrder: 1,
      isPublished: true,
    },
    {
      centerId,
      title: 'Tree Bookshelf & Reference Corner',
      description: 'Quick look at our curated Hindi literature, novels, and exam shelf.',
      videoType: 'LOCAL',
      videoUrl: '/assets/aistudio/videoplayback5_9b332c11.mp4',
      thumbnailUrl: '/assets/posters/videoplayback5_poster.jpg',
      durationLabel: '0:08',
      sortOrder: 2,
      isPublished: true,
    },
    {
      centerId,
      title: 'Evening Reading Desk Setup',
      description: 'Quiet evening reading atmosphere with individual desk sockets.',
      videoType: 'LOCAL',
      videoUrl: '/assets/aistudio/videoplayback6_97ebc562.mp4',
      thumbnailUrl: '/assets/posters/videoplayback6_poster.jpg',
      durationLabel: '0:07',
      sortOrder: 3,
      isPublished: true,
    },
  ]);

  await db.insert(libraryEvents).values([
    {
      centerId,
      title: 'Saraswati Puja & Book Blessing',
      category: 'Festivals',
      eventDate: addDaysDateStr(today, -45),
      description: 'Annual morning puja and prasad gathering with all library aspirants at Sunful Complex.',
      mediaUrl: '/assets/aistudio/unnamed9_31154063.jpg',
      isPublished: true,
    },
    {
      centerId,
      title: 'Dimna Lake Winter Picnic & Refresh',
      category: 'Picnic & Camps',
      eventDate: addDaysDateStr(today, -30),
      description: 'Post-exam recharge outing with library batchmates around Jamshedpur.',
      mediaUrl: '/assets/aistudio/unnamed1_54ef54e2.jpg',
      isPublished: true,
    },
    {
      centerId,
      title: 'UPSC & SSC Topper Peer Strategy Meetup',
      category: 'Student Meetups',
      eventDate: addDaysDateStr(today, -12),
      description: 'Weekend peer discussion on current affairs revision and prelims mock accuracy.',
      mediaUrl: '/assets/aistudio/unnamed3_6d1a5894.jpg',
      isPublished: true,
    },
  ]);

  // 11. CMS Content (no lockers!)
  const defaultCmsPayload = {
    heroHeadline: 'Quiet desks, steady light, and room to focus.',
    heroSubheadline:
      'Gyan Vatika Library is a 50-desk self-study hall in Chota Gamaria with partitioned cubicles, curated reading shelves, and flexible shift schedules.',
    facilitiesJson: [
      {
        id: 'desks',
        title: '50 Partitioned Study Desks',
        detail: 'Dedicated individual cubicles with privacy dividers, bag space, and charging socket.',
        enabled: true,
        pricingNote: 'Included',
        span: 'wide',
      },
      {
        id: 'wifi',
        title: 'High-Speed Wi-Fi',
        detail: 'Dual-band fiber connectivity for online mock tests and video lectures.',
        enabled: true,
        pricingNote: 'Included',
        span: 'normal',
      },
      {
        id: 'ac',
        title: 'Air-Conditioned Hall',
        detail: 'Split AC cooling paired with wall fans for steady comfort across afternoon hours.',
        enabled: true,
        pricingNote: 'Included',
        span: 'normal',
      },
      {
        id: 'chairs',
        title: 'Ergonomic Study Chairs',
        detail: 'Cushioned back support built for 6 to 12 hour focused preparation blocks.',
        enabled: true,
        pricingNote: 'Included',
        span: 'normal',
      },
      {
        id: 'power',
        title: 'Uninterrupted Power Backup',
        detail: 'Continuous lighting, cooling, and desk charging outlets during local outages.',
        enabled: true,
        pricingNote: 'Included',
        span: 'normal',
      },
      {
        id: 'water',
        title: 'Purified Water & Bookshelf',
        detail: 'RO drinking water station and curated competitive/literature bookshelf inside Sunful Complex.',
        enabled: true,
        pricingNote: 'Included',
        span: 'wide',
      },
    ],
    galleryJson: {
      photos: GALLERY_PHOTOS,
      videos: LIBRARY_VIDEOS,
    },
    reviewsJson: [],
    noticesJson: [
      {
        id: 'notice-real-1',
        title: 'New 50-Desk Hall Open · Morning, Evening, Full Day & 2–3 Hr Flexible Slots',
        body: 'Admissions open for Morning (09:00 AM - 03:00 PM · ₹700), Evening (03:00 PM - 09:00 PM · ₹700), Full Day (09:00 AM - 09:00 PM · ₹1,200), and Flexible Short Pass (starting ₹400).',
        category: 'General',
        isPinned: true,
        publishDate: addDaysDateStr(today, -5),
        expiryDate: addDaysDateStr(today, 120),
      },
      {
        id: 'notice-real-2',
        title: 'Silence & Reading Hall Etiquette',
        body: 'Keep mobile phones on silent mode inside Main Reading Hall and attend phone calls outside the glass entrance doors.',
        category: 'Urgent',
        isPinned: false,
        publishDate: addDaysDateStr(today, -2),
        expiryDate: addDaysDateStr(today, 90),
      },
    ],
    examCountdownsJson: [
      {
        id: 'upsc-2027',
        exam: 'UPSC CSE Prelims',
        eventName: 'UPSC Civil Services Preliminary Exam',
        examDate: addDaysDateStr(today, 185),
        sourceLabel: 'upsc.gov.in',
        sourceUrl: 'https://upsc.gov.in/',
        confirmed: true,
      },
      {
        id: 'ssc-2027',
        exam: 'SSC CGL Tier-I',
        eventName: 'SSC Combined Graduate Level Examination',
        examDate: addDaysDateStr(today, 112),
        sourceLabel: 'ssc.gov.in',
        sourceUrl: 'https://ssc.gov.in/',
        confirmed: true,
      },
      {
        id: 'gate-2027',
        exam: 'GATE 2027',
        eventName: 'Graduate Aptitude Test in Engineering',
        examDate: addDaysDateStr(today, 78),
        sourceLabel: 'gate.iitk.ac.in',
        sourceUrl: 'https://www.gate.iitk.ac.in/',
        confirmed: true,
      },
      {
        id: 'neet-2027',
        exam: 'NEET UG',
        eventName: 'National Eligibility cum Entrance Test',
        examDate: addDaysDateStr(today, 165),
        sourceLabel: 'neet.nta.nic.in',
        sourceUrl: 'https://neet.nta.nic.in/',
        confirmed: true,
      },
    ],
    faqsJson: [
      {
        id: 'faq-1',
        question: 'What are the shift timings and monthly fees at Gyan Vatika Library?',
        answer:
          'We offer Morning (09:00 AM - 03:00 PM) at ₹700/month, Evening (03:00 PM - 09:00 PM) at ₹700/month, Full Day (09:00 AM - 09:00 PM) at ₹1,200/month, and a Flexible 2–3 Hour Pass starting at ₹400/month (negotiable at counter).',
      },
      {
        id: 'faq-2',
        question: 'Can two students share the same desk in non-overlapping shifts?',
        answer:
          'Yes. Morning (09:00 AM - 03:00 PM) and Evening (03:00 PM - 09:00 PM) students or non-overlapping Flexible 2–3 hour slots can share the same desk without conflict. Full Day reserves the desk from 09:00 AM to 09:00 PM.',
      },
      {
        id: 'faq-3',
        question: 'How do online admissions and seat confirmations work?',
        answer:
          'Submit the online admission form or seat request with your preferred shift and desk. Reception reviews your details and approves your Student ID & digital QR card upon fee confirmation.',
      },
      {
        id: 'faq-4',
        question: 'What happens if my monthly membership expires?',
        answer:
          'Your desk remains held during our 3-day grace period. Renew at reception via Cash or UPI before grace ends to retain your exact desk.',
      },
      {
        id: 'faq-5',
        question: 'Can I visit the reading hall before joining?',
        answer:
          'Yes. Visit Sunful Complex Service Road, Tata Kandra Rd, near Manish Net Cafe, Chota Gamaria, or call 08580103307 between 09:00 AM and 09:00 PM.',
      },
    ],
    contactOverridesJson: {
      note: 'Located on Sunful Complex Service Road, Tata Kandra Rd, near Manish Net Cafe, Chota Gamaria.',
    },
  };

  await db.insert(cmsStates).values([
    { centerId, stage: 'PUBLISHED', ...defaultCmsPayload },
    { centerId, stage: 'DRAFT', ...defaultCmsPayload },
  ]);

  await db.insert(auditEvents).values({
    centerId,
    actorType: 'SYSTEM',
    actorId: 'seed',
    actorName: 'System Initializer',
    action: 'CENTER_SEEDED',
    entityType: 'CENTER',
    entityId: String(centerId),
    summary: 'Initialized 50-desk reading hall, 4 shifts (Morning, Evening, Full Day, Flexible), 3 plans, achievers, vlogs, events, and CMS content.',
  });

  return centerId;
}

if (require.main === module) {
  runSeed()
    .then((id) => {
      console.log(`Seed complete for center ${id}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
