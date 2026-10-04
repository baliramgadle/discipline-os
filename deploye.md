# Discipline OS deployment guide

Follow these steps in order to deploy the frontend to Vercel, the API to Render,
and PostgreSQL to Supabase. Keep this file and all dashboards private if you add
deployment-specific notes. Never paste database URLs, JWT secrets, email keys,
passwords, or `.env` contents into chat, issues, or source control.

## Before you start

You need:

- Access to the GitHub repository and permission to push the version you intend
  to deploy.
- Accounts for Vercel, Render, and Supabase.
- A Node.js 22+ installation for local checks and optional migration execution.
- A stable Vercel production domain. A custom domain is optional.
- A backup and restore plan for the Supabase database.

For local development, copy `.env.example` to `.env` in the repository root and
fill in the values there. `.env` is ignored by Git. For Render and Vercel, enter
the corresponding variables in their environment settings; do not upload or
commit the local `.env` file.

Email delivery is optional for the initial deployment. Without a configured
email provider, registration and login can work, but email verification and
password-reset messages cannot be delivered.

## Step 1 — Review and push the release

1. Review the changes you intend to deploy. Do not include `.env`,
   `auth.cookies.txt`, database exports, or other credentials.
2. Confirm the latest archive migrations are committed:
   - `backend/database/migrations/017_archive_recovery.sql`
   - `backend/database/migrations/018_study_wellness_archive.sql`
3. Run these commands from the repository root:

   ```powershell
   npm.cmd ci
   npm.cmd ci --include=dev --prefix backend
   npm.cmd ci --prefix frontend
   npm.cmd test
   npm.cmd --prefix backend run typecheck
   npm.cmd --prefix frontend run lint
   ```

4. Commit and push the intended release to GitHub. Vercel and Render deploy
   from the Git repository; local uncommitted changes are not deployed.

## Step 2 — Create or prepare the Supabase database

1. Create a Supabase project, or select the project intended for production.
2. Set a strong Supabase database password and store it in a password manager.
   Do not reuse a JWT secret or account password.
3. In Supabase, open **Project Settings → Database → Connect** and select a
   connection method reachable from Render:
   - Prefer the **Session pooler** for the long-running Render API if the
     Render environment cannot reach the direct database host.
   - Keep the **Direct connection** URL available for running migrations if
     the pooler does not support the required DDL.
4. Copy the PostgreSQL connection URL using the URI option. Keep it private.
   If the database password contains reserved URL characters, use Supabase's
   generated URL or URL-encode the password as required by the provider.
5. Do not run migrations against a database containing data you need to keep
   without taking and verifying a backup first.

## Step 3 — Generate production JWT secrets

Generate two different, random secrets locally. In PowerShell, run the
following command twice:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

1. Save the first result as `JWT_SECRET` in a password manager.
2. Run the command again and save the different result as
   `JWT_REFRESH_SECRET`.
3. Do not use the development secrets from `.env`. Do not commit these values.
   Rotating either secret later invalidates existing signed sessions.

## Step 4 — Create the Render API service

1. In Render, choose **New → Web Service** and connect the GitHub repository.
2. Configure the service:
   - **Root Directory:** leave blank (repository root).
   - **Runtime:** Node.
   - **Build Command:**

     ```sh
     npm ci --include=dev --prefix backend && npm --prefix backend run build
     ```

   - **Start Command:**

     ```sh
     npm --prefix backend start
     ```

   - **Health Check Path:** `/api/v1/health/live`
3. Choose a Render plan appropriate for the expected availability and traffic.
   Check whether the selected plan sleeps while idle; sleeping can make the
   first request slow and is generally unsuitable for latency-sensitive use.
4. Add these environment variables in the Render service's **Environment**
   page. Enter values in the dashboard, not in this file:

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `CLIENT_URL` | Exact Vercel production origin; no path or trailing slash |
   | `API_URL` | Render service public HTTPS origin |
   | `DATABASE_URL` | Supabase PostgreSQL URL reachable from Render; use the session pooler for runtime when appropriate |
   | `JWT_SECRET` | First generated production secret |
   | `JWT_REFRESH_SECRET` | Second, different generated production secret |
   | `PORT` | Leave unset; Render supplies the port |

5. The migration runner reads `DATABASE_URL`; it does not automatically select
   `DIRECT_URL`. Configure `RESEND_API_KEY`, `EMAIL_FROM`, and `EMAIL_API_URL`
   only if you have an email provider and verified sender; set all three or
   leave all three unset. For Resend, `EMAIL_API_URL` is the provider's email
   endpoint, stored as configuration rather than embedded in backend code.
6. Save the environment and start the first deployment.
7. Wait for Render to report the service as live. Copy its HTTPS public URL,
   for example `https://your-service.onrender.com`. This is the **Render API
   origin**; do not append `/api/v1`.
8. Check these URLs in a browser or PowerShell:

   ```text
   https://your-service.onrender.com/api/v1/health/live
   https://your-service.onrender.com/api/v1/health
   ```

   Both should return HTTP 200. Readiness must report the database connected.

## Step 5 — Apply database migrations

Run migrations once, before users begin using the production application.
Do not start concurrent migration commands.

### Option A: Run from Render

1. If the Render plan provides a service Shell, temporarily set the Render
   service's `DATABASE_URL` to the Supabase direct connection URL. Keep the
   Render environment private.
2. Open the service Shell and run:

   ```sh
   npm --prefix backend run migrate
   ```

3. Confirm the output says migrations are up to date.
4. Restore `DATABASE_URL` to the runtime connection URL (for example, the
   Supabase session pooler URL) and redeploy/restart the service if Render
   requires it.

### Option B: Run locally with the production migration URL

