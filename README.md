# Relay

Personal agents with useful workflows and clear limits.

[Public preview](https://relay-xarkgg.vercel.app) · [Repository](https://github.com/xarkgg/relay)

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
- A public storefront deployable on Vercel without the local workspace.
- Optional Pi sign-in verified by the backend against Pi's `/me` API.
- Testnet checkout with server-priced intents, owner/recipient/network checks,
  exactly-once access records, and interrupted-payment recovery.

Pi integrations remain disabled until the operator configures them. Real Pi
credentials and a Testnet transaction are still required to verify the complete
platform flow. Signed device activation, Mainnet checkout, third-party publishing,
and SoloHost distribution are not available. There is no cloud inference fallback
or autonomous message sending. Invoice payment status comes from your register.

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

`npm run build` produces `dist/`, a static storefront with a browser sample
preview. `vercel.json` supplies the build and security headers. No documents,
database, or runtime data are included. The local SQLite server is never deployed
to Vercel. Hosted accounts and purchases require durable Postgres storage.
The isolated `api/commerce.js` function handles hosted accounts and purchases
using Postgres. It never imports or hosts the SQLite agent workspace. The Vercel
project follows `main`. Local workspace and unknown routes remain unavailable.

## Pi accounts and Testnet purchases

Register the app in Pi's Developer Web Console and configure its Sandbox URL.
Set these operator variables on the account service:

- `RELAY_DATABASE_URL` or the provider's `DATABASE_URL`/`POSTGRES_URL`.
- `RELAY_PG_TLS_VERIFY=1` keeps certificate verification on. If a managed
  provider uses a private certificate chain, set it to `0` only for that trusted
  provider after verifying its connection hostname through the dashboard.
- `RELAY_SESSION_SECRET`, at least 32 random characters, for private rate-limit hashing.
- `RELAY_PI_AUTH_ENABLED=1` to enable Pi sign-in.
- `RELAY_PI_NETWORK=Pi Testnet` and `RELAY_PI_SANDBOX=1` for the Sandbox flow.
- `RELAY_PI_API_KEY`, the app's server API key, never a client credential.
- `RELAY_PI_MERCHANT_ADDRESS`, the app's actual Testnet receiving address.
- `RELAY_PI_PRICE`, an explicit positive Pi price with up to seven decimal places.
- `RELAY_PI_CHECKOUT_ENABLED=1` to enable Testnet checkout once those values are set.

On Vercel, the origin comes from the deployment and production-domain variables.
Only set `RELAY_COMMERCE_URL` there if it is the exact HTTPS app origin. The local
HTTP value in `.env.example` is for development and must not be copied to Vercel.
Serverless hosts never fall back to an embedded or in-memory database. Use a
verified TLS connection string from the Postgres provider.

For local storefront development, run `npm run build` then `npm run storefront`
and open `http://127.0.0.1:4311`. It uses the configured Postgres URL or the
development-only PGlite directory. The agent workspace still runs separately on
4310. PGlite is not imported by the Vercel entry.

Sign-in initially requests only the username scope. Checkout and recovery request
payment permission, which the backend verifies from Pi's response. Pi access
tokens are not stored. Relay sessions are hashed in Postgres, expire within an
hour, and support an HttpOnly cookie plus a browser-memory token for embedded
contexts. No token is saved in browser localStorage.

Each intent freezes the price, recipient, network, and account. Access is recorded
only after Pi attests a verified, completed transaction. Callback retries do not
extend access, and uncertain network outcomes remain recoverable. A Testnet
access record lasts 30 days but does not activate the desktop agent yet.
Mainnet checkout is rejected until the activation boundary is implemented.

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

GitHub Actions runs the syntax checks, SQLite/HTTP tests, storefront build, and
real-browser probe on Node.js 24 for pushes to `main` and pull requests.
The commerce tests use one real embedded Postgres instance and a Pi HTTP protocol
fixture. They verify application behavior, not a genuine Pi identity or payment.
On memory-constrained devices, use `NODE_OPTIONS=--max-old-space-size=128 npm test`.
To verify the deployed preview as well as the local workflow:

```sh
RELAY_PREVIEW_URL=https://relay-xarkgg.vercel.app npm run probe
```
