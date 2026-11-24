import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const centers = pgTable('centers', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull().default('Library and self-study center'),
  phoneDisplay: text('phone_display').notNull(),
  callLink: text('call_link').notNull(),
  address: text('address').notNull(),
  landmark: text('landmark').notNull(),
  instagramUrl: text('instagram_url').notNull(),
  googleBusinessUrl: text('google_business_url').notNull(),
  googleRating: text('google_rating').notNull().default('4.9'),
  googleReviewCount: integer('google_review_count').notNull().default(83),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  currency: text('currency').notNull().default('INR'),
  isDemoMode: boolean('is_demo_mode').notNull().default(false),
  whatsappEnabled: boolean('whatsapp_enabled').notNull().default(false),
  whatsappNumber: text('whatsapp_number').notNull().default(''),
  gracePeriodDays: integer('grace_period_days').notNull().default(3),
  totalConfiguredSeats: integer('total_configured_seats').notNull().default(50),
  adminPinHash: text('admin_pin_hash').notNull().default(''),
  geofenceEnabled: boolean('geofence_enabled').notNull().default(false),
  centerLat: text('center_lat').notNull().default('22.8152'),
  centerLng: text('center_lng').notNull().default('86.0914'),
  geofenceRadiusMeters: integer('geofence_radius_meters').notNull().default(150),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull().default('Staff Member'),
    role: text('role').notNull().default('MANAGER'), // SUPER_ADMIN | MANAGER
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('users_center_idx').on(table.centerId)]
);

export const staffAccess = pgTable(
  'staff_access',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    email: text('email').notNull(),
    fullName: text('full_name').notNull().default('Staff Member'),
    role: text('role').notNull().default('MANAGER'), // SUPER_ADMIN | MANAGER
    isActive: boolean('is_active').notNull().default(true),
    createdByUserId: integer('created_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('staff_access_center_email_idx').on(table.centerId, table.email)]
);

export const rooms = pgTable(
  'rooms',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    floorLabel: text('floor_label').notNull(),
    rows: integer('rows').notNull().default(6),
    cols: integer('cols').notNull().default(9),
    layoutMeta: jsonb('layout_meta').notNull().default({}),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('rooms_center_code_idx').on(table.centerId, table.code)]
);

export const seats = pgTable(
  'seats',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    roomId: integer('room_id')
      .references(() => rooms.id)
      .notNull(),
    seatNumber: integer('seat_number').notNull(),
    label: text('label').notNull(),
    gridX: integer('grid_x').notNull(),
    gridY: integer('grid_y').notNull(),
    zone: text('zone').notNull().default('Central Aisle'),
    hasPowerOutlet: boolean('has_power_outlet').notNull().default(true),
    nearWindow: boolean('near_window').notNull().default(false),
    nearAc: boolean('near_ac').notNull().default(false),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | MAINTENANCE | UNAVAILABLE
    notes: text('notes').notNull().default(''),
  },
  (table) => [
    uniqueIndex('seats_center_num_idx').on(table.centerId, table.seatNumber),
    index('seats_room_idx').on(table.roomId),
  ]
);

export const shifts = pgTable(
  'shifts',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    code: text('code').notNull(), // MORNING | EVENING | FULL_DAY | FLEXIBLE
    name: text('name').notNull(),
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
    displayHours: text('display_hours').notNull(),
    monthlyFeePaise: integer('monthly_fee_paise').notNull(),
    isFlexible: boolean('is_flexible').notNull().default(false),
    minMinutes: integer('min_minutes').notNull().default(120),
    maxMinutes: integer('max_minutes').notNull().default(180),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(1),
  },
  (table) => [uniqueIndex('shifts_center_code_idx').on(table.centerId, table.code)]
);

export const plans = pgTable(
  'plans',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    code: text('code').notNull(), // MONTHLY | QUARTERLY | HALF_YEARLY
    name: text('name').notNull(),
    durationMonths: integer('duration_months').notNull(),
    discountPercent: integer('discount_percent').notNull().default(0),
    description: text('description').notNull().default(''),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(1),
  },
  (table) => [uniqueIndex('plans_center_code_idx').on(table.centerId, table.code)]
);

