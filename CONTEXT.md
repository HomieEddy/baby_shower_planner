# CONTEXT.md

Domain vocabulary for the Baby Shower Event Management Platform. Terms here are
load-bearing: use them exactly in code, tests, and architecture reviews. Full
context map is in `docs/DDD.md`; this file records the terms that name modules.

## Table Assignment

The act and the module that maps a Guest's party onto physical chairs.

- **Module**: `src/lib/tableAssignment.ts`. Pure (no React, no PocketBase) so the
  host editor, the host page, and the server share one implementation.
- **Owns** the invariant `seats ⇄ assignedGuestIds ⇄ Guest.table_id` and the seat
  mutations: `seatAttendee`, `seatParty`, `unseatAttendee`, `unassignParty`,
  `trimPartySeats`.
- **Does not own** validation timing: `validateTables` runs once at the save
  boundary (`db/floorMap.updateFloorMap`), never per edit.

## Seat

One chair position around a table: an index into `TableElement.seats`, `null`
when empty. Written explicitly by the Table Assignment module; legacy tables that
only carry `assignedGuestIds` are expanded on read by `getTableSeats`.

## Attendee

One named person in a Guest's party, indexed by `attendeeIndex` (0 = the primary
Guest). `attendeeIndex` is the person's identity across seating: an attendee index
may exist **at most once** across every table. `getPartyMembers(guest)` resolves an
index to a name.

## Split

A party whose attendees occupy chairs on more than one table. Legitimate, not an
error: `seatParty` returns `{ placed, unplaced }` as data, and `validateTables`
accepts a split as long as no `attendeeIndex` repeats.

## Geometry (not Table Assignment)

Chair positions and wall clamping (`getSeatLocalPosition`, `findNearestSeat`,
`clampToRoundRoom`) live in `src/components/seating/floorPlanHelpers.ts` — the 2D
renderer is their only concern.
