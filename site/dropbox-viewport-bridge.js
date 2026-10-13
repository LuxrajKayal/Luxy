/*
 * Lux Omni — Dropbox viewport bridge.
 *
 * Renders Dropbox downloads into the existing Full / Left / Right viewports.
 * PDF and image previews are read-only. An actual editor can register the
 * exported document Blob with setEditedBlob() before invoking Sync.
 */

const ASSIGNMENT_EVENT = "lux:dropbox-viewport-assignment-request";
const RESULT_EVENT = "lux:dropbox-viewport-assignment-result";
const VALID_VIEWPORTS = new Set(["left", "right", "full"]);

const viewportAssignments = new Map();
const viewportObservers = new Map();

function activateViewportLayout(viewportType) {
  const selector = viewportType === "full"
    ? "#viewport-fullscreen"
    : "#viewport-split-screen";
  const button = document.querySelector(selector);

  if (!button) {
    throw new Error("The " + (viewportType === "full" ? "Full" : "Split") +
      " viewport layout control was not found.");
  }

  // app.js owns viewport layout state and creates missing panes as needed.
  button.click();
}

function getViewportElement(viewportType) {
  const selectors = {
    left: '#viewport-split-layout [data-viewport-side="left"]',
    right: '#viewport-split-layout [data-viewport-side="right"]',
    full: '#viewport-fullscreen-layout [data-viewport-side="full"]'
  };
  return document.querySelector(selectors[viewportType]);
}

function getImageMimeFromName(fileName) {
  const extension = String(fileName || "").split(".").pop().toLowerCase();
  const types = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    avif: "image/avif"
  };
  return types[extension] || "";
}

function classifyFile(blob, fileName) {
  const type = String(blob?.type || "").toLowerCase();
  const name = String(fileName || "");

  if (type.includes("application/pdf") || /\.pdf$/i.test(name)) return "pdf";
  if (type.startsWith("image/") || getImageMimeFromName(name)) return "image";
  return "download";
}

function createPreviewBlob(originalBlob, fileName, kind) {
  if (kind === "pdf" && originalBlob.type.toLowerCase().includes("application/pdf")) {
    return originalBlob;
  }
  if (kind === "pdf") {
    return new Blob([originalBlob], { type: "application/pdf" });
  }

  if (kind === "image") {
    if (originalBlob.type.toLowerCase().startsWith("image/")) return originalBlob;
    const mime = getImageMimeFromName(fileName);
    if (mime) return new Blob([originalBlob], { type: mime });
  }

  return originalBlob;
}

function revokeAssignment(viewportType, assignment) {
  if (assignment?.objectUrl) URL.revokeObjectURL(assignment.objectUrl);

  const current = viewportAssignments.get(viewportType);
  if (current === assignment) viewportAssignments.delete(viewportType);
}

function ensureViewportObserver(viewportType, viewport) {
  if (viewportObservers.has(viewportType)) return;

  const observer = new MutationObserver(() => {
    const current = viewportAssignments.get(viewportType);
    if (current?.mount && !viewport.contains(current.mount)) {
      // app.js removes viewport contents when the user closes a viewport.
      revokeAssignment(viewportType, current);
      if (viewport.dataset.fileName === current.fileData?.name) {
        delete viewport.dataset.fileName;
      }
    }
  });

  observer.observe(viewport, { childList: true, subtree: true });
  viewportObservers.set(viewportType, observer);
}

