/*
 * Lux Omni — Dropbox UI integration.
 *
 * This module bridges the Dropbox API utilities to the website's topbar,
 * sidebar, file-manager modal, upload control, and viewport-routing buttons.
 *
 * Viewport rendering is intentionally left as an integration seam. The file
 * is downloaded and emitted as a custom event; connect the actual viewport
 * renderer in response to "lux:dropbox-viewport-assignment-request".
 */

import {
  beginAuthorization,
  handleOAuthCallback,
  checkConnection,
  listAllFolderEntries,
  uploadFile,
  downloadFile,
  saveEditedFile,
  revokeAccess,
  clearSession
} from "./dropbox-api.js";

const els = {
  topbarButton: document.querySelector("#dropbox-topbar-button"),
  statusIndicator: document.querySelector("#dropbox-status-indicator"),
  syncButton: document.querySelector("#dropbox-sync-button"),
  disconnectButton: document.querySelector("#dropbox-disconnect-button"),
  sidebarButton: document.querySelector("#dropbox-sidebar-button"),
  modal: document.querySelector("#dropbox-file-manager"),
  modalClose: document.querySelector("#dropbox-file-manager-close"),
  currentLocation: document.querySelector("#dropbox-current-location"),
  backButton: document.querySelector("#dropbox-folder-back"),
  uploadInput: document.querySelector("#dropbox-upload-input"),
  fileList: document.querySelector("#dropbox-file-list"),
  emptyState: document.querySelector("#dropbox-empty-state"),
  managerStatus: document.querySelector("#dropbox-file-manager-status"),
  selectionActions: document.querySelector("#dropbox-selection-actions"),
  selectedName: document.querySelector("#dropbox-selected-name"),
  addLeftButton: document.querySelector("#dropbox-add-left"),
  addRightButton: document.querySelector("#dropbox-add-right"),
  addFullButton: document.querySelector("#dropbox-add-full"),
  toast: document.querySelector("#dropbox-ui-toast")
};

const state = {
  isConnected: false,
  currentPath: "",
  selectedFile: null,
  activeSources: new Map(),
  latestRoutedViewport: null,
  previousFocus: null,
  browseRequestId: 0,
  isDisconnecting: false,
  isSyncing: false,
  toastTimer: null
};

const FOLDER_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"/></svg>';
const FILE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h8l4 4V20a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20Z"/><path d="M14 3.5V8h4M9 13h6M9 16.5h6"/></svg>';

function errorText(error) {
  return error?.errorSummary || error?.message || String(error || "Unknown error");
}

function setToast(message, kind = "info") {
  if (!els.toast) return;
  window.clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.dataset.kind = kind;
  els.toast.hidden = !message;
  if (message) {
    state.toastTimer = window.setTimeout(() => {
      els.toast.hidden = true;
    }, 6000);
  }
}

function setManagerStatus(message, kind = "info") {
  if (!els.managerStatus) return;
  els.managerStatus.textContent = message;
  els.managerStatus.dataset.kind = kind;
}

export function updateTopbarStatus(isConnected) {
  state.isConnected = Boolean(isConnected);

  if (els.statusIndicator) {
    els.statusIndicator.textContent = state.isConnected
      ? "Connected 🟢"
      : "Disconnected 🔴";
    els.statusIndicator.dataset.state = state.isConnected
      ? "connected"
      : "disconnected";
  }

  if (els.topbarButton) {
    els.topbarButton.setAttribute(
      "aria-label",
      state.isConnected ? "Dropbox connected — open files" : "Dropbox disconnected — connect"
    );
    els.topbarButton.title = state.isConnected
      ? "Dropbox connected. Click to browse files."
      : "Dropbox disconnected. Click to connect.";
  }

  if (els.syncButton) {
    els.syncButton.disabled = !state.isConnected || state.isSyncing;
  }
  if (els.disconnectButton) {
    els.disconnectButton.disabled = !state.isConnected || state.isDisconnecting;
  }
}

