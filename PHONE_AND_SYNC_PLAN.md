# Plan: phone capture + Google ecosystem bridges

Follow-up work after CODEX_AUTH_PLAN.md ships. Nothing here blocks that work; items are independent and ordered by value-per-effort. Workstreams 1-2 are phone-side setup (no code). Workstreams 3-4 are small code additions.

## 1. Install as PWA (2 minutes, after PWA workstream deploys)

Chrome on Android -> open the Railway URL -> log in -> menu -> "Add to home screen" / "Install app". Long-press the icon to get the "Add task" shortcut from the manifest.

## 2. Home-screen widget via HTTP Shortcuts (no code)

App: "HTTP Shortcuts" by Waboodoo (Play Store, free, open source).

1. Create shortcut: method POST, URL `https://<app-url>/api/tasks`.
2. Headers: `Authorization: Bearer <TASKS_API_TOKEN>`, `Content-Type: application/json`.
3. Body: `{"title": "{{title}}"}` where `{{title}}` is a Variable of type "Text input" so it prompts on tap.
4. Place as a home-screen widget. Optional: a second shortcut with a "Voice input" variable type for spoken capture.

Security note: the token lives in the HTTP Shortcuts app on the phone. Acceptable for a personal device; if the phone is lost, rotate `TASKS_API_TOKEN` on Railway.

## 3. n8n bridge: Gemini/Google Tasks -> app inbox (small workflow)

Keeps the "talk to Gemini" capture habit while making this app the source of truth.

- Trigger: schedule, every 10-15 min.
- Node: Google Tasks -> list tasks in the default list (needs Google OAuth credential in n8n).
- For each open task: POST to `/api/tasks` with the bearer token, then mark the Google task completed (or delete it) so it never imports twice.
- Idempotency guard: skip tasks already completed; optionally prefix imported titles or keep a processed-ID data table in n8n if duplicates ever show up.
- Failure mode to handle: if the POST fails, do NOT complete the Google task (order: create in app first, then complete in Google).

## 4. ICS calendar feed (small code addition, replaces the Google Tasks calendar view)

- Route: `GET /api/calendar.ics?token=<CALENDAR_FEED_TOKEN>` (separate token from TASKS_API_TOKEN; query param is unavoidable here because Google Calendar subscriptions cannot send headers - this is why it must be a dedicated, rotatable, read-only token).
- New env var `CALENDAR_FEED_TOKEN`, timing-safe compare, 404 on mismatch (not 401, avoids advertising the endpoint).
- Content: all non-archived tasks with a `deadline`, as all-day VEVENT entries: SUMMARY = title (prefix with client name when present), DESCRIPTION = task URL. VTODO is poorly supported by Google Calendar; use VEVENT.
- Generate ICS by hand (it is a trivial text format) - no library needed. Set `Content-Type: text/calendar`.
- Subscribe in Google Calendar: Settings -> Add calendar -> From URL. Note: Google refreshes external ICS feeds slowly (hours); fine for deadline overview.

## Review focus for the Codex implementation (for the code-review session)

Risk label: medium-high (auth boundary + public API). Priority reading order:

1. `src/server/auth.ts` - the requireSession helper. Invariant: returns a verified session or never returns (throws/redirects). This is the real gate; middleware is cosmetic.
2. Every file in `src/server/actions/*.ts` - confirm requireSession is the FIRST statement in every exported action. A single missed action = unauthenticated DB writes. This is the most likely Codex omission.
3. `src/app/api/tasks/route.ts` - timing-safe compare (length guard before timingSafeEqual), no token logging, zod on body, 405 handling, body size cap.
4. `middleware.ts` matcher - check the exclusion list is not too broad (a regex that accidentally excludes `/tasks/...` because of an `/api/tasks` pattern would silently unprotect pages; requireSession in pages is the backstop, verify both exist).
5. `/signup` gating - env check happens server-side (notFound), not just hidden in UI. Also verify Better Auth's own signup endpoint is disabled via `disableSignUp`, since the API route exists regardless of the page.
6. Prisma migration - auth tables only, no changes to existing Task/Client/Label/Subtask/TaskLog models.
7. `railway.json` - healthcheck moved off `/`, otherwise first deploy after auth soft-fails.

Hostile scenarios to test: curl a server-action mutation and `/api/tasks` with no/wrong credentials; open `/tasks/1` logged out; POST /api/tasks with 1MB body and with `"title": ""`.
