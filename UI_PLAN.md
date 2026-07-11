# UI Overhaul Plan (2026-07-11)

Five phases, ordered by risk and dependency. **Prerequisite: all of `FIX_PLAN.md`
ships first** - Phase 3 builds on its task 4 (awaited subtask actions) and Phase 4
touches the update actions it repairs. All open design questions have been decided
by Anton; do not re-ask them.

## Decisions (already made - implement as stated)

1. Card action buttons: **borderless** ghost icon buttons (no outlines), lucide
   stroke icons, subtle hover tint. Delete icon stays red.
2. Archived: keep the board "Show archived" checkbox (moved to the far right) AND
   add a full `/archived` page with search.
3. Finished subtasks: **computed view** - the Work log tab merges log entries and
   finished subtasks into one time-sorted feed. No schema change for this.
4. Drag & drop: **@dnd-kit**, for cross-column status drags AND manual reordering
   within a column (adds a `sortOrder` column + migration).
5. Animations: full scope - create-task star animation, archive/delete/drag
   micro-animations, and Press Start 2P pixel-font accents (kickers/counts only).

## How to work each phase (the loop)

```
1. Implement the phase.
2. pnpm typecheck && pnpm check - fix failures, restart loop.
3. Run the phase's E2E list in a real browser (assume `pnpm dev` is already
   running on http://localhost:3000). Assert DB state with a Prisma script or
   psql, never by eyeballing the UI.
4. Any pass-criteria failure: diagnose, fix, back to step 2.
5. Green: commit as "feat: phase N - <title>". Then run the cumulative
   regression: all previous phases' E2E lists. Phases land as separate commits.
```

