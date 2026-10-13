/*
 * Lux Omni — Dropbox OAuth + API v2 utilities.
 *
 * This module contains Dropbox OAuth and API helpers used by dropbox-ui.js.
 *
 * OAuth uses authorization-code + PKCE for a browser/public client. No app
 * secret is used. The current implementation requests online access and keeps
 * the short-lived access token in localStorage (no refresh token).
 */

import { DROPBOX_CONFIG } from "./dropbox-config.js";

const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json"
});

export class DropboxApiError extends Error {
  constructor(message, { status = 0, errorSummary = "", details = null } = {}) {
    super(message);
    this.name = "DropboxApiError";
    this.status = status;
    this.errorSummary = errorSummary;
    this.details = details;
  }
}

function getStorage() {
  try {
    return window.localStorage;
  } catch (_) {
    throw new DropboxApiError(
      "Browser local storage is unavailable. Enable site storage and try again."
    );
  }
}

function getCrypto() {
  if (!window.crypto?.getRandomValues || !window.crypto?.subtle) {
    throw new DropboxApiError(
      "This browser does not provide the secure Web Crypto APIs required for Dropbox PKCE."
    );
  }
  return window.crypto;
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return window.btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomBase64Url(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  getCrypto().getRandomValues(bytes);
  return toBase64Url(bytes);
}

async function createCodeChallenge(verifier) {
  const encoded = new TextEncoder().encode(verifier);
  const digest = await getCrypto().subtle.digest("SHA-256", encoded);
  return toBase64Url(new Uint8Array(digest));
}

const PENDING_VERIFIER_PREFIX = DROPBOX_CONFIG.storageKeys.pendingVerifier + ":";

function clearPendingOAuth(state = null) {
  const storage = getStorage();

  // Remove the state-specific verifier for a single callback, or every
  // pending PKCE verifier when the user disconnects/clears credentials.
  if (state) {
    storage.removeItem(PENDING_VERIFIER_PREFIX + state);
  } else {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key && key.startsWith(PENDING_VERIFIER_PREFIX)) {
        storage.removeItem(key);
      }
    }
  }

  // Clean legacy single-attempt keys left by earlier builds.
  storage.removeItem(DROPBOX_CONFIG.storageKeys.pendingVerifier);
  storage.removeItem(DROPBOX_CONFIG.storageKeys.pendingState);
}

function removeOAuthParametersFromAddressBar() {
  const url = new URL(window.location.href);
  for (const key of ["code", "state", "error", "error_description", "scope", "token_access_type"]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
}

function headerSafeJson(value) {
  // Dropbox-API-Arg is an HTTP header. Escape non-ASCII characters so paths
  // containing accented characters or symbols remain valid header values.
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (character) => {
    return "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0");
  });
}

async function readErrorResponse(response) {
  const raw = await response.text().catch(() => "");
  let details = raw;
  try {
    details = raw ? JSON.parse(raw) : null;
  } catch (_) {
    // Keep the raw error body if the service did not return JSON.
  }

  const errorSummary =
    details?.error_summary ||
    details?.error?.error_summary ||
    details?.error_description ||
    details?.error ||
    response.statusText ||
    "Dropbox request failed";

  return new DropboxApiError(
    "Dropbox request failed (" + response.status + "): " + String(errorSummary),
    { status: response.status, errorSummary: String(errorSummary), details }
  );
}

function expireLocalSessionOnUnauthorized(status) {
  if (status === 401) clearSession();
}

async function requestJson(endpoint, args = {}) {
  const token = getAccessToken();
  if (!token) {
    throw new DropboxApiError("Dropbox is not connected. Authorize the app first.");
  }

  const response = await fetch(DROPBOX_CONFIG.apiBaseUrl + endpoint, {
    method: "POST",
    headers: {
      ...JSON_HEADERS,
      Authorization: "Bearer " + token
    },
    body: JSON.stringify(args)
  });

  if (!response.ok) {
    const error = await readErrorResponse(response);
    expireLocalSessionOnUnauthorized(error.status);
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

function requireDropboxPath(path, { allowRoot = false } = {}) {
  if (typeof path !== "string") {
    throw new TypeError("A Dropbox path must be a string.");
  }
  if (allowRoot && (path === "" || path === "/")) return "";
  if (!path.startsWith("/") || path === "/" || path.endsWith("/")) {
    throw new TypeError("Use an absolute Dropbox file/folder path, e.g. /Documents/report.pdf.");
  }
  return path;
}

async function requestContent(endpoint, args, body) {
  const token = getAccessToken();
  if (!token) {
    throw new DropboxApiError("Dropbox is not connected. Authorize the app first.");
  }

  const response = await fetch(DROPBOX_CONFIG.contentBaseUrl + endpoint, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": headerSafeJson(args)
    },
    body
  });

  if (!response.ok) {
    const error = await readErrorResponse(response);
    expireLocalSessionOnUnauthorized(error.status);
    throw error;
  }

  return response;
}

