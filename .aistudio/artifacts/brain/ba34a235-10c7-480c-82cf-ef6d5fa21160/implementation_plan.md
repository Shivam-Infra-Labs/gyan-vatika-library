# Gyan Vatika Library — Smart Library & Self-Study Center Platform

An integrated web platform for **Gyan Vatika Library** (Chota Gamaria, Jharkhand) uniting a photo-led public showcase and seat reservation journey (`/`), a mobile-first student portal (`/student`), and a reception and operations workspace (`/admin`) over one shared, transactional PostgreSQL database.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Confirmed Choices & Platform Architecture Decisions**
> - **Authentication Split**: Students sign in to `/student` using their **Student ID + registered phone/PIN** (issued during admission/activation), while center owners and managers sign in to `/admin` using **Google Sign-In** (Firebase Authentication).
> - **Initial Center State**: Seeded as a clearly labeled **44-seat demo hall** (incorporating real visible desk numbers such as `#24`, `#41`, and `#42`) with realistic editable demo fees, shifts, and discounts until the owner publishes confirmed center values in Settings / Website Content.
> - **Payments & WhatsApp**: Starts in **Offline Cash & UPI** collection mode (with full invoicing, partial payments, balance collection, linked reversals, and PDF receipts; Razorpay webhook endpoint included and ready for live credentials). WhatsApp chat and one-click reminders remain **disabled until the owner configures a confirmed WhatsApp number**.
> - **Database & ORM Stack**: Provisioned using **Cloud SQL for PostgreSQL** with **Drizzle ORM** (`drizzle-orm/node-postgres`, `pg`, `drizzle-kit`) and platform `SQL_*` connection pooling as standard in this environment (replacing Prisma while delivering identical schema guarantees, indexes, relations, and PostgreSQL overlap prevention).

---

## 1. Overview & Core Concept

- **What It Does**: Replaces disconnected spreadsheets, paper registers, and static brochures with a single live system of record for Gyan Vatika Library. Prospective students tour the actual reading room, check real-time shift-aware seat availability, and submit seat requests. Reception staff admit walk-ins or approve requests in a guided flow, issue digital IDs, track QR attendance, collect full or partial fees with downloadable PDF receipts, manage books and helpdesk tickets, track expenses, and publish website updates.
- **Target Audience**:
  - **Prospective Students & Parents** (`/`): Discovering the study hall in Chota Gamaria, verifying seating availability for their preferred shift, and requesting a desk.
  - **Enrolled Members** (`/student`): Checking in/out via QR, viewing their digital ID, tracking monthly study hours, reviewing receipts/dues, borrowing books, and raising support tickets on mobile.
  - **Center Owner & Reception Staff** (`/admin`): Running daily admissions, seat transfers, fee collections, attendance audits, lending, expenses, exports, and live website editing.
- **Key Value**: Every action updates one shared ledger—approving a request or transferring a seat immediately updates the public floor plan, the student's digital ID, and the owner's financial and occupancy metrics.

---

## 2. User Experience & Visual Design

### Visual Identity & Theme
- **Aesthetic Direction**: High-precision editorial minimalism inspired by Linear and Vercel, anchored by warm, authentic photography and portrait video of Gyan Vatika's reading room, tree-shaped bookshelf, globe corner, and curated books.
- **Color Palette & Dual-Theme System**:
  - **Dark-First Canvas**: `#09090B` primary background, `#18181B` elevated surface, crisp `1px` zinc borders (`#27272A`).
  - **Light Mode Surface Pair**: `#FAFAFA` canvas, `#FFFFFF` cards, `#E4E4E7` borders via Tailwind v4 `@custom-variant dark` and semantic tokens (persistent user toggle).
  - **Semantic Status Tokens (Always Paired with Label/Symbol)**: Emerald `#10B981` (Available / Paid / Inside), Amber `#F59E0B` (Expiring Soon / Partial Dues / Grace), Rose `#F43F5E` (Occupied / Overdue / Unavailable).