function cleanOAuthCallbackParameters() {
  const url = new URL(window.location.href);
  const keys = ["code", "state", "error", "error_description", "scope", "token_access_type"];
  let changed = false;
  for (const key of keys) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) {
    window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  }
}

async function refreshConnectionStatus({ notifyOnError = false } = {}) {
  try {
    const result = await checkConnection();
    updateTopbarStatus(Boolean(result?.connected));
    return Boolean(result?.connected);
  } catch (error) {
    updateTopbarStatus(false);
    if (notifyOnError) {
      setToast("Could not verify the Dropbox connection: " + errorText(error), "error");
    }
    return false;
  }
}

async function initializeDropboxUI() {
  const params = new URLSearchParams(window.location.search);
  const hasOAuthCallback =
    params.has("code") || params.has("error") || params.has("error_description");

  if (hasOAuthCallback) {
    let callbackError = null;
    try {
      await handleOAuthCallback();
    } catch (error) {
      callbackError = error;
    } finally {
      // handleOAuthCallback currently cleans the URL itself; this second,
      // idempotent cleanup ensures callback parameters never remain in the bar.
      cleanOAuthCallbackParameters();
    }

    const connected = await refreshConnectionStatus();
    if (callbackError) {
      setToast("Dropbox sign-in did not complete: " + errorText(callbackError), "error");
    } else if (!connected) {
      setToast("Dropbox sign-in returned, but the connection could not be verified.", "error");
    }
    return;
  }

  await refreshConnectionStatus();
}

function normalizePath(path) {
  if (!path || path === "/") return "";
  return String(path).replace(/\/+$/, "");
}

function getParentPath(path) {
  const normalized = normalizePath(path);
  if (!normalized) return "";
  const separatorIndex = normalized.lastIndexOf("/");
  return separatorIndex <= 0 ? "" : normalized.slice(0, separatorIndex);
}

function getEntryPath(entry) {
  return entry.path_display || entry.path_lower || "";
}

function getEntryKey(entry) {
  return entry.id || entry.path_lower || entry.path_display || entry.name;
}

function updateBackButton() {
  if (els.backButton) {
    els.backButton.disabled = !state.currentPath;
  }
}

function updateSelectionBar() {
  const selected = Boolean(state.selectedFile);
  if (els.selectionActions) els.selectionActions.hidden = !selected;
  if (els.selectedName) {
    els.selectedName.textContent = selected
      ? state.selectedFile.name || "Selected file"
      : "No file selected";
  }
}

function createFileRow(entry) {
  const isFolder = entry?.[".tag"] === "folder";
  const item = document.createElement("li");
  item.className = "dropbox-ui-file-item";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "dropbox-ui-file-row";
  button.dataset.entryKey = getEntryKey(entry);
  button.setAttribute("aria-pressed", "false");
  button.setAttribute("aria-label", (isFolder ? "Open folder " : "Select file ") + (entry.name || "unnamed item"));

  const icon = document.createElement("span");
  icon.className = "dropbox-ui-file-icon";
  icon.dataset.kind = isFolder ? "folder" : "file";
  icon.innerHTML = isFolder ? FOLDER_ICON : FILE_ICON;

  const copy = document.createElement("span");
  copy.className = "dropbox-ui-file-copy";

  const name = document.createElement("span");
  name.className = "dropbox-ui-file-name";
  name.textContent = entry.name || "Unnamed item";

  const meta = document.createElement("span");
  meta.className = "dropbox-ui-file-meta";
  meta.textContent = isFolder ? "Folder" : (entry.size != null ? formatBytes(entry.size) : "File");

  copy.append(name, meta);
  button.append(icon, copy);

  if (isFolder) {
    button.addEventListener("click", () => {
      void renderFileBrowser(getEntryPath(entry));
    });
  } else {
    button.addEventListener("click", () => selectFile(entry));
  }

  item.append(button);
  return item;
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value < 0) return "File";
  if (value < 1024) return value + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return size.toLocaleString(undefined, { maximumFractionDigits: 1 }) + " " + units[unitIndex];
}

