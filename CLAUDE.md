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
| API access | `lib/apiAccess.ts`, `lib/services.ts`, `src/api/` | — |
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
