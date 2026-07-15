# Plan: Auth + API token + PWA quick-add

Execution plan for this repo (Next.js 15 App Router, React 19, Prisma 6 + PostgreSQL, Tailwind v4, biome, pnpm, deployed on Railway). Single-user app owned by Anton. Three workstreams, in order. Keep solutions minimal and idiomatic to the existing code.

## Repo conventions (read first)

- Package manager is pnpm. Never npm or yarn.
- TypeScript: never use `any`.
- Prisma client is generated to `generated/prisma` (see `prisma/schema.prisma` `output`), and `src/server/db.ts` exports the `db` instance. Import Prisma types from the generated path, not `@prisma/client`.
- Env vars are validated in `src/env.js` via `@t3-oss/env-nextjs` + zod. Every new env var MUST be added to both the `server` schema and `runtimeEnv` there.
- Mutations are Next.js server actions in `src/server/actions/*.ts` using zod schemas and the `ActionResult` helpers from `src/lib/validation.ts`. Follow that style.
- Verify with `pnpm typecheck` and `pnpm check` (biome). Do NOT run `pnpm dev` or `pnpm build`.
- zod is v3 (`z.string().url()` style, not v4 APIs).
- Commit messages: conventional style like existing history (`feat:`, `chore:`); never add an AI co-author line.

## Workstream 1: Better Auth, single user

Goal: the entire app requires a logged-in session. One account (Anton). Signup is gated behind an env flag so it can be turned off after the first registration.

1. `pnpm add better-auth`
2. New env vars in `src/env.js`:
   - `BETTER_AUTH_SECRET: z.string().min(32)`
   - `BETTER_AUTH_URL: z.string().url()` (the public app URL; localhost in dev)
   - `AUTH_ALLOW_SIGNUP: z.enum(["true", "false"]).default("false")`
3. Auth instance at `src/server/auth.ts`:
   - `betterAuth()` with `prismaAdapter(db, { provider: "postgresql" })`
   - `emailAndPassword: { enabled: true, disableSignUp: env.AUTH_ALLOW_SIGNUP !== "true" }`
   - Leave Better Auth's built-in rate limiting at defaults (it is on in production).
4. Prisma models: run `pnpm dlx @better-auth/cli@latest generate` to emit the User/Session/Account/Verification models, merge them into `prisma/schema.prisma`, then create a migration with `pnpm exec prisma migrate dev --name auth`. Railway already runs `prisma migrate deploy` pre-deploy, so no deploy config change is needed for the DB.
5. Route handler at `src/app/api/auth/[...all]/route.ts` using `toNextJsHandler(auth)`.
6. Client helper at `src/lib/auth-client.ts` using `createAuthClient` from `better-auth/react`.
7. `/login` page: minimal email + password form styled like the rest of the app, calling `authClient.signIn.email`, redirect to `/` on success.
8. `/signup` page: server component that checks `env.AUTH_ALLOW_SIGNUP` and calls `notFound()` when disabled; otherwise a minimal form calling `authClient.signUp.email`.
9. Enforcement - this is the critical part, do all three layers:
   - `middleware.ts` at repo root: optimistic redirect to `/login` when the Better Auth session cookie is absent (`getSessionCookie` from `better-auth/cookies`). Exclude `/login`, `/signup`, `/api/auth`, `/api/health`, `/api/tasks`, `/manifest.webmanifest`, `/_next`, favicon/icons.
   - A `requireSession()` helper in `src/server/auth.ts` that calls `auth.api.getSession({ headers: await headers() })` and throws/redirects when null. Middleware cookie checks are NOT real auth (cookie presence is unverified, and middleware can be bypassed), so:
   - Call `requireSession()` at the top of EVERY server action in
     `src/server/actions/*.ts`, every page that reads task data (`/`, `/archived`,
     `/tasks/[id]`, and the new `/quick-add`), and every session-protected data API
     such as `/api/work-log-images/[id]`. No mutation or data read may be reachable
     without a verified session.
