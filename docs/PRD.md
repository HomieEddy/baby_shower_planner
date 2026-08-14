# Product Requirements Document (PRD)

## Project Title: Baby Shower Event Management Platform (PocketBase + Next-style Frontend)

---

## 1. Executive Summary
The **Baby Shower Event Management Platform** is a web application designed to streamline event planning, guest engagement, seating arrangements, catering logistics, photo sharing, and gratitude management for baby shower celebrations. The platform runs on a lightweight frontend architecture powered by PocketBase backend integration.

---

## 2. Target User Personas

### 2.1 The Event Host (Parents & Event Planners)
* **Goal**: Manage guest lists, track RSVPs, assign seating, oversee dietary needs, receive photo uploads, and send post-event thank-you cards smoothly without spreadsheet chaos.
* **Key Needs**: Real-time RSVP updates, CSV import/export, seating arrangement tools, catering manifests, printable escort cards, and automated thank-you note trackers.

### 2.2 The Guest
* **Goal**: RSVP effortlessly via personalized magic tokens, view schedule details and floor maps, leave celebration wishes in a digital guestbook, and upload event photos in real time.
* **Key Needs**: Mobile-optimized, frictionless authentication (token-based links), clear instructions, and engaging interactive elements.

### 2.3 The Caterer & Event Staff
* **Goal**: Receive an accurate headcount and clear dietary/allergy breakdown for meal preparation and service.
* **Key Needs**: Clean, printable kitchen manifests categorized by dietary restriction (Gluten-Free, Vegetarian, Nut Allergies, etc.).

---

## 3. Core Functional Scope

### 3.1 Guest & RSVP Management
* **Personalized Invitation Magic Tokens**: Tokenized invitation URLs for zero-friction single-click RSVPs.
* **Party Size & Dietary Tracking**: Captures attending headcount, dietary restrictions, contact information, and delivery channels.
* **CSV Batch Import & Export**: Import bulk guest lists and export full RSVP spreadsheets.
* **Instant Link Sharing**: One-click copying of all personalized magic invitation URLs.

### 3.2 Catering & Dietary Restrictions Export Summary
* **Real-time Kitchen Manifest**: Automated calculation of total attending guests, total meal counts, and special dietary requests.
* **Categorized Dietary Breakdown**: Automatic classification of restrictions into Vegetarian/Vegan, Gluten-Free, Nut Allergies, Dairy-Free, Halal/Kosher, and custom notes.
* **Export & Print Ready**: One-click CSV export and printable kitchen manifests formatted for banquet staff.

### 3.3 Interactive Floor Plan & Seating Management
* **Drag-and-Drop Floor Canvas**: Visual placement of guest tables, dance floor, gift station, and venue landmarks.
* **Guest Table Assignment**: Assign guests to specific tables with live seat counts and capacity indicators.

### 3.4 Printable Table Escort Cards & Name Tags
* **Stationery Formats**: Support for Folded Tent Place Cards (with cut/fold lines) and Wearable Name Badges.
* **Dynamic Content**: Auto-populates guest name, table assignment, party size, custom header text, and scannable table/RSVP QR codes.
* **Print Optimized**: 2-column print layout tuned for standard A4 and Letter paper dimensions.

### 3.5 Digital Guestbook & Memory Keepsake
* **Wishes & Advice Engine**: Guests can submit heartfelt wishes, parent advice, and attach optional photos.
* **Printable Memory Book**: Hosts can export or print the digital guestbook entries into a physical memory keepsake book.

### 3.6 Guest Photo Gallery & Day-of Uploads
* **Frictionless QR Uploads**: QR code access for guests to upload live event photos directly from mobile devices.
* **Photo Wall & Moderation**: Real-time photo gallery with liking, host download, and deletion controls.

### 3.7 Automated Thank-You Card Tracker
* **Gift Logging**: Track gifts received by guest name, description, category (Nursery, Clothing, Toys, Feeding, etc.), and receipt date.
* **Automated Note Generator**: One-click generation of personalized thank-you note text ready to copy or edit.
* **Status Progress**: Visual completion progress bar for sent vs. pending thank-you cards.

### 3.8 PocketBase Data Storage & Integration
* **PocketBase SDK (`pocketbase`)**: Integrated collection schemas for `guests`, `guestbook`, `photos`, `gifts`, `settings`, `alerts`, `floorplan`, `predictions`.

---

## 4. Non-Functional Requirements

* **Performance**: Sub-100ms API response times; client render under 60fps.
* **Backend Architecture**: Native Node HTTP Server with PocketBase SDK (Express removed).
* **Frontend Architecture**: Lightweight Next-style single-page routing architecture (`/admin`, `/rsvp/:token`, `/guestbook`, `/seating`, `/photos`).
* **Print Stylesheet Integration**: Tailored `@media print` rules hiding UI controls and formatting paper layouts cleanly.