- **Typography & Hierarchy**:
  - **Headings**: `Plus Jakarta Sans` (`clamp(2.25rem, 4vw, 3.75rem)` hero display, `text-wrap: balance`).
  - **Body**: `Inter` (`15px–16px`, `1.5–1.7` line height).
  - **Data & Numbers**: `JetBrains Mono` with `tabular-nums` for INR currency (`₹` with Indian grouping `1,25,000`), seat numbers, exam countdowns, receipt IDs, and KPI tables.
- **Anti-Slop Restraint**: Unboxed metadata with `·` separators (zero pill badge clutter), single-level elevation, no decorative pulsing dots, no thick left accent bars (`border-l-4`), and single-line `whitespace-nowrap` controls.

### Key User Flows across the Three Experiences

1. **Public Website (`/`)**
   - **Floating Glass Navbar**: Compact 3-zone header (brand wordmark, concise anchor links, theme toggle + Student Portal + prominent `Book a Seat` CTA) that tightens smoothly after the hero.
   - **Hero & Live Availability**: Line-by-line headline reveal alongside the already-visible `unnamed2` reading-room aisle photo, `Watch the room tour` trigger (`videoplayback`), and a live shift availability indicator computed directly from the floor-plan inventory (with a clear fully-booked state).
   - **Scroll-Driven Guided Tour**: Hero photograph transitions cleanly into an inset tour frame progressing from the reading-room aisle (`unnamed2`) → tree-shaped bookshelf & desks 41–42 (`unnamed3`) → collection shelf & globe (`unnamed1`), reversing naturally on scroll up (with swipeable controls on mobile and static layout for `prefers-reduced-motion`).
   - **Facilities Bento**: Owner-configurable asymmetric grid with subtle pointer spotlight highlighting enabled amenities (Wi-Fi, AC, Ergonomic Chairs, Lockers included/extra, Cafeteria, Power Backup).
   - **Shift-Aware Architectural Seat Map**: Date, term, room, and shift selectors driving an interactive SVG/grid floor plan (desks, walkways, entrance, windows, AC vents) plus a keyboard-accessible list view. Selecting a seat opens a detail sheet showing term-wide availability, amenities, fee, and locker option.
   - **Plans & Guided Seat Request**: Animated `Monthly | Quarterly | Half-Yearly` switcher (`15%` / `25%` demo discounts) flowing into a stateful reservation drawer (`Date/Term/Shift → Seat → Contact → Review → Request Reference & "Awaiting owner approval"`), preserving progress on back-navigation and offering eligible alternatives on conflict.
   - **Media Gallery, Reviews, Notices, Exams & Visit**: Photos/Films switcher (`unnamed5` Orwell, `unnamed6` Of Human Bondage, `unnamed9` hanging planter, plus 3 portrait videos loaded on demand with extracted posters), accessible keyboard/swipe lightbox, verified `4.9 / 5 (83 reviews)` Google rating link, publish/expiry-gated notices, active UPSC/SSC/GATE/NEET countdowns, editable FAQs, and `Near Manish Net Cafe` directions, tap-to-call (`08580103307`), Instagram, and optional Google Maps embed.

2. **Mobile-First Student Portal (`/student`)**
   - **Auth & Thumb-Zone Navigation**: Clean Student ID + phone/PIN login; fixed bottom tab bar (≤15% viewport height) on mobile expanding to a clean multi-column workspace on desktop.
   - **Home**: Immediate view of assigned seat, shift window, today's check-in status, membership expiry countdown, pending dues, and next action.
   - **Digital ID & QR**: Student photo, ID, seat, shift, valid-until date, opaque revocable QR code, plus print/download actions.
   - **Attendance**: Explicit Check In / Check Out, camera scanner for rotating reception QR (with manual/recovery flows for expired codes, camera denial, duplicate scans, and forgotten checkouts), daily history, calendar, and monthly study-hour totals.
   - **Membership, Receipts, Books & Helpdesk**: Plan/locker summary, renewal request flow, invoice & payment history with downloadable PDF receipts, issued library books with due dates, and support ticket creation/tracking.

