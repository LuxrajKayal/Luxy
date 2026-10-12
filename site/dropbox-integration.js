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
  const SUPPORTED_FILE_EXTENSIONS = new Set([
    ".pdf", ".md", ".jpg", ".jpeg", ".png", ".svg", ".webp", ".gif"
  ]);

  const STORAGE = {
    accessToken: "lux-dropbox-access-token",
    expiresAt: "lux-dropbox-access-token-expires-at",
    codeVerifier: "lux-dropbox-code-verifier",
    oauthState: "lux-dropbox-oauth-state"
  };

  const redirectUri = window.location.origin + window.location.pathname;
  const dropboxButton = document.querySelector("#dropbox-connect");
  const syncButton = document.querySelector("#dropbox-sync");
  const accountToggle = document.querySelector("#dropbox-account-toggle");
  const accountMenu = document.querySelector("#dropbox-account-menu");
  const accountMenuDescription = document.querySelector("#dropbox-account-menu-description");
  const menuConnectButton = document.querySelector("#dropbox-menu-connect");
  const menuDisconnectButton = document.querySelector("#dropbox-menu-disconnect");
  const disconnectConfirmation = document.querySelector("#dropbox-disconnect-confirmation");
  const disconnectCancelButton = document.querySelector("#dropbox-disconnect-cancel");
  const disconnectConfirmButton = document.querySelector("#dropbox-disconnect-confirm");
  const accountFeedback = document.querySelector("#dropbox-account-feedback");
  const statusText = document.querySelector("#dropbox-status-text");
  const modal = document.querySelector("#dropbox-modal");
  const modalCloseButton = document.querySelector("#dropbox-modal-close");
  const modalStatus = document.querySelector("#dropbox-modal-status");
  const modalLoading = document.querySelector("#dropbox-modal-loading");
  const modalLoadingText = document.querySelector("#dropbox-modal-loading-text");
  const modalFileList = document.querySelector("#dropbox-modal-file-list");
  const modalSelectButton = document.querySelector("#dropbox-modal-select");
  const modalCancelButton = document.querySelector("#dropbox-modal-cancel");
  const accessibleStatus = document.querySelector("#dropbox-accessible-status");
  const workspace = document.querySelector(".workspace");

  let dbx = null;
  let activeFilePathLower = null;
  let activeFileName = null;
  let activeFileKind = null;
  let activeSourcePdfBlob = null;
  let selectedDropboxFile = null;
  let selectedDropboxButton = null;
  let editedPdfBlob = null;
  let previewObjectUrl = null;
  let isListingFiles = false;
  let isOpeningFile = false;
  let isSyncing = false;
  let lastFocusedElement = null;
  let syncFeedbackTimer = null;
  let isDisconnecting = false;

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
    const normalizedState = labels[state] ? state : "not-connected";
    if (statusText) {
      statusText.dataset.state = normalizedState;
      statusText.textContent = labels[normalizedState];
    }
    if (accountToggle) {
      accountToggle.setAttribute("aria-label", "Dropbox account: " + labels[normalizedState]);
      accountToggle.title = "Dropbox account: " + labels[normalizedState];
    }

    if (accountMenuDescription) {
      if (dbx && (normalizedState === "connected" || normalizedState === "saved" || normalizedState === "uploading")) {
        accountMenuDescription.textContent = "Your Dropbox account is connected to Lux PDF Viewer.";
      } else if (normalizedState === "connection-failed") {
        accountMenuDescription.textContent = dbx
          ? "The last Dropbox request failed. You can disconnect this session or try again."
          : "Dropbox could not connect. Try connecting again.";
      } else {
        accountMenuDescription.textContent = "Connect your Dropbox account to browse and open supported files.";
      }
    }

    if (menuConnectButton) menuConnectButton.hidden = Boolean(dbx);
    if (menuDisconnectButton) menuDisconnectButton.hidden = !dbx;
  }

  function setAccountFeedback(text, kind) {
    if (!accountFeedback) return;
    accountFeedback.textContent = text || "";
    accountFeedback.hidden = !text;
    if (kind) accountFeedback.dataset.kind = kind;
    else delete accountFeedback.dataset.kind;
  }

  function setAccountMenuOpen(isOpen) {
    if (!accountMenu || !accountToggle) return;
    accountMenu.hidden = !isOpen;
    accountToggle.setAttribute("aria-expanded", String(isOpen));
    if (!isOpen) {
      if (disconnectConfirmation) disconnectConfirmation.hidden = true;
      if (menuDisconnectButton) menuDisconnectButton.hidden = !dbx;
      if (disconnectConfirmButton) {
        disconnectConfirmButton.disabled = false;
        disconnectConfirmButton.textContent = "Disconnect";
      }
      if (disconnectCancelButton) disconnectCancelButton.disabled = false;
    } else {
      setAccountFeedback("", "");
      if (disconnectConfirmation) disconnectConfirmation.hidden = true;
      if (menuDisconnectButton) menuDisconnectButton.hidden = !dbx;
      window.requestAnimationFrame(function () {
        (dbx ? menuDisconnectButton : menuConnectButton)?.focus();
      });
    }
  }

  function updateModalSelectButton() {
    if (modalSelectButton) {
      modalSelectButton.disabled = !dbx || !selectedDropboxFile || isListingFiles || isOpeningFile;
    }
    if (modalCancelButton) modalCancelButton.disabled = isOpeningFile;
    if (modalCloseButton) modalCloseButton.disabled = isOpeningFile;
  }

  function clearDropboxSelection() {
    if (selectedDropboxButton) {
      selectedDropboxButton.classList.remove("selected");
      selectedDropboxButton.setAttribute("aria-pressed", "false");
    }
    selectedDropboxFile = null;
    selectedDropboxButton = null;
    updateModalSelectButton();
  }

  function setModalLoading(isLoading) {
    if (modalLoading) modalLoading.hidden = !isLoading;
    updateModalSelectButton();
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
    setModalLoading(false);
    clearDropboxSelection();
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
      lastFocusedElement.focus();
    } else {
      dropboxButton?.focus();
    }
  }

  function updateSyncButton() {
    if (!syncButton) return;

    // Dropbox overwrite sync remains available only for a successfully opened PDF.
    const canSyncActivePdf = Boolean(dbx && activeFilePathLower && activeFileKind === "pdf");
    syncButton.hidden = !canSyncActivePdf;
    syncButton.disabled = !canSyncActivePdf || isSyncing || isOpeningFile;
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
    activeFileKind = null;
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
    setConnectionStatus("not-connected");
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

  function getDropboxFileExtension(fileName) {
    const lowerName = String(fileName || "").toLowerCase();
    const lastDot = lowerName.lastIndexOf(".");
    return lastDot >= 0 ? lowerName.slice(lastDot) : "";
  }

  function getDropboxFileKind(fileName) {
    const extension = getDropboxFileExtension(fileName);
    if (extension === ".pdf") return "pdf";
    if (extension === ".md") return "markdown";
    return "image";
  }

  function getDropboxFileTypeLabel(fileName) {
    const kind = getDropboxFileKind(fileName);
    if (kind === "pdf") return "PDF document";
    if (kind === "markdown") return "Markdown document";
    return "Image";
  }

  async function fetchAllSupportedFiles() {
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
          SUPPORTED_FILE_EXTENSIONS.has(getDropboxFileExtension(entry.name)) &&
          typeof entry.path_lower === "string";
      })
      .sort(function (a, b) {
        return a.path_lower.localeCompare(b.path_lower);
      });
  }

  function makeDropboxFileIcon(file) {
    const kind = getDropboxFileKind(file.name);
    const wrapper = document.createElement("span");
    wrapper.className = "dropbox-file-icon";
    wrapper.dataset.kind = kind === "image" ? "image" : "document";
    wrapper.setAttribute("aria-hidden", "true");

    if (kind === "image") {
      wrapper.innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m4 17 5-5 3.5 3.5 2.5-2.5 5 5"/></svg>';
    } else {
      wrapper.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 2.75h8l4 4V21H6z"/><path d="M14 2.75v4h4M8.5 13h7M8.5 16.5h7"/></svg>';
    }
    return wrapper;
  }

  function selectDropboxFile(file, button) {
    if (!file || !button || isOpeningFile || isListingFiles) return;

    if (selectedDropboxButton && selectedDropboxButton !== button) {
      selectedDropboxButton.classList.remove("selected");
      selectedDropboxButton.setAttribute("aria-pressed", "false");
    }

    selectedDropboxFile = file;
    selectedDropboxButton = button;
    button.classList.add("selected");
    button.setAttribute("aria-pressed", "true");
    updateModalSelectButton();
    setStatus("Selected " + file.name + ". Choose Select File to open it.");
  }

  function renderSupportedFiles(files) {
    if (!modalFileList) return;
    modalFileList.replaceChildren();
    modalFileList.hidden = files.length === 0;
    clearDropboxSelection();

    if (!files.length) {
      setStatus("No supported files were found. Supported types: PDF, Markdown, JPG, PNG, SVG, WEBP and GIF.");
      return;
    }

    files.forEach(function (file) {
      const item = document.createElement("li");
      item.className = "dropbox-modal-file-item";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "dropbox-file-button";
      button.title = file.path_display || file.path_lower;
      button.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-label", "Select " + file.name);
      button.appendChild(makeDropboxFileIcon(file));

      const copy = document.createElement("span");
      copy.className = "dropbox-file-copy";

      const name = document.createElement("span");
      name.className = "dropbox-file-name";
      name.textContent = file.name;

      const path = document.createElement("span");
      path.className = "dropbox-file-path";
      path.textContent = (file.path_display || file.path_lower) + " · " + getDropboxFileTypeLabel(file.name);

      copy.append(name, path);

      const arrow = document.createElement("span");
      arrow.className = "dropbox-file-arrow";
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "›";

      button.append(copy, arrow);
      button.addEventListener("click", function () {
        selectDropboxFile(file, button);
      });

      item.appendChild(button);
      modalFileList.appendChild(item);
    });

    setStatus(files.length + (files.length === 1 ? " supported file found." : " supported files found.") +
      " Select one file, then choose Select File.");
  }

  async function openDropboxPicker() {
    if (!dbx) {
      await connectDropbox();
      return;
    }
    setModalOpen(true);
    await listDropboxSupportedFiles();
  }

  async function listDropboxSupportedFiles() {
    if (!dbx || isListingFiles || isOpeningFile) return;

    isListingFiles = true;
    clearDropboxSelection();
    if (modalFileList) {
      modalFileList.replaceChildren();
      modalFileList.hidden = true;
    }
    if (modalLoadingText) modalLoadingText.textContent = "Loading supported files from Dropbox…";
    setStatus("Loading supported files from Dropbox…");
    setModalLoading(true);

    try {
      const files = await fetchAllSupportedFiles();
      renderSupportedFiles(files);
    } catch (error) {
      handleRequestError(error);
    } finally {
      isListingFiles = false;
      setModalLoading(false);
      updateModalSelectButton();
    }
  }

  async function openSelectedDropboxFile() {
    const file = selectedDropboxFile;
    if (!dbx || isOpeningFile || isListingFiles || !file || !file.path_lower) return;

    isOpeningFile = true;
    updateModalSelectButton();
    updateSyncButton();
    if (modalLoadingText) modalLoadingText.textContent = "Downloading selected file…";
    setStatus("Opening " + file.name + "…");
    setModalLoading(true);

    try {
      const response = await dbx.filesDownload({ path: file.path_lower });
      const downloadedBlob = response && response.result && response.result.fileBlob;

      if (!(downloadedBlob instanceof Blob)) {
        throw new Error("Dropbox downloaded the file, but no file Blob was returned.");
      }

      const fileKind = getDropboxFileKind(file.name);
      activeFilePathLower = file.path_lower;
      activeFileName = file.name;
      activeFileKind = fileKind;
      activeSourcePdfBlob = fileKind === "pdf" ? downloadedBlob : null;
      editedPdfBlob = null;
      updateSyncButton();

      if (fileKind === "pdf") {
        window.dispatchEvent(new CustomEvent("lux:dropbox-pdf-loaded", {
          detail: {
            pdfBlob: downloadedBlob,
            fileName: activeFileName,
            pathLower: activeFilePathLower
          }
        }));
      } else {
        window.dispatchEvent(new CustomEvent("lux:dropbox-file-loaded", {
          detail: {
            fileBlob: downloadedBlob,
            fileName: activeFileName,
            fileKind: activeFileKind,
            pathLower: activeFilePathLower
          }
        }));
      }

      if (typeof window.loadPdfIntoViewer === "function") {
        await window.loadPdfIntoViewer(downloadedBlob, file.name);
      } else {
        await loadPdfIntoViewer(downloadedBlob, file.name);
      }

      setStatus("Opened " + file.name + ".");
      if (syncButton && fileKind === "pdf") {
        syncButton.title = "Sync changes to " + file.name + " in Dropbox";
        syncButton.textContent = "Sync";
      }
      setModalLoading(false);
      setModalOpen(false);
    } catch (error) {
      setModalLoading(false);
      handleRequestError(error);
    } finally {
      isOpeningFile = false;
      updateModalSelectButton();
      updateSyncButton();
    }
  }

  async function loadPdfIntoViewer(fileBlob, fileName) {
    const fileKind = getDropboxFileKind(fileName);
    if (fileKind === "pdf" && window.LuxPdfViewer && typeof window.LuxPdfViewer.loadPdf === "function") {
      await window.LuxPdfViewer.loadPdf(fileBlob, fileName);
      return;
    }

    if (!workspace) return;

    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = URL.createObjectURL(fileBlob);
    workspace.replaceChildren();

    const heading = document.createElement("div");
    heading.className = "pdf-preview-heading";
    heading.textContent = fileName;

    if (fileKind === "image") {
      const image = document.createElement("img");
      image.className = "file-preview-image";
      image.alt = fileName;
      image.decoding = "async";
      image.src = previewObjectUrl;
      workspace.append(heading, image);
      return;
    }

    if (fileKind === "markdown") {
      const markdownPreview = document.createElement("pre");
      markdownPreview.className = "file-preview-markdown";
      markdownPreview.textContent = await fileBlob.text();
      workspace.append(heading, markdownPreview);
      return;
    }

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
    if (!dbx || !activeFilePathLower || activeFileKind !== "pdf" || isSyncing) return;

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
    discardActiveFile: function () {
      if (isOpeningFile || isSyncing) {
        setStatus("Wait for the current Dropbox operation to finish before discarding the document.", "error");
        return false;
      }

      if (syncFeedbackTimer) {
        window.clearTimeout(syncFeedbackTimer);
        syncFeedbackTimer = null;
      }
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
      }

      activeFilePathLower = null;
      activeFileName = null;
      activeFileKind = null;
      activeSourcePdfBlob = null;
      editedPdfBlob = null;
      updateSyncButton();
      setConnectionStatus(dbx ? "connected" : "not-connected");
      setStatus("Document discarded.");
      window.dispatchEvent(new CustomEvent("lux:dropbox-document-discarded"));
      return true;
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

  accountToggle?.addEventListener("click", function (event) {
    event.stopPropagation();
    setAccountMenuOpen(Boolean(accountMenu && accountMenu.hidden));
  });

  accountMenu?.addEventListener("click", function (event) {
    event.stopPropagation();
  });

  menuConnectButton?.addEventListener("click", async function () {
    setAccountMenuOpen(false);
    await openDropboxPicker();
  });

  menuDisconnectButton?.addEventListener("click", function () {
    if (!dbx || isDisconnecting) return;
    setAccountFeedback("", "");
    if (disconnectConfirmation) disconnectConfirmation.hidden = false;
    menuDisconnectButton.hidden = true;
    disconnectConfirmButton?.focus();
  });

  disconnectCancelButton?.addEventListener("click", function () {
    if (disconnectConfirmation) disconnectConfirmation.hidden = true;
    if (menuDisconnectButton) menuDisconnectButton.hidden = !dbx;
    setAccountFeedback("", "");
    menuDisconnectButton?.focus();
  });

  disconnectConfirmButton?.addEventListener("click", async function () {
    if (isDisconnecting) return;
    isDisconnecting = true;
    disconnectConfirmButton.disabled = true;
    disconnectConfirmButton.textContent = "Disconnecting…";
    if (disconnectCancelButton) disconnectCancelButton.disabled = true;
    if (menuDisconnectButton) menuDisconnectButton.disabled = true;
    setAccountFeedback("Disconnecting Dropbox…", "");

    let tokenRevoked = false;
    try {
      if (dbx && typeof dbx.authTokenRevoke === "function") {
        await dbx.authTokenRevoke();
        tokenRevoked = true;
      }
    } catch (_) {
      // Always clear the browser session below, even if the revoke request fails.
    } finally {
      clearSessionCredentials("not-connected");
      isDisconnecting = false;
      if (disconnectConfirmation) disconnectConfirmation.hidden = true;
      if (menuDisconnectButton) {
        menuDisconnectButton.disabled = false;
        menuDisconnectButton.hidden = true;
      }
      if (disconnectCancelButton) disconnectCancelButton.disabled = false;
      if (disconnectConfirmButton) {
        disconnectConfirmButton.disabled = false;
        disconnectConfirmButton.textContent = "Disconnect";
      }

      if (tokenRevoked) {
        setAccountFeedback("Dropbox disconnected. Your session has been cleared and the access token was revoked.", "success");
      } else {
        setAccountFeedback("You are signed out of Luxy on this tab, but Dropbox could not confirm token revocation. To revoke access completely, remove Lux PDF Viewer from your Dropbox connected apps.", "error");
      }
    }
  });

  document.addEventListener("click", function (event) {
    if (
      accountMenu &&
      !accountMenu.hidden &&
      !accountMenu.contains(event.target) &&
      accountToggle &&
      !accountToggle.contains(event.target)
    ) {
      setAccountMenuOpen(false);
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && accountMenu && !accountMenu.hidden) {
      setAccountMenuOpen(false);
      accountToggle?.focus();
    }
  });
  modalCloseButton?.addEventListener("click", function () {
    setModalOpen(false);
  });
  modalSelectButton?.addEventListener("click", openSelectedDropboxFile);
  modalCancelButton?.addEventListener("click", function () {
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
