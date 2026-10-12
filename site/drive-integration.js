// Lux PDF Viewer — Google Drive integration.
// Replace these placeholders with values from your Google Cloud project.
// OAuth access tokens are kept in memory, never in localStorage.

const DRIVE_CONFIG = {
  clientId: "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com",
  apiKey: "YOUR_GOOGLE_PICKER_API_KEY",
  appId: "YOUR_GOOGLE_CLOUD_PROJECT_NUMBER"
};

const DRIVE_SCOPE = "openid email profile https://www.googleapis.com/auth/drive.file";
const GIS_SCRIPT_URL = "https://accounts.google.com/gsi/client";
const GAPI_SCRIPT_URL = "https://apis.google.com/js/api.js";
const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const PROFILE_STORAGE_KEY = "lux-pdf-viewer-drive-profile";

let tokenClient = null;
let pendingTokenRequest = null;
let accessToken = null;
let accessTokenExpiresAt = 0;
let cachedProfile = null;
let pickerLoadPromise = null;

// Active Drive document state exists only in memory.
let activeDriveFileId = null;
let activeDriveFileName = null;
let activeDrivePdfBlob = null;

function getDriveUi() {
  return {
    connectButton: document.querySelector("#drive-connect-button"),
    connectedControls: document.querySelector("#drive-connected-controls"),
    avatarButton: document.querySelector("#drive-avatar-button"),
    avatar: document.querySelector("#drive-avatar"),
    avatarFallback: document.querySelector("#drive-avatar-fallback"),
    syncButton: document.querySelector("#drive-sync-button"),
    syncLabel: document.querySelector("#drive-sync-label"),
    feedback: document.querySelector("#drive-feedback")
  };
}

function setDriveFeedback(message, kind) {
  const feedback = getDriveUi().feedback;
  if (!feedback) return;
  feedback.textContent = message || "";
  feedback.hidden = !message;
  if (kind) feedback.dataset.kind = kind;
  else delete feedback.dataset.kind;
}

function validateDriveConfig() {
  const missing = [];
  if (!DRIVE_CONFIG.clientId || DRIVE_CONFIG.clientId.startsWith("YOUR_")) missing.push("Google OAuth Client ID");
  if (!DRIVE_CONFIG.apiKey || DRIVE_CONFIG.apiKey.startsWith("YOUR_")) missing.push("Google Picker API key");
  if (!DRIVE_CONFIG.appId || DRIVE_CONFIG.appId.startsWith("YOUR_")) missing.push("Google Cloud project number");
  if (missing.length) throw new Error("Configure " + missing.join(", ") + " in site/drive-integration.js first.");
}

function loadScript(url, readyCheck) {
  if (readyCheck()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let script = Array.from(document.scripts).find((item) => item.dataset.driveScript === url);

    const onLoad = () => {
      if (!readyCheck()) {
        script.remove();
        reject(new Error("Google library loaded but is unavailable: " + url));
        return;
      }
      script.dataset.loaded = "true";
      resolve();
    };
    const onError = () => {
      script && script.remove();
      reject(new Error("Could not load Google library: " + url));
    };

    if (!script) {
      script = document.createElement("script");
      script.src = url;
      script.async = true;
      script.dataset.driveScript = url;
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
      document.head.appendChild(script);
    } else if (script.dataset.loaded === "true" && readyCheck()) {
      resolve();
    } else {
      script.addEventListener("load", onLoad, { once: true });
      script.addEventListener("error", onError, { once: true });
    }
  });
}

async function ensureGisLoaded() {
  await loadScript(GIS_SCRIPT_URL, () => Boolean(window.google && window.google.accounts && window.google.accounts.oauth2));
}