function selectFile(entry) {
  state.selectedFile = entry;
  updateSelectionBar();

  if (els.fileList) {
    for (const button of els.fileList.querySelectorAll(".dropbox-ui-file-row")) {
      const isSelected = button.dataset.entryKey === getEntryKey(entry);
      button.setAttribute("aria-pressed", String(isSelected));
    }
  }

  setManagerStatus("Selected " + (entry.name || "file") + ". Choose a viewport below.");
}

export async function renderFileBrowser(path = "") {
  state.currentPath = normalizePath(path);
  state.selectedFile = null;
  updateSelectionBar();
  updateBackButton();

  if (els.currentLocation) {
    els.currentLocation.textContent = state.currentPath || "My Dropbox";
    els.currentLocation.title = state.currentPath || "My Dropbox";
  }
  if (els.fileList) els.fileList.replaceChildren();
  if (els.emptyState) els.emptyState.hidden = true;

  const requestId = ++state.browseRequestId;
  setManagerStatus("Loading folder…");

  try {
    // listAllFolderEntries starts with listFolder(path) and follows Dropbox
    // cursor pages so the user can browse folders with more than one page.
    const entries = await listAllFolderEntries({
      path: state.currentPath,
      recursive: false,
      limit: 1000
    });

    if (requestId !== state.browseRequestId) return;

    const sorted = [...entries].sort((a, b) => {
      const aFolder = a?.[".tag"] === "folder";
      const bFolder = b?.[".tag"] === "folder";
      if (aFolder !== bFolder) return aFolder ? -1 : 1;
      return String(a?.name || "").localeCompare(String(b?.name || ""));
    });

    if (els.fileList) {
      const fragment = document.createDocumentFragment();
      for (const entry of sorted) {
        // Dropbox may report deleted entries for some requests; don't display them.
        if (entry?.[".tag"] === "deleted") continue;
        fragment.append(createFileRow(entry));
      }
      els.fileList.append(fragment);
    }

    const isEmpty = !sorted.some(entry => entry?.[".tag"] !== "deleted");
    if (els.emptyState) els.emptyState.hidden = !isEmpty;
    setManagerStatus(
      isEmpty
        ? "This folder has no files or folders."
        : sorted.length + " item" + (sorted.length === 1 ? "" : "s") + " in this folder."
    );
  } catch (error) {
    if (requestId !== state.browseRequestId) return;
    if (els.fileList) els.fileList.replaceChildren();
    if (els.emptyState) els.emptyState.hidden = true;
    setManagerStatus("Could not load this folder: " + errorText(error), "error");
  }
}

export async function openFileManager() {
  if (!state.isConnected || !els.modal) return;
  state.previousFocus = document.activeElement;
  els.modal.hidden = false;
  document.body.classList.add("dropbox-ui-open");
  window.requestAnimationFrame(() => els.modalClose?.focus());
  await renderFileBrowser("");
}

export function closeFileManager() {
  if (!els.modal) return;
  els.modal.hidden = true;
  document.body.classList.remove("dropbox-ui-open");
  state.selectedFile = null;
  updateSelectionBar();
  if (state.previousFocus && typeof state.previousFocus.focus === "function") {
    state.previousFocus.focus();
  }
  state.previousFocus = null;
}

async function handleDropboxButtonClick() {
  if (state.isDisconnecting) return;
  try {
    const result = await checkConnection();
    updateTopbarStatus(Boolean(result?.connected));
    if (result?.connected) {
      await openFileManager();
    } else {
      await beginAuthorization();
    }
  } catch (error) {
    updateTopbarStatus(false);
    setToast("Could not check Dropbox. Please try again: " + errorText(error), "error");
  }
}

