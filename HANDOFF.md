# Codex Handoff

## Objective

Finish and verify the implementation described by `UI_PLAN.md`. The code for all
five phases is present, but database migration, browser E2E verification, and Git
commits could not be completed in the previous restricted session.

Do not discard the current worktree. It contains the completed `FIX_PLAN.md`
baseline plus the uncommitted UI overhaul.

## Current State

- `pnpm typecheck` passes.
- `pnpm check` passes.
- `pnpm exec prisma validate` passes.
- `pnpm exec prisma generate` completed successfully.
- `git diff --check` passes.
- No UI overhaul commit exists yet.
- `UI_PLAN.md` and `.lavish/ui-overhaul-plan.html` are untracked planning artifacts.
- The previous session could not write to `.git`, access Docker, or bind port 3000.

Installed UI dependencies:

- `lucide-react`
- `@dnd-kit/core`
- `@dnd-kit/sortable`
- `@dnd-kit/utilities`

## Implemented Work

### Phase 1

- Card Edit, Archive/Restore, and Delete actions use accessible Lucide ghost icons.
- Icon buttons have `aria-label`, `title`, hover tint, lift, and focus states.
- Task dialog Status, Deadline, Client, and Label fields have pointer, hover, and
  focus treatments.

### Phase 2

- Board archived controls are right-aligned and link to `/archived`.
- `/archived` supports bounded title/description search, client and label filters,
  pagination, empty state, restore, and confirmed delete.
- Archive/delete actions revalidate `/`, `/archived`, and relevant detail routes.

### Phase 3

- Task details use URL tabs: default Tasks and `?tab=log` Work log.
- Active subtasks are grouped into Inbox, Review, and Ongoing sections.
- Finished subtasks are merged with log entries into a descending feed.
- Finished subtasks do not contribute to logged-minute totals.

### Phase 4

- `Task.sortOrder` and `Subtask.sortOrder` were added to Prisma.
- Migration `prisma/migrations/20260711140000_sort_order/migration.sql` adds and
  backfills ordering with 1024-point gaps and replaces relevant indexes.
- `moveTask` and `moveSubtask` validate input and atomically reindex target lanes.
- Board and subtasks share `DropLane` and `SortableItem` primitives.
- Pointer activation distance, keyboard sensors, optimistic updates, visible
  failures, no-op detection, and archived-card disabling are implemented.

### Phase 5

- Press Start 2P is loaded with `next/font` for kickers and count badges only.
- Successful task creation runs a self-cleaning pixel crumble/swirl/star overlay.
- Validation failure does not trigger the animation.
- Clicking the overlay skips it.
- Archive, delete, and drag pickup have reduced-motion-aware micro-animations.

## Resume Commands

Run these with Docker Desktop available:

```bash
./start-database.sh
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm typecheck
pnpm check
pnpm dev
```

If the existing development database predates the repaired migration baseline,
inspect `prisma migrate status` before making destructive changes. Prefer a fresh
database for the first verification pass.

## Required Verification

Use a real browser against `http://localhost:3000` and inspect the console and
network panel.

1. Confirm the board renders with icon actions and no hydration warnings.
2. Create a client, label, and fully populated task. Confirm the star animation
   plays once and leaves no `.pixel-create-overlay` element behind.
3. Drag a task across statuses and reorder within one status. Hard reload and
   verify persistence.
4. Verify a drop onto the existing source position sends no server action.
5. Verify keyboard and touch drag behavior.
6. Open task details. Create subtasks, drag them across the three active sections,
   finish one through its select, and verify it appears in `?tab=log`.
7. Add work logs and confirm logged minutes exclude finished-subtask estimates.
8. Archive tasks and verify board checkbox behavior plus `/archived` search,
   filters, restore, delete, pagination, and mobile layout.
9. Test hostile archive queries: SQL-like text, 500-character input, array query,
   and oversized page values. None should produce a 500.
10. Emulate `prefers-reduced-motion: reduce`. Creation and micro-animations should
    be skipped while mutations still complete.
11. Force server-action failures for task and subtask moves. Optimistic UI must
    revert and show an error.
12. Run the final regression loops in both `FIX_PLAN.md` and `UI_PLAN.md`.

Assert persisted order, status, archive state, and cascades with Prisma or `psql`,
not the UI alone.

## Review Hotspots

- `src/server/actions/tasks.ts`: `moveTask`, create append ordering, revalidation.
- `src/server/actions/subtasks.ts`: `moveSubtask`, create append ordering.
- `src/components/task-board.tsx`: optimistic cross-lane and same-lane semantics.
- `src/components/subtask-list.tsx`: drag handling plus select error rollback.
- `src/components/sortable-lane.tsx`: shared DnD attributes and transforms.
- `src/components/task-form.tsx`: create animation lifecycle and reduced motion.
- `src/app/archived/page.tsx`: query normalization, pagination, and DB bounds.
- `prisma/migrations/20260711140000_sort_order/migration.sql`: backfill and indexes.

## Security Notes

- Inputs are bounded and validated with Zod; Prisma is used without raw queries.
- Move actions use transactions and validate INT4 IDs and status enums.
- Archived search is capped at 100 characters and 50 results per page.
- The application still has no authentication or ownership authorization. Do not
  deploy it publicly until access control is added to reads and every mutation.

## Commit Guidance

The original plan requested one commit per phase, but all phases are currently in
one uncommitted worktree. Do not manufacture misleading phase commits by rewriting
history without review. After the regression loop is green, either make one honest
commit:

```text
feat: implement task manager UI overhaul
```

or split commits carefully by dependency with explicit review of each staged diff.
Do not add an agent co-author.