function renderAssignment(detail) {
  const {
    blob,
    fileData,
    metadata,
    originalPath,
    originalRevision,
    viewportType
  } = detail || {};

  if (!VALID_VIEWPORTS.has(viewportType)) {
    throw new TypeError("Invalid Dropbox viewport target.");
  }
  if (!(blob instanceof Blob)) {
    throw new TypeError("The Dropbox viewport assignment must contain a Blob.");
  }

  activateViewportLayout(viewportType);

  const viewport = getViewportElement(viewportType);
  if (!viewport) {
    throw new Error("The " + viewportType + " viewport container was not found.");
  }

  const fileName = fileData?.name || "Dropbox file";
  const kind = classifyFile(blob, fileName);
  const previewBlob = createPreviewBlob(blob, fileName, kind);
  const objectUrl = URL.createObjectURL(previewBlob);
  const mount = document.createElement("div");

  mount.className = "lux-dropbox-preview";
  Object.assign(mount.style, {
    display: "flex",
    width: "100%",
    height: "100%",
    minHeight: "100%",
    boxSizing: "border-box",
    justifyContent: "center",
    alignItems: "center",
    overflow: "auto",
    background: "#ffffff"
  });

  if (kind === "pdf") {
    const frame = document.createElement("iframe");
    frame.src = objectUrl;
    frame.title = fileName;
    frame.setAttribute("aria-label", "PDF preview: " + fileName);
    Object.assign(frame.style, {
      display: "block",
      width: "100%",
      height: "100%",
      minHeight: "100%",
      border: "0",
      background: "#ffffff",
      flex: "1 1 auto"
    });
    mount.append(frame);
  } else if (kind === "image") {
    const image = document.createElement("img");
    image.src = objectUrl;
    image.alt = fileName;
    Object.assign(image.style, {
      display: "block",
      maxWidth: "100%",
      maxHeight: "100%",
      width: "auto",
      height: "auto",
      objectFit: "contain"
    });
    mount.append(image);
  } else {
    mount.style.flexDirection = "column";
    mount.style.alignItems = "flex-start";
    mount.style.justifyContent = "flex-start";
    mount.style.gap = "0.75rem";
    mount.style.padding = "1rem";

    const note = document.createElement("p");
    note.textContent = "Preview is not available for this file type. You can download the file below.";
    note.style.margin = "0";
    note.style.color = "#374151";

    const download = document.createElement("a");
    download.href = objectUrl;
    download.download = fileName;
    download.textContent = "Download " + fileName;
    download.style.color = "#1d4ed8";
    download.style.overflowWrap = "anywhere";

    mount.append(note, download);
  }

  // Remove previous DOM first, then release its object URL.
  const previous = viewportAssignments.get(viewportType);
  viewport.replaceChildren();
  if (previous) revokeAssignment(viewportType, previous);

  viewport.dataset.fileName = fileName;
  viewport.append(mount);

  viewportAssignments.set(viewportType, {
    blob,               // original bytes downloaded from Dropbox
    editedBlob: null,   // set by a real editor when edited bytes become available
    objectUrl,
    mount,
    fileData,
    metadata,
    originalPath,
    originalRevision,
    viewportType
  });

  ensureViewportObserver(viewportType, viewport);
}

window.addEventListener(ASSIGNMENT_EVENT, (event) => {
  const detail = event.detail || {};
  try {
    renderAssignment(detail);
    window.dispatchEvent(new CustomEvent(RESULT_EVENT, {
      detail: {
        requestId: detail.requestId,
        success: true,
        viewportType: detail.viewportType,
        fileName: detail.fileData?.name || "Dropbox file"
      }
    }));
  } catch (error) {
    console.error("Dropbox viewport rendering failed:", error);
    window.dispatchEvent(new CustomEvent(RESULT_EVENT, {
      detail: {
        requestId: detail.requestId,
        success: false,
        viewportType: detail.viewportType,
        message: error?.message || "The viewport could not render this file."
      }
    }));
  }
});

window.LuxOmniViewportBridge = {
  /*
   * Mock exporter: returns edited bytes when an editor has registered them,
   * otherwise returns the original download. The UI asks for confirmation
   * before uploading that unchanged original Blob.
   */
  async exportEditedBlob(viewportType) {
    if (!VALID_VIEWPORTS.has(viewportType)) {
      throw new TypeError('viewportType must be "left", "right", or "full".');
    }

    const assignment = viewportAssignments.get(viewportType);
    if (!assignment) {
      throw new Error("No Dropbox file is loaded in the " + viewportType + " viewport.");
    }

    return assignment.editedBlob || assignment.blob;
  },

  /*
   * Integration hook for a real editor. Call setEditedBlob(side, blob) when
   * edited document bytes are available, rather than trying to scrape an iframe.
   */
  setEditedBlob(viewportType, blob) {
    if (!VALID_VIEWPORTS.has(viewportType)) {
      throw new TypeError('viewportType must be "left", "right", or "full".');
    }
    if (!(blob instanceof Blob)) {
      throw new TypeError("The edited document must be provided as a Blob.");
    }

    const assignment = viewportAssignments.get(viewportType);
    if (!assignment) {
      throw new Error("No Dropbox file is loaded in the " + viewportType + " viewport.");
    }

    assignment.editedBlob = blob;
  },

  markSaved(viewportType, blob, result = {}) {
    const assignment = viewportAssignments.get(viewportType);
    if (!assignment) return;

    assignment.blob = blob;
    assignment.editedBlob = null;
    assignment.originalRevision = result?.rev || assignment.originalRevision;
    assignment.metadata = {
      ...(assignment.metadata || {}),
      ...(result || {})
    };
  },

  getViewportAssignment(viewportType) {
    const assignment = viewportAssignments.get(viewportType);
    if (!assignment) return null;

    return {
      fileData: assignment.fileData,
      originalPath: assignment.originalPath,
      originalRevision: assignment.originalRevision,
      hasEditedBlob: Boolean(assignment.editedBlob)
    };
  }
};

window.addEventListener("pagehide", () => {
  for (const [viewportType, assignment] of viewportAssignments) {
    revokeAssignment(viewportType, assignment);
  }
  for (const observer of viewportObservers.values()) observer.disconnect();
  viewportObservers.clear();
});
