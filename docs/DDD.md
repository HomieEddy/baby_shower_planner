# Domain-Driven Design (DDD) Document

## Project: Baby Shower Event Management Platform (PocketBase Architecture)

---

## 1. Ubiquitous Language & Glossary

* **Guest**: An invited individual or household with an assigned magic invitation token.
* **Magic Token**: A unique string token embedding invitation access without requiring password login.
* **RSVP Status**: The attendance state of a guest (`Attending`, `Declined`, `Pending`).
* **PocketBase Collection**: A structured backend table entity in PocketBase (e.g., `guests`, `guestbook`, `photos`, `gifts`).
* **Party Size**: The count of attendees associated with a single guest invitation.
* **Dietary Restriction**: Food allergies, dietary preferences (e.g., Gluten-Free, Vegan, Nut Allergy), or special dining needs logged by a guest.
* **Catering Manifest**: A consolidated report of total headcounts and categorized dietary requirements for kitchen operations.
* **Table Assignment / Escort Card**: The physical or digital designation of a guest's assigned table at the venue.
* **Gift Log**: A record of a gift received from a guest during or prior to the shower.
* **Thank-You Status**: Boolean indicator tracking whether a host has sent a thank-you note for a specific gift.
* **Guestbook Entry**: A celebration wish, advice note, or message left by a guest for the parents.

---

## 2. Bounded Contexts & Context Map

```
+-------------------------------------------------------------------------------+
|                       BABY SHOWER EVENT DOMAIN BOUNDARY                       |
+-------------------------------------------------------------------------------+
                                        |
  +-------------------------------------+-----------------------------------+
  |                                     |                                   |
  v                                     v                                   v
+-------------------------------+ +-------------------------------+ +-------------------------------+
|  Invitation & RSVP Context    | | Seating & Stationery Context  | |  Catering & Logistics Context |
|                               | |                               | |                               |
| - PocketBase Guests Collection| | - Floor Plan Aggregate        | | - Catering Summary Projection |
| - Magic Token Value Object    | | - Table Assignment Value Obj  | | - Dietary Category Matrix   |
| - RSVP Status Enum            | | - Escort Card Generator       | | - Headcount Calculation     |
+-------------------------------+ +-------------------------------+ +-------------------------------+
  |                                     |                                   |
  +-------------------------------------+-----------------------------------+
                                        |
  +-------------------------------------+-----------------------------------+
  |                                     |                                   |
  v                                     v                                   v
+-------------------------------+ +-------------------------------+ +-------------------------------+
|  Keepsake & Memory Context    | | Gift & Gratitude Context      | | Host Admin & Settings Context |
|                               | |                               | |                               |
| - PocketBase Guestbook        | | - PocketBase Gifts Collection | | - Event Settings Aggregate  |
| - PocketBase Photos           | | - Thank-You Status            | | - Announcement Alert Entity |
| - Like Counter Value Object   | | - Note Draft Generator        | | - Theme & Schedule Context  |
+-------------------------------+ +-------------------------------+ +-------------------------------+
```

---

## 3. Domain Model Specifications

### 3.1 Invitation & RSVP Context (PocketBase `guests` Collection)
* **Guest (Aggregate Root)**
  * `id`: Unique identifier (string)
  * `name`: Primary contact name (string)
  * `email`: Contact email (string)
  * `phone`: Contact phone number (string)
  * `rsvp_status`: `Attending` | `Declined` | `Pending`
  * `attending_party_size`: Integer headcount
  * `dietary_restrictions`: Text description of dietary/allergy requirements
  * `magic_token`: Unique token string for frictionless authentication
  * `table_id`: Foreign key reference to assigned table

### 3.2 Seating & Stationery Context
* **Table (Entity)**
  * `id`: Table identifier (e.g., "Table 1", "VIP Table")
  * `name`: Custom table name (string)
  * `capacity`: Maximum allowed seat count (number)
  * `assigned_guests`: Array of `Guest` references
* **EscortCard (Value Object)**
  * `card_type`: `tent` | `nametag`
  * `guest_name`: Name string
  * `table_name`: Table designation
  * `party_size`: Attending size
  * `qr_url`: Encoded Magic Token URL for table checking

### 3.3 Catering & Logistics Context
* **CateringSummary (Domain Read Model / Projection)**
  * `total_attending_guests`: Calculated total count of guests with `rsvp_status === 'Attending'`
  * `total_headcount_meals`: Sum of all `attending_party_size` values for attending guests
  * `dietary_category_counts`: Map of dietary categories (Vegetarian, Gluten-Free, Nut Allergies, Dairy-Free, Halal/Kosher, Other) to meal counts and guest names.

### 3.4 Gift & Gratitude Context (PocketBase `gifts` Collection)
* **GiftLog (Aggregate Root)**
  * `id`: Gift entry ID (string)
  * `guest_name`: Giver name (string)
  * `gift_description`: Item description (string)
  * `category`: `Nursery` | `Clothing` | `Toys` | `Feeding` | `Diapering` | `Other`
  * `thank_you_sent`: Boolean flag
  * `created_at`: Timestamp

---

## 4. Key Domain Events

1. **`GuestRsvpSubmitted`**: Fired when a guest updates their attendance status, party size, or dietary preferences. Triggers re-calculation of the `CateringSummary` projection in PocketBase.
2. **`GuestTableAssigned`**: Fired when a host assigns or moves a guest to a table. Updates seating capacity and regenerates `EscortCard` representations.
3. **`GiftLogged`**: Fired when a new gift is recorded. Increments total gifts received and initializes a pending thank-you draft.
4. **`ThankYouStatusToggled`**: Fired when a host marks a thank-you note as sent. Re-calculates gratitude completion percentage.