After Phase 5, run the final regression loop at the bottom (includes FIX_PLAN's).

---

## Phase 1 - Icon buttons + dialog hover states (low risk)

**Card actions** (`src/components/task-card.tsx`):
- Replace the Edit / Archive / Delete text buttons with icon-only buttons using
  `lucide-react`: `Pencil`, `Archive` (swap to `ArchiveRestore` on archived cards),
  `Trash2`.
- Style: NO border, transparent background, ~2rem square, rounded; hover = subtle
  dark tint (`rgba(0,0,0,.07)`) + 1px upward lift; delete icon colored red-700,
  hover tint red. Visible focus ring for keyboard users.
- Every button needs `aria-label` and `title` (icons alone have no accessible name).
- The delete-confirm dialog keeps its text buttons - destructive confirmations
  should read as words.
- The Edit trigger rendered by `TaskForm` on cards needs the same icon treatment;
  pass a `trigger` variant prop rather than duplicating the dialog.

**Dialog field hover states** (`src/components/task-form.tsx`):
- Status, Deadline, Client, Label controls get: `cursor: pointer`, hover =
  emerald border + small hard shadow + faint green-tinted background, and a
  visible `focus-visible` ring. Title/Description keep their native text cursor
  and current styling.

**E2E loop:**
- [ ] Every card shows the three icon buttons: no text labels, no emoji glyphs,
      no borders; delete icon is red.
- [ ] Hover each icon: tint + lift; `title` tooltip appears; `aria-label` present
      in the DOM for all three.
- [ ] Archived card shows the restore icon variant; click toggles archive state
      (reload to prove persistence).
- [ ] Click-through regression: edit opens the dialog, delete opens the confirm
      dialog, confirm-delete still works.
- [ ] In the create dialog, hovering Status / Deadline / Client / Label gives
      pointer cursor + visible style change on all four; Tab shows focus rings.
- [ ] Keyboard-only pass: all card actions reachable and operable via Tab/Enter.

---

## Phase 2 - Archived far right + /archived page (low risk)

**Filter bar** (`src/app/page.tsx`):
- Order becomes: Client, Label, Apply filters, [flex spacer], Show archived
  checkbox + "View all →" link to `/archived`. Must wrap sanely on mobile.
- Checkbox behavior unchanged (mixes archived cards into the board).

**New page** `src/app/archived/page.tsx` (server component):
- Query: `where: { archivedAt: { not: null } }`, `orderBy: { archivedAt: "desc" }`,
  bounded with `take` (e.g. 50) + a "load more" or simple pagination param.
- Search: plain GET form, `?q=` searchParam, case-insensitive `contains` on title
  and description. Keep client/label filter selects (reuse the board's pattern).
- Layout: a list (not board columns), showing title, archived date, client, label,
  log count/total logged. Cards link to `/tasks/[id]`. Actions per row: restore
  (icon) and delete (icon + existing confirm dialog).
- Add a nav link to `/archived` in the board header.
- Restore/archive/delete actions must revalidate both `/` and `/archived`.

**E2E loop:**
- [ ] Archived control right-aligned at desktop width; usable at 375px.
- [ ] Archive 2 tasks → `/archived` shows exactly those; board without the
      checkbox shows neither; with the checkbox shows them dimmed as today.
- [ ] Search matches title AND description, case-insensitive; gibberish query
      shows an empty state; clearing the query restores the list.
- [ ] Restore from `/archived` → task reappears on the board in its status column
      (hard reload proves it), and disappears from `/archived`.
- [ ] Hostile: `?q=%27%3B--`, a 500-char query, `?q[]=a` - clean handling, no 500.

---

## Phase 3 - Task detail: tabs + status sections (medium risk)

**Restructure** `src/app/tasks/[id]/page.tsx`:
- Two tabs: **Tasks** (default) and **Work log**. Tab state lives in the URL
  (`?tab=log`), not useState, so it deep-links and survives revalidation. Render
  both server-side; toggle via links styled as tabs (no client JS needed beyond
  styling).
- Tasks tab: subtasks grouped into three sections - Inbox, Review, Ongoing -
  reusing the board column styling at smaller scale. No Finished section. The
  per-subtask status select stays (it is the keyboard path, and "Finished"
  remains an option in it).
- Work log tab: merged feed, time-sorted desc, of (a) TaskLog entries and
  (b) subtasks with status Finished (computed - no schema change). Finished
  subtasks render visually distinct (e.g. "✔ subtask · finished <relative time>";
  use Subtask.createdAt if no better timestamp - do NOT add columns for this).
  The add-log form lives on this tab. Tab label shows a count badge.
- Finishing a subtask (select or Phase 4 drag) moves it from the sections to the
  Work log feed; setting it back to any other status returns it.
- Prerequisite check: FIX_PLAN task 4 must already be merged (awaited subtask
  actions with error states).

**E2E loop:**
- [ ] Detail page defaults to the Tasks tab; `?tab=log` deep-links; browser
      back/forward toggles tabs.
- [ ] Subtasks created in each status render in their section; empty sections
      show an empty state.
- [ ] Finish a subtask → leaves sections, appears in the Work log feed with the
      finished styling, badge count increments; un-finish → returns to sections.
- [ ] Adding a plain work-log entry works from the Work log tab; total logged
      minutes stays correct (finished subtasks do NOT add to logged minutes).
- [ ] Two-tab failure regression: delete a subtask in tab A, change its status in
      tab B → visible error, no unhandled rejection, no phantom UI state.

---

## Phase 4 - Drag & drop with @dnd-kit (medium risk)

**Schema** (one migration):
- Add `sortOrder Int @default(0)` to `Task` and `Subtask`; backfill in the
  migration from the current display order (tasks: deadline asc nulls last then
  createdAt desc, per status; subtasks: createdAt asc, per task+status). Use
  integer gaps (e.g. 1024 apart); on insert-between exhaustion, reindex the column
  server-side. Add the columns to the relevant `@@index` if query plans need it.
- Board and section queries now order by `sortOrder` within a status. New
  tasks/subtasks append to the end of their status lane.
- NOTE: this replaces deadline-first auto-sorting on the board; overdue remains
  signaled by the red highlight (decided trade-off).

**Behavior**:
- Library: `@dnd-kit/core` + `@dnd-kit/sortable`. One shared drop-zone/sortable
  wrapper used by BOTH the board columns and the Phase 3 subtask sections.
- Cross-column drop = status change; within-column drop = sortOrder change; both
  through server actions (`moveTask(id, status, beforeId?)` style - one action
  that sets status + sortOrder atomically, validated with zod like the rest).
- `useOptimistic` for instant movement; on action failure the item snaps back and
  an error message shows. Never leave UI and DB disagreeing after settle.
- Keyboard: enable dnd-kit's keyboard sensor (pick up / move / drop with arrows).
  The status select (subtasks) and edit dialog (tasks) remain as fallbacks.
- Touch: pointer sensor with a small activation distance so taps still open links.
- Archived cards are not draggable. Dragging a subtask onto a "Finished" target is
  allowed only if a Finished drop target is exposed; otherwise finishing stays in
  the select (Phase 3 semantics apply either way).
- Respect `prefers-reduced-motion`: no spring/lift animation on drag.

**E2E loop:**
- [ ] Drag board card Inbox → Review: instant move, counts update, hard reload
      proves status persisted.
- [ ] Reorder two cards within a column → order survives reload; new task appends
      at a consistent position; other columns unaffected.
- [ ] Drop back on the source position: no server call fired (assert via network
      log).
- [ ] Failure path (stub the action to throw): card snaps back + visible error;
      after reload the board matches the DB.
- [ ] Subtask drags across sections persist; finished-subtask semantics per
      Phase 3.
- [ ] Touch drag works in a mobile-emulated viewport; keyboard pick-up/move/drop
      works without a mouse; reduced-motion shows no drag animations.
- [ ] Regression: client/label/archived filters still correct after drags;
      archived cards cannot be dragged.

---

## Phase 5 - 8-bit motion (low risk)

**Create-task star animation** (the headline):
- Trigger ONLY after `createTask` resolves successfully - never on validation
  failure (dialog stays open with errors, as today).
- Sequence (~1.4s total, all `steps()` easing for the chunky 8-bit feel):
  1. Measure the dialog, mount a fixed-position overlay of 12-16px pixel divs
     sampled from the dialog's palette; hide the dialog instantly.
  2. Crumble: pixels scatter a few px downward/outward, ~350ms, `steps(3)`.
  3. Swirl: pixels translate+rotate into the center point, staggered, ~450ms,
     `steps(5)`, fading out.
  4. Star: one div box-shadow pixel-art white star (1px ink outline) forms at
     center over a briefly dimmed backdrop, ~200ms.
  5. Blink 3x (~450ms, visibility toggles), then remove overlay + backdrop.
- The board updates behind the overlay via normal revalidation - the animation
  must never block interaction or delay the actual close/reset logic.
- `prefers-reduced-motion: reduce` → skip straight to close. Any click during the
  animation skips it. Overlay cleans itself up (no orphaned nodes on rapid
  creates).

**Micro-animations** (same pixel system, tiny scale, all reduced-motion-aware):
- Archive: card does a short 2-frame pixel "drop and fade".
- Delete (after confirm): card crumbles downward.
- Drag pickup (Phase 4): 1px jitter frame on lift.

**Pixel font accents:**
- Load `Press Start 2P` via `next/font` (subset, swap). Apply ONLY to tiny
  accents: the header kicker ("Agency workbench"), column count badges, and the
  dialog kicker. Never body text, titles, or forms.

**E2E loop:**
- [ ] Valid create → full sequence plays once, dialog closed after, new card on
      the board; record a GIF of the sequence for review.
- [ ] Server-rejected create (tampered estimate POST) → NO animation, dialog stays
      open with the error.
- [ ] `prefers-reduced-motion: reduce` emulation → instant close, no pixels, task
      still created; micro-animations also disabled.
- [ ] Click mid-animation skips cleanly; 3 rapid creates leave zero orphaned
      overlay nodes in the DOM.
- [ ] Archive and delete micro-animations play and never delay the actual state
      change; pixel font appears only on kicker/count elements.
- [ ] No layout shift when the overlay mounts; no console errors; sequence ≤1.5s.

---

## Final regression loop (after Phase 5)

Repeat until one full pass is green with zero fixes:

1. FIX_PLAN.md's final regression loop (fresh-DB provision, full journey, hostile
   pass, two-timezone pass).
2. Full new-feature journey: create task (star animation) → drag across columns →
   reorder within a column → open detail → subtasks through all three sections →
   finish one (appears in Work log tab) → log work → archive (micro-animation) →
   find it via /archived search → restore → delete with confirm (crumble).
3. Keyboard-only and reduced-motion passes over the same journey.
4. `pnpm typecheck && pnpm check` clean.
