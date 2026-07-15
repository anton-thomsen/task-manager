# Hour Tracking and Work Logs Handoff

## Change overview

This branch converts task estimates, subtask estimates, and work-log durations
from integer minutes to decimal hours. It also makes work logs manual-only,
detailed records with authenticated image attachments.

- Task estimates use optional positive `estimateMinHours` and
  `estimateMaxHours` values. The minimum cannot exceed the maximum, and large
  project estimates are allowed up to the shared 100,000-hour validation bound.
- Subtasks use an optional positive `estimatedHours` value capped at 5 hours.
- New work logs require a short summary and positive `hoursSpent`, with optional
  long-form details and images.
- Finished subtasks remain in a separate Completed subtasks section on the Tasks
  tab. They never appear in the Work log feed or logged-hour total.
- The task header shows total logged hours and compares them with the task's
  estimate range.
- Work logs can be permanently deleted. Database cascades remove their images.

## Deploy-safe migration

Apply the four new migrations in order with `pnpm exec prisma migrate deploy`:

1. `20260715120000_hours_and_rich_work_logs` adds nullable hour fields,
   compatibility triggers, and `WorkLogImage`.
2. `20260715120100_backfill_hours` converts every existing minute value by
   dividing by 60 without rounding.
3. `20260715120200_add_hour_constraints` adds positive-value, range-order, and
   5-hour subtask checks as `NOT VALID`.
4. `20260715120300_validate_hour_constraints` validates the checks after the
   backfill.

The legacy minute columns remain in PostgreSQL for compatibility but are ignored
by Prisma. Triggers synchronize old and new units during deployment.

## Work-log images

The add-log action accepts up to five PNG, JPEG, GIF, or WebP files. Limits are 5
MB per file, 15 MB total, 8192 pixels per side, and 20 megapixels across animated
frames. Sharp verifies the decoded image content rather than trusting the upload's
name or declared MIME type.

Next.js Server Actions use a 16 MB request-body limit so the 15 MB aggregate image
allowance still leaves room for the other form fields.

`GET /api/work-log-images/[id]` requires a session and returns images with
`private, no-store`, `nosniff`, and a restrictive content security policy.

## Review hotspots

- `prisma/migrations/20260715120000_hours_and_rich_work_logs/migration.sql`:
  dual-unit compatibility and image cascade.
- `prisma/migrations/20260715120100_backfill_hours/migration.sql`: exact value
  preservation during conversion.
- `src/server/actions/tasks.ts`: task-hour parsing and estimate-range invariant.
- `src/server/actions/subtasks.ts`: decimal-hour parsing and the 5-hour cap.
- `src/server/actions/logs.ts`: required log fields, upload bounds, decoded-image
  validation, and permanent deletion.
- `src/app/api/work-log-images/[id]/route.ts`: authenticated image delivery and
  response hardening.
- `src/app/tasks/[id]/page.tsx`: estimate comparison and manual-only log feed.
- `src/components/subtask-list.tsx`: separate active and completed subtasks.
- `src/components/work-log.tsx`: rich log form, image display, and deletion flow.

## Verification

Run the non-server checks:

```bash
pnpm typecheck
pnpm check
pnpm exec prisma validate
git diff --check
```

With the E2E database available, run `pnpm test:e2e`. The hour-worklog journey
checks high-precision task estimates, the 5-hour subtask boundary, completed
subtask separation, invalid and oversized image rejection, successful image
delivery with disabled caching, and cascading work-log deletion.

## Security audit

- Broken access control: pages, mutations, and image reads require an
  authenticated session.
- Injection and malformed input: Zod bounds scalar input and Prisma parameterizes
  database operations.
- Unrestricted upload and resource exhaustion: file counts, encoded bytes,
  dimensions, decoded pixels, formats, filenames, and server-action body size are
  bounded.
- Stored content risks: image bytes are format-verified and served with `nosniff`,
  sandboxed content security policy, and no shared caching.