async function handleUploadChange() {
  const file = els.uploadInput?.files?.[0];
  if (!file) return;

  const folder = normalizePath(state.currentPath);
  const destination = (folder ? folder : "") + "/" + file.name;

  if (els.uploadInput) els.uploadInput.disabled = true;
  setManagerStatus("Uploading " + file.name + "…");
  try {
    const result = await uploadFile({
      path: destination,
      file,
      mode: "add",
      autorename: true
    });
    setManagerStatus("Uploaded " + (result?.name || file.name) + ".", "success");
    await renderFileBrowser(state.currentPath);
    setToast("Uploaded " + file.name + " to Dropbox.", "success");
  } catch (error) {
    setManagerStatus("Upload failed: " + errorText(error), "error");
  } finally {
    if (els.uploadInput) {
      els.uploadInput.disabled = false;
      els.uploadInput.value = "";
    }
  }
}

/**
 * Download the selected file and emit a routing event for the existing viewport
 * UI. Actual DOM injection stays deliberately unimplemented here.
 */
export async function loadFileIntoViewport(fileData, viewportType) {
  const allowedViewports = new Set(["left", "right", "full"]);
  if (!allowedViewports.has(viewportType)) {
    throw new TypeError('viewportType must be "left", "right", or "full".');
  }
  if (!fileData || fileData[".tag"] !== "file") {
    throw new TypeError("Select a file before assigning it to a viewport.");
  }

  setManagerStatus("Downloading " + (fileData.name || "file") + "…");
  try {
    const identifier = fileData.id
      ? "id:" + fileData.id
      : (fileData.path_lower || fileData.path_display);
    const downloaded = await downloadFile(identifier);
    const originalPath = fileData.path_display || fileData.path_lower;
    const source = {
      fileData,
      originalPath,
      originalRevision: downloaded.metadata?.rev || fileData.rev || null,
      viewportType
    };
    state.activeSources.set(viewportType, source);
    state.latestRoutedViewport = viewportType;

    const assignment = {
      fileData,
      blob: downloaded.blob,
      metadata: downloaded.metadata,
      originalPath,
      originalRevision: source.originalRevision,
      viewportType
    };

    // TODO: connect the actual viewport renderer here. The event is the bridge
    // contract: listen for "lux:dropbox-viewport-assignment-request" and mount
    // assignment.blob into assignment.viewportType using your existing viewport UI.
    window.dispatchEvent(new CustomEvent("lux:dropbox-viewport-assignment-request", {
      detail: assignment
    }));

    setManagerStatus(
      "Downloaded " + (fileData.name || "file") + " for the " +
      (viewportType === "full" ? "full" : viewportType) +
      " viewport. Viewport rendering is the remaining integration step.",
      "success"
    );
    return assignment;
  } catch (error) {
    setManagerStatus("Could not load file: " + errorText(error), "error");
    return null;
  }
}

export async function handleSync() {
  if (!state.isConnected) {
    setToast("Connect Dropbox before syncing.", "error");
    return;
  }

  const viewportType = state.latestRoutedViewport;
  const source = viewportType ? state.activeSources.get(viewportType) : null;
  if (!source) {
    setToast("Choose a Dropbox file and assign it to a viewport before syncing.", "info");
    return;
  }

  // Viewport export is intentionally an adapter point. Once the editor exposes
  // an export function, it should return the edited document as a Blob:
  // const editedBlob = await window.LuxOmniViewportBridge.exportEditedBlob(viewportType);
  // Then pass the Blob and original source metadata to saveEditedFile().
  const viewportBridge = window.LuxOmniViewportBridge;
  if (typeof viewportBridge?.exportEditedBlob !== "function") {
    setToast(
      "Sync is connected to the button, but viewport export is not wired yet. " +
      "Expose LuxOmniViewportBridge.exportEditedBlob(viewportType) to enable saving.",
      "info"
    );
    return;
  }

  state.isSyncing = true;
  if (els.syncButton) {
    els.syncButton.disabled = true;
    els.syncButton.setAttribute("aria-busy", "true");
  }
  setToast("Preparing viewport edits for Dropbox…", "info");

  try {
    const editedBlob = await viewportBridge.exportEditedBlob(viewportType, source.fileData);
    if (!(editedBlob instanceof Blob)) {
      throw new TypeError("The viewport export adapter must return a Blob.");
    }

    const result = await saveEditedFile({
      originalPath: source.originalPath,
      content: editedBlob,
      originalRevision: source.originalRevision
    });

    source.originalRevision = result?.rev || source.originalRevision;
    source.fileData = { ...source.fileData, rev: source.originalRevision };
    setToast("Saved " + (source.fileData.name || "file") + " to Dropbox.", "success");
  } catch (error) {
    setToast("Could not sync edits: " + errorText(error), "error");
  } finally {
    state.isSyncing = false;
    if (els.syncButton) els.syncButton.removeAttribute("aria-busy");
    updateTopbarStatus(state.isConnected);
  }
}