async function ensurePickerLoaded() {
  if (window.google && window.google.picker && window.google.picker.PickerBuilder) return;

  if (!pickerLoadPromise) {
    pickerLoadPromise = (async () => {
      await loadScript(GAPI_SCRIPT_URL, () => Boolean(window.gapi && window.gapi.load));
      await new Promise((resolve, reject) => {
        window.gapi.load("picker", {
          callback: resolve,
          onerror: () => reject(new Error("Google Picker failed to load.")),
          timeout: 15000,
          ontimeout: () => reject(new Error("Timed out loading Google Picker."))
        });
      });
      if (!window.google || !window.google.picker || !window.google.picker.PickerBuilder) {
        throw new Error("Google Picker is unavailable. Check the Picker API setup.");
      }
    })().catch((error) => {
      pickerLoadPromise = null;
      throw error;
    });
  }

  await pickerLoadPromise;
}

function initializeTokenClient() {
  if (tokenClient) return;

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: DRIVE_CONFIG.clientId,
    scope: DRIVE_SCOPE,
    callback: (response) => {
      const pending = pendingTokenRequest;
      pendingTokenRequest = null;
      if (!pending) return;

      if (response && response.error || !response || !response.access_token) {
        pending.reject(new Error((response && (response.error_description || response.error)) || "Google authorization failed."));
        return;
      }

      accessToken = response.access_token;
      accessTokenExpiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000;
      pending.resolve(accessToken);
    },
    error_callback: (error) => {
      const pending = pendingTokenRequest;
      pendingTokenRequest = null;
      if (pending) pending.reject(new Error((error && (error.message || error.type)) || "Google sign-in was interrupted."));
    }
  });
}

async function requestAccessToken(prompt) {
  validateDriveConfig();
  await ensureGisLoaded();
  initializeTokenClient();

  return new Promise((resolve, reject) => {
    if (pendingTokenRequest) {
      reject(new Error("A Google authorization request is already in progress."));
      return;
    }
    pendingTokenRequest = { resolve, reject };
    try {
      tokenClient.requestAccessToken({ prompt: prompt || "" });
    } catch (error) {
      pendingTokenRequest = null;
      reject(error);
    }
  });
}

async function getUsableAccessToken() {
  if (accessToken && accessTokenExpiresAt > Date.now() + 60000) return accessToken;

  try {
    // After reload, attempt to obtain a token silently using existing consent.
    return await requestAccessToken("");
  } catch (silentError) {
    // If Google needs user interaction, this runs from the user's click.
    return requestAccessToken("consent");
  }
}

async function fetchGoogleProfile(token) {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: "Bearer " + token }
  });
  if (!response.ok) throw new Error("Could not load the Google profile.");
  return response.json();
}

function storeProfile(profile) {
  cachedProfile = {
    sub: profile.sub || "",
    name: profile.name || profile.given_name || "Google user",
    email: profile.email || "",
    picture: profile.picture || ""
  };
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(cachedProfile));
  } catch {
    // Profile UI remains available for this page if browser storage is blocked.
  }
  return cachedProfile;
}

function readStoredProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const profile = JSON.parse(raw);
    return profile && typeof profile === "object" && (profile.name || profile.email) ? profile : null;
  } catch {
    return null;
  }
}

function renderConnected(profile) {
  const ui = getDriveUi();
  cachedProfile = profile;
  if (ui.connectButton) ui.connectButton.hidden = true;
  if (ui.connectedControls) ui.connectedControls.hidden = false;

  if (ui.avatar) {
    ui.avatar.hidden = !profile.picture;
    ui.avatar.alt = profile.name ? profile.name + " Google profile" : "Google profile";
    ui.avatar.onerror = () => {
      ui.avatar.hidden = true;
      if (ui.avatarFallback) ui.avatarFallback.hidden = false;
    };
    if (profile.picture) ui.avatar.src = profile.picture;
    else ui.avatar.removeAttribute("src");
  }

  if (ui.avatarFallback) {
    ui.avatarFallback.hidden = Boolean(profile.picture);
    ui.avatarFallback.textContent = (profile.name || profile.email || "G").trim().charAt(0).toUpperCase();
  }

  if (ui.avatarButton) {
    ui.avatarButton.title = profile.email ? "Open Google Drive (" + profile.email + ")" : "Open Google Drive";
  }
}