3. **Owner & Reception Workspace (`/admin`)**
   - **Layout**: Compact desktop sidebar (`Overview`, `Reception`, `Students`, `Seats & Lockers`, `Attendance`, `Fees`, `Book Lending`, `Helpdesk`, `Expenses`, `Reports`, `Website Content`, `Staff Activity`, `Settings`) and mobile drawer.
   - **Overview**: Clickable KPIs opening filtered records, explicit profit reporting basis notes, Recharts monthly income vs. expenses and shift occupancy charts, and an actionable `Needs attention` queue.
   - **Reception & Guided Admission**: Persistent quick actions (`Add Student`, `Record Fees`, `Assign Seat`, `Scan ID`) opening slide-over sheets. Unified 6-step admission workflow for walk-ins and online requests with idempotent confirmation, itemized preview, partial payment, private ID upload, receipt, and printable digital ID.
   - **Operations Modules**: `Ctrl/Cmd+K` Student CRM, dated seat transfers & independent locker management, attendance desk with audited manual corrections, partial/full fee collection, linked payment reversals, one-click WhatsApp reminder launcher (when enabled), copy-level book lending, ticket-linked seat transfers, expense ledger, filtered CSV/Excel exports, and Draft → Preview → Publish website editor.

---

## 3. Key Product Decisions & Trade-Offs

- **Cloud SQL (PostgreSQL) + Drizzle ORM with Transactional Overlap Locking**
  - *Chosen Approach*: Use PostgreSQL via Cloud SQL with Drizzle ORM for type-safe queries, paired with PostgreSQL `daterange` / `tstzrange` exclusion constraints (`btree_gist`) and `SERIALIZABLE` / row-locked seat checks inside transactions.
  - *Why*: Prevents double-booking when two receptionists approve or admit overlapping shifts concurrently, while allowing adjacent shifts (e.g., Morning `06:00–12:00` and Afternoon `12:00–18:00`) to share the same physical desk.
  - *Alternatives Considered*: Application-level checks alone or NoSQL documents were rejected because race conditions can cause conflicting seat allocations.

- **Integer Paise Money & Immutable Invoice Snapshots**
  - *Chosen Approach*: Store all monetary amounts (`amountPaise`) as integers and snapshot plan rates, discounts, and add-on fees onto each invoice at billing time.
  - *Why*: Avoids floating-point rounding errors in Indian Rupee accounting and ensures owner edits to future pricing never mutate historical receipts.

- **Separate Auth Realms for Staff vs. Students**
  - *Chosen Approach*: Firebase Google Sign-In for `SUPER_ADMIN` and `MANAGER` staff on `/admin`; signed HTTP-only session cookies via Student ID + phone/PIN verification for students on `/student`.
  - *Why*: Matches non-technical owner workflows (instant Google login for staff, frictionless Student ID login for walk-in students who may not share a Google account at reception) while enforcing strict tenant-scoped server-side authorization on every API route.

