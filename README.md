# MailGuard

**Email infrastructure health & monitoring for the domains you send from.**

MailGuard watches DNS, MX, SPF, DKIM, DMARC, HTTP availability, and TLS certificate health for a set of domains,
scores them transparently, and tells you — via dashboard and signed webhooks — the moment something breaks.

## Why this exists

Email deliverability failures are almost always silent until they're expensive: a DNS record gets edited by someone
who doesn't understand SPF, a TLS certificate expires over a weekend, DKIM keys get rotated and the DNS record isn't
updated to match. By the time a human notices, mail has already been bouncing or landing in spam for hours or days.

This project was built as a full-stack engineering portfolio piece for a role focused on email infrastructure,
automation, APIs, reliability, and large-scale SaaS systems. It's deliberately scoped as **one thing done properly**
rather than a feature-sprawl demo: recurring, reliable background checks; a transparent scoring model; a real
public API with API keys and webhooks; and the security posture that's non-negotiable the moment your application
makes network requests to hosts your users control.

## Architecture

```
 React (Vite) ──TanStack Query──> Express REST API ──Prisma──> PostgreSQL (Neon)
                                        |
                                        v
                                  Redis (Upstash)
                                        |
                                        v
                                     BullMQ
                                        |
                          +-------------+-------------+
                          v                            v
                 domain-check worker           webhook-delivery worker
                          |                            |
              DNS / HTTP / TLS checks         signed HTTPS POST to
              (SSRF-validated)                the user's endpoint
                          |
                          v
                    PostgreSQL (results, issues, audit log)
                          |
                          v
                 Dashboard polls + webhook events fire
```

**Why Express requests never do the network work themselves.** A domain check makes 6-7 outbound network calls
(DNS x5, an HTTP request, a TLS handshake), several of which can legitimately take seconds or time out. Doing that
inline in a request handler would tie up an API worker thread and give users a terrible "why is adding a domain so
slow" experience. Instead, `POST /domains` and `POST /domains/:id/check` do the minimal DB writes, enqueue a BullMQ
job, and return immediately (`202 Accepted` for check triggers). The actual work happens in a **separate Node
process** (`worker.ts`), so a burst of checks, a slow DNS server, or a worker crash never touches the API's
responsiveness.

**Why one codebase, two entrypoints, instead of two services from day one.** The brief specifically asks for a
Render Web Service (API) and a Render Background Worker (queue consumer) — genuinely separate processes, which is
the right call for a system with expensive, latency-variable background work. But splitting them into two
*repositories* or duplicating business logic (check services, Prisma schema, scoring logic) between two codebases
would be needless overengineering for a project this size — a change to how SPF is parsed would have to be made and
kept in sync in two places. `backend/src/server.ts` and `backend/src/worker.ts` are two thin entrypoints over one
shared `src/` tree, each deployed as its own Render service with its own start command. One developer can hold the
whole system in their head, and the two processes still scale, restart, and fail independently in production.

## Database design

Postgres via Prisma. Full schema: [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma).

| Model | Purpose |
|---|---|
| `User` | Account + plan tier (`FREE` / `PRO`) |
| `Session` | DB-backed session, not a JWT — see Security section |
| `Domain` | A monitored hostname, scoped to a user (`@@unique([userId, hostname])`) |
| `MonitoringConfig` | One-to-one with `Domain`: enabled + interval, drives the BullMQ job scheduler |
| `DomainCheck` | One row per check run: health score, overall status, and the full raw result JSON for all 7 checks |
| `DomainIssue` | Normalized, queryable "what's wrong" rows derived from a `DomainCheck`, with severity |
| `ApiKey` | Hashed (never plaintext) key + scopes + expiry + revocation |
| `Webhook` | User-configured endpoint + subscribed events + signing secret |
| `WebhookDelivery` | One row per delivery attempt group: status, attempts, response code |
| `AuditLog` | Append-only security-relevant event log (logins, key/webhook changes) |

Design choices worth calling out:
- **`DomainCheck` stores the raw per-check JSON, not just the score.** The health-scoring algorithm (weights, what
  counts as a WARN vs a FAIL) is expected to evolve. Storing the structured inputs means historical checks can be
  *re-scored* under a new algorithm without re-running any network calls — the raw evidence isn't thrown away.
- **`DomainIssue` is separate from `DomainCheck`.** Checks are point-in-time snapshots; issues are the thing a user
  actually wants a list of ("what's currently wrong"), and they need their own lifecycle (`resolvedAt`) independent
  of any single check run.
