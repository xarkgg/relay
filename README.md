# Relay

Personal agents with useful workflows and clear limits.

The first agent, Follow-up Desk, turns a Pi invoice register into a source-linked
follow-up queue. You choose the inputs and tools, set an expiry and run limit,
review the drafts, and export only approved work.

## What works

- CSV import with strict validation and exact Pi amounts.
- Hash-bound, expiring permission grants with immediate revocation.
- Deterministic overdue detection and explicitly labelled template drafts.
- Optional local-model drafting through a loopback or Docker Model Runner API.
- Draft approval, dismissal, approved text exports, and local activity history.
- Persistence across restarts without replaying interrupted runs.
- A public, catalogue-only preview deployable on Vercel.

Pi authentication, payments, signed device entitlements, third-party publishing,
and SoloHost distribution are not implemented in this first slice. There is no
cloud fallback, autonomous message sending, or payment-status verification.

## Run locally

Requires Node.js 24 or newer.

```sh
npm install
npm start
```

Open `http://127.0.0.1:4310`. Import a register or explicitly choose sample data,
create a grant, and prepare a queue. Approve drafts before exporting.

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
OpenAI-compatible model endpoint and model ID. Restart Relay and choose Local AI
once its availability check passes. Only loopback and Docker Model Runner HTTP
hosts are accepted. Model output is validated and cannot invoke tools.

A missing or failed model does not turn into a cloud or template run. Templates
are a separate, explicit drafting method. Real inference and SoloHost installation
must be verified on a supported desktop. Docker is not available in Termux here.

## Vercel

`npm run build` produces `dist/`, a catalogue-only site with a browser sample
preview. `vercel.json` supplies the build and security headers. No documents,
database, or runtime data are included. The local SQLite server is never deployed
to Vercel. The future payment service will require durable hosted storage.

## Verification

```sh
npm test
npm run check
npm run build
npm run probe
```

The probe uses a real local HTTP server and SQLite database. Install Puppeteer
on the verifier or set `RELAY_PUPPETEER_PATH` to an existing ESM module, and set
`PUPPETEER_EXECUTABLE_PATH` to the Chromium binary if needed. Screenshots are
written to ignored `probe-shots/`. No browser library is a production dependency.
