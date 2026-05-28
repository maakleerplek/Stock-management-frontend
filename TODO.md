# Project TODOs

This file tracks planned features, enhancements, and architectural tasks for the Stock Management Frontend.

---

## 🔐 Authentication & Access Control

### [ ] Volunteer Mode: Sign-in with Microsoft Account (Entra ID / Office 365)
Enable volunteers to sign in using their organization's Microsoft accounts rather than relying on a shared static password.
- **Implementation Steps**:
  1. Register the application in the Microsoft Entra admin center to get a `Client ID` and set up redirect URIs.
  2. Install `@azure/msal-react` and `@azure/msal-browser` for Microsoft OAuth2 authentication.
  3. Create an Auth Provider and wrapper in `src/AuthContext.tsx`.
  4. Replace the static `VITE_VOLUNTEER_PASSWORD` prompt with a brutalist-styled **"Sign in with Microsoft"** button in `VolunteerModal.tsx`.
  5. Add email domain validation (e.g. restrict to `@maakleerplek.be`) or check group membership to authorize volunteer access.
  6. Store the session securely and implement automatic token refresh.

---

## 🛠️ Offline & Scanner Improvements

### [ ] Offline Kiosk Mode Fallback
- Support queueing transactions locally when the network is offline, syncing them back to InvenTree once internet access is restored.

### [ ] Improved Barcode Lookup Fallbacks
- Enhance scanner validation for non-standard barcodes and implement advanced regex rules for various supplier tag formats.

---

## 📈 Testing & CI/CD Automation

### [ ] Unit and Integration Tests
- Write Vitest tests for utility helpers, API mapping, and mock scanner event handling.
- Integrate test runs into the GitHub Actions `.github/workflows/ci.yml` pipeline.

### [ ] ESLint Cleanup
- Fix the existing 24 ESLint errors (mostly `no-explicit-any` and `no-unused-vars`) and re-enable linting in the GitHub Actions runner.
