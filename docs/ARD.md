# Architecture Reference Document (ARD)

## System Overview & PocketBase Integration Architecture

---

## 1. System Technology Stack

* **Frontend Framework**: React 18 with TypeScript & Next-style Page View Architecture (`src/pages/*`)
* **Build Tooling**: Vite (Development SPA server & bundling)
* **Backend Runtime**: Native Node.js HTTP Server (`server.ts`) with PocketBase SDK (`pocketbase`), compiled with `esbuild` for production (`dist/server.cjs`). **Express framework replaced completely.**
* **Styling & UI Utilities**: Tailwind CSS, Framer Motion (`motion/react`), Lucide Icons, `clsx` & `tailwind-merge` (`cn` helper)
* **Schema Validation & Parsing**: `zod` schema validation (`src/lib/validation.ts`)
* **Database & Persistence**: PocketBase Collections (`guests`, `guestbook`, `photos`, `gifts`, `settings`, `alerts`, `floorplan`, `predictions`) via `PocketBaseDataService` (`src/lib/pocketbase.ts`)
* **Deployment Target**: Cloud Run container listening strictly on port `3000`

---

## 2. Component Architecture Diagram

```
+-------------------------------------------------------------------------+
|                    Browser Client (Next-Style Views)                    |
|                                                                         |
|  +------------------+   +-------------------+   +--------------------+  |
|  | Admin Dashboard  |   | RSVP / Guest Flow |   | Digital Guestbook  |  |
|  +------------------+   +-------------------+   +--------------------+  |
|  | Catering Summary |   | Escort Card Gen   |   | Thank You Tracker  |  |
|  +------------------+   +-------------------+   +--------------------+  |
+------------------------------------|------------------------------------+
                                     | PocketBase SDK / HTTP API (/api/*)
                                     v
+-------------------------------------------------------------------------+
|                  Native Node HTTP Server (server.ts)                    |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  |                 PocketBase Client SDK (pocketbase)                |  |
|  |             - Collection Queries & PocketBase Services            |  |
|  +-------------------------------------------------------------------+  |
|                                    |                                    |
|                                    v                                    |
|  +-------------------------------------------------------------------+  |
|  |                 Data Access Layer (src/db/index.ts)               |  |
|  |              - PocketBase data caching & local store              |  |
|  +-------------------------------------------------------------------+  |
+-------------------------------------------------------------------------+
```

---

## 3. Directory Structure

```
├── docs/
│   ├── PRD.md                       # Product Requirements Document
│   ├── ARD.md                       # Architecture Reference Document
│   └── DDD.md                       # Domain-Driven Design Document
├── src/
│   ├── components/                  # React UI Components
│   │   ├── AdminDashboard.tsx       # Main Host Portal & Navigation Hub
│   │   ├── CateringSummaryView.tsx  # Catering & Dietary Restrictions Summary
│   │   ├── EscortCardsGenerator.tsx # Printable Escort Cards & Name Tags
│   │   ├── ThankYouTrackerView.tsx  # Automated Thank You Card Tracker
│   │   ├── GuestbookPage.tsx        # Guestbook & Memory Keepsake
│   │   ├── SeatingPlannerView.tsx   # Drag-and-Drop Table & Seating Canvas
│   │   └── ToastContext.tsx         # Global User Notification System
│   ├── lib/
│   │   └── pocketbase.ts            # PocketBase Client SDK Integration
│   ├── db/
│   │   └── index.ts                 # Data Access Methods & Seed Store
│   ├── types.ts                     # Application Shared Interfaces & Types
│   ├── App.tsx                      # Primary Application Container
│   └── main.tsx                     # React DOM Entry Point
├── server.ts                        # Native Node HTTP Server with Vite & PocketBase
├── package.json                     # Dependency Manifest & Build Scripts
└── vite.config.ts                   # Vite Configuration
```

---

## 4. API Specification

### 4.1 Guest Management APIs
* `GET /api/guests`: Fetch full list of registered guests from PocketBase / local store.
* `POST /api/guests`: Create a new guest entry and generate a magic token.
* `POST /api/guests/batch-import`: Batch import guests from CSV payloads.
* `PUT /api/guests/:id`: Update guest details (e.g., party size, table assignment, contact info).
* `DELETE /api/guests/:id`: Delete a guest entry.

### 4.2 RSVP Public APIs
* `GET /api/rsvp/:token`: Fetch guest details by personalized invitation magic token.
* `POST /api/rsvp/:token`: Submit or update guest RSVP status, party size, and dietary restrictions.

### 4.3 Gift & Gratitude Tracker APIs
* `GET /api/gifts`: Retrieve logged shower gifts.
* `POST /api/gifts`: Log a newly received gift.
* `POST /api/gifts/:id/thankyou`: Toggle thank-you note sent status.
* `DELETE /api/gifts/:id`: Delete a gift entry.

### 4.4 Guestbook & Photo APIs
* `GET /api/guestbook`: Fetch guestbook wishes.
* `POST /api/guestbook`: Post a new guestbook message.
* `GET /api/photos`: Retrieve gallery photos.
* `POST /api/photos`: Upload a photo payload.
* `POST /api/photos/:id/like`: Increment photo likes.

---

## 5. Security & Deployment Constraints

1. **Port Standard**: The Native HTTP server binds strictly to `0.0.0.0:3000`.
2. **Build Flow**: Production build compiles `server.ts` into `dist/server.cjs` via `esbuild`.
3. **No Express**: Backend runs entirely on native `http` module without Express overhead.