function renderDisconnected() {
  const ui = getDriveUi();
  if (ui.connectButton) ui.connectButton.hidden = false;
  if (ui.connectedControls) ui.connectedControls.hidden = true;
  if (ui.syncButton) {
    ui.syncButton.hidden = true;
    ui.syncButton.disabled = true;
  }
}

function setActiveDriveFile(file, blob) {
  activeDriveFileId = file.id;
  activeDriveFileName = file.name;
  activeDrivePdfBlob = blob;

  const ui = getDriveUi();
  if (ui.syncButton) {
    ui.syncButton.hidden = false;
    ui.syncButton.disabled = false;
  }
  if (ui.syncLabel) ui.syncLabel.textContent = "Sync to Drive";
}

export function clearActiveDriveFile() {
  activeDriveFileId = null;
  activeDriveFileName = null;
  activeDrivePdfBlob = null;
  const ui = getDriveUi();
  if (ui.syncButton) {
    ui.syncButton.hidden = true;
    ui.syncButton.disabled = true;
  }
  if (ui.syncLabel) ui.syncLabel.textContent = "Sync to Drive";
}

async function driveFetch(url, options) {
  const token = await getUsableAccessToken();
  const response = await fetch(url, {
    ...(options || {}),
    headers: {
      Authorization: "Bearer " + token,
      ...((options && options.headers) || {})
    }
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = (body.error && body.error.message) || "";
    } catch {
      // Error response did not contain JSON.
    }

    if (response.status === 401) {
      accessToken = null;
      accessTokenExpiresAt = 0;
      throw new Error("Google access expired. Click the Drive avatar and try again.");
    }
    throw new Error(detail || "Google Drive request failed (" + response.status + ").");
  }
  return response;
}

function openGooglePicker(token) {
  return new Promise((resolve, reject) => {
    ensurePickerLoaded().then(() => {
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS);
      view.setMimeTypes("application/pdf");
      view.setSelectFolderEnabled(false);

      const picker = new window.google.picker.PickerBuilder()
        .setDeveloperKey(DRIVE_CONFIG.apiKey)
        .setAppId(DRIVE_CONFIG.appId)
        .setOAuthToken(token)
        .setOrigin(window.location.origin)
        .setTitle("Open a PDF from Google Drive")
        .setSelectableMimeTypes("application/pdf")
        .addView(view)
        .setCallback(async (data) => {
          if (data.action === window.google.picker.Action.CANCEL) {
            resolve(null);
            return;
          }
          if (data.action !== window.google.picker.Action.PICKED) return;

          try {
            const documents = data[window.google.picker.Response.DOCUMENTS] || data.docs || [];
            const picked = documents[0];
            if (!picked || !picked.id) throw new Error("Google Picker did not return a file ID.");

            setDriveFeedback("Loading PDF from Drive…");
            const metadataResponse = await driveFetch(
              DRIVE_API_BASE + "/files/" + encodeURIComponent(picked.id) + "?fields=id,name,mimeType,size"
            );
            const metadata = await metadataResponse.json();
            if (metadata.mimeType !== "application/pdf") throw new Error("Please select a PDF file.");

            const fileResponse = await driveFetch(
              DRIVE_API_BASE + "/files/" + encodeURIComponent(metadata.id) + "?alt=media"
            );
            const pdfBlob = await fileResponse.blob();

            setActiveDriveFile(metadata, pdfBlob);
            await loadPdfIntoViewer(pdfBlob, metadata.name, metadata.id);
            setDriveFeedback("Opened " + metadata.name, "success");
            resolve(metadata);
          } catch (error) {
            setDriveFeedback(error.message || "Could not open that PDF.", "error");
            reject(error);
          }
        })
        .build();

      picker.setVisible(true);
    }).catch(reject);
  });
}

/**
 * Renderer integration point. The future PDF renderer can listen for this
 * event and pass detail.pdfBlob to its PDF.js loading function.
 */