// Legacy tables preserved strictly for non-destructive PostgreSQL schema compatibility
export const lockers = pgTable(
  'lockers',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    lockerNumber: text('locker_number').notNull(),
    monthlyFeePaise: integer('monthly_fee_paise').notNull().default(15000),
    isIncludedInFullDay: boolean('is_included_in_full_day').notNull().default(false),
    status: text('status').notNull().default('AVAILABLE'),
  },
  (table) => [uniqueIndex('lockers_center_num_idx').on(table.centerId, table.lockerNumber)]
);

export const studentProfiles = pgTable(
  'student_profiles',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    studentCode: text('student_code').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone').notNull(),
    whatsappNumber: text('whatsapp_number').notNull().default(''),
    email: text('email').notNull().default(''),
    guardianName: text('guardian_name').notNull().default(''),
    emergencyContactName: text('emergency_contact_name').notNull().default(''),
    emergencyContactPhone: text('emergency_contact_phone').notNull().default(''),
    address: text('address').notNull().default(''),
    examTarget: text('exam_target').notNull().default('UPSC CSE'),
    photoUrl: text('photo_url').notNull().default(''),
    govIdType: text('gov_id_type').notNull().default(''),
    govIdLast4: text('gov_id_last4').notNull().default(''),
    govIdDocData: text('gov_id_doc_data').notNull().default(''),
    idProofMode: text('id_proof_mode').notNull().default('OFFLINE'), // OFFLINE | ONLINE
    idVerificationStatus: text('id_verification_status').notNull().default('PENDING_OFFLINE'), // PENDING_OFFLINE | UPLOADED | VERIFIED
    idVerificationNote: text('id_verification_note').notNull().default(''),
    idVerifiedAt: timestamp('id_verified_at'),
    idVerifiedByUserId: integer('id_verified_by_user_id'),
    rulesAccepted: boolean('rules_accepted').notNull().default(false),
    pinHash: text('pin_hash').notNull(),
    qrSecret: text('qr_secret').notNull(),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until'),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | INACTIVE | PENDING
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('students_center_code_idx').on(table.centerId, table.studentCode),
    index('students_center_phone_idx').on(table.centerId, table.phone),
    uniqueIndex('students_qr_secret_idx').on(table.qrSecret),
  ]
);

export const bookingRequests = pgTable(
  'booking_requests',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    referenceCode: text('reference_code').notNull().unique(),
    fullName: text('full_name').notNull(),
    phone: text('phone').notNull(),
    whatsappNumber: text('whatsapp_number').notNull().default(''),
    email: text('email').notNull().default(''),
    guardianName: text('guardian_name').notNull().default(''),
    emergencyContactPhone: text('emergency_contact_phone').notNull().default(''),
    address: text('address').notNull().default(''),
    examTarget: text('exam_target').notNull().default('UPSC CSE'),
    photoUrl: text('photo_url').notNull().default(''),
    govIdType: text('gov_id_type').notNull().default(''),
    govIdLast4: text('gov_id_last4').notNull().default(''),
    govIdDocData: text('gov_id_doc_data').notNull().default(''),
    idProofMode: text('id_proof_mode').notNull().default('OFFLINE'), // OFFLINE | ONLINE
    idVerificationStatus: text('id_verification_status').notNull().default('PENDING_OFFLINE'), // PENDING_OFFLINE | UPLOADED | VERIFIED
    idVerificationNote: text('id_verification_note').notNull().default(''),
    idVerifiedAt: timestamp('id_verified_at'),
    idVerifiedByUserId: integer('id_verified_by_user_id'),
    rulesAccepted: boolean('rules_accepted').notNull().default(false),
    requestSource: text('request_source').notNull().default('BOOKING_DRAWER'), // BOOKING_DRAWER | ADMISSION_FORM
    shiftId: integer('shift_id')
      .references(() => shifts.id)
      .notNull(),
    planId: integer('plan_id')
      .references(() => plans.id)
      .notNull(),
    seatId: integer('seat_id').references(() => seats.id),
    lockerRequested: boolean('locker_requested').notNull().default(false),
    startDate: text('start_date').notNull(), // YYYY-MM-DD
    customStartMinute: integer('custom_start_minute'),
    customEndMinute: integer('custom_end_minute'),
    customSlotLabel: text('custom_slot_label').notNull().default(''),
    negotiatedMonthlyFeePaise: integer('negotiated_monthly_fee_paise'),
    negotiationNote: text('negotiation_note').notNull().default(''),
    quotedTotalPaise: integer('quoted_total_paise').notNull(),
    status: text('status').notNull().default('PENDING'), // PENDING | APPROVED | REJECTED | CANCELLED
    reviewNote: text('review_note').notNull().default(''),
    approvedStudentId: integer('approved_student_id').references(() => studentProfiles.id),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('booking_requests_center_status_idx').on(table.centerId, table.status)]
);

