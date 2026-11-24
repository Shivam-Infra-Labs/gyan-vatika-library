'use client';

import type {
  AchieverItem,
  CenterInfo,
  ExamCountdownItem,
  FacilityItem,
  FaqItem,
  LibraryEventItem,
  NoticeItem,
  PlanInfo,
  ReviewItem,
  RoomInfo,
  SeatAvailabilityDTO,
  ShiftInfo,
  VlogItem,
  WaitlistItem,
} from '@/src/types/library';

export type AdminSection =
  | 'overview'
  | 'reception'
  | 'students'
  | 'seats'
  | 'attendance'
  | 'finance'
  | 'books'
  | 'tickets'
  | 'expenses'
  | 'reports'
  | 'cms'
  | 'audit'
  | 'settings';

export interface StaffIdentity {
  userId: number;
  email: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'MANAGER';
  centerId: number;
}

export interface PendingBookingRequest {
  request: {
    id: number;
    referenceCode: string;
    fullName: string;
    phone: string;
    whatsappNumber?: string;
    email: string;
    guardianName?: string;
    emergencyContactPhone: string;
    address?: string;
    examTarget: string;
    govIdType?: string;
    govIdLast4?: string;
    hasGovIdDoc?: boolean;
    idProofMode?: 'OFFLINE' | 'ONLINE' | string;
    idVerificationStatus?: 'PENDING_OFFLINE' | 'UPLOADED' | 'VERIFIED' | string;
    idVerificationNote?: string;
    idVerifiedAt?: string | null;
    shiftId: number;
    planId: number;
    seatId: number | null;
    startDate: string;
    customStartMinute?: number | null;
    customEndMinute?: number | null;
    customSlotLabel?: string;
    negotiatedMonthlyFeePaise?: number | null;
    negotiationNote?: string;
    requestSource?: string;
    notes: string;
    status: string;
    createdAt: string;
  };
  shiftName: string;
  planName: string;
  seatNumber: number | null;
}

export interface BootstrapPayload {
  staff: StaffIdentity;
  center: CenterInfo;
  rooms: RoomInfo[];
  shifts: ShiftInfo[];
  plans: PlanInfo[];
  waitlistCount: number;
  kpis: {
    totalSeats: number;
    insideNow: number;
    selectedShiftAvailable: number;
    selectedShiftId: number;
    todayCollectionPaise: number;
    monthlyRevenuePaise: number;
    monthlyExpensesPaise: number;
    netProfitPaise: number;
    pendingDuesPaise: number;
    profitBasisNote: string;
  };
  charts: {
    monthlyIncomeVsExpenses: Array<{
      month: string;
      label: string;
      income: number;
      expenses: number;
    }>;
    shiftOccupancy: Array<{
      name: string;
      occupied: number;
      available: number;
    }>;
  };
  attentionQueue: {
    pendingRequests: PendingBookingRequest[];
    expiringMemberships: Array<{
      membership: {
        id: number;
        endDate: string;
        graceEndDate: string;
        status: string;
        shiftId: number;
        planId: number;
        renewalRequested: boolean;
      };
      studentName: string;
      studentCode: string;
      studentPhone: string;
      studentWhatsapp: string;
      studentId: number;
      shiftName: string;
    }>;
    overdueInvoices: Array<{
      invoice: {
        id: number;
        invoiceNumber: string;
        studentId: number;
        totalPaise: number;
        paidPaise: number;
        balancePaise: number;
        status: string;
        dueDate: string;
      };
      studentName: string;
      studentCode: string;
      studentPhone: string;
      studentWhatsapp: string;
      seatNumber: number | null;
    }>;
    openTickets: Array<{
      ticket: {
        id: number;
        ticketNumber: string;
        category: string;
        subject: string;
        status: string;
        createdAt: string;
      };
      studentName: string;
      studentCode: string;
    }>;
  };
}

export interface StudentSummaryRow {
  id: number;
  studentCode: string;
  fullName: string;
  phone: string;
  whatsappNumber: string;
  email: string;
  examTarget: string;
  status: string;
  govIdType?: string;
  govIdLast4?: string;
  idProofMode?: string;
  idVerificationStatus?: string;
  idVerificationNote?: string;
  hasGovIdDoc: boolean;
  isLocked: boolean;
  membershipId: number | null;
  membershipStatus: string;
  endDate: string | null;
  shiftId: number | null;
  shiftName: string | null;
  customSlotLabel: string;
  planName: string | null;
  seatId: number | null;
  seatNumber: number | null;
  balancePaise: number;
  feeStatus: 'PAID' | 'PARTIAL' | 'OVERDUE';
}