10. Add a small "sign out" affordance in the layout or board header (`authClient.signOut`).
11. Railway healthcheck fix: `railway.json` currently healthchecks `/`, which will now redirect to `/login`. Add `src/app/api/health/route.ts` returning `{ ok: true }` with 200 (no auth), and change `railway.json` `healthcheckPath` to `/api/health`.

## Workstream 2: Bearer-token task API

Goal: one endpoint for phone widgets/automation (HTTP Shortcuts, n8n) to create tasks.

1. New env var `TASKS_API_TOKEN: z.string().min(32)` in `src/env.js`.
2. `src/app/api/tasks/route.ts`, Node runtime, POST only:
   - Auth: `Authorization: Bearer <token>` header compared against `env.TASKS_API_TOKEN` using `crypto.timingSafeEqual` (guard for length mismatch first; on any mismatch return 401 with a generic body). Never accept the token via query string.
   - Body: JSON, zod-validated: `{ title: string (1-200, trimmed), description?: string (max 2000), deadline?: ISO date string }`. Reuse the field constraints from `src/server/actions/tasks.ts` - extract the shared zod fields into `src/lib/validation.ts` or a shared module rather than duplicating them.
   - Creates a Task with `status: "Inbox"` and the same `sortOrder` top-placement logic the create action uses (extract and reuse, don't copy).
   - Returns 201 with `{ id, title }`. 400 on validation failure with the first zod issue message. 405 for other methods.
   - Cap request body size (reject bodies over ~10KB with 413).

## Workstream 3: PWA + quick-add

Goal: installable on Android with a home-screen icon and a long-press "Add task" shortcut. No service worker / offline support - keep it simple.

1. `src/app/manifest.ts` (Next metadata route): name "Task Manager", `display: "standalone"`, appropriate `background_color`/`theme_color` matching the app's palette, icons 192 and 512, and a `shortcuts` entry `{ name: "Add task", url: "/quick-add" }`.
2. Icons: create `public/icon-192.png` and `public/icon-512.png`. A simple flat rounded square in the app's accent color with a check glyph is fine (generate with a one-off script or sharp; do not commit the script).
3. `/quick-add` page: session-protected (requireSession + middleware). A single centered form: title (autofocused), optional deadline, submit via the existing `createTask` server action pattern. On success show a brief confirmation with "Add another" and "Open board" links. Mobile-first layout.
4. Add `viewport`/`themeColor` metadata in `src/app/layout.tsx` if not already present.

## Verification

- `pnpm typecheck` and `pnpm check` must pass.
- Add `.env.example` entries for the new vars (do not touch real `.env`).
- Manual test notes to leave in the PR/summary: which routes were verified as
  redirecting when logged out, that work-log image reads reject logged-out users,
  and a sample `curl -X POST /api/tasks` for the token flow.

## Railway env vars to set (Anton does this, list them in the summary)

- `BETTER_AUTH_SECRET` - `openssl rand -base64 32`
- `BETTER_AUTH_URL` - the public Railway URL
- `AUTH_ALLOW_SIGNUP` - `true` for first deploy, flip to `false` after registering
- `TASKS_API_TOKEN` - `openssl rand -hex 32`

## Security audit checklist (address each in the implementation)

- [ ] Broken access control: every server action, data-reading page, and private
      data API calls `requireSession()`; middleware is only an optimistic redirect
      layer, never the sole gate.
- [ ] Injection: all input through zod schemas + Prisma parameterized queries; no raw SQL.
- [ ] Auth failures: signup disabled by default via env flag; Better Auth rate limiting left on; generic 401 messages (no user enumeration).
- [ ] Cryptographic failures: API token compared with `timingSafeEqual`; secrets only via env; token never logged, never in URLs.
- [ ] SSRF/redirects: login redirect target is hardcoded to `/`, never taken from query params.
- [ ] Resource limits: `/api/tasks` and Server Action bodies are capped; field
      lengths and work-log image counts, bytes, dimensions, and pixels are bounded.
