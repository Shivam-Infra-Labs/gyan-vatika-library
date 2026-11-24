export interface CenterInfo {
  id: number;
  slug: string;
  name: string;
  category: string;
  phoneDisplay: string;
  callLink: string;
  address: string;
  landmark: string;
  instagramUrl: string;
  googleBusinessUrl: string;
  googleRating: string;
  googleReviewCount: number;
  timezone: string;
  currency: string;
  isDemoMode: boolean;
  whatsappEnabled: boolean;
  whatsappNumber: string;
  gracePeriodDays: number;
  totalConfiguredSeats: number;
  hasAdminPin: boolean;
  geofenceEnabled: boolean;
  centerLat: string;
  centerLng: string;
  geofenceRadiusMeters: number;
}

export interface RoomInfo {
  id: number;
  name: string;
  code: string;
  floorLabel: string;
  rows: number;
  cols: number;
  layoutMeta: {
    entrance?: { x: number; y: number; label: string };
    walkwayCols?: number[];
    windows?: Array<{ side: string; startRow: number; endRow: number; label: string }>;
    acVents?: Array<{ x: number; y: number; label: string }>;
    bookshelfZone?: { x: number; y: number; label: string };
  };
}

export interface ShiftInfo {
  id: number;
  code: string;
  name: string;
  startMinute: number;
  endMinute: number;
  displayHours: string;
  monthlyFeePaise: number;
  isFlexible: boolean;
  minMinutes: number;
  maxMinutes: number;
  isActive: boolean;
  sortOrder: number;
}

export interface PlanInfo {
  id: number;
  code: string;
  name: string;
  durationMonths: number;
  discountPercent: number;
  description: string;
  isActive: boolean;
  sortOrder: number;
}

export interface FacilityItem {
  id: string;
  title: string;
  detail: string;
  enabled: boolean;
  pricingNote: string;
  span?: string;
}

export interface NoticeItem {
  id: string;
  title: string;
  body: string;
  category?: 'Urgent' | 'General' | 'Holiday' | string;
  isPinned?: boolean;
  publishDate: string;
  expiryDate: string;
}

export interface ExamCountdownItem {
  id: string;
  exam: string;
  eventName: string;
  examDate: string;
  sourceLabel: string;
  sourceUrl: string;
  confirmed: boolean;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface ReviewItem {
  id: string;
  author: string;
  examOrRole: string;
  quote: string;
  source: string;
  verifiedDate: string;
}

export interface AchieverItem {
  id: number;
  fullName: string;
  examCleared: string;
  postOrRank: string;
  selectionYear: string;
  photoUrl: string;
  quote: string;
  sortOrder: number;
  isPublished: boolean;
}

export interface VlogItem {
  id: number;
  title: string;
  description: string;
  videoType: 'LOCAL' | 'YOUTUBE' | string;
  videoUrl: string;
  thumbnailUrl: string;
  durationLabel: string;
  sortOrder: number;
  isPublished: boolean;
}

export interface LibraryEventItem {
  id: number;
  title: string;
  category: 'Festivals' | 'Picnic & Camps' | 'Student Meetups' | string;
  eventDate: string;
  description: string;
  mediaUrl: string;
  isPublished: boolean;
}

export interface WaitlistItem {
  id: number;
  fullName: string;
  phone: string;
  whatsappNumber: string;
  examTarget: string;
  shiftId: number | null;
  shiftName?: string;
  preferredDate: string;
  status: 'WAITING' | 'CONTACTED' | 'CONVERTED' | string;
  notes: string;
  createdAt: string;
}

export interface PublicCenterPayload {
  center: CenterInfo;
  rooms: RoomInfo[];
  shifts: ShiftInfo[];
  plans: PlanInfo[];
  achievers: AchieverItem[];
  vlogs: VlogItem[];
  events: LibraryEventItem[];
  cms: {
    heroHeadline: string;
    heroSubheadline: string;
    facilities: FacilityItem[];
    gallery: {
      photos: Array<{
        id: string;
        originalFilename: string;
        src: string;
        category: string;
        title: string;
        caption: string;
        alt: string;
        focalPoint: string;
      }>;
      videos: Array<{
        id: string;
        originalFilename: string;
        src: string;
        posterSrc: string;
        title: string;
        caption: string;
        durationLabel: string;
      }>;
    };
    reviews: ReviewItem[];
    notices: NoticeItem[];
    examCountdowns: ExamCountdownItem[];
    faqs: FaqItem[];
    contactOverrides: { note?: string };
  } | null;
  heroAvailability: {
    shiftId: number;
    shiftName: string;
    shiftHours: string;
    date: string;
    availableCount: number;
    totalSeats: number;
  } | null;
}

export interface SeatAvailabilityDTO {
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
  availability: 'AVAILABLE' | 'OCCUPIED' | 'EXPIRING_SOON' | 'UNAVAILABLE';
  conflictReason?: string;
  expiringOn?: string;
}
