# Relay

An agent marketplace frontend with a separate, local-first workflow backend.

[Public preview](https://relay-xarkgg.vercel.app) · [Repository](https://github.com/xarkgg/relay)

The Next.js/React marketplace lives in `frontend/`. It displays labelled sample
agent listings with search, category/pricing filters, sorting, saved views, and
agent details. Navigation, additional metadata filters, publishing, accounts,
checkout, and agent launches are preview-only until backend integration is ready.

The existing Follow-up Desk backend still turns a Pi invoice register into a
source-linked follow-up queue. Its API supports scoped grants, drafting, review,
and approved exports. The new marketplace does not call those APIs yet, and the
previous invoice-workspace UI has been replaced.

## Project layout

- `frontend/app/` — Next.js pages, layout, and CSS.
- `frontend/components/` — interactive marketplace UI.
- `frontend/public/` — static assets, following Next.js conventions; this is not
  the former root `public/` application.
- `server/` — Express, local SQLite storage, grants, and workflow logic.
- `shared/` — invoice validation and frontend security-policy helpers.
- `scripts/` and `tests/` — builds and verification.

Dependencies and scripts are managed by the root `package.json` and
`package-lock.json`. There is no separate frontend install or pnpm lockfile.

## Existing backend capabilities

- CSV import with strict validation and exact Pi amounts.
- Hash-bound, expiring permission grants with immediate revocation.
- Deterministic overdue detection and explicitly labelled template drafts.
- Optional local-model drafting through a loopback or Docker Model Runner API.
- Draft approval, dismissal, approved text exports, and local activity history.
- Persistence across restarts without replaying interrupted runs.
- A static marketplace preview deployable on Vercel, separate from the backend.

Pi authentication, payments, signed device entitlements, third-party publishing,
and SoloHost distribution are not implemented. There is no cloud fallback,
autonomous message sending, or payment-status verification.

## Run locally

Requires Node.js 24 or newer.

```sh
npm ci
npm run dev
```

Open the URL printed by Next.js (normally `http://localhost:3000`). This is the
frontend development server with hot reload; it does not proxy the local backend.

To build the frontend and serve the exported marketplace with the existing local
backend on the same origin:

```sh
npm start
```

`npm start` builds first, then opens the loopback-only Express server at
`http://127.0.0.1:4310`. `npm run dev:server` watches backend changes and serves the
last frontend build; run `npm run build` first if no export exists. The marketplace
remains a sample preview in either mode and does not import invoices or start runs.

### Backend invoice format

```csv
invoice_id,customer,amount_pi,due_date,status
INV-101,Studio North,12.5,2026-11-20,unpaid
INV-102,Amara,8,2026-11-28,paid
```

Dates use YYYY-MM-DD in UTC. Status is `unpaid`, `paid`, or `void`. Amounts have
at most seven decimal places. Registers are limited to 256 KB and 500 invoices.
Selected registers must not contain overlapping invoice IDs.

Settings are documented in `.env.example`. Data lives in `data/relay.db` by
default. The database is local but not encrypted. Use operating-system access
controls and disk encryption. The runtime is for one operator, not a shared host.

## Local AI

Set both `RELAY_MODEL_URL` and `RELAY_MODEL_NAME` to a real local
OpenAI-compatible model endpoint and model ID. Restart the backend and check
`/api/model` before requesting a `local-model` run through the API. Only loopback
and Docker Model Runner HTTP hosts are accepted. Model output is validated and
cannot invoke tools.

A missing or failed model does not turn into a cloud or template run. Templates
are a separate, explicit drafting method. Real inference and SoloHost installation
must be verified on a supported desktop; the marketplace preview does not verify them.

## Vercel

`npm run build` statically exports Next.js into `frontend/out/` and generates a
Vercel Build Output API deployment in `.vercel/output/`. Keep the Vercel project
root at the repository root; `vercel.json` sets the build command and export path.
The generated deployment configuration includes exact CSP hashes for Next.js
hydration, self-hosted assets only, and 404s for unknown routes. No documents,
database, or runtime data are included. The local SQLite server is never deployed
to Vercel. The future payment service will require durable hosted storage.
The Vercel project follows `main`. Unknown routes return 404 rather than serving
the marketplace as a workspace API response. Generated build output is ignored
by Git. Rebuilding updates CSP hashes automatically, without `unsafe-inline` or
`unsafe-eval`. Analytics and remote-avatar requests from the supplied template
are not included.

## Pi integration handoff

Both frontend and backend contributors should read [`agents.md`](agents.md)
before Pi integration. The frontend owner registers or selects the Pi app and
shares its app ID/network through `.pi-onboard.json` once selected. Backend keys,
wallet seeds, and private environment values must never be added to frontend
code, public environment variables, Git, logs, or chat. Redacted `.env.example`
files can be shared; real environment files and Pi validation keys stay ignored.

## Verification

```sh
npm test
npm run check
npm run build
npm run probe
```

`npm run check` checks JavaScript syntax, generates Next.js route types, and runs
the frontend TypeScript checker. Backend tests use real SQLite and HTTP fixtures.
The browser probe tests the exported marketplace on both the local backend host
and a static host, including mobile layouts, filtering, sorting, saved views,
details, privacy links, CSP, and the absence of backend/third-party requests.

Install Puppeteer on the verifier or set `RELAY_PUPPETEER_PATH` to an existing ESM
module, and set
`PUPPETEER_EXECUTABLE_PATH` to the Chromium binary if needed. Screenshots are
written to ignored `probe-shots/`. No browser library is a production dependency.

GitHub Actions runs the syntax/type checks, SQLite/HTTP tests, marketplace build,
and real-browser probe on Node.js 24 for pushes to `main` and pull requests. After
deploying the new frontend, verify the deployed preview as well as the local build:

```sh
RELAY_PREVIEW_URL=https://relay-xarkgg.vercel.app npm run probe
```
