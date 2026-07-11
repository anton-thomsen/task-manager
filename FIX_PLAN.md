# Fix Plan: Code Review Findings (2026-07-11)

Ten confirmed findings from the code review, each with a fix plan and an end-to-end
verification loop. Work through the tasks in order (Task 1 resets the database
baseline, so everything else depends on it).

## How to work each task (the loop)

Every task follows the same loop. Do not move to the next task until the loop exits green.

```
1. Implement the fix described under "Fix".
2. Run: pnpm typecheck && pnpm check
   - If either fails, fix and restart the loop.
3. Run the E2E steps under "E2E verification" against the running app
   (assume `pnpm dev` is already running on http://localhost:3000;
   drive the flows in a real browser, not just unit-level checks).
4. Check every item under "Pass criteria".
   - Any failure: diagnose, adjust the fix, go back to step 2.
5. All green: commit the task as a single commit named "fix: <task title>",
   then start the next task.
```

DB state assertions: use a throwaway script with the generated Prisma client
(`generated/prisma`), e.g. `pnpm exec tsx scripts/assert.ts`, or `psql` against
the local database from `start-database.sh`. Never assert DB state by eyeballing
the UI alone.

After Task 10, run the **final regression loop** at the bottom.

---

## Task 1 - Rebuild the migration baseline (critical)

**Problem:** The only migration (`prisma/migrations/20260711120000_agency_workflow/migration.sql`)
ALTERs a `Task` table and references a `TaskStatus` enum that no migration ever creates.
A fresh database cannot be provisioned. There is also no `migration_lock.toml`.

**Fix:**
- Delete the `prisma/migrations` directory entirely.
- With the local dev DB running, run `pnpm exec prisma migrate dev --name init` to
  generate a single clean baseline from `schema.prisma` (this creates
  `migration_lock.toml` too).
- Do NOT hand-edit the generated SQL.

**E2E verification (fresh-provision loop):**
1. Start a second, empty Postgres database (new container or new database name).
2. Point `DATABASE_URL` at it and run `pnpm exec prisma migrate deploy`.
3. Then run the app against it: create a task, a subtask, and a log entry through the UI.

**Pass criteria:**
- [ ] `migrate deploy` on an empty database exits 0 with no manual steps.
- [ ] `pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url <empty-db-url>` reports no drift.
- [ ] The app works end to end against the freshly provisioned database.

---

## Task 2 - Make cleared fields actually clear on update (critical)

**Problem:** In `updateTask` (`src/server/actions/tasks.ts`), cleared form fields
(`""`) become `undefined` via the zod preprocessors, and Prisma skips `undefined`
fields on update. Deadline, client, label, and both estimates can never be unset.

**Fix:**
- On update, distinguish "field submitted as empty" (set column to `null`) from
  "field absent" (leave unchanged). Simplest correct approach for this form, which
  always submits every field: map each optional field explicitly to `value ?? null`
  in the update `data`, the way `description` already goes through `nullableText`.
- Keep create behavior unchanged.

**E2E verification:**
1. Create a task with deadline, client, label, min and max estimates all set.
2. Open Edit, clear the deadline, select "No client", select "No label", clear both
   estimates, save.
3. Reload the page (hard reload, not just the revalidated view).

**Pass criteria:**
- [ ] UI shows no deadline, no client, no label, no estimate after reload.
- [ ] DB row has `deadline`, `clientId`, `labelId`, `estimateMinMinutes`,
      `estimateMaxMinutes` all NULL (assert via script/psql).
- [ ] Editing only the title still leaves other fields untouched.
- [ ] Clearing only the description still works (regression on existing behavior).

---

## Task 3 - Enforce min <= max across partial updates (high)

**Problem:** The `superRefine` in `src/server/actions/tasks.ts` only compares
estimates when both are present in the same request. Clearing max while raising min
persists `min > max` in the DB. No DB constraint backs the invariant.

**Fix:**
- In `updateTask`, validate the invariant against the *effective* post-update state:
  merge the parsed input with the existing row's values (the row is already fetched
  for the existence check) and reject if effective min > effective max.
- Note: after Task 2, cleared fields mean `null`, which trivially satisfies the
  invariant; the interesting case is one field updated while the other keeps its
  stored value.
- Add a DB-level guard so the invariant cannot be violated by any future code path:
  a `CHECK` constraint via a migration
  (`CHECK ("estimateMinMinutes" IS NULL OR "estimateMaxMinutes" IS NULL OR "estimateMinMinutes" <= "estimateMaxMinutes")`).

**E2E verification:**
1. Create a task with min=1h, max=2h.
2. Edit: set min=4h and clear max in the same save. Expect a rejection... careful:
   after Task 2, clearing max sets it NULL, which is allowed. So also test:
3. Edit: set min=4h and leave max=2h untouched. Expect a visible validation error
   and no DB change.
4. Direct-POST check (server actions are public endpoints): replay the update
   request with `estimateMinMinutes=240` and the max field absent; expect rejection.