export interface StudentDetailPayload {
  student: {
    id: number;
    studentCode: string;
    fullName: string;
    phone: string;
    whatsappNumber: string;
    email: string;
    guardianName: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    address: string;
    examTarget: string;
    photoUrl: string;
    govIdType: string;
    govIdLast4: string;
    idProofMode?: string;
    idVerificationStatus?: string;
    idVerificationNote?: string;
    idVerifiedAt?: string | null;
    hasGovIdDoc: boolean;
    lockedUntil: string | null;
    status: string;
    createdAt: string;
  };
  memberships: Array<{
    membership: {
      id: number;
      shiftId: number;
      planId: number;
      startDate: string;
      endDate: string;
      graceEndDate: string;
      customStartMinute: number | null;
      customEndMinute: number | null;
      customSlotLabel: string;
      negotiatedMonthlyFeePaise: number | null;
      negotiationNote: string;
      status: string;
      renewalRequested: boolean;
    };
    shift: ShiftInfo;
    plan: PlanInfo;
  }>;
  seatHistory: Array<{
    allocation: {
      id: number;
      seatId: number;
      startDate: string;
      endDate: string;
      customSlotLabel?: string;
      status: string;
    };
    seat: { id: number; seatNumber: number; label: string; zone: string };
    shiftName: string;
  }>;
  attendance: Array<{
    id: number;
    checkInAt: string;
    checkOutAt: string | null;
    durationMinutes: number | null;
    source: string;
    status: string;
    correctionReason: string;
  }>;
  invoices: Array<{
    id: number;
    invoiceNumber: string;
    subtotalPaise: number;
    discountPaise: number;
    totalPaise: number;
    paidPaise: number;
    balancePaise: number;
    status: string;
    dueDate: string;
    snapshotJson: {
      planName?: string;
      shiftName?: string;
      shiftHours?: string;
      negotiationNote?: string;
      seatNumber?: number;
    };
  }>;
  payments: Array<{
    id: number;
    invoiceId: number;
    receiptNumber: string;
    amountPaise: number;
    method: string;
    referenceCode: string;
    status: string;
    paidAt: string;
  }>;
  loans: Array<{
    loan: { id: number; issuedAt: string; dueDate: string; returnedAt: string | null; status: string };
    copy: { copyCode: string };
    book: { title: string; author: string };
  }>;
  tickets: Array<{
    id: number;
    ticketNumber: string;
    category: string;
    subject: string;
    status: string;
    createdAt: string;
  }>;
}

export interface SeatAssignmentInfo {
  allocation: {
    id: number;
    seatId: number;
    membershipId: number;
    studentId: number;
    shiftId: number;
    startDate: string;
    endDate: string;
    startMinute: number;
    endMinute: number;
    customSlotLabel?: string;
  };
  studentName: string;
  studentCode: string;
  shiftName: string;
  shiftHours: string;
  membershipStatus: string;
}

export interface SeatsPayload {
  availability: {
    seats: SeatAvailabilityDTO[];
    summary: { available: number; occupied: number; expiringSoon: number; unavailable: number };
    endDate: string;
  };
  assignmentsBySeat: SeatAssignmentInfo[];
}

export interface AttendanceDeskPayload {
  insideNow: Array<{
    session: {
      id: number;
      studentId: number;
      checkInAt: string;
      checkOutAt: string | null;
      durationMinutes: number | null;
      source: string;
      status: string;
      correctionReason: string;
    };
    studentName: string;
    studentCode: string;
    seatNumber: number | null;
  }>;
  needsReview: AttendanceDeskPayload['insideNow'];
  todayRegister: AttendanceDeskPayload['insideNow'];
  recentSessions: AttendanceDeskPayload['insideNow'];
  activeReceptionQr: {
    token: string;
    expiresAt: string;
    secondsRemaining: number;
    payload: string;
  } | null;
}