- **Curated Local Media Pipeline**
  - *Chosen Approach*: Bundle all 9 verified venue assets locally in `/public/assets/aistudio/` via a typed media manifest (`src/lib/media.ts`), derive static video posters directly from frames of the supplied `.mp4` files, and load video streams only on user interaction.
  - *Why*: Guarantees fast initial hero paint, authentic representation of Gyan Vatika's real interior, and zero dependency on external stock or generated venue imagery.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### System Architecture Diagram

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT INTERFACES (Next.js App Router)             │
├───────────────────────────┬──────────────────────────┬───────────────────────┤
│   Public Website (/)      │   Student Portal         │   Owner Workspace       │
│  • Hero & Scroll Tour     │   (/student)             │   (/admin)              │
│  • Live Floor Plan & List │  • Home & Digital ID QR  │  • Overview & Charts    │
│  • Pricing & Seat Request │  • QR Check-In/Out       │  • Reception Admission  │
│  • Gallery, Notices, Map  │  • Receipts, Books, Help │  • CRM, Fees, CMS, Logs │
└─────────────┬─────────────┴────────────┬─────────────┴───────────┬───────────┘
              │                          │                         │
              ▼                          ▼                         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                  NEXT.JS ROUTE HANDLERS & SERVER ACTIONS (/api/*)            │
│  • Public Read/Request APIs (Shift Availability, CMS Published, Booking)     │
│  • Student Session Guard (HTTP-Only Signed Cookie, Own-Record Scope)         │
│  • Staff Auth Guard (Firebase Admin ID Token -> SUPER_ADMIN / MANAGER RBAC)  │
│  • Domain Engines: Conflict Engine · Billing/PDF Receipts · Audit Logger     │
└───────────────────────────────────────┬──────────────────────────────────────┘
                                        │ (pg Pool - Object Method / SQL_*)
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       CLOUD SQL FOR POSTGRESQL + DRIZZLE ORM                 │
│  • Multi-Tenant Core: centers, users, staff_roles, settings                  │
│  • Space & Inventory: rooms, seats, shifts, lockers, locker_allocations      │
│  • Memberships & Access: student_profiles, booking_requests, memberships,    │
│    seat_allocations (GIST overlap exclusion), attendance_sessions            │
│  • Finance & Audit: invoices (price snapshot), payments, payment_reversals,  │
│    expenses, audit_events (append-only)                                      │
│  • Operations & CMS: books, book_copies, book_loans, support_tickets,        │
│    cms_drafts_and_published (notices, exams, faqs, reviews, media)           │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Data Model & Core Entities

- **Tenant & Auth (`centers`, `users`, `center_settings`)**: Scopes every entity by `centerId`. Stores Firebase `uid` and role (`SUPER_ADMIN`, `MANAGER`) for staff, configurable shift windows, grace period days, currency/demo flags, and WhatsApp settings.
- **Floor & Shifts (`rooms`, `seats`, `shifts`, `lockers`, `locker_allocations`)**: Stores architectural coordinates (`x`, `y`, `zone`, `hasWindow`, `nearAc`), desk numbers (`1`–`44` including `#24`, `#41`, `#42`), shift minute ranges (handling overnight `24x7` intervals cleanly), and independent locker assignments.
- **Admissions & Allocations (`student_profiles`, `booking_requests`, `memberships`, `seat_allocations`)**: Tracks Student ID (`GV-YYYY-NNN`), revocable QR token secret, private ID document metadata (served only via authenticated admin routes), pending requests (non-blocking until approved), and active/grace/expired memberships linked to `seat_allocations` protected by a PostgreSQL exclusion check on overlapping date ranges and minute intervals.
- **Attendance (`attendance_sessions`, `reception_qr_tokens`)**: Enforces single open check-in per student, supports both student-scans-reception and staff-scans-student-ID QR flows (opaque payload `{ token, centerId }` only), calculates overnight/cross-month duration, and logs manual corrections with original/new values and required reason.
- **Finance (`invoices`, `payments`, `payment_reversals`, `expenses`, `webhook_events`)**: Integer paise accounting, itemized price snapshots, idempotency keys for admission/webhook safety, linked owner-only reversals, downloadable PDF receipts, and categorized center expenses.
- **Library, Support & CMS (`books`, `book_copies`, `book_loans`, `support_tickets`, `ticket_messages`, `cms_content`, `audit_events`)**: Copy-level lending preventing double checkout, ticket-to-seat-transfer linking, Draft/Preview/Publish CMS versioning (copy, plans, discounts, facilities, gallery, notices, exam countdowns, FAQs, reviews), and immutable append-only `audit_events`.

### Interactive Component & State Mapping

- **Shift Availability & Floor Plan (`/` & `/admin`)**: Changing `startDate`, `term`, `room`, or `shift` queries shared availability logic (`[startDate, endDate)` × `[shiftStartMin, shiftEndMin)`), returning real-time `AVAILABLE | OCCUPIED | EXPIRING_SOON | UNAVAILABLE` states without exposing member identities publicly.
- **Idempotent Seat Request & Admission**: Every submission carries a client-generated `idempotencyKey`; if a selected seat becomes conflicted mid-flow, the server returns `409 Conflict` with eligible alternative seats while preserving all entered student and payment form fields.
- **Live Sync Across Portals**: Approving a request, collecting a balance, transferring a seat, or publishing CMS plan edits commits inside a PostgreSQL transaction, appends an `audit_events` row, and immediately reflects across `/`, `/student`, and `/admin`.
