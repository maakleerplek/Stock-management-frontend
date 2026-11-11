# htl-stock — map for Claude

The HTL stock web app (React + Vite + TS) on top of InvenTree, plus `core/` (Flask): the laser service and the till. Live on htl-server (`stock.int.maakleerplek.be`, kiosk uses `10.72.1.246:8086`). htl-tempserver = test copy, never real sales. Users/flows: README.md. Big-picture plan: MOONSHOT.md. Style rules: STYLING_GUIDE.md.

## Where things are
| Feature | Frontend | Backend (`core/`) |
|---|---|---|
| Checkout / cart / kiosk scan | `src/ShoppingCart.tsx`, `ShoppingWindow.tsx`, `BarcodeScanner*.tsx`, `components/CheckoutSteps.tsx`, `lib/checkoutApi.ts`, `lib/totals.ts`, `lib/invoice.ts` | `checkout.py` (cart → one InvenTree sales order, `/api/till/`) |
| Laser page (sessions, projects, library, settings) | `src/LaserCutterPage.tsx`, `components/LaserLibrary.tsx`, `LaserAnimation.tsx`, `lib/laserApi.ts`, `lib/laserSetting.ts` | `app.py` (routes + in-memory state), `db.py` (SQLite sessions), `inventree.py` (cut library), `recommend.py`, `feedback.py`, `lbrn.py` (.lbrn2 → PNG) |
| Analytics tabs | `src/analytics/*Tab.tsx`, `ProfitChart.tsx`, `lib/profitTrend.ts`, `lib/itemAnalytics.ts`, `lib/stockHistory.ts`, `lib/workshops.ts` | — |
| Volunteer/admin | `VolunteerContext.tsx`, `VolunteerModal.tsx`, `VolunteerScanView.tsx`, `components/AdminToolsBar.tsx`, `src/auth/` | — |
| InvenTree forms / POs | `Add*Form.tsx`, `InvenTreePage.tsx`, `PurchaseOrderPage.tsx`, `components/PurchaseOrderDetail.tsx`, `lib/purchaseOrderPdf.ts` | — |
| API access / cache | `lib/apiAccess.ts`, `lib/services.ts`, `lib/cache.ts`, `src/api/` | — |
| Laser Timer desktop bar (laser PC, Windows) | `laser-timer-widget/` (Tauri, wraps `#laser`) | — |
| Machine-power monitor | `esp/monitorOTA/monitorOTA.ino` (ESP32, OTA via `scripts/esp-ota.sh`) | — |

App shell/routing: `src/App.tsx`, `main.tsx`. Shared UI: `src/components/` (Sheet, ModalFrame, NumberStepper, Header, BottomNav).

## Run / test / deploy
- `npm test` (vitest, `tests/*.test.ts`), `npm run build:check` (= CI), `npm run lint`.
- Core: `cd core && pytest` (`core/tests/`). gunicorn runs **one worker** (laser state lives in memory, `wsgi.py`).
- `docker-compose.yml`: services `frontend` (nginx) + `core`; volume `laser-data`.
- Deploy: push to master → `scripts/autodeploy.sh` on htl-server (every 5 min, waits for green CI, rolls back on failure). No PRs, no local dev server; UI changes go via tempserver first.

## Architecture rules (keep the code readable)
- One feature = one folder (`src/features/<name>/`). New code never goes loose in `src/`.
- Max ~400 lines per file. Over that, split before adding more.
- All InvenTree calls go through `src/api/inventreeClient.ts`. No raw `fetch` to InvenTree elsewhere.
- Pricing and checkout rules live only in `core/checkout.py`. Do not re-implement them in TS or in the kiosk.
- Change behaviour and move code in separate commits; tests green before and after a move.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