export interface FinancePayload {
  invoices: Array<{
    invoice: {
      id: number;
      invoiceNumber: string;
      studentId: number;
      membershipId: number;
      totalPaise: number;
      paidPaise: number;
      balancePaise: number;
      status: string;
      dueDate: string;
      snapshotJson: {
        planName?: string;
        shiftName?: string;
        shiftHours?: string;
        negotiationNote?: string;
        seatNumber?: number;
      };
    };
    studentName: string;
    studentCode: string;
    studentPhone: string;
    studentWhatsapp: string;
    membershipEndDate: string;
  }>;
  payments: Array<{
    payment: {
      id: number;
      invoiceId: number;
      studentId: number;
      receiptNumber: string;
      amountPaise: number;
      method: string;
      referenceCode: string;
      status: string;
      paidAt: string;
    };
    studentName: string;
    studentCode: string;
    studentPhone: string;
    studentWhatsapp: string;
    invoiceNumber: string;
  }>;
  reversals: Array<{
    id: number;
    paymentId: number;
    invoiceId: number;
    amountPaise: number;
    reason: string;
    createdAt: string;
  }>;
  expenses: Array<{
    id: number;
    category: string;
    title: string;
    amountPaise: number;
    expenseDate: string;
    paymentMethod: string;
    vendorName: string;
    notes: string;
  }>;
}

export interface BooksPayload {
  books: Array<{
    id: number;
    title: string;
    author: string;
    category: string;
    shelfLocation: string;
    copies: Array<{
      id: number;
      copyCode: string;
      condition: string;
      status: string;
    }>;
  }>;
  loans: Array<{
    loan: {
      id: number;
      copyId: number;
      studentId: number;
      issuedAt: string;
      dueDate: string;
      returnedAt: string | null;
      status: string;
    };
    copyCode: string;
    bookTitle: string;
    bookAuthor: string;
    studentName: string;
    studentCode: string;
  }>;
}

export interface AdminTicketItem {
  id: number;
  ticketNumber: string;
  studentId: number;
  category: string;
  subject: string;
  status: string;
  targetSeatId: number | null;
  linkedTransferDone: boolean;
  createdAt: string;
  studentName: string;
  studentCode: string;
  currentMembershipId: number | null;
  currentSeatNumber: number | null;
  messages: Array<{
    id: number;
    senderType: string;
    senderName: string;
    message: string;
    createdAt: string;
  }>;
}

export interface StaffAccessItem {
  id: number;
  email: string;
  fullName: string;
  role: 'SUPER_ADMIN' | 'MANAGER';
  isActive: boolean;
  createdAt: string;
}

export interface CmsPayload {
  center: CenterInfo;
  draft: {
    id: number;
    heroHeadline: string;
    heroSubheadline: string;
    facilitiesJson: FacilityItem[];
    galleryJson: {
      photos?: Array<{
        id: string;
        originalFilename: string;
        src: string;
        category: string;
        title: string;
        caption: string;
        alt: string;
        focalPoint: string;
      }>;
      videos?: Array<{
        id: string;
        originalFilename: string;
        src: string;
        posterSrc: string;
        title: string;
        caption: string;
        durationLabel: string;
      }>;
    };
    reviewsJson: ReviewItem[];
    noticesJson: NoticeItem[];
    examCountdownsJson: ExamCountdownItem[];
    faqsJson: FaqItem[];
    contactOverridesJson: { note?: string };
    updatedAt: string;
  } | null;
  published: {
    updatedAt: string;
  } | null;
  shifts: ShiftInfo[];
  plans: PlanInfo[];
  achievers: AchieverItem[];
  vlogs: VlogItem[];
  events: LibraryEventItem[];
  waitlist: WaitlistItem[];
  staffUsers: Array<{
    id: number;
    email: string;
    fullName: string;
    role: 'SUPER_ADMIN' | 'MANAGER';
    isActive: boolean;
  }>;
  staffAccess: StaffAccessItem[];
}

export interface AuditEventItem {
  id: number;
  actorType: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  createdAt: string;
}

export async function adminApiFetch<T>(
  token: string,
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`) as Error & {
      status?: number;
      conflictWindow?: string;
      alternatives?: SeatAvailabilityDTO[];
    };
    err.status = res.status;
    err.conflictWindow = data.conflictWindow;
    err.alternatives = data.alternatives;
    throw err;
  }
  return data as T;
}