async function handleDisconnect() {
  if (state.isDisconnecting) return;
  state.isDisconnecting = true;
  if (els.disconnectButton) {
    els.disconnectButton.disabled = true;
    els.disconnectButton.setAttribute("aria-busy", "true");
  }

  let feedback = "Dropbox disconnected.";
  let feedbackKind = "success";
  try {
    const result = await revokeAccess();
    if (!result?.revoked && result?.reason === "no-active-token") {
      feedback = "The local Dropbox session was cleared; there was no active token to revoke.";
    }
  } catch (error) {
    // revokeAccess normally clears its session in a finally block. Do it again
    // defensively so UI state is cleared even if storage or revoke handling fails.
    try { clearSession(); } catch (_) {}
    feedback = "The local session was cleared, but Dropbox could not confirm token revocation: " + errorText(error);
    feedbackKind = "error";
  } finally {
    state.activeSources.clear();
    state.latestRoutedViewport = null;
    closeFileManager();
    state.isDisconnecting = false;
    updateTopbarStatus(false);
    if (els.disconnectButton) els.disconnectButton.removeAttribute("aria-busy");
    setToast(feedback, feedbackKind);
  }
}

function wireEvents() {
  els.sidebarButton?.addEventListener("click", () => void handleDropboxButtonClick());
  els.topbarButton?.addEventListener("click", () => void handleDropboxButtonClick());
  els.syncButton?.addEventListener("click", () => void handleSync());
  els.disconnectButton?.addEventListener("click", () => void handleDisconnect());
  els.modalClose?.addEventListener("click", closeFileManager);
  els.backButton?.addEventListener("click", () => {
    if (state.currentPath) void renderFileBrowser(getParentPath(state.currentPath));
  });
  els.uploadInput?.addEventListener("change", () => void handleUploadChange());
  els.addLeftButton?.addEventListener("click", () => {
    if (state.selectedFile) void loadFileIntoViewport(state.selectedFile, "left");
  });
  els.addRightButton?.addEventListener("click", () => {
    if (state.selectedFile) void loadFileIntoViewport(state.selectedFile, "right");
  });
  els.addFullButton?.addEventListener("click", () => {
    if (state.selectedFile) void loadFileIntoViewport(state.selectedFile, "full");
  });

  els.modal?.querySelectorAll("[data-dropbox-ui-close]").forEach(element => {
    element.addEventListener("click", closeFileManager);
  });
  els.modal?.addEventListener("click", event => {
    if (event.target === els.modal) closeFileManager();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && els.modal && !els.modal.hidden) {
      closeFileManager();
    }
  });
}

wireEvents();
updateTopbarStatus(false);
void initializeDropboxUI();

window.LuxOmniDropboxUI = Object.freeze({
  updateTopbarStatus,
  renderFileBrowser,
  openFileManager,
  closeFileManager,
  loadFileIntoViewport,
  handleSync,
  refreshConnectionStatus
});
