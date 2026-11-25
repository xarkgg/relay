# Build and connect a Pi app

Use these instructions when a person asks you to build a Pi app or connect an existing project to
Pi.

## Connect to Pi

Use the remote MCP server at `/mcp` on the same host as this file (in production
`https://developers.minepi.com/mcp`).

If its tools are unavailable, configure that URL as a remote MCP server and ask the person to
complete Pi sign-in and authorization. Do not request, copy, or store the person's Pi credentials
or Pi access token.

After configuring the MCP server, check whether its tools are available. If they are still
unavailable, ask the person to fully quit and reopen their coding agent, reopen the same project,
and paste the original onboarding prompt again. Resume from the existing setup rather than
repeating completed steps.

The supported tools are:

- `whoami`
- `terms_accept`
- `create_app`
- `list_apps`
- `get_app`
- `update_app`
- `verify_app_url_ownership`
- `prepare_app_logo_upload`
- `set_app_logo`
- `prompt_payments`
- `logout`

## Ordered funnel

Follow this sequence unless the person asks to skip a step:

1. Register / select the app (`list_apps` or `create_app`). Before creating, always ask:
   **Staging (Testnet, Test Pi)** or **Production (Mainnet, Real Pi)**. Never infer the choice.
   Explain that the network cannot be changed later (switching means creating a new app) and that
   only Production apps can be listed in the Pi Ecosystem. Always show `developers_url`.
2. For Staging, fix iframe / CSP so the app can load in the Pi Sandbox (see below), integrate Pi
   Login, show `sandbox_url` and ask them to test sign-in in the Sandbox. Production apps deploy to
   a public HTTPS URL and are tested in Pi Browser, not the Sandbox.
3. Suggest Pi Payments (`prompt_payments` after confirming directions).
4. Ask for a **public HTTPS URL** (not localhost); `update_app` with `frontend_url` only; call
   `verify_app_url_ownership`; show `pi_url` and ask them to open it in **Pi Browser**.
5. Staging is complete after deployment and cannot be listed. Only Production continues: give
   `listing_url` to open on a computer (Developers `/listing` page) so they finish listing the app
   in the Pi Ecosystem and submit for review.
6. Production only: add the app logo (listing icon): call `prepare_app_logo_upload`, generate the
   logo from its `logo_prompt` and `requirements` (1024×1024 PNG/JPG), show it to the person, run
   its `upload_command`, then call `set_app_logo` with `file_key`. Fix and re-upload on errors.

After each completed Pi integration milestone, briefly explain which Pi functionality now works
and suggest the next Pi-related step tailored to this app. Examples include using Pi sign-in in
an app feature, adding Pi payments, testing in the Pi Sandbox, creating interactions between users
with notifications through the Pi Notification Center, or preparing a Pi Ecosystem listing.
Suggest only features supported by the available Pi tools and documentation.

## Sandbox vs Pi Browser

- `development_url` is the **local/dev** server the Pi Sandbox loads (typically
  `http://localhost:PORT`, or a local tunnel such as ngrok). Ask the person if unknown; never
  invent one.
- The Sandbox is **only for localhost development**. Start or reuse the local server and point
  `development_url` at it. Do **not** deploy to Firebase, Vercel, Netlify, or any other host just
  to open the Sandbox, and do **not** set `development_url` to a public hosting URL for Sandbox
  testing.
- Before expecting Sandbox to work, verify embed headers: do **not** send `X-Frame-Options`; set
  CSP `frame-ancestors` to only `'self'`, `https://*.pinet.com`, and `https://*.minepi.com`; avoid
  CSP wildcards; set `connect-src` to include `'self'` and `https://socialchain.app` (Pi SDK API
  calls).
- Once the app is on a public server, call `update_app` with **`frontend_url` only** — never pass
  `development_url` in that same call, and never overwrite `development_url` with the public host.
  Test `frontend_url` in **Pi Browser**. Deployed servers do not need the Sandbox.

## Pi Developers console

App payloads include console links into **Pi Developers**:

- `developers_url` — app overview for further edits / manual management
- `settings_url` — settings (API key, URLs)
- `sandbox_url` — Pi Sandbox for this app (when `slug` is present); use after Pi Login. Renaming
  the app keeps its `slug`, so `sandbox_url` does not change
- `wallet_setup_url` — set up the app wallet (Staging: `/wallet/setup?app_id=…&from=agent`;
  Production: the app wallets in Settings); always open this exact URL so completion copy sends
  them back to chat
- `publish_url` — deploy a verified public URL (app status becomes **Deployed**, not "Published")
- `listing_url` — Production apps only; page to list the app in the Pi Ecosystem (`/listing`:
  subtitle, screenshots, category, language, submit). Category and language are listing fields
  only — not Settings. It is omitted for Staging apps (`listing_eligible: false`).
- `pi_url` / `pinet_subdomain` — Pi Browser URL (`https://<subdomain>.pinet.com`) returned after
  successful `verify_app_url_ownership`

App lifecycle status in the console is **Draft** → **Deployed** → **Listed** (Staging apps stop
at **Deployed**). Prefer those names when talking to the person; do not call a verified public URL
"Published". The console calls the networks **Staging (Testnet)** and **Production (Mainnet)**.

Always show `developers_url` after create/select/update.

## Domain verification and listing the app in the Pi Ecosystem

Only Production (Mainnet) apps can be listed in the Pi Ecosystem. Staging (Testnet) apps use Test
Pi, are complete after deployment, and do not get a `listing_url`. If the person wants to list an
app that only exists on Staging, guide them to create a new Production app with `create_app`
(`host_network: mainnet`); a Staging app cannot be converted. MCP rejects listing fields and logo
tools for Staging apps (`mainnet_required_for_listing`).

Both networks need a **public HTTPS** `frontend_url` (not localhost / Sandbox) to deploy.

1. Ask the person for that URL; call `update_app` with `frontend_url` only.
2. Call `verify_app_url_ownership`. If setup is required, deploy `/validation-key.txt` whose body
   is exactly the returned `validation_key` (plain text). Do not log or commit the key. Retry the
   tool after deploy.