export const memberships = pgTable(
  'memberships',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    studentId: integer('student_id')
      .references(() => studentProfiles.id)
      .notNull(),
    shiftId: integer('shift_id')
      .references(() => shifts.id)
      .notNull(),
    planId: integer('plan_id')
      .references(() => plans.id)
      .notNull(),
    startDate: text('start_date').notNull(), // YYYY-MM-DD
    endDate: text('end_date').notNull(), // YYYY-MM-DD
    graceEndDate: text('grace_end_date').notNull(), // YYYY-MM-DD
    customStartMinute: integer('custom_start_minute'),
    customEndMinute: integer('custom_end_minute'),
    customSlotLabel: text('custom_slot_label').notNull().default(''),
    negotiatedMonthlyFeePaise: integer('negotiated_monthly_fee_paise'),
    negotiationNote: text('negotiation_note').notNull().default(''),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | EXPIRING_SOON | IN_GRACE | EXPIRED | CANCELLED
    renewalRequested: boolean('renewal_requested').notNull().default(false),
    renewedFromId: integer('renewed_from_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('memberships_center_student_idx').on(table.centerId, table.studentId),
    index('memberships_status_end_idx').on(table.centerId, table.status, table.endDate),
  ]
);

export const seatAllocations = pgTable(
  'seat_allocations',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    seatId: integer('seat_id')
      .references(() => seats.id)
      .notNull(),
    membershipId: integer('membership_id')
      .references(() => memberships.id)
      .notNull(),
    studentId: integer('student_id')
      .references(() => studentProfiles.id)
      .notNull(),
    shiftId: integer('shift_id')
      .references(() => shifts.id)
      .notNull(),
    startDate: text('start_date').notNull(), // YYYY-MM-DD
    endDate: text('end_date').notNull(), // YYYY-MM-DD
    startMinute: integer('start_minute').notNull(),
    endMinute: integer('end_minute').notNull(),
    customSlotLabel: text('custom_slot_label').notNull().default(''),
    status: text('status').notNull().default('ACTIVE'), // ACTIVE | TRANSFERRED | RELEASED | EXPIRED
    releasedAt: timestamp('released_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('alloc_center_seat_status_idx').on(table.centerId, table.seatId, table.status),
    index('alloc_dates_idx').on(table.startDate, table.endDate),
  ]
);