export async function loadPdfIntoViewer(pdfBlob, fileName, fileId) {
  window.dispatchEvent(new CustomEvent("lux:drive-pdf-loaded", {
    detail: { pdfBlob, fileName, fileId }
  }));
}

async function createMockEditedPdfBlob() {
  if (!activeDrivePdfBlob) throw new Error("Open a PDF from Google Drive before syncing.");

  // Safe stand-in until the renderer exports edited bytes: preserve the source bytes.
  // Replace this with the actual renderer export before enabling annotation sync.
  return new Blob([await activeDrivePdfBlob.arrayBuffer()], { type: "application/pdf" });
}

export async function savePdfToDrive() {
  if (!activeDriveFileId) throw new Error("No Google Drive PDF is active.");

  const ui = getDriveUi();
  const previousLabel = (ui.syncLabel && ui.syncLabel.textContent) || "Sync to Drive";

  try {
    if (ui.syncButton) ui.syncButton.disabled = true;
    if (ui.syncLabel) ui.syncLabel.textContent = "Syncing…";
    setDriveFeedback("Saving " + (activeDriveFileName || "PDF") + " to Google Drive…");

    const editedBlob = await createMockEditedPdfBlob();
    await driveFetch(
      "https://www.googleapis.com/upload/drive/v3/files/" + encodeURIComponent(activeDriveFileId) + "?uploadType=media",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/pdf" },
        body: editedBlob
      }
    );

    if (ui.syncLabel) ui.syncLabel.textContent = "Saved!";
    setDriveFeedback("PDF saved to Google Drive.", "success");
    window.setTimeout(() => {
      if (ui.syncLabel && activeDriveFileId) ui.syncLabel.textContent = "Sync to Drive";
    }, 2200);
  } catch (error) {
    if (ui.syncLabel) ui.syncLabel.textContent = previousLabel;
    setDriveFeedback(error.message || "Could not sync the PDF to Google Drive.", "error");
  } finally {
    if (ui.syncButton) ui.syncButton.disabled = !activeDriveFileId;
  }
}

async function connectDrive() {
  const ui = getDriveUi();
  if (ui.connectButton) ui.connectButton.disabled = true;
  setDriveFeedback("Connecting to Google Drive…");

  try {
    validateDriveConfig();
    const token = await requestAccessToken("consent select_account");
    const profile = storeProfile(await fetchGoogleProfile(token));
    renderConnected(profile);
    setDriveFeedback("Connected as " + (profile.email || profile.name) + ".", "success");
  } catch (error) {
    setDriveFeedback(error.message || "Could not connect Google Drive.", "error");
  } finally {
    if (ui.connectButton) ui.connectButton.disabled = false;
  }
}

async function chooseDrivePdf() {
  const ui = getDriveUi();
  if (ui.avatarButton) ui.avatarButton.disabled = true;
  setDriveFeedback("Connecting to Google Drive…");

  try {
    const token = await getUsableAccessToken();
    if (!cachedProfile) {
      renderConnected(storeProfile(await fetchGoogleProfile(token)));
    }
    await openGooglePicker(token);
  } catch (error) {
    setDriveFeedback(error.message || "Could not open Google Drive.", "error");
  } finally {
    if (ui.avatarButton) ui.avatarButton.disabled = false;
  }
}

export function initDriveIntegration() {
  const ui = getDriveUi();
  const profile = readStoredProfile();

  if (profile) {
    renderConnected(profile);
    setDriveFeedback("Drive account remembered. Select a PDF to reconnect.", "success");
  } else {
    renderDisconnected();
  }

  ui.connectButton && ui.connectButton.addEventListener("click", connectDrive);
  ui.avatarButton && ui.avatarButton.addEventListener("click", chooseDrivePdf);
  ui.syncButton && ui.syncButton.addEventListener("click", savePdfToDrive);

  const api = {
    clearActiveDriveFile,
    getActiveDriveFileId: () => activeDriveFileId,
    getActiveDriveFileName: () => activeDriveFileName,
    savePdfToDrive
  };
  window.luxDriveIntegration = api;
  return api;
}