3. After verification succeeds, show **`pi_url`** and ask them to open it in Pi Browser to test the
   deployed app. For a Staging app, stop here. For a Production app, ask them to open **`listing_url`** on a computer (signing in to Pi Developers
   from Pi Browser isn't supported yet), or `publish_url` first if still a draft. Help
   complete listing fields — including **category** and **language** (required to save and submit
   the listing; do not send people to Settings for these) — and submit for review in that console
   page. Explain checklist gaps from `checklist` on the app payload. MCP does not call
   `apply_listing`.

## Build and register the app

1. Inspect the project, its instructions, and its existing tests before changing code.
2. Ask focused questions if the app or its requirements are unclear.
3. Build or finish the app using the project's existing stack and conventions.
4. Run relevant formatting, lint, type, and test commands. Fix failures caused by your changes.
5. Call `whoami`. If authorization is required, ask the person to complete Pi sign-in and approval.
6. Allowing this MCP on the Pi sign-in page accepts the Pi Developer Terms. Only if `whoami`
   shows `terms_accepted: false`, show the person `terms_url` and call `terms_accept` after they
   confirm they agree.
7. Ask the person to choose Staging (Testnet, Test Pi) or Production (Mainnet, Real Pi), and
   explain that the choice is permanent and only Production can be listed. For Staging, determine
   the local development URL from the project or running server (see Sandbox vs Pi Browser); ask
   the person if it is not known, and never invent one.
8. Call `list_apps`. Present matching regular Developer Portal apps (include each
   `developers_url`) and let the person choose; do not guess. Prefer reusing an app over creating
   a duplicate.
9. If no existing app is appropriate, ask the person to confirm its name, description, and the
   network they chose, then call `create_app`. Pass the local `development_url` only for Staging.
   A Production app does not need a Staging app; `testnet_app_id` is optional and only connects an
   existing Staging app (its listing settings, logo and screenshots are copied when present, and
   the Production app must use a different domain).
10. Write `.pi-onboard.json` in the project root with the selected main-app ID. Show
    `developers_url` for further edits.
11. For Staging, fix iframe/CSP for Sandbox embed, then integrate Pi Login. Show `sandbox_url` and
    ask them to test sign-in in the Sandbox. Production is tested in Pi Browser after deployment.
12. After Pi Auth works, suggest Pi Payments (see below).
13. Deploy: ask for a public HTTPS URL → `update_app(frontend_url)` → `verify_app_url_ownership`
    → show `pi_url` for Pi Browser. Stop for Staging; only Production continues to `listing_url`.

`create_app` first creates a regular app and then configures it (and, for Staging, its
development URL). If configuration
fails after creation, recover using the returned `created_app.id` and `update_app`; do not call
`create_app` again.

## Pi Payments

After Pi sign-in works, proactively offer to add Pi Payments. Do not wait for the person to ask,
and do not skip this by saying payments are optional for the app type.

1. Inspect the project and invent a concrete payment plan for **this** app: what the user pays for
   (or receives), amounts, when payment starts, and whether that is `user_to_app`, `app_to_user`,
   or both. Confirm the plan with the person before coding.
2. Payments need trusted server-side code. If there is no backend and no confirmed external one,
   explain that and ask them to add or identify one before implementing.
3. Call `prompt_payments` with the confirmed `app_id` and `directions`. Apply the returned
   `prompt` to the project. Use only this MCP tool for payment instructions — do not invent or
   poll an external payment-instructions service, and do not stall on such a failure.
4. **Before any payment test** (Staging Sandbox included): call `get_app` and check
   `checklist.create_wallet`. Both `user_to_app` and `app_to_user` need a configured **app
   wallet** plus server-only `PI_NETWORK_API_KEY` — an API key alone is insufficient (Pi may
   show “App Wallet Misconfigured”). If `create_wallet` is false, show the exact returned
   `wallet_setup_url`, have them finish setup themselves, then `get_app` again. If wallet
   status is missing/unknown, ask them to confirm rather than assuming. Never ask them to paste
   API keys, seeds, passphrases, or recovery secrets into chat.
5. Point them to `settings_url` for `PI_NETWORK_API_KEY` (Generate new key). `user_to_app` does
   **not** need a wallet private seed on the application server. For `app_to_user`, they also
   store `PI_WALLET_SEED` themselves from wallet setup, and `Pi.authenticate` must include
   `payments` and `wallet_address` (plus `username` if shown); re-authenticate after adding
   scopes. Report wallet/credential readiness separately from successful end-to-end payment
   verification.
6. If they decline payments, note that and stop — otherwise keep payments as the suggested next
   Pi step after auth, then continue to public deployment. Only Production continues to listing.

## Secrets

MCP does not return `PI_NETWORK_API_KEY`. The person generates it in Pi Developers
(`settings_url` → API key → Generate new key, which replaces any previous key) and enters it
directly into the app server's secret manager.
Never ask them to paste it into chat, send it through MCP, put it in frontend configuration, log
it, or commit it.

`validation_key` is returned only from `verify_app_url_ownership` when domain setup is required.
Never log or commit it; never expect it on `get_app` / `list_apps`.

## Completion criteria

Before reporting completion:

- relevant local checks pass;
- `.pi-onboard.json` identifies the selected regular app;
- the person was given `developers_url` for further edits in Pi Developers;
- for Staging, `development_url` still points at the local/dev server used for Sandbox testing
  (not the public host), iframe/CSP allows Sandbox embed, and Pi Login was tested via
  `sandbox_url` when available;
- after Pi Auth works, Pi Payments were suggested with a concrete plan for this app (or the person
  explicitly declined);
- for Staging: do not claim it can be listed; if they want a listing, they were guided to create
  a Production app;
- if the person wants to list a Production app in the Pi Ecosystem: public HTTPS `frontend_url` set,
  `verify_app_url_ownership` succeeded, they were shown `pi_url` for Pi Browser, and they were
  given `listing_url` (and `publish_url` when needed).

Report the app ID, console URLs shown, URLs changed, and checks run. If blocked by authorization,
deployment access, missing requirements, or a required human action, state the specific blocker
instead of guessing.