export const lockerAllocations = pgTable(
  'locker_allocations',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    lockerId: integer('locker_id')
      .references(() => lockers.id)
      .notNull(),
    studentId: integer('student_id')
      .references(() => studentProfiles.id)
      .notNull(),
    membershipId: integer('membership_id').references(() => memberships.id),
    startDate: text('start_date').notNull(),
    endDate: text('end_date').notNull(),
    monthlyFeePaise: integer('monthly_fee_paise').notNull().default(0),
    status: text('status').notNull().default('ACTIVE'),
    releasedAt: timestamp('released_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('locker_alloc_center_idx').on(table.centerId, table.lockerId, table.status)]
);

export const attendanceSessions = pgTable(
  'attendance_sessions',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    studentId: integer('student_id')
      .references(() => studentProfiles.id)
      .notNull(),
    membershipId: integer('membership_id').references(() => memberships.id),
    seatId: integer('seat_id').references(() => seats.id),
    checkInAt: timestamp('check_in_at').notNull(),
    checkOutAt: timestamp('check_out_at'),
    durationMinutes: integer('duration_minutes'),
    source: text('source').notNull().default('STUDENT_SCAN'),
    status: text('status').notNull().default('OPEN'),
    correctionReason: text('correction_reason').notNull().default(''),
    correctedByUserId: integer('corrected_by_user_id').references(() => users.id),
    originalCheckInAt: timestamp('original_check_in_at'),
    originalCheckOutAt: timestamp('original_check_out_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('attendance_center_student_idx').on(table.centerId, table.studentId, table.status),
    index('attendance_checkin_idx').on(table.centerId, table.checkInAt),
  ]
);

export const receptionQrTokens = pgTable('reception_qr_tokens', {
  id: serial('id').primaryKey(),
  centerId: integer('center_id')
    .references(() => centers.id)
    .notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdByUserId: integer('created_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const invoices = pgTable(
  'invoices',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    invoiceNumber: text('invoice_number').notNull().unique(),
    studentId: integer('student_id')
      .references(() => studentProfiles.id)
      .notNull(),
    membershipId: integer('membership_id')
      .references(() => memberships.id)
      .notNull(),
    subtotalPaise: integer('subtotal_paise').notNull(),
    discountPaise: integer('discount_paise').notNull().default(0),
    lockerFeePaise: integer('locker_fee_paise').notNull().default(0),
    totalPaise: integer('total_paise').notNull(),
    paidPaise: integer('paid_paise').notNull().default(0),
    balancePaise: integer('balance_paise').notNull(),
    status: text('status').notNull().default('UNPAID'),
    snapshotJson: jsonb('snapshot_json').notNull(),
    dueDate: text('due_date').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('invoices_center_student_idx').on(table.centerId, table.studentId, table.status)]
);

export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    invoiceId: integer('invoice_id')
      .references(() => invoices.id)
      .notNull(),
    studentId: integer('student_id')
      .references(() => studentProfiles.id)
      .notNull(),
    receiptNumber: text('receipt_number').notNull().unique(),
    amountPaise: integer('amount_paise').notNull(),
    method: text('method').notNull().default('CASH'),
    referenceCode: text('reference_code').notNull().default(''),
    status: text('status').notNull().default('POSTED'),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    collectedByUserId: integer('collected_by_user_id').references(() => users.id),
    paidAt: timestamp('paid_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('payments_center_paid_idx').on(table.centerId, table.paidAt),
    index('payments_invoice_idx').on(table.invoiceId),
  ]
);

export const paymentReversals = pgTable('payment_reversals', {
  id: serial('id').primaryKey(),
  centerId: integer('center_id')
    .references(() => centers.id)
    .notNull(),
  paymentId: integer('payment_id')
    .references(() => payments.id)
    .notNull(),
  invoiceId: integer('invoice_id')
    .references(() => invoices.id)
    .notNull(),
  amountPaise: integer('amount_paise').notNull(),
  reason: text('reason').notNull(),
  reversedByUserId: integer('reversed_by_user_id')
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const webhookEvents = pgTable('webhook_events', {
  id: serial('id').primaryKey(),
  centerId: integer('center_id')
    .references(() => centers.id)
    .notNull(),
  provider: text('provider').notNull(),
  eventId: text('event_id').notNull().unique(),
  payloadJson: jsonb('payload_json').notNull(),
  processedAt: timestamp('processed_at').defaultNow().notNull(),
});

export const expenses = pgTable(
  'expenses',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    category: text('category').notNull(),
    title: text('title').notNull(),
    amountPaise: integer('amount_paise').notNull(),
    expenseDate: text('expense_date').notNull(),
    paymentMethod: text('payment_method').notNull().default('UPI'),
    vendorName: text('vendor_name').notNull().default(''),
    notes: text('notes').notNull().default(''),
    recordedByUserId: integer('recorded_by_user_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('expenses_center_date_idx').on(table.centerId, table.expenseDate)]
);

export const books = pgTable(
  'books',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    title: text('title').notNull(),
    author: text('author').notNull(),
    isbn: text('isbn').notNull().default(''),
    category: text('category').notNull().default('General'),
    shelfLocation: text('shelf_location').notNull().default('Tree Shelf'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('books_center_idx').on(table.centerId)]
);

export const bookCopies = pgTable(
  'book_copies',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    bookId: integer('book_id')
      .references(() => books.id)
      .notNull(),
    copyCode: text('copy_code').notNull(),
    condition: text('condition').notNull().default('GOOD'),
    status: text('status').notNull().default('AVAILABLE'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('book_copies_center_code_idx').on(table.centerId, table.copyCode)]
);

export const bookLoans = pgTable(
  'book_loans',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    copyId: integer('copy_id')
      .references(() => bookCopies.id)
      .notNull(),
    studentId: integer('student_id')
      .references(() => studentProfiles.id)
      .notNull(),
    issuedAt: timestamp('issued_at').defaultNow().notNull(),
    dueDate: text('due_date').notNull(),
    returnedAt: timestamp('returned_at'),
    status: text('status').notNull().default('ISSUED'),
    issuedByUserId: integer('issued_by_user_id').references(() => users.id),
    returnedToUserId: integer('returned_to_user_id').references(() => users.id),
    notes: text('notes').notNull().default(''),
  },
  (table) => [index('book_loans_center_status_idx').on(table.centerId, table.status)]
);

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    ticketNumber: text('ticket_number').notNull().unique(),
    studentId: integer('student_id')
      .references(() => studentProfiles.id)
      .notNull(),
    category: text('category').notNull(),
    subject: text('subject').notNull(),
    description: text('description').notNull(),
    status: text('status').notNull().default('PENDING'),
    assignedToUserId: integer('assigned_to_user_id').references(() => users.id),
    targetSeatId: integer('target_seat_id').references(() => seats.id),
    linkedTransferDone: boolean('linked_transfer_done').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('tickets_center_status_idx').on(table.centerId, table.status)]
);

export const ticketMessages = pgTable('ticket_messages', {
  id: serial('id').primaryKey(),
  centerId: integer('center_id')
    .references(() => centers.id)
    .notNull(),
  ticketId: integer('ticket_id')
    .references(() => supportTickets.id)
    .notNull(),
  senderType: text('sender_type').notNull(),
  senderName: text('sender_name').notNull(),
  message: text('message').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const cmsStates = pgTable(
  'cms_states',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    stage: text('stage').notNull(),
    heroHeadline: text('hero_headline').notNull(),
    heroSubheadline: text('hero_subheadline').notNull(),
    facilitiesJson: jsonb('facilities_json').notNull(),
    galleryJson: jsonb('gallery_json').notNull(),
    reviewsJson: jsonb('reviews_json').notNull(),
    noticesJson: jsonb('notices_json').notNull(),
    examCountdownsJson: jsonb('exam_countdowns_json').notNull(),
    faqsJson: jsonb('faqs_json').notNull(),
    contactOverridesJson: jsonb('contact_overrides_json').notNull(),
    updatedByUserId: integer('updated_by_user_id').references(() => users.id),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('cms_center_stage_idx').on(table.centerId, table.stage)]
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    actorType: text('actor_type').notNull(),
    actorId: text('actor_id').notNull(),
    actorName: text('actor_name').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    summary: text('summary').notNull(),
    metadataJson: jsonb('metadata_json').notNull().default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('audit_center_created_idx').on(table.centerId, table.createdAt)]
);

export const achievers = pgTable(
  'achievers',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    fullName: text('full_name').notNull(),
    examCleared: text('exam_cleared').notNull(),
    postOrRank: text('post_or_rank').notNull().default(''),
    selectionYear: text('selection_year').notNull().default('2026'),
    photoUrl: text('photo_url').notNull().default(''),
    quote: text('quote').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(1),
    isPublished: boolean('is_published').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('achievers_center_idx').on(table.centerId)]
);