- **Cascading deletes are used deliberately** (`onDelete: Cascade` from `Domain` to `DomainCheck`/`DomainIssue`,
  `User` to everything): deleting a domain or account should not leave orphaned rows that queries have to
  defensively filter around forever.

## Health scoring

Shown as e.g. `82 / 100 - WARNING`, always alongside the reasoning:

| Check | Weight | Why this weight |
|---|---|---|
| MX | 25 | No MX record means mail literally cannot be delivered — the single most severe failure |
| SPF | 15 | Missing/broken SPF materially hurts deliverability and enables spoofing |
| DMARC | 15 | Same severity class as SPF; the two are usually fixed together |
| HTTP | 15 | The domain itself being unreachable is a real production signal, if a lighter one for pure mail flows |
| DKIM | 10 | Best-practice signal; its absence is a warning sign, not on its own a deliverability-breaking failure |
| DNS | 10 | Baseline resolvability |
| TLS | 10 | Matters for the domain's website, and indirectly for BIMI/MTA-STS-adjacent trust signals |

Each check contributes `weight x multiplier` where `PASS = 1.0`, `WARN = 0.5`, `ERROR = 0.25` (couldn't verify — not
necessarily the domain's fault), `FAIL = 0`. The full breakdown (`backend/src/services/healthScore.service.ts`) is
returned to the frontend and rendered per-check, so the number is never a black box.

## Queue & worker architecture

Two BullMQ queues, one Redis instance, described in `backend/src/queues`:

**`domain-check`**
- Enqueued on domain creation (immediate first check), on manual "run check now", on the public API's
  `POST /domains/:id/check`, and as a **BullMQ job scheduler** per the domain's `MonitoringConfig.interval`.
- **Idempotency / duplicate-job protection:** manual triggers use a jobId of `manual-{domainId}-{30s-bucket}`, so
  rapid double-clicks or a retried HTTP request collapse into a single BullMQ job instead of running the check
  twice. Scheduled runs use one job scheduler per domain (`scheduled-{domainId}`), so `upsertJobScheduler` replaces the
  existing schedule when the interval changes rather than stacking a second one. The first scheduled run fires one
  interval after registration (the immediate first check is the separate manual job). BullMQ reserves `:` in custom
  job ids, so ids use `-` as the separator.
- **Retries:** 3 attempts, exponential backoff starting at 3s. A transient DNS blip or an upstream timeout doesn't
  permanently mark a domain as broken.
- **Timeouts:** every individual DNS/HTTP/TLS operation has its own timeout (`CHECK_TIMEOUT_MS`, default 8s) via a
  `Promise.race`, so one hung network call can't wedge a worker slot indefinitely (the job's `lockDuration` is a
  60s backstop on top of that).
- **Concurrency is capped at 5** per worker process — each job makes several outbound connections, and unbounded
  concurrency would look indistinguishable from a port scanner to the mail servers being checked.
- **Domain deleted after enqueue:** the worker checks for the domain's existence and completes the job as a no-op
  rather than throwing (and therefore retrying) on a `null`.
- **Final failure leads to a webhook:** after retries are exhausted, `domain.monitoring.failed` fires so the user
  finds out their monitoring itself is broken, not just that a check happened to fail once.

**`webhook-delivery`**
- One job per (webhook, event) pair, enqueued by `enqueueWebhookEvent`. jobId is `delivery-{deliveryId}`, matching
  the `WebhookDelivery` row created synchronously beforehand — delivery status is always queryable even before the
  job runs.
