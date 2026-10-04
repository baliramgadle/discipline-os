# Production operations

## Runtime requirements

- Node.js 22 or later and npm, installed with `npm ci` from the repository root.
- PostgreSQL (Supabase PostgreSQL is supported). Runtime can use a pooler; the
  migration job should use a direct connection if pooled DDL is unsupported.
- A public HTTPS origin for the frontend and a separately configured backend API.
- Persistent, private environment configuration; never commit `.env`, access
  tokens, database URLs, email keys, or cookie exports.
- For local development, copy `.env.example` to the repository-root `.env` and
  replace each placeholder. `.env` is ignored by Git. For hosted deployments,
  set the same variables in each provider's environment/secret settings rather
  than uploading the local `.env` file.

## Required backend configuration

Set these variables in the deployment secret manager:

- `NODE_ENV=production`
- `PORT` to the platform-provided port, if one is supplied.
- `CLIENT_URL` to the exact HTTPS frontend origin allowed by CORS.
- `API_URL` to the public HTTPS API origin. The frontend build also reads this
  variable and embeds only this public URL into its browser bundle.
- `DATABASE_URL` to the PostgreSQL connection URL. The migration runner reads
  this variable too, so set it to the provider's direct connection URL in the
  one-off migration job when the runtime pooler does not support DDL.
- Email links use `CLIENT_URL`; ensure it is the public frontend origin.
- `JWT_SECRET` and `JWT_REFRESH_SECRET` to different, randomly generated values
  of at least 32 characters. Rotate both with a deliberate session-revocation
  plan; changing them invalidates existing signed sessions.
- `RESEND_API_KEY`, `EMAIL_FROM`, and `EMAIL_API_URL` together to enable password
  reset and email verification. Verify the sender/domain with the email provider
  first. Leaving all three unset disables email delivery.

Production startup rejects missing database URLs, weak/default JWT secrets,
non-HTTPS client origins, and partial email-provider configuration. PostgreSQL
TLS certificate verification is enabled in production.

## Vercel frontend and Render backend

- Deploy the repository root to Render as a Node web service. Use
  `npm ci && npm --prefix backend run build` as the build command and
  `npm --prefix backend start` as the start command. Set the health check path
  to `/api/v1/health/live`.
- Set Render's `CLIENT_URL` to the exact public Vercel frontend origin (no
  trailing path). The backend CORS and Socket.IO origin checks use this value.
- Set Render's `DATABASE_URL` to a Supabase connection URL reachable from
  Render. Prefer the Supabase session pooler for the runtime if direct IPv6 or
  network access is not available. Run migrations as a one-off command with
  `DATABASE_URL` set to Supabase's direct connection URL when pooled DDL is
  unsupported; `DIRECT_URL` is not read by the migration runner.
- On Vercel, configure the project root as `frontend` and set
  `API_URL` to the Render service's public origin, for example
  `https://your-service.onrender.com` (no `/api/v1` suffix). This public value
  is compiled into the browser bundle; never put secrets in `VITE_*` variables.
- Deploy the backend before the frontend. Verify `GET /api/v1/health` on the
  Render URL, then test browser login, refresh, chat/WebSocket, and CORS from
  the deployed Vercel origin. Vercel preview origins are not automatically
  allowed; use the production Vercel domain for initial release or extend the
  backend's origin allowlist deliberately.
- If custom domains are available, use them for a stable frontend origin and
  configure that exact origin in `CLIENT_URL`. The API's signed bearer tokens
  are used by the frontend; cookies may be subject to browser cross-site
  restrictions when Vercel and Render default domains are used.

## Release procedure

1. Build and test from a clean dependency install:

   ```sh
   npm ci
   npm test
   npm --prefix backend run typecheck
   npm --prefix backend run build
   npm --prefix frontend run lint
   ```

2. Take a database backup and verify that it can be restored before applying
   migrations to a production database.
3. Run `npm --prefix backend run migrate` as a one-off deployment/release job
   with the backend environment configured. Do not run multiple competing
   migration jobs.
4. Deploy the backend and frontend artifacts. Terminate TLS at a trusted
   platform/reverse proxy, forward only the intended frontend origin, and
   configure WebSocket upgrades for Socket.IO.
5. Check `GET /api/v1/health/live` for process liveness and
   `GET /api/v1/health` for database readiness. Readiness returns HTTP 503 when
   the database is unavailable or unconfigured.
6. Verify login, registration, email verification, password recovery, data
   creation, archive restoration, profile email changes, and chat with
   non-production test accounts before announcing a release.

## Operations and recovery

- Collect application logs centrally, restrict access, and alert on repeated
  5xx responses, database pool exhaustion, migration failures, and failed email
  delivery. Never log authorization headers, passwords, reset tokens, or
  verification links.
- Configure PostgreSQL automated backups, point-in-time recovery where
  available, and periodically perform a restore drill.
- Use graceful SIGINT/SIGTERM shutdown. The server closes Socket.IO/HTTP and
  then drains its PostgreSQL pool.
- Keep dependency updates and vulnerability review in the deployment pipeline.
  Review schema changes for lock duration and backwards compatibility before
  rollout.
- Email is not queued for retry. A reported delivery failure should be retried
  by the user through the relevant recovery or verification control.
- The finance budget estimate is derived from manually entered entries and is
  not bank-connected. It is not financial advice.

## Known deployment boundary

This repository does not select or configure a hosting provider, DNS zone,
monitoring vendor, or secret manager. Provision those platform resources and
their access controls before deploying; this guide describes the application
contract rather than claiming that a production deployment has occurred.