export const vlogs = pgTable(
  'vlogs',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    videoType: text('video_type').notNull().default('LOCAL'), // LOCAL | YOUTUBE
    videoUrl: text('video_url').notNull(),
    thumbnailUrl: text('thumbnail_url').notNull().default(''),
    durationLabel: text('duration_label').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(1),
    isPublished: boolean('is_published').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('vlogs_center_idx').on(table.centerId)]
);

export const libraryEvents = pgTable(
  'library_events',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    title: text('title').notNull(),
    category: text('category').notNull().default('Festivals'), // Festivals | Picnic & Camps | Student Meetups
    eventDate: text('event_date').notNull(),
    description: text('description').notNull().default(''),
    mediaUrl: text('media_url').notNull().default(''),
    isPublished: boolean('is_published').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('library_events_center_idx').on(table.centerId)]
);

export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: serial('id').primaryKey(),
    centerId: integer('center_id')
      .references(() => centers.id)
      .notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone').notNull(),
    whatsappNumber: text('whatsapp_number').notNull().default(''),
    examTarget: text('exam_target').notNull().default('General'),
    shiftId: integer('shift_id').references(() => shifts.id),
    preferredDate: text('preferred_date').notNull(),
    status: text('status').notNull().default('WAITING'), // WAITING | CONTACTED | CONVERTED
    notes: text('notes').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('waitlist_center_status_idx').on(table.centerId, table.status)]
);