- 5 attempts, exponential backoff from 2s. A `WebhookDelivery.status` moves `PENDING -> SUCCESS`, or
  `PENDING -> FAILED` (will retry) then `EXHAUSTED` (won't).
- Payloads are signed exactly like Stripe/GitHub do: `X-MailGuard-Signature: t={ts},v1=HMAC-SHA256({ts}.{body})`,
  so receivers can verify authenticity and reject stale replays.

## Failure handling

| Failure | Handling |
|---|---|
| DNS timeout | Per-operation timeout via `Promise.race`; reported as `ERROR` status on that specific check, not a hard crash |
| External service failure (DNS server down, TLS handshake refused) | Caught, turned into a `FAIL`/`ERROR` check result with a human-readable summary; job still completes successfully — a broken domain is a *result*, not a *job failure* |
| Worker crash | BullMQ jobs are durable in Redis; an in-flight job whose worker dies is picked back up (visibility timeout / stalled-job recovery) by the next available worker |
| Duplicate monitoring request | Idempotent jobIds (see above) collapse duplicates at the queue level |
| Malformed DNS response | DNS parsing (SPF/DKIM/DMARC tag parsing) is defensive — a record that doesn't parse as expected becomes a `WARN`/`FAIL` with an explanatory message, never an unhandled exception |
| Temporary network failure | 3 retries with exponential backoff before a check is considered genuinely failed |
| Webhook receiver is down/slow | Delivery runs in its own queue with its own timeout and retries — a broken customer endpoint can never block or slow down domain checks |

## Security

- **SSRF / DNS-rebinding protection** (`backend/src/lib/ssrf.ts`): every domain a user adds is, by definition, a
  network destination the *user* controls. Before any HTTP or TLS check runs, MailGuard resolves the hostname
  itself and rejects it outright if **any** resolved address falls in a private/loopback/link-local/reserved range
  (including the cloud metadata address `169.254.169.254`). Checks then connect to that **pre-validated IP
  directly** rather than letting the HTTP/TLS libraries re-resolve the hostname — closing the classic DNS-rebinding
  TOCTOU window where a hostname resolves safely at validation time and unsafely at connection time. The same guard
  runs a second time at the socket layer (`socket.on('lookup', ...)`) as defense in depth, and again for
  user-supplied **webhook URLs**, which are exactly as capable of pointing at an internal service.
- **Safe redirect handling:** HTTP redirects are followed manually (max 5 hops), and every redirect target is
  re-resolved and re-validated against the same SSRF rules before being followed — an attacker can't bypass the
  guard by having the *first* hop be safe and a redirect target be internal.
- **Passwords:** argon2id (OWASP-recommended parameters), never bcrypt/scrypt-with-defaults or, worse, plain
  hashing. Login compares against a dummy hash when the account doesn't exist, so response timing doesn't leak
  which emails are registered.
- **Sessions:** DB-backed, opaque, `httpOnly` + `secure` + `SameSite` cookies — never `localStorage`. This costs one
  extra DB read per authenticated request versus a stateless JWT, in exchange for genuine instant revocation
  (logout-everywhere, compromised-session response) that a stateless token can't offer without a denylist that is,
  functionally, a session table with extra steps.
- **API keys:** shown once at creation, stored as `HMAC-SHA256(pepper, key)` — never plaintext, and the pepper
  itself lives only in server config, so a leaked database alone isn't enough to reconstruct usable keys. Scoped
  (`DOMAINS_READ`, `DOMAINS_WRITE`, `CHECKS_TRIGGER`, `WEBHOOKS_MANAGE`), revocable, optionally expiring, and
  API-key management itself requires a real session (a leaked key can't be used to mint or revoke other keys).
- **Input validation:** every request body is parsed through a Zod schema before touching business logic; hostname
  format, password strength, webhook URL scheme (HTTPS-only) are all enforced server-side, not just in the form.
- **Authorization:** every domain/API-key/webhook lookup checks `resource.userId === req.userId` and returns `404`
  (not `403`) on mismatch, so one user can't even confirm another user's domain exists.
- **Rate limiting:** three tiers — strict on `/auth/*` (brute-force surface), general per-user/IP on the API, and a
  separate stricter budget on "run check now" (it triggers real outbound network activity, unlike a normal read).
- **Security headers:** Helmet, plus explicit CORS restricted to the configured frontend origin(s) with
  `credentials: true` (required for the cross-origin session cookie between Vercel and Render).
- **Structured logging:** Pino, with cookies/passwords/hashes/secrets redacted at the logger level so they can never
  end up in log aggregation even by accident.

## API documentation

Base URL: `https://<your-render-service>.onrender.com/api/v1`. Session-cookie auth for the dashboard, or
`Authorization: Bearer mg_live_...` for programmatic use — both accepted on every route.

```
POST   /auth/register                 { email, password }
POST   /auth/login                    { email, password }
POST   /auth/logout
GET    /auth/me

POST   /domains                       { hostname, dkimSelectors? }
GET    /domains
GET    /domains/:id
DELETE /domains/:id
POST   /domains/:id/check                             -> 202, enqueues a check
GET    /domains/:id/checks            ?limit=20
GET    /domains/:id/issues            ?status=all      (default: unresolved only)
GET    /domains/:id/history           ?days=30
PATCH  /domains/:id/monitoring        { enabled?, interval? }

GET    /api-keys
POST   /api-keys                      { name, scopes[], expiresInDays? }  -> plaintext key returned once
DELETE /api-keys/:id

GET    /webhooks
POST   /webhooks                      { url, events[] }                  -> signing secret returned once
DELETE /webhooks/:id
GET    /webhooks/:id/deliveries
```

Webhook payload shape:
```json
{
  "event": "DOMAIN_ISSUE_DETECTED",
  "data": { "domainId": "...", "hostname": "example.com", "issues": [] },
  "deliveryId": "..."
}
```
Verify `X-MailGuard-Signature: t=<unix_ts>,v1=<hex_hmac>` as `HMAC_SHA256(secret, "${t}.${rawBody}")`.

## Local development setup

Prerequisites: Node.js 22.22+ (24 LTS recommended), a Postgres instance (local or Neon), a Redis instance (local
or Upstash).

```bash
# 1. Backend
cd backend
cp .env.example .env        # fill in DATABASE_URL, REDIS_URL, CORS_ORIGIN, API_KEY_PEPPER
npm install
npm run prisma:generate     # generates the Prisma client into src/generated/prisma (needs DATABASE_URL set)
npm run prisma:deploy       # applies the committed migrations (use `npm run prisma:migrate` while changing the schema)
npm run dev                 # API on :4000

# 2. Worker (separate terminal, same backend/ folder)
npm run dev:worker

# 3. Frontend (separate terminal)
cd frontend
cp .env.example .env        # VITE_API_URL=http://localhost:4000
npm install
npm run dev                 # dashboard on :5173
```

> **Prisma 7 notes:** the client is generated into `backend/src/generated/prisma` (git-ignored) and talks to Postgres
> through the `pg` driver adapter; connection and migration settings live in `backend/prisma.config.ts`, and
> `DATABASE_URL` must be set for every Prisma command, including `prisma generate` (use a placeholder in CI).
> Re-run `npm run prisma:generate` after pulling schema changes.



### Dummy data and sample API requests

```bash
cd backend
npm run seed         # idempotent: (re)creates the demo users and data below
```

`requests/mailguard.http` is the same file you can open in VS Code (REST Client extension) or a JetBrains IDE and
send request by request; each request documents its expected status in a `# expect:` comment. The API's general
rate limit is 120 requests/minute per IP, so wait a minute between two full runs.

| Seeded data | Details |
|---|---|
| Users | `demo@mailguard.dev` / `Demo-Password-123` (FREE plan) and `other@mailguard.dev` / `Other-Password-123` (for authorization-boundary tests) |
| Domains (demo user) | `example.com` healthy (100), `example.org` warning (DMARC `p=none`, no DKIM, expiring cert, one resolved SPF issue), `example.net` critical (no MX/SPF/DMARC), `staging.example.com` outage (DNS failing, monitoring paused). Each has 12-24 historical checks. `example.edu` belongs to the other user |
| API keys | `mg_live_demo_full_access_key_0000000000000000` (all scopes), `mg_live_demo_read_only_key_00000000000000000` (`DOMAINS_READ`), plus a revoked and an expired key that must return 401, and one for the other user |
| Webhooks | `wh_demo_active` (secret `whsec_demo_signing_secret_for_local_testing`) with deliveries in `SUCCESS`, `FAILED`, `EXHAUSTED` and `PENDING`; `wh_demo_inactive` |

The seed uses IANA-reserved example domains, so scheduled checks only touch purpose-built hosts, and it refuses to
run with `NODE_ENV=production` because the credentials above are public.

### Checking real-world domains

The dashboard's domain box and the CLI below run the real checks (live DNS, SPF, DKIM, DMARC, HTTP, TLS) against
whatever domain you give them: nothing is faked.

```bash
cd backend                       # API and worker must be running
npm run check:domains                                  # every domain in requests/real-world-domains.txt
npm run check:domains -- github.com stripe.com         # only the ones you name
npm run check:domains -- --keep gmail.com              # leave it in the dashboard afterwards
npm run check:domains -- --json google.com             # machine-readable
```

It signs in as a dedicated `tester@mailguard.dev` account (created on first use), adds the domains in batches (the
free plan allows 5), waits for the worker, prints each check with the HTTP timing breakdown and the detected issues,
and removes the domains again unless you pass `--keep`. Set `ORIGIN=https://your-api` to target a deployed API.

Between runs, issues follow a lifecycle: a problem that persists is updated rather than duplicated, one that
disappears is marked resolved, and only newly detected critical problems fire `domain.issue.detected`. A change in
a domain's MX, SPF, DKIM or DMARC records fires `domain.configuration.changed` with the before/after values. A check
that could not complete (for example a DNS timeout) shows up as a `CHECK_TIMEOUT` / `CHECK_ERROR` issue instead of
silently lowering the score. Some networks block DNS over TCP, which large TXT record sets (google.com, github.com)
need; those show as SPF timeouts rather than a wrong answer.

## Environment variables

**Backend** (`backend/.env`):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string (BullMQ) |
| `CORS_ORIGIN` | Comma-separated list of allowed frontend origins |
| `API_KEY_PEPPER` | Long random secret used to HMAC-hash API keys |
| `SESSION_COOKIE_NAME` | Cookie name (default `mg_session`) |
| `SESSION_TTL_HOURS` | Session lifetime (default 168h / 7 days) |
| `CHECK_TIMEOUT_MS` | Per-network-operation timeout for domain checks (default 8000) |
| `WEBHOOK_DEFAULT_TIMEOUT_MS` | Timeout for outbound webhook POSTs (default 10000) |
| `TRUST_PROXY` | Trust `X-Forwarded-*` from Render's proxy (default true) |
| `PORT` | API port (default 4000) |

**Frontend** (`frontend/.env`):

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Base URL of the deployed API |

## Deployment

| Component | Target | Notes |
|---|---|---|
| Frontend | Vercel | Build command `npm run build`, output `dist/`; set `VITE_API_URL` to the Render API URL |
| API | Render Web Service | Root `backend/`; build `npm install --include=dev && npm run prisma:generate && npm run build && npm run prisma:deploy`; start `npm start` |
| Worker | Render Background Worker | Same repo/root as the API; start `npm run start:worker` instead |
| Database | Neon (or any managed Postgres) | Paste the connection string into `DATABASE_URL` on **both** Render services |
| Redis | Upstash (or any managed Redis) | Paste the connection string into `REDIS_URL` on **both** Render services |

A ready-to-use `render.yaml` blueprint defines both Render services (pinned to Node 24 via `NODE_VERSION`; the
codebase also runs on Node 22.22+). `API_KEY_PEPPER` must be identical across the
API and worker services.

No Docker is used anywhere in this project, per the brief — Render and Vercel both build directly from source with
native Node.js buildpacks.

## Engineering tradeoffs

- **DB-backed sessions over JWTs**, trading one extra read per request for real-time revocation. For a security
  product, being able to say "yes, we can invalidate a session immediately" is worth more than saving a database
  round trip.
- **One backend codebase, two entrypoints** rather than two separate services/repos for the API and worker (see
  Architecture) — the right amount of separation for a single-developer-comprehensible system that still deploys
  and scales as genuinely independent processes.
- **Synchronous-looking enqueue, asynchronous execution.** `POST /domains/:id/check` returns `202` with a job id
  rather than blocking until the check finishes. The frontend polls (`refetchInterval`) rather than using
  WebSockets/SSE — simpler infrastructure (no persistent connections to manage on a free-tier Render instance) at
  the cost of up to ~30s of staleness, an acceptable trade for a tool checking on minutes-to-hours schedules.
- **Health score is a fixed weighted formula, not machine-learned or user-configurable (yet).** Deliberately: the
  whole point is that a user can see *why* their score is 82, not trust an opaque model. Weights are documented and
  centralized in one file if they need to change.
- **No Docker**, per the brief. Render and Vercel's native Node buildpacks are sufficient for this project's needs
  and remove an entire layer (image builds, registries) that a two-service, no-container deployment doesn't need.

## Dependency baseline

Current majors: React 19, React Router 8, Vite 8, Tailwind CSS 4 (CSS-first `@theme` config), TanStack Query 5,
Zod 4, Express 5, Prisma 7 (driver adapter, no Rust query engine), BullMQ 6 (Job Schedulers), ioredis 6,
Helmet 8, Vitest 5, Playwright 1.63, TypeScript 7. `prisma` is pinned to 7.10.0 to match `@prisma/client`: the npm
`latest` tag of the CLI currently points at an 8.0 release candidate. `backend/package.json` uses `overrides` to
pull patched versions of two transitive dependencies of the Prisma CLI (`deepmerge-ts`, `mysql2`).

## Known limitations

- DKIM checking tries common selectors plus user-supplied ones; it cannot discover an arbitrary, non-standard
  selector without the user providing it — this is a fundamental limitation of DKIM (there's no DNS record that
  lists "here are my selectors").
- The free-tier plan limits (5 domains, hourly-minimum interval) are enforced in the API but not currently
  metered/billed — there's no payment integration in this project's scope.
- Webhook deliveries retry for a bounded window (5 attempts / a few minutes); a receiver down for hours will miss
  events rather than have them queued indefinitely.
- TLS checks validate the certificate presented on port 443 with SNI set to the domain; they don't perform
  additional SAN/wildcard validation beyond what Node's own `authorized`/`authorizationError` already provides.
- Rate limiting uses in-process memory stores, so limits are per API instance; running several API instances would
  need a shared store (e.g. Redis) to enforce them globally.
- Single-region deployment (Render + Neon + Upstash each in one region); no multi-region failover, which would be
  the natural next step for a monitoring product whose own uptime matters.
