# Moonshot: one "till core" for the whole MLP stack

## Context
Moonshot prompt (unlimited devs, 12 months) on the stock frontend, the Interface-stock kiosk and the MLP server setup: is there a part that needs a complete overhaul instead of more small fixes?

## What the stack looks like now (read from the repos)
Five clients each talk to InvenTree directly. Each one has its own copy of the shop rules.

| Piece | Language | Talks to InvenTree | Own business logic |
|---|---|---|---|
| Stock app (`Stock-management-frontend/src`) | React/TS, ~1200-line `api/inventreeClient.ts` | yes, from the browser via nginx token proxy | cart, prices, machine minimum, laser merge, checkout |
| Kiosk (`Interface-stock/kiosk/src`) | Rust + Slint | yes, from the Pi (`inventree.rs`, 935 lines) | **the same** cart/minimum/laser merge again (`cart.rs`, `state.rs`) |
| Laser service (`Stock-management-frontend/laser/app.py`) | Python + SQLite `machineusage.db` | reads materials | cuts, sessions, projects, paid flag |
| TV data-fetcher (`Tv-Presentation/data-fetcher`) | Node | polls stock | `changelog-reporter.js` guesses changes, dedups against the other apps (2 min window) |
| Analytics (`src/analytics/*`) | in the browser | pulls **all** stock tracking + all SO lines (`getAllStockTracking`, `getAllServiceLines`) | totals, profit, volunteer use |

The ugly part everyone accepts as "just how it is":
1. **Checkout is ~10 sequential REST calls from the client** (`sellParts`, inventreeClient.ts:443): create SO → lines → extra lines → issue → allocate → shipment → ship → poll worker → complete → cancel on failure. A Wi-Fi drop on the Pi or a closed tab halfway leaves a half-booked order. The kiosk repeats this in Rust.
2. **Every rule lives twice** (TS + Rust): machine minimum per payment (kiosk #19 + stock app #30), laser cut merge, 3D-print name parsing, volunteer €0 lines, checkout lock. Each change = two PRs, two test suites, a chance to drift.
3. **Two sources of truth without a transaction**: a cut is "paid" in `machineusage.db`, the money is in InvenTree. Nothing ties them together if one write fails.
4. **No events**: TV polls and guesses, kiosk polls `/laser/api/sessions`, stock app polls. The 2-minute dedup in the changelog reporter exists only because nobody announces what happened.
5. **Analytics recomputed in every browser** from full history; gets slower every month.

## The moonshot
**One server process, "till core", owns every rule and every write. Kiosk, stock app, TV and laser PC become thin screens.** InvenTree stays the inventory/accounting book behind it.

- **One API for the shop:** `GET /catalog`, `POST /checkout` (cart → priced order, idempotency key from the client), `GET /events` (SSE/websocket). Pricing, minimum, laser merge, volunteer rules: written once, tested once.
- **Durable checkout (outbox):** `POST /checkout` writes the order to the core's own DB in one transaction (including marking cuts paid), answers in ~50 ms, then a worker books it into InvenTree step by step with retries. A half-booked order becomes impossible; a dead InvenTree only delays booking.
- **Laser service folds in:** cuts, projects and payments in the same DB → "paid" and "booked" are one transaction.
- **Event bus:** every sale, stock change, cut start/stop goes out on `/events`. TV changelog, kiosk laser cards, stock app laser page all subscribe. Polling and the dedup hack go away.
- **Offline kiosk:** the Pi keeps the catalog + a local queue; sales made while the network is down sync later with the same idempotency key. Removes the "Pi lost Wi-Fi" class of problems.
- **Analytics server-side:** the core keeps daily aggregates (sales, machine minutes, volunteer use, profit). Analytics tab = one small request.
- **Kiosk renders server-driven screens** (optional): the core sends product grid/sections; the Rust app only draws. A new product type then needs no kiosk release.

## Honest assessment
A full rewrite is not needed. The app screens, kiosk UI, CAD, deploy pipeline (autodeploy + rollback) and laser watcher are fine. The overhaul is **only the layer between the screens and InvenTree**. 

Risk: one more service on htl-server = one more thing that can be down. The outbox makes InvenTree downtime harmless, but core downtime stops the till (the optional offline queue covers that).

## Plan
One step: a small HTTP service (start inside the laser service, it already runs on htl-server and is Python) with `GET /catalog` (prices, minimum, laser merge already applied) and `POST /checkout` (idempotency key, books the SO into InvenTree, marks cuts paid in the same go). The stock app and the kiosk call it and drop their own InvenTree booking code and rule copies.

A shared crate is not enough: the stock app is TS in the browser, the laser service Python, the TV Node. Only the kiosk could link a Rust crate, and checkout would still run on the client.

Optional later, only if it hurts: `/events` instead of polling, offline queue on the kiosk, server-side analytics totals.

## Verification
- Unit tests on `/checkout` with a mocked InvenTree (pattern: `laser/tests/test_sessions.py`).
- Cut the connection halfway through booking: the order is retried, not duplicated (same idempotency key).
- On htl-tempserver: one sale from the stock app + one from the kiosk preview (`kiosk/preview.sh`); check the SO in InvenTree and the cut marked paid.

Not checked: Tv-Presentation frontend internals, ESP firmware, nginx config details, InvenTree version/plugins (a server-side InvenTree plugin is an alternative place for this).