export const rateLimits = pgTable(
  'rate_limits',
  {
    id: serial('id').primaryKey(),
    key: text('key').notNull().unique(),
    count: integer('count').notNull().default(1),
    windowStart: timestamp('window_start').defaultNow().notNull(),
  }
);

// Relations
export const centersRelations = relations(centers, ({ many }) => ({
  users: many(users),
  staffAccess: many(staffAccess),
  rooms: many(rooms),
  seats: many(seats),
  shifts: many(shifts),
  plans: many(plans),
  students: many(studentProfiles),
}));

export const studentProfilesRelations = relations(studentProfiles, ({ many }) => ({
  memberships: many(memberships),
  allocations: many(seatAllocations),
  attendanceSessions: many(attendanceSessions),
  invoices: many(invoices),
  payments: many(payments),
  bookLoans: many(bookLoans),
  tickets: many(supportTickets),
}));

export const membershipsRelations = relations(memberships, ({ one, many }) => ({
  student: one(studentProfiles, {
    fields: [memberships.studentId],
    references: [studentProfiles.id],
  }),
  shift: one(shifts, {
    fields: [memberships.shiftId],
    references: [shifts.id],
  }),
  plan: one(plans, {
    fields: [memberships.planId],
    references: [plans.id],
  }),
  allocations: many(seatAllocations),
  invoices: many(invoices),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  student: one(studentProfiles, {
    fields: [invoices.studentId],
    references: [studentProfiles.id],
  }),
  membership: one(memberships, {
    fields: [invoices.membershipId],
    references: [memberships.id],
  }),
  payments: many(payments),
}));

export const booksRelations = relations(books, ({ many }) => ({
  copies: many(bookCopies),
}));

export const bookCopiesRelations = relations(bookCopies, ({ one, many }) => ({
  book: one(books, {
    fields: [bookCopies.bookId],
    references: [books.id],
  }),
  loans: many(bookLoans),
}));

export const supportTicketsRelations = relations(supportTickets, ({ one, many }) => ({
  student: one(studentProfiles, {
    fields: [supportTickets.studentId],
    references: [studentProfiles.id],
  }),
  messages: many(ticketMessages),
}));
