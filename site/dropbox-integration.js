/* Lux PDF Viewer — Dropbox Bring Your Own Cloud integration.
 * Browser-only OAuth uses authorization-code + PKCE. Never add an app secret here.
 * The PDF editor must supply an exported Blob before Sync can overwrite a source file.
 */
(function () {
  "use strict";

  // Dropbox App Key (also called the client ID). This is public, not a secret.
  const DROPBOX_APP_KEY = "YOUR_DROPBOX_APP_KEY";
  const REQUIRED_SCOPES = [
    "files.metadata.read",
    "files.content.read",
    "files.content.write"
  ];

  const STORAGE = {
    accessToken: "lux-dropbox-access-token",
    expiresAt: "lux-dropbox-access-token-expires-at",
    codeVerifier: "lux-dropbox-code-verifier",
    oauthState: "lux-dropbox-oauth-state"
  };

  const redirectUri = window.location.origin + window.location.pathname;
  const connectButton = document.querySelector("#dropbox-connect");
  const connectedControls = document.querySelector("#dropbox-connected-controls");
  const connectionStatus = document.querySelector("#dropbox-connection-status");
  const openFileButton = document.querySelector("#dropbox-open-file");
  const syncButton = document.querySelector("#dropbox-sync");
  const activeFileLabel = document.querySelector("#dropbox-active-file");
  const fileList = document.querySelector("#dropbox-file-list");
  const message = document.querySelector("#dropbox-message");
  const workspace = document.querySelector(".workspace");

  let dbx = null;
  let activeFilePathLower = null;
  let activeFileName = null;
  let activeSourcePdfBlob = null;
  let editedPdfBlob = null;
  let previewObjectUrl = null;
  let isListingFiles = false;
  let isOpeningFile = false;
  let isSyncing = false;

  function setMessage(text, kind) {
    if (!message) return;
    message.textContent = text;
    if (kind) message.dataset.kind = kind;
    else delete message.dataset.kind;
  }

  function setConnectedUi(connected) {
    if (connectionStatus) {
      connectionStatus.textContent = connected ? "Dropbox Connected" : "Not connected";
      connectionStatus.dataset.connected = String(connected);
    }
    if (connectButton) connectButton.hidden = connected;
    if (connectedControls) connectedControls.hidden = !connected;
    updateSyncButton();
  }

  function updateSyncButton() {
    if (!syncButton) return;
    syncButton.disabled = !dbx || !activeFilePathLower || isSyncing;
    if (!isSyncing && syncButton.textContent === "Syncing...") {
      syncButton.textContent = "Sync to Dropbox";
    }
  }

  function clearSessionCredentials() {
    try {
      sessionStorage.removeItem(STORAGE.accessToken);
      sessionStorage.removeItem(STORAGE.expiresAt);
      sessionStorage.removeItem(STORAGE.codeVerifier);
      sessionStorage.removeItem(STORAGE.oauthState);
    } catch (_) {
      // Ignore storage cleanup failures; the in-memory client is still cleared.
    }
    dbx = null;
    setConnectedUi(false);
  }

  function createState() {
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, function (value) {
      return value.toString(16).padStart(2, "0");
    }).join("");
  }

  function sdkAvailable() {
    return Boolean(window.Dropbox && window.Dropbox.Dropbox && window.Dropbox.DropboxAuth);
  }

  async function connectDropbox() {
    if (DROPBOX_APP_KEY === "YOUR_DROPBOX_APP_KEY" || !DROPBOX_APP_KEY.trim()) {
      setMessage("Setup required: add your Dropbox App Key in dropbox-integration.js.", "error");
      return;
    }
    if (!sdkAvailable()) {
      setMessage("The Dropbox SDK could not be loaded. Refresh the page and try again.", "error");
      return;
    }
    if (!window.crypto || !window.crypto.subtle || !window.crypto.getRandomValues) {
      setMessage("This browser does not provide the Web Crypto API required by Dropbox PKCE.", "error");
      return;
    }

    try {
      const auth = new window.Dropbox.DropboxAuth({ clientId: DROPBOX_APP_KEY });
      const state = createState();
      const authUrl = await auth.getAuthenticationUrl(
        redirectUri,
        state,
        "code",
        "online",
        REQUIRED_SCOPES,
        undefined,
        true
      );

      // Keep only the PKCE verifier and OAuth state across the redirect.
      sessionStorage.setItem(STORAGE.codeVerifier, auth.getCodeVerifier());
      sessionStorage.setItem(STORAGE.oauthState, state);
      setMessage("Redirecting to Dropbox for authorization...");
      window.location.assign(authUrl);
    } catch (error) {
      setMessage("Could not start Dropbox authorization: " + errorMessage(error), "error");
    }
  }

  function removeOAuthParametersFromAddressBar(url) {
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    url.searchParams.delete("error");
    url.searchParams.delete("error_description");
    const newAddress = url.pathname + (url.search ? url.search : "") + url.hash;
    window.history.replaceState({}, document.title, newAddress);
  }

  async function handleOAuthCallback() {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error_description") || url.searchParams.get("error");

    if (!code && !oauthError) return false;

    removeOAuthParametersFromAddressBar(url);

    if (oauthError) {
      sessionStorage.removeItem(STORAGE.codeVerifier);
      sessionStorage.removeItem(STORAGE.oauthState);
      setMessage("Dropbox authorization was not completed: " + oauthError, "error");
      return true;
    }

    let expectedState;
    let verifier;
    try {
      expectedState = sessionStorage.getItem(STORAGE.oauthState);
      verifier = sessionStorage.getItem(STORAGE.codeVerifier);
    } catch (_) {
      setMessage("This browser could not read the temporary OAuth session. Please connect again.", "error");
      return true;
    }

    if (!returnedState || !expectedState || returnedState !== expectedState || !verifier) {
      sessionStorage.removeItem(STORAGE.codeVerifier);
      sessionStorage.removeItem(STORAGE.oauthState);
      setMessage("Dropbox sign-in could not be verified. Please connect again.", "error");
      return true;
    }

    if (!sdkAvailable()) {
      setMessage("The Dropbox SDK could not be loaded while completing sign-in.", "error");
      return true;
    }

    try {
      const auth = new window.Dropbox.DropboxAuth({ clientId: DROPBOX_APP_KEY });
      auth.setCodeVerifier(verifier);
      const tokenResponse = await auth.getAccessTokenFromCode(redirectUri, code);
      const result = tokenResponse && tokenResponse.result;
      if (!result || !result.access_token) {
        throw new Error("Dropbox did not return an access token.");
      }

      const expiresInSeconds = Number(result.expires_in) || 14400;
      sessionStorage.setItem(STORAGE.accessToken, result.access_token);
      sessionStorage.setItem(
        STORAGE.expiresAt,
        String(Date.now() + Math.max(60, expiresInSeconds) * 1000)
      );
      sessionStorage.removeItem(STORAGE.codeVerifier);
      sessionStorage.removeItem(STORAGE.oauthState);

      initializeClient(result.access_token);
      setMessage("Connected to Dropbox. Choose Open File to browse your PDFs.", "success");
      return true;
    } catch (error) {
      sessionStorage.removeItem(STORAGE.codeVerifier);
      sessionStorage.removeItem(STORAGE.oauthState);
      setMessage("Could not complete Dropbox sign-in: " + errorMessage(error), "error");
      return true;
    }
  }

  function initializeClient(accessToken) {
    dbx = new window.Dropbox.Dropbox({ accessToken: accessToken });
    setConnectedUi(true);
  }

  function restoreSession() {
    let token;
    let expiresAt;
    try {
      token = sessionStorage.getItem(STORAGE.accessToken);
      expiresAt = Number(sessionStorage.getItem(STORAGE.expiresAt));
    } catch (_) {
      setMessage("Session storage is unavailable. Enable it to keep Dropbox connected in this tab.", "error");
      return;
    }

    if (!token || !expiresAt || expiresAt <= Date.now() + 15000) {
      if (token) clearSessionCredentials();
      setConnectedUi(false);
      return;
    }

    if (!sdkAvailable()) {
      setMessage("The Dropbox SDK could not be loaded. Refresh the page and try again.", "error");
      return;
    }

    initializeClient(token);
    setMessage("Dropbox Connected. Choose Open File to browse your PDFs.");
  }

  function errorMessage(error) {
    if (error && error.error && error.error.error_summary) return error.error.error_summary;
    if (error && error.message) return error.message;
    return String(error || "Unknown error");
  }

  function handleRequestError(error) {
    if (error && (error.status === 401 || error.status === 400)) {
      clearSessionCredentials();
      setMessage("Your Dropbox session may have expired. Connect Dropbox again.", "error");
    } else {
      setMessage("Dropbox request failed: " + errorMessage(error), "error");
    }
  }

  async function fetchAllPdfFiles() {
    const entries = [];
    let response = await dbx.filesListFolder({
      path: "",
      recursive: true,
      limit: 2000
    });

    while (true) {
      const result = response.result;
      entries.push.apply(entries, result.entries || []);
      if (!result.has_more) break;
      response = await dbx.filesListFolderContinue({ cursor: result.cursor });
    }

    return entries
      .filter(function (entry) {
        return entry[".tag"] === "file" &&
          typeof entry.name === "string" &&
          entry.name.toLowerCase().endsWith(".pdf") &&
          typeof entry.path_lower === "string";
      })
      .sort(function (a, b) {
        return a.path_lower.localeCompare(b.path_lower);
      });
  }

  function renderPdfFiles(files) {
    fileList.replaceChildren();
    fileList.hidden = false;

    if (!files.length) {
      setMessage("No PDF files were found in this Dropbox account.");
      return;
    }

    files.forEach(function (file) {
      const item = document.createElement("li");
      item.className = "dropbox-file-item";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "dropbox-file-button";
      button.title = file.path_display || file.path_lower;
      button.appendChild(document.createTextNode(file.name));

      const pathLabel = document.createElement("span");
      pathLabel.className = "dropbox-file-path";
      pathLabel.textContent = file.path_display || file.path_lower;
      button.appendChild(pathLabel);

      button.addEventListener("click", function () {
        openDropboxFile(file);
      });

      item.appendChild(button);
      fileList.appendChild(item);
    });

    setMessage("Choose a PDF to open it in the workspace.");
  }

  async function listDropboxPdfs() {
    if (!dbx || isListingFiles || isOpeningFile) return;

    isListingFiles = true;
    openFileButton.disabled = true;
    openFileButton.textContent = "Loading PDFs...";
    fileList.hidden = false;
    fileList.replaceChildren();
    setMessage("Loading PDFs from Dropbox...");

    try {
      const files = await fetchAllPdfFiles();
      renderPdfFiles(files);
    } catch (error) {
      handleRequestError(error);
    } finally {
      isListingFiles = false;
      openFileButton.disabled = false;
      openFileButton.textContent = "Open File";
    }
  }

  async function openDropboxFile(file) {
    if (!dbx || isOpeningFile || !file || !file.path_lower) return;

    isOpeningFile = true;
    openFileButton.disabled = true;
    setMessage("Opening " + file.name + " from Dropbox...");

    try {
      const response = await dbx.filesDownload({ path: file.path_lower });
      const downloadedBlob = response && response.result && response.result.fileBlob;
      if (!(downloadedBlob instanceof Blob)) {
        throw new Error("Dropbox downloaded the file, but no PDF Blob was returned.");
      }

      activeFilePathLower = file.path_lower;
      activeFileName = file.name;
      activeSourcePdfBlob = downloadedBlob;
      editedPdfBlob = null;
      if (activeFileLabel) activeFileLabel.textContent = "Selected: " + activeFileName;
      updateSyncButton();

      // This in-memory path is intentionally the exact Dropbox path for overwrite.
      window.dispatchEvent(new CustomEvent("lux:dropbox-pdf-loaded", {
        detail: {
          pdfBlob: downloadedBlob,
          fileName: activeFileName,
          pathLower: activeFilePathLower
        }
      }));

      if (typeof window.loadPdfIntoViewer === "function") {
        await window.loadPdfIntoViewer(downloadedBlob, file.name);
      } else {
        await loadPdfIntoViewer(downloadedBlob, file.name);
      }

      setMessage(
        "Opened " + file.name + ". Sync will overwrite this Dropbox path only after the editor supplies an edited PDF Blob.",
        "success"
      );
    } catch (error) {
      handleRequestError(error);
    } finally {
      isOpeningFile = false;
      openFileButton.disabled = false;
      updateSyncButton();
    }
  }

  async function loadPdfIntoViewer(pdfBlob, fileName) {
    if (window.LuxPdfViewer && typeof window.LuxPdfViewer.loadPdf === "function") {
      await window.LuxPdfViewer.loadPdf(pdfBlob, fileName);
      return;
    }

    if (!workspace) return;
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = URL.createObjectURL(pdfBlob);
    workspace.replaceChildren();

    const heading = document.createElement("div");
    heading.className = "pdf-preview-heading";
    heading.textContent = fileName;

    const note = document.createElement("p");
    note.className = "pdf-preview-note";
    note.textContent =
      "Browser preview only: PDF editing/export is not connected in this project build. Sync will not overwrite the source until an edited PDF Blob is provided.";

    const frame = document.createElement("iframe");
    frame.className = "pdf-preview-frame";
    frame.title = "PDF preview: " + fileName;
    frame.src = previewObjectUrl;

    workspace.append(heading, note, frame);
  }

  if (typeof window.loadPdfIntoViewer !== "function") {
    window.loadPdfIntoViewer = loadPdfIntoViewer;
  }

  async function getEditedPdfBlob() {
    // The future editor may expose exportPdf(); otherwise it can call setEditedPdfBlob().
    if (window.LuxPdfViewer && typeof window.LuxPdfViewer.exportPdf === "function") {
      const exported = await window.LuxPdfViewer.exportPdf();
      if (exported instanceof Blob) return exported;
      throw new Error("The PDF editor export did not return a Blob. No Dropbox file was changed.");
    }

    if (editedPdfBlob instanceof Blob) return editedPdfBlob;

    throw new Error(
      "The current workspace only previews PDFs; its editing/export hook is not connected yet. " +
      "No Dropbox file was overwritten. Connect your editor through LuxDropboxIntegration.setEditedPdfBlob(blob)."
    );
  }

  async function syncToDropbox() {
    if (!dbx || !activeFilePathLower || isSyncing) return;

    isSyncing = true;
    syncButton.textContent = "Syncing...";
    syncButton.disabled = true;
    setMessage("Syncing changes to Dropbox...");

    try {
      const blobToUpload = await getEditedPdfBlob();
      if (!(blobToUpload instanceof Blob)) {
        throw new Error("The PDF editor did not provide a Blob. No Dropbox file was changed.");
      }

      await dbx.filesUpload({
        path: activeFilePathLower,
        contents: blobToUpload,
        mode: { ".tag": "overwrite" }
      });

      editedPdfBlob = blobToUpload;
      syncButton.textContent = "Saved!";
      setMessage("Saved! Replaced " + activeFileName + " at its original Dropbox path.", "success");
      window.setTimeout(function () {
        if (!isSyncing && syncButton.textContent === "Saved!") {
          syncButton.textContent = "Sync to Dropbox";
        }
      }, 2200);
    } catch (error) {
      handleRequestError(error);
      syncButton.textContent = "Sync to Dropbox";
    } finally {
      isSyncing = false;
      updateSyncButton();
    }
  }

  // Public bridge for the PDF editor: call this with its newly exported/annotated PDF Blob.
  window.LuxDropboxIntegration = {
    setEditedPdfBlob: function (blob) {
      if (!(blob instanceof Blob)) {
        throw new TypeError("setEditedPdfBlob expects a Blob returned by the PDF editor.");
      }
      editedPdfBlob = blob;
      setMessage("Edited PDF ready to sync to Dropbox.");
      updateSyncButton();
    },
    clearEditedPdfBlob: function () {
      editedPdfBlob = null;
      setMessage("Editor changes cleared; no updated PDF is ready to sync.");
    },
    getActiveFile: function () {
      if (!activeFilePathLower) return null;
      return {
        fileName: activeFileName,
        pathLower: activeFilePathLower,
        sourceBlob: activeSourcePdfBlob
      };
    }
  };

  if (connectButton) connectButton.addEventListener("click", connectDropbox);
  if (openFileButton) openFileButton.addEventListener("click", listDropboxPdfs);
  if (syncButton) syncButton.addEventListener("click", syncToDropbox);

  async function initialize() {
    setConnectedUi(false);
    try {
      const callbackHandled = await handleOAuthCallback();
      if (!callbackHandled) restoreSession();
    } catch (error) {
      setMessage("Dropbox setup error: " + errorMessage(error), "error");
    }
  }

  initialize();
})();
