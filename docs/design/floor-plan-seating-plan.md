# Floor Plan & Seating: visual design plan

Status: proposal, for review before any implementation.
Branch: `claude/project-thread-hpqps1` (off `main`).

## Scope

- **/seating host page**: `FloorPlanPage.tsx`, `UnassignedGuestsSidebar.tsx`, the quick actions panel and the read-only 2D/3D canvas.
- **Full-screen Floor Plan editor**: `FloorPlanEditor.tsx` (opened from /seating).
- **Shared canvas rendering**: `venueShapes.tsx`, `tableVisuals.ts`, `FloorPlan3D.tsx` colors.
- Out of scope for now: the guest-facing Find My Table page (`GuestFinderPage.tsx`). It can adopt the new canvas look later for free, since it shares the renderers.

## What the review found

1. **No visual hierarchy.** Every block is the same cream card with a 2px tan border and a heavy shadow. Above the canvas sit five stacked boxes (page header, progress banner, 4-tile stat bar, canvas header, status filter bar), so the floor plan, the thing the page is about, starts far down the screen.
2. **Repeated information.** Seated/unseated counts appear in the progress banner and again in the stat tiles. "Fullscreen editor" is a button twice (quick actions and canvas header).
3. **Inconsistent status colors.** On the page, empty = green, partial = amber, full = red. In the editor (`tableVisuals.ts`), full = green. Red reads as an error, but a full table is the goal. Green is also reused for "this table fits the selected party".
4. **English-only canvas text in a bilingual app.** The canvas prints `FULL`, `PARTIAL (3/8)` and `EMPTY` as hardcoded strings (`FloorPlanPage.tsx` ~L960-981), right above the table's own `3/8 seats` label, so the information is duplicated too. The editor's room presets ("Small", "Standard", ...) are hardcoded English as well.
5. **Broken characters in the editor.** Room preset buttons show mojibake: `Small (ÃƒËœ 650)` should read `Ø 650`, and `750Ãƒâ€”550` should read `750×550` (`FloorPlanEditor.tsx` ~L421-482).
6. **The canvas ignores themes and dark mode.** Konva draws with hex literals (`#FFFDF9`, `#CBAE94`, ...). The CSS that routes the palette through theme vars only touches Tailwind classes, so theme presets and dark mode stop at the canvas edge.
7. **Seats carry no information at rest.** An occupied chair is a solid brown dot. You can only see who sits where by hovering, and hover does not exist on touch screens.
8. **Off-palette accents.** The Smart Suggest button uses an amber to brown to emerald gradient with a pulsing icon, which pulls attention away from the canvas.
9. **Mobile flow.** The canvas scale stops at 0.45 then scrolls sideways, and the unassigned-guests list sits below the canvas, so "pick a party, then tap a table" means scrolling back and forth.
10. **Duplicated logic behind the visuals.** The page re-implements table outline rules inline (~L889-923) instead of using `tableOutline()` in `tableVisuals.ts`, which is how the colors drifted apart.

## Proposed direction: "calm, canvas-first"

### A. Page layout
- One compact header row: title, a slim progress bar with `12/30 seated`, undo/redo, and the primary **Open editor** button.
- The canvas becomes the hero and is visible without scrolling on a laptop. The four stats shrink into small chips inside the canvas header.
- Quick actions become a toolbar: **Smart suggest** (primary, plain accent color, no gradient) plus a **Share** menu holding Email, Print QR and Export PNG.
- Lighter cards: 1px borders and soft shadows, keeping the heavier style only for the canvas frame.
- Desktop: the unassigned-guests sidebar is sticky. Mobile: it becomes a bottom sheet, and the selected party stays pinned above the canvas while you tap a table.

### B. One status language, everywhere
| State | Look |
|---|---|
| Empty | Neutral tan outline |
| Partial | Amber ring + fill bar in the capacity pill |
| Full | Sage/emerald ring + small check |
| Over capacity | Red (the only red on the canvas) |
| Seating a party: fits | Emerald glow, free chairs highlighted |
| Seating a party: doesn't fit | Dimmed (no red dashes) |

All rules live in `tableVisuals.ts` and are used by the page, the editor and 3D. Status is never shown by color alone: each state also has an icon or label, localized EN/FR. A small legend sits in the canvas corner.

### C. Canvas look
- Theme-aware palette: read the CSS vars (`--surface`, `--accent`, `--ink`, ...) into a `canvasPalette` object, refreshed when the theme or dark mode changes, and pass it to the renderers instead of hex literals.
- Floor: a softly filled room with a subtle dot grid instead of dashed lines.
- Tables: linen fill with the table's own color as a thin accent ring; name centered, capacity as a small pill under the table.
- Chairs: occupied chairs show the guest's initials; members of the same party share a tint.
- Controls: zoom in/out and zoom-to-fit buttons; tap opens the same details as hover.

### D. Editor alignment
- Same header style as the page; fix the mojibake and localize the room presets.
- Left panel grouped into collapsible sections: Room, Add items, Selected item.
- Uses the same palette and status rules as the page.

### E. Accessibility
- Check contrast of the many `text-xs` labels on tan backgrounds (target WCAG AA).
- Status not conveyed by color alone; visible focus rings on canvas controls.

## Suggested phasing (one PR each)

1. **Quick wins** (small): fix the mojibake, localize canvas status labels and room presets, unify status colors through `tableVisuals.ts`, remove duplicated stats and buttons.
2. **Page layout**: compact header, canvas-first layout, Share menu, sticky sidebar and mobile bottom sheet.
3. **Canvas refresh**: theme-aware palette, new table/chair styling with initials, legend, zoom controls; match 3D colors.
4. **Editor alignment**: header, grouped panel, shared palette.

## Open questions
- Full tables: sage/emerald "done" (recommended) or keep the current red?
- Should Find My Table get the new canvas look in the same pass?
- Is guest initials on chairs OK privacy-wise for exported PNGs, or should export hide them?