/**
 * Create an OAuth authorization URL and store one-time PKCE values in this
 * browser's localStorage. Call beginAuthorization() to redirect to this URL.
 */
export async function createAuthorizationUrl() {
  const storage = getStorage();
  const verifier = randomBase64Url(32);
  const state = randomBase64Url(32);
  const challenge = await createCodeChallenge(verifier);

  // Key the verifier by OAuth state so simultaneous sign-ins in separate tabs
  // cannot overwrite one another's PKCE verifier.
  storage.setItem(PENDING_VERIFIER_PREFIX + state, verifier);

  const url = new URL(DROPBOX_CONFIG.oauthAuthorizeUrl);
  url.searchParams.set("client_id", DROPBOX_CONFIG.appKey);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", DROPBOX_CONFIG.redirectUri);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", DROPBOX_CONFIG.scopes.join(" "));
  return url.href;
}

/** Begin the OAuth flow in the current tab; popup UI can be added separately. */
export async function beginAuthorization() {
  const authorizationUrl = await createAuthorizationUrl();
  window.location.assign(authorizationUrl);
}

/**
 * Complete OAuth after Dropbox redirects to the configured URI.
 * Returns null when the current URL is not an OAuth callback.
 */
export async function handleOAuthCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");
  const returnedState = url.searchParams.get("state");

  if (!code && !oauthError) return null;

  const storage = getStorage();
  // Each tab's callback retrieves only the verifier associated with its own
  // returned state, even if another tab starts a separate authorization flow.
  const verifier = returnedState
    ? storage.getItem(PENDING_VERIFIER_PREFIX + returnedState)
    : null;

  removeOAuthParametersFromAddressBar();

  try {
    if (oauthError) {
      throw new DropboxApiError("Dropbox authorization was not completed: " + oauthError);
    }
    if (!returnedState || !verifier) {
      throw new DropboxApiError("Dropbox sign-in could not be verified. Please authorize again.");
    }

    const form = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: DROPBOX_CONFIG.appKey,
      redirect_uri: DROPBOX_CONFIG.redirectUri,
      code_verifier: verifier
    });

    const response = await fetch(DROPBOX_CONFIG.oauthTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString()
    });

    if (!response.ok) throw await readErrorResponse(response);
    const tokenResult = await response.json();
    if (!tokenResult?.access_token) {
      throw new DropboxApiError("Dropbox did not return an access token.");
    }

    const expiresIn = Math.max(60, Number(tokenResult.expires_in) || 14400);
    storage.setItem(DROPBOX_CONFIG.storageKeys.accessToken, tokenResult.access_token);
    storage.setItem(DROPBOX_CONFIG.storageKeys.expiresAt, String(Date.now() + expiresIn * 1000));

    return {
      connected: true,
      expiresAt: Date.now() + expiresIn * 1000,
      accountId: tokenResult.account_id || null
    };
  } finally {
    clearPendingOAuth(returnedState);
  }
}

/** Return the valid short-lived access token, or null if none is available. */
export function getAccessToken() {
  const storage = getStorage();
  const token = storage.getItem(DROPBOX_CONFIG.storageKeys.accessToken);
  const expiresAt = Number(storage.getItem(DROPBOX_CONFIG.storageKeys.expiresAt));

  if (!token || !expiresAt || expiresAt <= Date.now() + 15000) {
    storage.removeItem(DROPBOX_CONFIG.storageKeys.accessToken);
    storage.removeItem(DROPBOX_CONFIG.storageKeys.expiresAt);
    return null;
  }
  return token;
}

/** Clear all Dropbox credentials and any unfinished OAuth attempt from localStorage. */
export function clearSession() {
  const storage = getStorage();
  clearPendingOAuth();
  for (const key of Object.values(DROPBOX_CONFIG.storageKeys)) {
    storage.removeItem(key);
  }
}