Use this only from a trusted computer and network. Do not save the direct URL
in a committed file.

1. In a PowerShell window at the repository root, assign the Supabase direct
   connection URL to the current process without printing it:

   ```powershell
   $env:DATABASE_URL = Read-Host 'Paste the Supabase direct database URL'
   npm.cmd ci --include=dev --prefix backend
   npm.cmd --prefix backend run migrate
   Remove-Item Env:DATABASE_URL
   ```

2. Confirm the migration runner reports that the database migrations are up
   to date.
3. Close the terminal when done. Never capture or share terminal history that
   includes the secret input.

If the provider's direct endpoint is unreachable from your computer, use
Render's Shell or another trusted runner that can reach Supabase. Do not assume
`DIRECT_URL` is automatically selected by this repository.

## Step 6 — Create the Vercel frontend

1. In Vercel, choose **Add New → Project** and import the same GitHub repository.
2. Configure the project:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Vite (or let Vercel detect it)
   - **Install Command:** `npm ci`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
3. Add this environment variable for **Production** (and Preview only if you
   intend to allow preview deployments):

   | Variable | Value |
   | --- | --- |
   | `API_URL` | Render API origin; no `/api/v1` suffix |

   `API_URL` is embedded into the browser bundle and is public. Never put
   database URLs, JWT secrets, or email API keys in frontend build variables.
4. Deploy the production branch.
5. Copy the Vercel production origin, including `https://` and without a path.
   If you use a custom frontend domain, use that stable domain for the next
   step rather than a temporary preview URL.

## Step 7 — Match the allowed frontend origin

1. In Render's environment settings, set `CLIENT_URL` to the exact Vercel
   production origin from Step 6. Examples:
   - Correct: `https://your-app.vercel.app`
   - Incorrect: `https://your-app.vercel.app/`
   - Incorrect: `https://your-app.vercel.app/profile`
2. Save the Render environment and redeploy/restart the API.
3. The API uses this single configured origin for both HTTP CORS and Socket.IO.
   Vercel preview URLs will not work unless they are deliberately added to an
   origin allowlist in a future code/configuration change. Do not weaken CORS
   to `*` for a quick fix.
4. If you change the Vercel custom domain later, update `CLIENT_URL` to the new
   exact origin and redeploy/restart the API.

## Step 8 — Verify the deployed application

Use a private/incognito browser window and a non-sensitive test account.

1. Open the Vercel production URL and confirm the page loads over HTTPS.
2. Check the Render liveness and readiness endpoints again:
   - `/api/v1/health/live` returns HTTP 200.
   - `/api/v1/health` returns HTTP 200 and reports the database connected.
3. Register a test account and sign out.
4. Sign in using both the test account's username and email address.
5. Create, edit, archive, and restore a test task or routine.
6. Check that a test item persists after a page reload.
7. Open Chat, send a message, and confirm realtime updates work. A working
   HTTP API alone does not prove Socket.IO/WebSocket connectivity.
8. Test profile changes that do not require email delivery. Do not change a
   real account's email just to test deployment.
9. Confirm there are no browser console CORS, mixed-content, failed API, or
   socket connection errors.
10. Delete the test account and associated test data when finished.

## Step 9 — Set up operations before inviting users

1. Enable Supabase automated backups and, if available for the plan, point-in-
   time recovery. Document who can restore the database.
2. Restrict access to Render, Vercel, Supabase, and GitHub. Enable MFA for
   owner/admin accounts.
3. Review Render logs for startup and migration errors. Never enable logging
   that includes passwords, bearer tokens, cookies, reset links, or verification
   links.
4. Decide how you will receive alerts for downtime, repeated server errors,
   database connection failures, and quota exhaustion.
5. Add email delivery later by configuring both `RESEND_API_KEY` and
   `EMAIL_FROM` on Render with a verified sending domain. Do not add these to
   Vercel. Then test verification and password reset with a test account.
6. Review the selected Render/Supabase plans, quotas, sleeping behavior, backup
   policy, and expected cost before sharing the public URL.

## If deployment fails

- **Render fails startup:** inspect the Render build/start logs and confirm
  production variables are present. The API rejects missing database
  configuration, weak or identical JWT secrets, non-HTTPS `CLIENT_URL`, and
  partial email-provider configuration.
- **Readiness returns 503:** verify `DATABASE_URL` is the correct Supabase
  PostgreSQL URL and that the selected host/port is reachable from Render.
- **Browser reports CORS:** make `CLIENT_URL` exactly match the browser's
  production Vercel origin, then restart/redeploy Render.
- **Browser calls the wrong API:** verify Vercel's `API_URL` is the
  Render origin with no path, then redeploy Vercel. Vite values are embedded
  at build time.
- **Chat does not connect:** check Socket.IO/WebSocket errors, Render logs,
  the exact CORS origin, and that the client is using the Render origin.
- **A migration fails:** stop and inspect the error before retrying. Do not
  manually edit the migration history table or run concurrent migrations.
  Restore from the verified backup if data/schema recovery is necessary.

## Deployment completion checklist

- [ ] Release is committed and pushed; no secrets or local exports are in Git.
- [ ] Supabase production database and backup plan are ready.
- [ ] Render service is live with production secrets and the correct runtime
      `DATABASE_URL`.
- [ ] All database migrations are applied exactly once.
- [ ] Render liveness and readiness endpoints both return HTTP 200.
- [ ] Vercel production build uses `API_URL` pointing at the Render origin.
- [ ] Render `CLIENT_URL` matches the Vercel production origin exactly.
- [ ] Browser smoke tests pass for login, database-backed data, restore, and
      realtime chat.
- [ ] Monitoring/access controls are in place and email-provider limitations
      are understood.