**Pass criteria:**
- [ ] No sequence of UI edits can produce a DB row with min > max (assert via script).
- [ ] The user sees a real validation message, not the generic catch-all error.
- [ ] The CHECK constraint exists in the new migration and `migrate deploy` still
      works on a fresh DB (re-run Task 1's provision loop).

---

## Task 4 - Handle errors on subtask status change and delete (high)

**Problem:** `src/components/subtask-list.tsx` calls `updateSubtaskStatus` (line ~106)
and `deleteSubtask` (line ~126) fire-and-forget: no await, no catch, no pending state.
Failures are invisible and the select shows unsaved state.

**Fix:**
- Route both through async handlers that await the action, set the existing `error`
  state on failure, and disable the control while in flight (mirror how `submit`
  handles `createSubtask`).
- On failure of a status change, revert the select to the last known-good value
  (make the select controlled, or reset via the row's key).

**E2E verification:**
1. Happy path: change a subtask status, reload, confirm persisted; delete a subtask,
   reload, confirm gone.
2. Failure path: open the same task in two tabs. Delete a subtask in tab A. In tab B
   (without reloading), change that subtask's status.

**Pass criteria:**
- [ ] Tab B shows the error message ("could not be updated" or similar), no unhandled
      rejection in the browser console.
- [ ] The select in tab B does not keep displaying a status that was never saved.
- [ ] Controls are disabled during in-flight requests (no double-fire on rapid clicks).

---

## Task 5 - Fix overdue computation: one timezone rule, no hydration mismatch (high)

**Problem:** `src/components/task-card.tsx` computes overdue with
`new Date(\`${deadline}T23:59:59\`)` (parses in *local* time, compared against the
rendering machine's clock) while displaying the same deadline pinned to UTC. Server
and browser can disagree, causing React hydration mismatches and viewer-dependent styling.

**Fix:**
- Pick one rule: a task is overdue when the current UTC date is past the deadline's
  UTC calendar date (deadlines are date-only). Implement it once in `src/lib` (this
  lands in the same helper module as Task 10) comparing date strings or UTC-pinned
  dates, never local parsing.
- Compute overdue where it cannot mismatch: either derive it on the server and pass
  it as a prop, or compute after mount. Prefer server-derived: the board is
  revalidated on every mutation anyway.

**E2E verification:**
1. Create tasks with deadline yesterday, today, and tomorrow.
2. Load the board with the browser console open; check for hydration warnings.
3. Run the dev server with `TZ=UTC` and view from a browser with a non-UTC timezone
   (or flip the machine/browser timezone) and reload.

**Pass criteria:**
- [ ] Zero hydration mismatch warnings in the console on the board page.
- [ ] Yesterday's task is red/overdue, tomorrow's is not, in both timezone setups.
- [ ] A "Finished" task with a past deadline is not marked overdue.

---

## Task 6 - Fix work-log timestamp rendering (high)

**Problem:** `src/components/work-log.tsx` formats `createdAt` with
`Intl.DateTimeFormat(..., {dateStyle, timeStyle})` and no `timeZone` in an SSR'd
client component: server-TZ text vs browser-TZ text mismatches on every entry.

**Fix:**
- Show the timestamp in the *user's* timezone without a mismatch: format after mount
  (e.g. render a stable placeholder or the ISO date server-side and swap in the
  localized string in an effect), or use `<time dateTime={iso}>` with
  `suppressHydrationWarning` on the formatted text. Choose one and apply it
  consistently; document the choice in a short comment only if the code cannot
  express it.

**E2E verification:**
1. Add a work log entry, view the task detail page with the console open.
2. Repeat the two-timezone check from Task 5 (server `TZ=UTC`, browser non-UTC).

**Pass criteria:**
- [ ] Zero hydration warnings on the task detail page.
- [ ] The displayed time matches the browser's timezone after load.

---

## Task 7 - Upsert clients and labels; stop discarding the chosen color (medium)

**Problem:** `src/server/actions/clients.ts` and `labels.ts` do findUnique-then-create
(TOCTOU race on the `@unique` name; loser throws P2002 shown as a generic error), and
`createLabel` silently returns an existing label with its *old* color, ignoring the
user's validated color.

**Fix:**
- Replace both with a single `upsert` on `name`.
- For labels, decide the conflict semantics and implement them honestly: update the
  color on name match (`update: { color }`). This makes "create existing name with
  new color" mean "recolor", which the UI should reflect (replace the stale entry in
  `labelOptions`, not just dedupe by id).
- Disable the inline Add buttons while the request is in flight.

**E2E verification:**
1. Create label "urgent" red. Then, from another card's form, create "urgent" blue.
2. Rapid-double-click the Add button with a brand-new client name.
3. Concurrency: two tabs, same new client name, submit near-simultaneously.

**Pass criteria:**
- [ ] "urgent" ends up blue everywhere (DB assert + UI), with no error shown.
- [ ] Double-click and two-tab submits produce exactly one row (DB assert:
      `SELECT count(*)` by name) and no user-visible error.
- [ ] Add buttons are disabled while a request is in flight.

---

## Task 8 - Stop mirroring client/label props into state (medium)

**Problem:** `src/components/task-form.tsx` copies `clients`/`labels` props into
`useState`. Mounted forms ignore refreshed props after revalidation, so dropdowns go
stale (the page-level filter selects update; the form selects do not).

**Fix:**
- Render the selects from props. The actions already `revalidatePath("/")`, so props
  refresh after every create. If the just-created entity must appear before
  revalidation lands, keep only a small "locally added" list merged with props
  (dedup by id), not a full mirror.

**E2E verification:**
1. Board with two task cards. Open card A's edit form, create client "NewCo" inline,
   close the dialog.
2. Without reloading, open card B's edit form and the header "Create task" form.

**Pass criteria:**
- [ ] "NewCo" appears in card B's and the header form's client dropdowns without a reload.
- [ ] After Task 7, a recolored label shows its new color in all open forms' option lists.
- [ ] Selected values in an open form are not clobbered when props refresh.

---

## Task 9 - Reject out-of-INT4-range ids cleanly (low)

**Problem:** Ids between 2^31 and 2^53 pass `Number.isSafeInteger` /
`z.coerce.number().int().positive()`, then Prisma throws ("Unable to fit integer value
into an INT4") and the app 500s. Affects `src/app/tasks/[id]/page.tsx` and every id
schema in the server actions. There is also no `error.tsx` anywhere.

**Fix:**
- Create one shared id schema in `src/lib` (this pairs with Task 10's consolidation):
  `z.coerce.number().int().positive().max(2147483647)`, and use it in the page and
  all actions.
- In the page, invalid id -> `notFound()`.
- Add a root `src/app/error.tsx` so any residual unhandled server error renders a
  friendly boundary instead of the raw 500 page.

**E2E verification:**
1. GET `/tasks/99999999999` and `/tasks/2147483648`.
2. GET `/tasks/abc` and `/tasks/0` (regression: still 404).
3. Direct-POST `deleteTask` with id `99999999999` (server actions are public endpoints).

**Pass criteria:**
- [ ] All oversized/invalid ids on the page yield the 404 page, not a 500.
- [ ] The crafted action POST returns a clean validation error, and nothing is logged
      as an unhandled Prisma conversion error.
- [ ] `error.tsx` exists and renders when an error is forced.

---

## Task 10 - Delete dead modules, consolidate formatting/status logic (cleanup)

**Problem:** `src/lib/format.ts` and `src/lib/types.ts` are imported nowhere. Their
logic was reimplemented divergently: `formatMinutes` in `tasks/[id]/page.tsx`,
estimate formatting in `task-card.tsx` (renders 100 min as `1.6666666666666667h`),
overdue logic inline with a different day-boundary rule, and a third hand-copied
status list.

**Fix:**
- Delete `src/lib/types.ts`. Keep `src/lib/tasks.ts` as the single source for
  `taskStatuses`/`TaskStatus` (deriving from the generated Prisma enum is even better:
  `Object.values(TaskStatus)` from `generated/prisma`).
- Make `src/lib/format.ts` the single formatting module: `formatMinutes`,
  `formatEstimateRange` (with the `toFixed(1)` rounding), and the overdue helper from
  Task 5. Update `task-card.tsx`, `tasks/[id]/page.tsx`, and `task-form.tsx`'s
  `hours()` to import from it; delete the inline copies.
- Also fold in the shared bits created by Tasks 3/9 (id schema, optional-int zod
  preprocessor used in tasks/subtasks/logs actions) so there is one validation helper
  module instead of three copies.

**E2E verification:**
1. `grep` proves no duplicate definitions remain (`formatMinutes`, `estimateLabel`,
   `taskStatuses` defined exactly once each).
2. Board and detail page render estimates identically for the same task, including a
   100-minute estimate created via direct action POST (should read `1.7h`, not a
   17-digit decimal).

**Pass criteria:**
- [ ] `src/lib/types.ts` gone; single definition site for each helper (grep-verified).
- [ ] Board card, detail page, and edit form show consistent estimate/duration text.
- [ ] `pnpm typecheck` and `pnpm check` pass.

---

## Final regression loop (run after Task 10)

Repeat until a full pass is green with zero fixes needed:

1. Fresh-provision loop from Task 1 (empty DB, `migrate deploy`, app boots).
2. Full user journey in the browser: create client + label inline -> create task with
   all fields -> edit and clear every optional field -> add 3 subtasks -> change
   statuses -> delete one -> add 2 work logs -> archive -> filter board by
   client/label/archived -> restore -> delete task (confirm cascade removed subtasks
   and logs in DB).
3. Hostile pass: `/tasks/99999999999`, `/tasks/abc`, direct action POSTs with
   oversized ids and min>max estimates - all clean errors, no 500s, no invariant
   violations in the DB.
4. Two-timezone pass (server `TZ=UTC`, browser non-UTC): zero hydration warnings on
   board and detail pages.
5. `pnpm typecheck && pnpm check` clean.

If any step fails, fix it, and restart the regression loop from step 1.