export function hasLocalSession() {
  return Boolean(getAccessToken());
}

/** Verify that a saved access token is still accepted by Dropbox. */
export async function checkConnection() {
  if (!hasLocalSession()) return { connected: false, account: null };
  try {
    const account = await requestJson("/users/get_current_account", {});
    return { connected: true, account };
  } catch (error) {
    if (error?.status === 401) return { connected: false, account: null };
    throw error;
  }
}

/** List a single Dropbox folder. Use path "" for the root folder. */
export async function listFolder({
  path = "",
  recursive = false,
  limit = 1000,
  includeDeleted = false
} = {}) {
  const folderPath = path === "" || path === "/" ? "" : requireDropboxPath(path);
  const safeLimit = Math.max(1, Math.min(2000, Math.floor(Number(limit) || 1000)));
  return requestJson("/files/list_folder", {
    path: folderPath,
    recursive: Boolean(recursive),
    include_deleted: Boolean(includeDeleted),
    limit: safeLimit
  });
}

/** Fetch all pages for a folder; stops when Dropbox reports has_more=false. */
export async function listAllFolderEntries(options = {}) {
  let page = await listFolder(options);
  const entries = [...(page.entries || [])];

  while (page.has_more && page.cursor) {
    page = await requestJson("/files/list_folder/continue", { cursor: page.cursor });
    entries.push(...(page.entries || []));
  }

  return entries;
}

/** Upload a new file to a Dropbox path, usually using mode "add". */
export async function uploadFile({
  path,
  file,
  mode = "add",
  autorename = false,
  mute = false
} = {}) {
  const destination = requireDropboxPath(path);
  if (typeof Blob === "undefined" || !(file instanceof Blob)) {
    throw new TypeError("file must be a File, Blob, or another Blob-compatible value.");
  }
  if (!["add", "overwrite"].includes(mode)) {
    throw new TypeError('uploadFile mode must be "add" or "overwrite". Use saveEditedFile() for revision-aware updates.');
  }

  const response = await requestContent("/files/upload", {
    path: destination,
    mode,
    autorename: Boolean(autorename),
    mute: Boolean(mute)
  }, file);

  return response.json();
}

/**
 * Download a file for a viewport or editor.
 * Returns both the binary Blob and its Dropbox metadata (including rev/path).
 */
export async function downloadFile(pathOrId) {
  if (typeof pathOrId !== "string" || !pathOrId.trim()) {
    throw new TypeError("downloadFile expects a Dropbox path or file ID.");
  }
  const path = pathOrId.startsWith("id:") ? pathOrId : requireDropboxPath(pathOrId);
  const response = await requestContent("/files/download", { path }, null);
  const resultHeader = response.headers.get("Dropbox-API-Result");
  let metadata = null;
  try { metadata = resultHeader ? JSON.parse(resultHeader) : null; } catch (_) {}
  return { blob: await response.blob(), metadata };
}

/**
 * Save edits back to the original file path.
 * If originalRevision is supplied, Dropbox only overwrites if that revision is
 * still current, preventing accidental loss of another edit. Without a revision,
 * this performs an explicit overwrite of the selected source path.
 */
export async function saveEditedFile({
  originalPath,
  content,
  originalRevision = null,
  mute = false
} = {}) {
  const destination = requireDropboxPath(originalPath);
  if (typeof Blob === "undefined" || !(content instanceof Blob)) {
    throw new TypeError("content must be a Blob containing the edited file bytes.");
  }

  const mode = originalRevision
    ? { ".tag": "update", update: originalRevision }
    : { ".tag": "overwrite" };

  const response = await requestContent("/files/upload", {
    path: destination,
    mode,
    autorename: false,
    mute: Boolean(mute)
  }, content);

  return response.json();
}

/**
 * Revoke the current access token on Dropbox, then clear local session data
 * even when the remote revoke request fails. Callers should show any error.
 */
export async function revokeAccess() {
  const token = getAccessToken();
  try {
    if (!token) return { revoked: false, reason: "no-active-token" };

    const response = await fetch(DROPBOX_CONFIG.apiBaseUrl + "/auth/token/revoke", {
      method: "POST",
      headers: { Authorization: "Bearer " + token }
    });
    if (!response.ok) throw await readErrorResponse(response);
    return { revoked: true };
  } finally {
    clearSession();
  }
}
