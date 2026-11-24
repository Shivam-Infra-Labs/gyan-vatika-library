# Gyan Vatika Library — Smart Library & Self-Study Center Platform

[![Next.js](https://img.shields.io/badge/Next.js-App_Router-black?logo=next.js)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16_Alpine-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F?logo=drizzle&logoColor=black)](https://orm.drizzle.team/)
[![Docker](https://img.shields.io/badge/Docker-Multi--Container-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Firebase Auth](https://img.shields.io/badge/Firebase-Auth-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com/)

A production-ready, full-stack Library Management & SaaS Operations Platform built for **Gyan Vatika Library** (Chota Gamaria, Jharkhand). The system digitizes end-to-end self-study center workflows—including a 50-desk shift-aware seat map, dynamic anti-proxy QR attendance with GPS geo-fencing, automated invoicing & PDF receipt generation, a local-first database assistant, and a Draft/Preview/Publish CMS.

---

## System Architecture

```text
                        ┌─────────────────────────────────────────┐
                        │           Client Applications           │
                        │  Public (/)  │  Admission (/admission)  │
                        │  Student (/student) │  Admin (/admin)   │
                        └────────────────────┬────────────────────┘
                                             │ HTTP / REST API
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                          Docker Compose Network (bridge)                            │
│                                                                                     │
│  ┌───────────────────────────────────────┐      ┌────────────────────────────────┐  │
│  │        app (Next.js Production)       │      │   postgres (PostgreSQL 16)     │  │
│  │  • App Router & REST API Handlers     │─────▶│  • ACID Seat & Fee Ledger      │  │
│  │  • Drizzle ORM Query Layer            │ TCP  │  • Persistent Volume (pgdata)  │  │
│  │  • Firebase Admin Token Verification  │ 5432 │  • Healthcheck Enabled         │  │
│  │  • Local-First DB Chatbot Engine      │      └───────────────┬────────────────┘  │
│  └───────────────────┬───────────────────┘                      │                   │
│                      │                                          │ pg_dump (24h)     │
│                      ▼                                          ▼                   │
│  ┌───────────────────────────────────────┐      ┌────────────────────────────────┐  │
│  │          External Integrations        │      │     pg_backup (Alpine Worker)  │  │
│  │  • Firebase Auth (Google Staff SSO)   │      │  • Compressed .dump Snapshots  │  │
│  │  • Razorpay UPI / Webhooks (Optional) │      │  • 14-Day Rolling Retention    │  │
│  │  • Gemini API (Optional Upgrade)      │      │  • Persistent Volume (backups) │  │
│  └───────────────────────────────────────┘      └────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Portals & Capabilities

### 1. Public Website (`/`) & Online Admission (`/admission`)
* **Interactive Architectural Seat Map:** Live 50-desk floor layout showing real-time availability across shifts, power outlets, window, and AC zones.
* **Shift & Pricing Engine:** Supports 4 configurable study shifts (**Morning** ₹700/mo, **Evening** ₹700/mo, **Full Day** ₹1,200/mo, and **Flexible Pass** ₹400/mo) with multi-month plan discounts.
* **Dedicated Admission Flow (`/admission`):** Streamlined online seat reservation & registration workflow supporting both `OFFLINE` counter ID verification and digital document submission.
* **Dynamic Content Sections:** Photo/video campus gallery, Hall of Fame (Achievers & Platform Contributors with portrait cards), notice board, competitive exam countdowns, FAQs, and Google Maps directions.
* **Local-First Smart Assistant:** Built-in chatbot powered directly by live PostgreSQL queries (answers seat availability, shift fees, timings, and rules without requiring paid external AI APIs).

### 2. Student Self-Service Portal (`/student`)
* **Secure PIN Authentication:** Mobile-first login using auto-generated `Student ID` + 4-digit PIN with rate-limiting and brute-force lockout protection.
* **Anti-Proxy QR Attendance:** Built-in camera QR scanner (`qr-scanner-modal.tsx`) that reads rotating, time-bound Reception QR tokens (`reception_qr_tokens`) to log Check-In and Check-Out sessions, optionally enforced by a **150m GPS Geo-Fence**.
* **Digital ID & Study Timer:** Revocable personal QR pass, interactive study timer widget (`study-timer-widget.tsx`), daily/monthly study-hour logs, and assigned desk/locker details.
* **Billing & Helpdesk:** View invoices, download generated PDF payment receipts (`pdf-generator.ts`), request membership renewals, track issued library books, and raise seat-transfer or facility support tickets.

### 3. Admin & Owner Workspace (`/admin`)
* **Role-Based Access Control (RBAC):** Google Sign-In powered by Firebase Auth with strict `SUPER_ADMIN` lock (`OWNER_EMAIL`) and granular `MANAGER` staff permissions.
* **Admissions & Fee Negotiation:** Guided walk-in admission wizard and online request approval workflow with support for custom negotiated monthly fees and offline ID verification tracking.
* **Seat, Locker & Shift Operations:** Dated seat allocations, conflict-free seat transfers, locker assignments, and waitlist management.
* **Financial Ledger & Exports:** Cash/UPI/Razorpay payment collection, receipt generation, authorized payment reversals, expense tracking, and filtered CSV/Excel exports.
* **Draft / Preview / Publish CMS:** Live editor for homepage headlines, facilities, gallery media, events, notices, exam countdowns, FAQs, and Hall of Fame achievers with photo uploads.

---

## Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | Next.js (App Router), React, TypeScript, Tailwind CSS |
| **Backend & API** | Next.js Route Handlers (`app/api/*`), Server-Side Validation, Rate Limiting |
| **Database & ORM** | PostgreSQL 16 (Alpine), Drizzle ORM, `drizzle-kit` |
| **Authentication** | Firebase Auth (Staff Google SSO) + Signed HTTP-Only Cookies (Students) |
| **Containerization** | Docker, Multi-Container Docker Compose (`app`, `postgres`, `pg_backup`) |
| **Payments & Maps** | Razorpay Webhooks (Optional), Coordinate-Based GPS Geo-Fencing |

---

## Project Structure

```text
├── app/                          # Next.js App Router pages & REST API endpoints
│   ├── admin/                    # Reception & Owner SaaS workspace (/admin)
│   ├── admission/                # Dedicated online admission & booking flow (/admission)
│   ├── student/                  # Mobile-first student self-service portal (/student)
│   ├── api/                      # Backend route handlers (admin, assistant, public, student)
│   ├── page.tsx                  # Public library homepage (/)
│   ├── layout.tsx                # Root layout & theme provider wrapper
│   └── globals.css               # Global Tailwind styles
├── src/
│   ├── components/               # Modular UI components
│   │   ├── admin/                # Admin dashboard, CRM, seat map & CMS editors
│   │   ├── assistant/            # Local-first smart chatbot drawer
│   │   ├── public/               # Landing page sections, gallery & Hall of Fame cards
│   │   ├── student/              # Student dashboard, invoices & attendance views
│   │   ├── qr-scanner-modal.tsx  # Camera QR scanner for reception check-in/out
│   │   ├── study-timer-widget.tsx# Focus & session timer widget
│   │   └── theme-provider.tsx    # Light/Dark theme state provider
│   ├── db/                       # Drizzle schema, DB connection, seed script & config
│   ├── lib/                      # Auth guards, Firebase SDKs, PDF generator & rate limiter
│   └── types/                    # Shared TypeScript domain interfaces
├── drizzle/                      # SQL migrations & PostgreSQL GiST overlap exclusion
├── hooks/ & lib/                 # Shared React hooks & UI utility helpers
├── public/assets/                # Static posters & campus media assets
├── firebase-applet-config.json   # Firebase client & admin project configuration
├── Dockerfile                    # Production Node 20 Alpine build for Next.js
├── docker-compose.yml            # Orchestrates app, postgres (healthy), and pg_backup
└── .env.example                  # Environment variable template
```

---

## Environment Configuration

Copy `.env.example` to `.env` before starting the containers:

```bash
cp .env.example .env
```

| Variable | Required | Description |
| :--- | :---: | :--- |
| `APP_URL` | Yes | Base URL of the application (e.g., `http://localhost:3000`) |
| `OWNER_EMAIL` | Yes | Gmail address locked as `SUPER_ADMIN` in `/admin` |
| `SQL_HOST` | Yes | Database host (`postgres` inside Docker Compose network) |
| `SQL_DB_NAME` | Yes | PostgreSQL database name (default: `gyan_vatika`) |
| `SQL_ADMIN_USER` | Yes | PostgreSQL username (default: `gv_admin`) |
| `SQL_ADMIN_PASSWORD` | Yes | Strong password for PostgreSQL authentication |
| `STUDENT_SESSION_SECRET` | Yes | High-entropy secret key for signing student session tokens |
| `NEXT_PUBLIC_CENTER_LAT` | Yes | Library latitude for directions & geo-fencing (`22.820576`) |
| `NEXT_PUBLIC_CENTER_LNG` | Yes | Library longitude for directions & geo-fencing (`86.094174`) |
| `GEMINI_API_KEY` | No | Optional key for LLM-enhanced assistant responses (works locally without it) |
| `RAZORPAY_KEY_ID` / `SECRET` | No | Optional credentials for online UPI payment gateway |

---

## Local & Docker Setup

### 1. Build and Start Services
Launch the Next.js application (`app`), PostgreSQL 16 (`postgres`), and the automated backup worker (`pg_backup`):

```bash
docker compose up -d --build
```

### 2. Push Database Schema & Seed Initial Data
Apply the Drizzle schema inside the running `app` container and populate initial shifts, plans, rooms, and 50 desks:

```bash
docker compose exec app npx drizzle-kit push --config=src/db/drizzle.config.ts
docker compose exec app npx tsx src/db/seed.ts
```

### 3. Optional PostgreSQL Overlap Prevention Constraint
To enforce database-level non-overlapping seat allocations on self-hosted Postgres, enable `btree_gist` and apply the exclusion migration:

```bash
docker compose exec -T postgres psql -U "$SQL_ADMIN_USER" -d "$SQL_DB_NAME" -c "CREATE EXTENSION IF NOT EXISTS btree_gist;"
docker compose exec -T postgres psql -U "$SQL_ADMIN_USER" -d "$SQL_DB_NAME" < drizzle/0001_overlap_exclusion.sql
```

Access the running portals locally:
* **Public Website:** `http://localhost:3000`
* **Online Admission:** `http://localhost:3000/admission`
* **Student Portal:** `http://localhost:3000/student`
* **Admin Dashboard:** `http://localhost:3000/admin`

---

## Automated Backup & Disaster Recovery

* **Automated Snapshots:** The `pg_backup` sidecar container runs `pg_dump -Fc` every 24 hours into the persistent `pgbackups` volume and automatically prunes dumps older than **14 days**.
* **List Available Backups:**
  ```bash
  docker compose exec pg_backup ls -lh /backups
  ```
* **Restore from a Backup Dump:**
  ```bash
  docker compose exec -T postgres pg_restore -U "$SQL_ADMIN_USER" -d "$SQL_DB_NAME" --clean --if-exists < backup.dump
  ```

---

## Cloud & DevOps Roadmap

Planned infrastructure upgrades for production cloud deployment:
- [ ] **CI/CD Pipeline:** GitHub Actions workflow for automated linting, Next.js build verification, Trivy container vulnerability scanning, and publishing images to GHCR.
- [ ] **Infrastructure as Code:** Terraform modules for cloud VM & firewall provisioning paired with Ansible playbooks for zero-touch server hardening.
- [ ] **Reverse Proxy & TLS:** Nginx reverse proxy with API rate-limiting and automated Let's Encrypt SSL certificates.
- [ ] **Off-Site Backup Replication:** Automated daily sync of `pg_backup` dumps to S3-compatible object storage (Cloudflare R2 / AWS S3).
- [ ] **GitOps & Observability:** Kubernetes (K3s) deployment via Helm charts + ArgoCD, monitored with Prometheus and Grafana.

---

## Author

**Shivam Kumar Sinha** — DevOps & Full-Stack Developer  
GitHub: [@Shivam-Infra-Labs](https://github.com/Shivam-Infra-Labs)