import type { IPublicClientApplication } from '@azure/msal-browser';

/**
 * Microsoft sign-in for Microsoft 365 Copilot (URS-AI-023). The settings are public (a single-page
 * app registration has no secret); the token is held by MSAL in session storage and sent only to this
 * app's own API, for the request it is for.
 */
export interface MicrosoftSettings {
  clientId: string;
  tenantId: string;
  scopes: string[];
}

let app: Promise<IPublicClientApplication> | undefined;
let configured: string | undefined;

// Loaded on first use, so the main bundle stays small for those who never sign in.
function client(s: MicrosoftSettings): Promise<IPublicClientApplication> {
  const key = `${s.clientId}/${s.tenantId}`;
  if (!app || configured !== key) {
    configured = key;
    app = import('@azure/msal-browser').then((m) =>
      m.createStandardPublicClientApplication({
        auth: { clientId: s.clientId, authority: `https://login.microsoftonline.com/${s.tenantId}`, redirectUri: `${location.origin}/auth-redirect.html` },
        cache: { cacheLocation: 'sessionStorage' },
      }),
    );
  }
  return app;
}

/** Name of the signed-in account, if any. */
export async function signedIn(s: MicrosoftSettings): Promise<string | undefined> {
  const pca = await client(s);
  const a = pca.getActiveAccount() ?? pca.getAllAccounts()[0];
  return a?.name ?? a?.username;
}

export async function signIn(s: MicrosoftSettings): Promise<string> {
  const pca = await client(s);
  const r = await pca.loginPopup({ scopes: s.scopes });
  pca.setActiveAccount(r.account);
  return r.account.name ?? r.account.username;
}

export async function signOut(s: MicrosoftSettings): Promise<void> {
  const pca = await client(s);
  await pca.clearCache();
}

/** A Graph token for the Copilot Chat API: cached or refreshed silently, else through a popup. */
export async function graphToken(s: MicrosoftSettings): Promise<string> {
  const pca = await client(s);
  const account = pca.getActiveAccount() ?? pca.getAllAccounts()[0];
  if (account) {
    try {
      return (await pca.acquireTokenSilent({ scopes: s.scopes, account })).accessToken;
    } catch {
      /* Expired or new consent needed: ask interactively. */
    }
  }
  const r = await pca.acquireTokenPopup({ scopes: s.scopes });
  pca.setActiveAccount(r.account);
  return r.accessToken;
}
