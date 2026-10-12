/* Lux PDF Viewer — Dropbox Bring Your Own Cloud integration.
 * Browser-only OAuth uses authorization-code + PKCE. Never add an app secret here.
 * The PDF editor must supply an exported Blob before Sync can overwrite a source file.
 */
(function () {
  "use strict";

  const DROPBOX_APP_KEY = "8vfyy6u50amp4py";
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
  const dropboxButton = document.querySelector("#dropbox-connect");
  const syncButton = document.querySelector("#dropbox-sync");
  const statusText = document.querySelector("#dropbox-status-text");
  const modal = document.querySelector("#dropbox-modal");
  const modalCloseButton = document.querySelector("#dropbox-modal-close");
  const modalStatus = document.querySelector("#dropbox-modal-status");
  const modalLoading = document.querySelector("#dropbox-modal-loading");
  const modalFileList = document.querySelector("#dropbox-modal-file-list");
  const accessibleStatus = document.querySelector("#dropbox-accessible-status");
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
  let lastFocusedElement = null;
  let syncFeedbackTimer = null;

  function setStatus(text, kind) {
    if (modalStatus) {
      modalStatus.textContent = text;
      if (kind) modalStatus.dataset.kind = kind;
      else delete modalStatus.dataset.kind;
    }
    if (accessibleStatus) accessibleStatus.textContent = text;
  }

  function setConnectionStatus(state) {
    const labels = {
      "not-connected": "Not connected",
      "connected": "Connected",
      "connection-failed": "Connection failed",
      "uploading": "Uploading",
      "saved": "Saved"
    };
    if (!statusText) return;
    statusText.dataset.state = labels[state] ? state : "not-connected";
    statusText.textContent = labels[state] || labels["not-connected"];
  }

  function setModalLoading(isLoading) {
    if (modalLoading) modalLoading.hidden = !isLoading;
    if (modalFileList && isLoading) {
      modalFileList.replaceChildren();
      modalFileList.hidden = true;
    }
  }

  function setModalOpen(isOpen) {
    if (!modal) return;

    if (isOpen) {
      lastFocusedElement = document.activeElement;
      modal.hidden = false;
      document.body.classList.add("dropbox-modal-open");
      window.requestAnimationFrame(function () {
        modalCloseButton?.focus();
      });
      return;
    }

    modal.hidden = true;
    document.body.classList.remove("dropbox-modal-open");
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
    } else {
      dropboxButton?.focus();
    }
  }

  function updateSyncButton() {
    if (!syncButton) return;

    // Sync only exists visually once a Dropbox PDF has successfully opened.
    syncButton.hidden = !dbx || !activeFilePathLower;
    syncButton.disabled = !dbx || !activeFilePathLower || isSyncing;
    if (!isSyncing && syncButton.textContent === "Syncing...") {
      syncButton.textContent = "Sync";
    }
  }

  function clearSessionCredentials(status = "not-connected") {
    try {
      sessionStorage.removeItem(STORAGE.accessToken);
      sessionStorage.removeItem(STORAGE.expiresAt);
      sessionStorage.removeItem(STORAGE.codeVerifier);
      sessionStorage.removeItem(STORAGE.oauthState);
    } catch (_) {
      // Ignore storage cleanup failures; the in-memory client is still cleared.
    }

    dbx = null;
    activeFilePathLower = null;
    activeFileName = null;
    activeSourcePdfBlob = null;
    editedPdfBlob = null;
    setConnectionStatus(status);
    updateSyncButton();
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
    if (!DROPBOX_APP_KEY || DROPBOX_APP_KEY === "YOUR_DROPBOX_APP_KEY") {
      setModalOpen(true);
      setConnectionStatus("connection-failed");
      setStatus("Setup needed: add your Dropbox App Key in dropbox-integration.js.", "error");
      return;
    }

    if (!sdkAvailable()) {
      setModalOpen(true);
      setConnectionStatus("connection-failed");
      setConnectionStatus("connection-failed");
      setStatus("The Dropbox SDK could not be loaded. Refresh the page and try again.", "error");
      return;
    }

    if (!window.crypto || !window.crypto.subtle || !window.crypto.getRandomValues) {
      setModalOpen(true);
      setConnectionStatus("connection-failed");
      setStatus("This browser does not provide the Web Crypto API required by Dropbox PKCE.", "error");
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

      sessionStorage.setItem(STORAGE.codeVerifier, auth.getCodeVerifier());
      sessionStorage.setItem(STORAGE.oauthState, state);
      setStatus("Redirecting to Dropbox to connect your account…");
      window.location.assign(authUrl);
    } catch (error) {
      setModalOpen(true);
      setConnectionStatus("connection-failed");
      setStatus("Could not start Dropbox authorization: " + errorMessage(error), "error");
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
      setModalOpen(true);
      setConnectionStatus("connection-failed");
      setStatus("Dropbox authorization was not completed: " + oauthError, "error");
      return true;
    }

    let expectedState;
    let verifier;
    try {
      expectedState = sessionStorage.getItem(STORAGE.oauthState);
      verifier = sessionStorage.getItem(STORAGE.codeVerifier);
    } catch (_) {
      setModalOpen(true);
      setConnectionStatus("connection-failed");
      setStatus("This browser could not read the temporary OAuth session. Please connect again.", "error");
      return true;
    }

    if (!returnedState || !expectedState || returnedState !== expectedState || !verifier) {
      sessionStorage.removeItem(STORAGE.codeVerifier);
      sessionStorage.removeItem(STORAGE.oauthState);
      setModalOpen(true);
      setConnectionStatus("connection-failed");
      setStatus("Dropbox sign-in could not be verified. Please connect again.", "error");
      return true;
    }

    if (!sdkAvailable()) {
      setModalOpen(true);
      setConnectionStatus("connection-failed");
      setStatus("The Dropbox SDK could not be loaded while completing sign-in.", "error");
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
      setModalOpen(true);
      setStatus("Connected. Loading your Dropbox PDFs…");
      await listDropboxPdfs();
      return true;
    } catch (error) {
      sessionStorage.removeItem(STORAGE.codeVerifier);
      sessionStorage.removeItem(STORAGE.oauthState);
      setModalOpen(true);
      setConnectionStatus("connection-failed");
      setStatus("Could not complete Dropbox sign-in: " + errorMessage(error), "error");
      return true;
    }
  }

  function initializeClient(accessToken) {
    dbx = new window.Dropbox.Dropbox({ accessToken: accessToken });
    setConnectionStatus("connected");
    updateSyncButton();
  }

  function restoreSession() {
    let token;
    let expiresAt;

    try {
      token = sessionStorage.getItem(STORAGE.accessToken);
      expiresAt = Number(sessionStorage.getItem(STORAGE.expiresAt));
    } catch (_) {
      setConnectionStatus("connection-failed");
      setStatus("Session storage is unavailable. Enable it to connect Dropbox in this tab.", "error");
      return;
    }

    if (!token || !expiresAt || expiresAt <= Date.now() + 15000) {
      if (token) clearSessionCredentials();
      updateSyncButton();
      return;
    }

    if (!sdkAvailable()) {
      setConnectionStatus("connection-failed");
      setConnectionStatus("connection-failed");
      setStatus("The Dropbox SDK could not be loaded. Refresh the page and try again.", "error");
      return;
    }

    initializeClient(token);
  }

  function errorMessage(error) {
    if (error && error.error && error.error.error_summary) return error.error.error_summary;
    if (error && error.message) return error.message;
    return String(error || "Unknown error");
  }

  function handleRequestError(error) {
    setConnectionStatus("connection-failed");
    if (error && (error.status === 401 || error.status === 400)) {
      clearSessionCredentials("connection-failed");
      setStatus("Your Dropbox session may have expired. Click Dropbox to connect again.", "error");
    } else {
      setStatus("Dropbox request failed: " + errorMessage(error), "error");
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

  function makePdfIcon() {
    const wrapper = document.createElement("span");
    wrapper.className = "dropbox-file-icon";
    wrapper.setAttribute("aria-hidden", "true");
    wrapper.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 2.75h8l4 4V21H6z"/><path d="M14 2.75v4h4M8.5 13h7M8.5 16.5h7"/></svg>';
    return wrapper;
  }

  function renderPdfFiles(files) {
    if (!modalFileList) return;
    modalFileList.replaceChildren();
    modalFileList.hidden = files.length === 0;

    if (!files.length) {
      setStatus("No PDF files were found in your Dropbox account.");
      return;
    }

    files.forEach(function (file) {
      const item = document.createElement("li");
      item.className = "dropbox-modal-file-item";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "dropbox-file-button";
      button.title = file.path_display || file.path_lower;
      button.appendChild(makePdfIcon());

      const copy = document.createElement("span");
      copy.className = "dropbox-file-copy";

      const name = document.createElement("span");
      name.className = "dropbox-file-name";
      name.textContent = file.name;

      const path = document.createElement("span");
      path.className = "dropbox-file-path";
      path.textContent = file.path_display || file.path_lower;

      copy.append(name, path);

      const arrow = document.createElement("span");
      arrow.className = "dropbox-file-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "›";

      button.append(copy, arrow);
      button.addEventListener("click", function () {
        openDropboxFile(file);
      });

      item.appendChild(button);
      modalFileList.appendChild(item);
    });

    setStatus(files.length + (files.length === 1 ? " PDF found." : " PDFs found.") + " Select a file to open it.");
  }

  async function openDropboxPicker() {
    if (!dbx) {
      await connectDropbox();
      return;
    }
    setModalOpen(true);
    await listDropboxPdfs();
  }

  async function listDropboxPdfs() {
    if (!dbx || isListingFiles || isOpeningFile) return;

    isListingFiles = true;
    setStatus("Loading PDFs from Dropbox…");
    setModalLoading(true);

    try {
      const files = await fetchAllPdfFiles();
      setModalLoading(false);
      renderPdfFiles(files);
    } catch (error) {
      setModalLoading(false);
      handleRequestError(error);
    } finally {
      isListingFiles = false;
    }
  }

  async function openDropboxFile(file) {
    if (!dbx || isOpeningFile || !file || !file.path_lower) return;

    // Clear any previous source before starting the new selection's download.
    activeFilePathLower = null;
    activeFileName = null;
    activeSourcePdfBlob = null;
    editedPdfBlob = null;
    updateSyncButton();

    // The requested behavior is to close the picker as soon as a row is chosen.
    setModalOpen(false);
    isOpeningFile = true;

    try {
      setStatus("Opening " + file.name + "…");
      const response = await dbx.filesDownload({ path: file.path_lower });
      const downloadedBlob = response && response.result && response.result.fileBlob;

      if (!(downloadedBlob instanceof Blob)) {
        throw new Error("Dropbox downloaded the file, but no PDF Blob was returned.");
      }

      activeFilePathLower = file.path_lower;
      activeFileName = file.name;
      activeSourcePdfBlob = downloadedBlob;
      editedPdfBlob = null;
      updateSyncButton();

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

      setStatus("Opened " + file.name + ".");
      if (syncButton) {
        syncButton.title = "Sync changes to " + file.name + " in Dropbox";
        syncButton.textContent = "Sync";
      }
    } catch (error) {
      handleRequestError(error);
      setModalOpen(true);
    } finally {
      isOpeningFile = false;
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
    if (syncFeedbackTimer) window.clearTimeout(syncFeedbackTimer);
    syncButton.textContent = "Syncing...";
    syncButton.title = "Syncing PDF to Dropbox";
    syncButton.disabled = true;
    setStatus("Preparing PDF to sync…");

    try {
      const blobToUpload = await getEditedPdfBlob();
      if (!(blobToUpload instanceof Blob)) {
        throw new Error("The PDF editor did not provide a Blob. No Dropbox file was changed.");
      }

      setConnectionStatus("uploading");
      setStatus("Uploading changes to Dropbox…");
      await dbx.filesUpload({
        path: activeFilePathLower,
        contents: blobToUpload,
        mode: { ".tag": "overwrite" }
      });

      editedPdfBlob = blobToUpload;
      setConnectionStatus("saved");
      syncButton.textContent = "Saved!";
      syncButton.title = "Saved to Dropbox";
      setStatus("Saved! Replaced " + activeFileName + " at its original Dropbox path.", "success");
      syncFeedbackTimer = window.setTimeout(function () {
        if (!isSyncing && syncButton.textContent === "Saved!") {
          syncButton.textContent = "Sync";
          syncButton.title = "Sync changes to " + activeFileName + " in Dropbox";
          setConnectionStatus(dbx ? "connected" : "not-connected");
        }
      }, 2200);
    } catch (error) {
      const detail = errorMessage(error);
      const isDropboxRequestFailure = Boolean(error && (typeof error.status === "number" || error.error));
      if (isDropboxRequestFailure) {
        handleRequestError(error);
      } else {
        // A missing editor export is not a Dropbox connection failure.
        setConnectionStatus(dbx ? "connected" : "not-connected");
        setStatus("Sync unavailable: " + detail, "error");
      }

      syncButton.textContent = isDropboxRequestFailure ? "Retry Sync" : "No edits";
      syncButton.title = detail;
      syncFeedbackTimer = window.setTimeout(function () {
        if (!isSyncing && (syncButton.textContent === "Retry Sync" || syncButton.textContent === "No edits")) {
          syncButton.textContent = "Sync";
          syncButton.title = activeFileName ? "Sync changes to " + activeFileName + " in Dropbox" : "Sync";
        }
      }, 3500);
    } finally {
      isSyncing = false;
      updateSyncButton();
    }
  }

  window.LuxDropboxIntegration = {
    setEditedPdfBlob: function (blob) {
      if (!(blob instanceof Blob)) {
        throw new TypeError("setEditedPdfBlob expects a Blob returned by the PDF editor.");
      }
      editedPdfBlob = blob;
      setStatus("Edited PDF is ready to sync.");
      updateSyncButton();
    },
    clearEditedPdfBlob: function () {
      editedPdfBlob = null;
      setStatus("Editor changes cleared; no updated PDF is ready to sync.");
    },
    getActiveFile: function () {
      if (!activeFilePathLower) return null;
      return {
        fileName: activeFileName,
        pathLower: activeFilePathLower,
        sourceBlob: activeSourcePdfBlob
      };
    },
    openPicker: openDropboxPicker
  };

  dropboxButton?.addEventListener("click", openDropboxPicker);
  syncButton?.addEventListener("click", syncToDropbox);
  modalCloseButton?.addEventListener("click", function () {
    setModalOpen(false);
  });
  modal?.querySelectorAll("[data-dropbox-modal-close]").forEach(function (element) {
    element.addEventListener("click", function () {
      setModalOpen(false);
    });
  });
  modal?.addEventListener("click", function (event) {
    if (event.target === modal) setModalOpen(false);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && modal && !modal.hidden) {
      setModalOpen(false);
    }
  });

  async function initialize() {
    setConnectionStatus("not-connected");
    updateSyncButton();
    try {
      const callbackHandled = await handleOAuthCallback();
      if (!callbackHandled) restoreSession();
    } catch (error) {
      setConnectionStatus("connection-failed");
      setModalOpen(true);
      setStatus("Dropbox setup error: " + errorMessage(error), "error");
    }
  }

  initialize();
})();
