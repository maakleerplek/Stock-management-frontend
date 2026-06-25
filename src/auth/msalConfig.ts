// Microsoft Entra ID (Azure AD) authentication configuration for MSAL.
//
// Volunteers sign in with their organization Microsoft account. The relevant
// values come from an Entra "App registration" (SPA platform) and are injected
// at build time via Vite env vars (see .env.example):
//   - VITE_AZURE_CLIENT_ID     Application (client) ID
//   - VITE_AZURE_TENANT_ID     Directory (tenant) ID  -> single-tenant
//   - VITE_AZURE_REDIRECT_URI  (optional) defaults to the current origin
//
// NOTE: This gates UI access only (same trust level as the volunteer password).
// It does NOT secure the InvenTree API, which is still reached through the
// proxy with a static token. Backend token validation would be a separate step.

import { LogLevel, type Configuration, type PopupRequest } from '@azure/msal-browser';

const clientId = import.meta.env.VITE_AZURE_CLIENT_ID as string | undefined;
const tenantId = import.meta.env.VITE_AZURE_TENANT_ID as string | undefined;

/**
 * True only when both Azure values are present. The UI uses this to hide the
 * Microsoft sign-in button until the app registration has been configured,
 * so the app keeps working (password fallback) before Azure is wired up.
 */
export const isMsalConfigured = Boolean(clientId && tenantId);

export const msalConfig: Configuration = {
  auth: {
    clientId: clientId ?? '',
    // Single-tenant: only accounts in THIS Entra tenant may sign in.
    authority: `https://login.microsoftonline.com/${tenantId ?? 'organizations'}`,
    redirectUri:
      (import.meta.env.VITE_AZURE_REDIRECT_URI as string | undefined) || window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    // localStorage keeps the session across tabs / PWA reloads.
    cacheLocation: 'localStorage',
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Error,
      loggerCallback: () => {},
      piiLoggingEnabled: false,
    },
  },
};

/** Scopes requested at sign-in. User.Read lets us read the basic profile/name. */
export const loginRequest: PopupRequest = {
  scopes: ['User.Read'],
};

/** sessionStorage flag set before a redirect-based login so we can resume
 *  "enter volunteer mode" after the page reloads (see MicrosoftAuthSync). */
export const MS_LOGIN_INTENT_KEY = 'msVolunteerLoginIntent';
