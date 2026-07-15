# Google Calendar integration

Each user connects their own Google account from **Settings → Integrations**.
Deadlines for tasks they participate in are synced as all-day events into
their primary Google calendar: created when a live task has a deadline,
updated when the title or deadline changes, removed when the task is
archived, deleted, or loses its deadline.

## One-time setup (Google Cloud Console)

1. Create a project at https://console.cloud.google.com (or reuse one).
2. **APIs & Services → Library**: enable the **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**:
   - User type: External.
   - Fill in app name and contact emails; no extra branding is needed.
   - Scopes: add `https://www.googleapis.com/auth/calendar.events`.
   - Test users: add every account that will connect (Anton + Emil).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: Web application.
   - Authorized redirect URI: `<BETTER_AUTH_URL>/api/auth/callback/google`
     (one entry per environment, e.g. localhost and production).
5. Copy the client ID and secret into the environment:

```
GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="..."
```

Without these two variables the app runs normally and the Integrations page
shows the connection as unavailable.

## Testing-mode caveat

While the consent screen is in **Testing** publishing status, Google expires
refresh tokens after 7 days. Syncing then stops and the Integrations page
shows **Needs reconnect** until the user reconnects. To make tokens
long-lived, publish the app (**OAuth consent screen → Publish app**). With
only the `calendar.events` scope this does not require Google verification
for personal use, but Google shows an "unverified app" warning during
consent - acceptable for a two-person workspace.

## How it works

- Linking uses better-auth's `linkSocial` with `accessType=offline` and
  `prompt=consent`; tokens live in the existing `account` table. Google
  sign-IN is disabled (`disableSignUp`): the provider can only be linked to
  an existing signed-in user.
- Sync runs best-effort after task mutations (`src/server/calendar-sync.ts`)
  and never blocks or fails a task save. Auth failures flag the connection
  in `CalendarSyncStatus` and surface as **Needs reconnect** in Settings.
- Disconnecting removes the synced events (best effort), the stored
  event mappings, and the linked account.
