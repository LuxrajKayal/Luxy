/*
 * Lux Omni — Dropbox frontend configuration.
 *
 * This is a public, static-site configuration file. The Dropbox App Key is an
 * application identifier and is not an app secret. Never put a Dropbox App
 * Secret, access token, or refresh token in source-controlled frontend code.
 *
 * For this GitHub Pages site, there is no server-side .env runtime. Frontend
 * values must be public. Register the exact redirect URI in the Dropbox App
 * Console: https://luxrajkayal.github.io/Luxy/
 */

export const DROPBOX_CONFIG = Object.freeze({
  appKey: "8vfyy6u50amp4py",
  // Resolve to the website directory, including the /Luxy/ path on Pages.
  get redirectUri() {
    return new URL("./", window.location.href).href;
  },
  apiBaseUrl: "https://api.dropboxapi.com/2",
  contentBaseUrl: "https://content.dropboxapi.com/2",
  oauthAuthorizeUrl: "https://www.dropbox.com/oauth2/authorize",
  oauthTokenUrl: "https://api.dropboxapi.com/oauth2/token",
  scopes: Object.freeze([
    "account_info.read",
    "files.metadata.read",
    "files.content.read",
    "files.content.write"
  ]),
  storageKeys: Object.freeze({
    accessToken: "lux-omni-dropbox-access-token",
    expiresAt: "lux-omni-dropbox-expires-at",
    pendingVerifier: "lux-omni-dropbox-pkce-verifier",
    pendingState: "lux-omni-dropbox-oauth-state"
  })
});
