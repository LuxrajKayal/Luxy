/*
 * Lux Omni PDF editor adapter.
 * Uses the pinned Mozilla PDF.js distribution and viewer components.
 * PDF.js assets are loaded only when a PDF is opened.
 */
const PDFJS_VERSION = "6.4.299";
const PDFJS_BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@" + PDFJS_VERSION;
const PDFJS_VIEWER_STYLESHEET = PDFJS_BASE + "/web/pdf_viewer.css";

let pdfjsModulesPromise = null;
const stylesheetPromises = new WeakMap();

function ensureViewerStylesheet(shadowRoot) {
  const existingPromise = stylesheetPromises.get(shadowRoot);
  if (existingPromise) return existingPromise;

  const stylesheetUrls = [
    { url: PDFJS_VIEWER_STYLESHEET, attribute: "data-lux-pdfjs-stylesheet" },
    { url: new URL("./pdf-editor.css", import.meta.url).href, attribute: "data-lux-pdf-editor-stylesheet" }
  ];
  let links = [];
  const promise = new Promise((resolve, reject) => {
    let remaining = stylesheetUrls.length;
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      for (const link of links) link.remove();
      stylesheetPromises.delete(shadowRoot);
      reject(new Error("PDF editor styles could not be loaded into the isolated viewer."));
    };

    for (const item of stylesheetUrls) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = item.url;
      link.setAttribute(item.attribute, "true");
      link.addEventListener("load", () => {
        remaining -= 1;
        if (remaining === 0 && !settled) {
          settled = true;
          resolve();
        }
      }, { once: true });
      link.addEventListener("error", fail, { once: true });
      links.push(link);
      shadowRoot.append(link);
    }
  });
  stylesheetPromises.set(shadowRoot, promise);
  return promise;
}

function loadPdfJsModules() {
  if (!pdfjsModulesPromise) {
    pdfjsModulesPromise = (async () => {
      const pdfjsLib = await import(PDFJS_BASE + "/build/pdf.mjs");
      // The distribution viewer components read the public core API from this namespace.
      // Assign it before importing the viewer module; parallel imports can race during module evaluation.
      globalThis.pdfjsLib = pdfjsLib;
      const pdfjsViewer = await import(PDFJS_BASE + "/web/pdf_viewer.mjs");
      if (!pdfjsLib.getDocument || !pdfjsViewer.PDFViewer) {
        throw new Error("The pinned Mozilla PDF.js build did not expose the viewer APIs Lux Omni requires.");
      }
      pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + "/build/pdf.worker.mjs";
      return { pdfjsLib, pdfjsViewer };
    })().catch((error) => {
      pdfjsModulesPromise = null;
      throw error;
    });
  }
  return pdfjsModulesPromise;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createToolbarButton(label, title, command, className = "") {
  const button = createElement("button", "lux-pdf-tool " + className, label);
  button.type = "button";
  button.title = title;
  button.setAttribute("aria-label", title);
  button.dataset.pdfCommand = command;
  button.setAttribute("aria-pressed", "false");
  return button;
}

function normalizePdfName(name) {
  const cleaned = String(name || "document.pdf").replace(/[\\/:*?"<>|]+/g, "_");
  return /\.pdf$/i.test(cleaned) ? cleaned : cleaned + ".pdf";
}

export async function mountPdfEditor({ root, blob, fileName, viewportType, onDirty, onEdited, toolbarContainer = null, scrollContainer: externalScrollContainer = null, initiallyDirty = false, viewState = null }) {
  if (!(blob instanceof Blob)) throw new TypeError("PDF.js needs a PDF Blob.");

  root.classList.add("lux-pdf-editor-root");
  root.style.alignItems = "stretch";
  root.style.justifyContent = "flex-start";
  root.style.flexDirection = "column";
  root.style.height = "auto";
  root.style.minHeight = "100%";
  root.style.overflow = "visible";
  root.style.background = "#e9edf3";

  // PDF.js ships generic selectors such as ".sidebar". Keep all viewer CSS and
  // its imported stylesheets inside an open Shadow DOM so they cannot restyle Lux Omni.
  const shadowRoot = root.shadowRoot || root.attachShadow({ mode: "open" });
  root.replaceChildren();
  shadowRoot.replaceChildren();
  await ensureViewerStylesheet(shadowRoot);
  const modules = await loadPdfJsModules();
  const pdfjsLib = modules.pdfjsLib;
  const pdfjsViewer = modules.pdfjsViewer;
  const AnnotationEditorType = pdfjsLib.AnnotationEditorType || pdfjsViewer.AnnotationEditorType;
  if (!AnnotationEditorType || AnnotationEditorType.HIGHLIGHT === undefined ||
      AnnotationEditorType.FREETEXT === undefined || AnnotationEditorType.INK === undefined) {
    throw new Error("This Mozilla PDF.js build does not expose the annotation tools Lux Omni requires.");
  }

  const shell = createElement("section", "lux-pdf-editor");
  shell.setAttribute("aria-label", "PDF editor");
  const toolbar = createElement("div", "lux-pdf-toolbar");
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "PDF navigation and annotation tools");

  const toolGroup = createElement("div", "lux-pdf-toolbar-group");
  toolGroup.setAttribute("role", "group");
  toolGroup.setAttribute("aria-label", "Annotation tools");
  const tools = [
    ["↖", "Select text and links", "select"],
    ["✋", "Hand tool: drag to pan", "hand"],
    ["▰", "Highlight selected text", "highlight"],
    ["✎", "Freehand pen", "pen"],
    ["T", "Add free text", "text"],
    ["▣", "Add a stamp", "stamp"],
    ["✍", "Add a signature", "signature"]
  ];
  const toolButtons = new Map();
  for (const item of tools) {
    const button = createToolbarButton(item[0], item[1], item[2]);
    toolButtons.set(item[2], button);
    toolGroup.append(button);
  }

  const pageGroup = createElement("div", "lux-pdf-toolbar-group lux-pdf-page-controls");
  pageGroup.setAttribute("role", "group");
  pageGroup.setAttribute("aria-label", "Page navigation");
  const previousButton = createToolbarButton("‹", "Previous page", "previous");
  const pageInput = createElement("input", "lux-pdf-page-input");
  pageInput.type = "number";
  pageInput.min = "1";
  pageInput.value = "1";
  pageInput.setAttribute("aria-label", "Current PDF page");
  pageInput.title = "Current page";
  const pageCount = createElement("span", "lux-pdf-page-count", "of —");
  const nextButton = createToolbarButton("›", "Next page", "next");
  pageGroup.append(previousButton, pageInput, pageCount, nextButton);

  const zoomGroup = createElement("div", "lux-pdf-toolbar-group lux-pdf-zoom-controls");
  zoomGroup.setAttribute("role", "group");
  zoomGroup.setAttribute("aria-label", "Zoom and rotation");
  const zoomOutButton = createToolbarButton("−", "Zoom out", "zoom-out");
  const zoomValue = createElement("span", "lux-pdf-zoom-value", "Fit width");
  const zoomInButton = createToolbarButton("+", "Zoom in", "zoom-in");
  const fitButton = createToolbarButton("↔", "Fit page width", "fit-width");
  const rotateButton = createToolbarButton("↻", "Rotate clockwise", "rotate");
  zoomGroup.append(zoomOutButton, zoomValue, zoomInButton, fitButton, rotateButton);

  const searchGroup = createElement("div", "lux-pdf-toolbar-group lux-pdf-search-controls");
  searchGroup.setAttribute("role", "search");
  const searchInput = createElement("input", "lux-pdf-search-input");
  searchInput.type = "search";
  searchInput.placeholder = "Find in PDF";
  searchInput.setAttribute("aria-label", "Find text in this PDF");
  const searchPreviousButton = createToolbarButton("↑", "Previous search result", "find-previous");
  const searchNextButton = createToolbarButton("↓", "Next search result", "find-next");
  searchGroup.append(searchInput, searchPreviousButton, searchNextButton);

  const saveGroup = createElement("div", "lux-pdf-toolbar-group lux-pdf-save-controls");
  saveGroup.setAttribute("role", "group");
  saveGroup.setAttribute("aria-label", "Export PDF");
  const downloadButton = createToolbarButton("↓ Save PDF", "Download a copy of the current PDF including supported edits", "download", "lux-pdf-save-button");
  saveGroup.append(downloadButton);

  const status = createElement("span", "lux-pdf-status", "Loading PDF…");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  toolbar.append(toolGroup, pageGroup, zoomGroup, searchGroup, saveGroup, status);

  const viewerFrame = createElement("div", "lux-pdf-viewer-frame");
  const pages = createElement("div", "pdfViewer");
  const scrollContainer = externalScrollContainer || createElement("div", "lux-pdf-viewer-container");
  if (externalScrollContainer) {
    // Use the actual Lux Omni viewport as PDF.js's scroll container. Viewer
    // styles stay isolated in this Shadow DOM; only tool controls are portaled.
    viewerFrame.append(pages);
  } else {
    scrollContainer.tabIndex = 0;
    scrollContainer.setAttribute("aria-label", "PDF pages");
    scrollContainer.append(pages);
    viewerFrame.append(scrollContainer);
  }
  shell.append(viewerFrame);
  shadowRoot.append(shell);
  if (toolbarContainer) {
    toolbarContainer.replaceChildren(toolbar);
  } else {
    shell.prepend(toolbar);
  }

  const eventBus = new pdfjsViewer.EventBus();
  const linkService = new pdfjsViewer.PDFLinkService({ eventBus });
  const findController = new pdfjsViewer.PDFFindController({ eventBus, linkService });
  const pdfViewer = new pdfjsViewer.PDFViewer({
    container: scrollContainer,
    viewer: pages,
    eventBus,
    linkService,
    findController,
    textLayerMode: 2,
    annotationMode: pdfjsLib.AnnotationMode ? pdfjsLib.AnnotationMode.ENABLE_FORMS : 2,
    annotationEditorMode: AnnotationEditorType.NONE,
    enableScripting: false
  });
  linkService.setViewer(pdfViewer);

  let pdfDocument = null;
  let loadingTask = null;
  let disposed = false;
  let dirty = false;
  let handMode = false;
  let dragging = null;
  let searchCount = 0;

  function setStatus(message, state = "") {
    status.textContent = message;
    status.dataset.state = state;
  }

  function markDirty() {
    if (disposed || dirty) return;
    dirty = true;
    setStatus("Unsaved changes", "dirty");
    onDirty?.();
  }

  function setActiveTool(tool) {
    for (const [name, button] of toolButtons) {
      const active = name === tool;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  function setHandMode(active) {
    handMode = active;
    scrollContainer.classList.toggle("is-hand-tool", active);
    shell.classList.toggle("is-hand-tool", active);
    const button = toolButtons.get("hand");
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    if (active) {
      for (const [name, item] of toolButtons) {
        if (name !== "hand") {
          item.classList.remove("is-active");
          item.setAttribute("aria-pressed", "false");
        }
      }
      setStatus("Hand tool active — drag the page to pan", "ready");
    }
  }

  function setEditorMode(mode, toolName) {
    setHandMode(false);
    const chosenMode = AnnotationEditorType[mode];
    if (chosenMode === undefined) {
      setStatus("This annotation tool is not available in the loaded PDF.js build.", "error");
      return;
    }
    pdfViewer.annotationEditorMode = { mode: chosenMode };
    setActiveTool(toolName);
    const messages = {
      NONE: "Text selection active",
      HIGHLIGHT: "Highlight tool active — select text to highlight",
      INK: "Pen tool active — draw on the page",
      FREETEXT: "Text tool active — click the page to add text",
      STAMP: "Stamp tool active",
      SIGNATURE: "Signature tool active"
    };
    setStatus(messages[mode] || "Annotation tool active", "ready");
  }

  function renderPageState() {
    pageInput.max = String(pdfViewer.pagesCount || 1);
    pageInput.value = String(pdfViewer.currentPageNumber || 1);
    pageCount.textContent = "of " + (pdfViewer.pagesCount || "—");
    previousButton.disabled = !pdfViewer.pagesCount || pdfViewer.currentPageNumber <= 1;
    nextButton.disabled = !pdfViewer.pagesCount || pdfViewer.currentPageNumber >= pdfViewer.pagesCount;
  }

  function renderScaleState() {
    zoomValue.textContent = pdfViewer.currentScale ? Math.round(pdfViewer.currentScale * 100) + "%" : "Fit width";
  }

  async function exportEditedBlob() {
    if (!pdfDocument) throw new Error("The PDF document is not ready to export.");
    const bytes = await pdfDocument.saveDocument();
    return new Blob([bytes], { type: "application/pdf" });
  }

  async function downloadPdf() {
    downloadButton.disabled = true;
    try {
      const editedBlob = await exportEditedBlob();
      onEdited?.(editedBlob);
      const downloadUrl = URL.createObjectURL(editedBlob);
      const anchor = createElement("a");
      anchor.href = downloadUrl;
      anchor.download = normalizePdfName(fileName);
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000);
      setStatus("PDF copy downloaded — Dropbox Sync can save these bytes", "ready");
    } catch (error) {
      setStatus("Could not export the PDF: " + (error?.message || "unknown error"), "error");
      throw error;
    } finally {
      downloadButton.disabled = false;
    }
  }

  toolButtons.get("select").addEventListener("click", () => setEditorMode("NONE", "select"));
  toolButtons.get("hand").addEventListener("click", () => setHandMode(!handMode));
  toolButtons.get("highlight").addEventListener("click", () => setEditorMode("HIGHLIGHT", "highlight"));
  toolButtons.get("pen").addEventListener("click", () => setEditorMode("INK", "pen"));
  toolButtons.get("text").addEventListener("click", () => setEditorMode("FREETEXT", "text"));
  toolButtons.get("stamp").addEventListener("click", () => setEditorMode("STAMP", "stamp"));
  if (AnnotationEditorType.SIGNATURE === undefined) {
    toolButtons.get("signature").hidden = true;
  } else {
    toolButtons.get("signature").addEventListener("click", () => setEditorMode("SIGNATURE", "signature"));
  }

  previousButton.addEventListener("click", () => { if (pdfViewer.currentPageNumber > 1) pdfViewer.currentPageNumber -= 1; });
  nextButton.addEventListener("click", () => { if (pdfViewer.currentPageNumber < pdfViewer.pagesCount) pdfViewer.currentPageNumber += 1; });
  pageInput.addEventListener("change", () => {
    const value = Number.parseInt(pageInput.value, 10);
    if (Number.isFinite(value)) pdfViewer.currentPageNumber = Math.max(1, Math.min(pdfViewer.pagesCount || 1, value));
    renderPageState();
  });
  pageInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      pageInput.blur();
    }
  });
  zoomOutButton.addEventListener("click", () => {
    pdfViewer.currentScaleValue = String(Math.max(0.25, (pdfViewer.currentScale || 1) / 1.15));
    renderScaleState();
  });
  zoomInButton.addEventListener("click", () => {
    pdfViewer.currentScaleValue = String(Math.min(5, (pdfViewer.currentScale || 1) * 1.15));
    renderScaleState();
  });
  fitButton.addEventListener("click", () => {
    pdfViewer.currentScaleValue = "page-width";
    renderScaleState();
  });
  rotateButton.addEventListener("click", () => {
    pdfViewer.pagesRotation = ((pdfViewer.pagesRotation || 0) + 90) % 360;
  });
  searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const query = searchInput.value.trim();
    if (!query) return;
    eventBus.dispatch("find", {
      source: searchInput,
      type: searchCount++ ? "again" : "",
      query,
      phraseSearch: true,
      caseSensitive: false,
      entireWord: false,
      highlightAll: true,
      findPrevious: event.shiftKey
    });
  });
  searchPreviousButton.addEventListener("click", () => {
    const query = searchInput.value.trim();
    if (!query) return;
    eventBus.dispatch("find", { source: searchInput, type: "again", query, phraseSearch: true, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: true });
  });
  searchNextButton.addEventListener("click", () => {
    const query = searchInput.value.trim();
    if (!query) return;
    eventBus.dispatch("find", { source: searchInput, type: "again", query, phraseSearch: true, caseSensitive: false, entireWord: false, highlightAll: true, findPrevious: false });
  });
  downloadButton.addEventListener("click", () => { void downloadPdf(); });

  scrollContainer.addEventListener("input", markDirty, true);
  scrollContainer.addEventListener("change", markDirty, true);
  eventBus.on("annotationeditorstateschanged", (event) => {
    if (event?.details?.hasSomethingToUndo) markDirty();
  });
  eventBus.on("pagechanging", renderPageState);
  eventBus.on("scalechanging", renderScaleState);

  scrollContainer.addEventListener("pointerdown", (event) => {
    const eventPath = event.composedPath?.() || [event.target];
    const startedOnControl = eventPath.some((node) =>
      node instanceof Element && node.matches("a, input, button, textarea, select")
    );
    if (!handMode || event.button !== 0 || startedOnControl) return;
    event.preventDefault();
    dragging = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: scrollContainer.scrollLeft, top: scrollContainer.scrollTop };
    scrollContainer.setPointerCapture(event.pointerId);
    scrollContainer.classList.add("is-panning");
  });
  scrollContainer.addEventListener("pointermove", (event) => {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    scrollContainer.scrollLeft = dragging.left - (event.clientX - dragging.x);
    scrollContainer.scrollTop = dragging.top - (event.clientY - dragging.y);
  });
  function endPan(event) {
    if (!dragging || event.pointerId !== dragging.pointerId) return;
    dragging = null;
    scrollContainer.classList.remove("is-panning");
  }
  scrollContainer.addEventListener("pointerup", endPan);
  scrollContainer.addEventListener("pointercancel", endPan);

  function getViewState() {
    let activeTool = "select";
    for (const [name, button] of toolButtons) {
      if (button.getAttribute("aria-pressed") === "true") {
        activeTool = name;
        break;
      }
    }
    return {
      pageNumber: pdfViewer.currentPageNumber || 1,
      scaleValue: pdfViewer.currentScaleValue || "page-width",
      rotation: pdfViewer.pagesRotation || 0,
      scrollTop: scrollContainer.scrollTop || 0,
      scrollLeft: scrollContainer.scrollLeft || 0,
      activeTool,
      searchQuery: searchInput.value || ""
    };
  }

  function restoreViewState(state) {
    if (!state || !pdfDocument) return;
    if (Number.isFinite(state.rotation)) pdfViewer.pagesRotation = state.rotation;
    if (state.scaleValue) pdfViewer.currentScaleValue = String(state.scaleValue);
    if (Number.isFinite(state.pageNumber)) {
      pdfViewer.currentPageNumber = Math.max(1, Math.min(pdfViewer.pagesCount || 1, state.pageNumber));
    }
    searchInput.value = state.searchQuery || "";
    const toolModes = {
      select: ["NONE", "select"],
      highlight: ["HIGHLIGHT", "highlight"],
      pen: ["INK", "pen"],
      text: ["FREETEXT", "text"],
      stamp: ["STAMP", "stamp"],
      signature: ["SIGNATURE", "signature"]
    };
    if (state.activeTool === "hand") {
      setHandMode(true);
    } else if (toolModes[state.activeTool]) {
      setEditorMode(...toolModes[state.activeTool]);
    }
    window.requestAnimationFrame(() => {
      scrollContainer.scrollTop = Math.max(0, Number(state.scrollTop) || 0);
      scrollContainer.scrollLeft = Math.max(0, Number(state.scrollLeft) || 0);
    });
  }

  const pagesReady = new Promise((resolve) => {
    eventBus.on("pagesinit", () => {
      pdfViewer.currentScaleValue = "page-width";
      renderPageState();
      renderScaleState();
      resolve();
    });
  });
  try {
    const data = new Uint8Array(await blob.arrayBuffer());
    loadingTask = pdfjsLib.getDocument({
      data,
      cMapUrl: PDFJS_BASE + "/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: PDFJS_BASE + "/standard_fonts/",
      wasmUrl: PDFJS_BASE + "/wasm/",
      iccUrl: PDFJS_BASE + "/iccs/",
      enableXfa: true
    });
    loadingTask.onProgress = (progress) => {
      if (progress?.total) setStatus("Loading PDF " + Math.round(progress.loaded / progress.total * 100) + "%", "loading");
    };
    pdfDocument = await loadingTask.promise;
    if (disposed) {
      await pdfDocument.destroy();
      throw new Error("The PDF viewport was closed while the document was loading.");
    }
    pdfViewer.setDocument(pdfDocument);
    linkService.setDocument(pdfDocument, null);
    await Promise.race([
      pagesReady,
      new Promise((_, reject) => window.setTimeout(() => reject(new Error("PDF.js did not finish initializing its page viewer.")), 30000))
    ]);
    setStatus("Ready · " + pdfViewer.pagesCount + (pdfViewer.pagesCount === 1 ? " page" : " pages"), "ready");
    setEditorMode("NONE", "select");
    if (viewState) restoreViewState(viewState);
    if (initiallyDirty) {
      dirty = true;
      setStatus("Unsaved changes", "dirty");
    }
  } catch (error) {
    setStatus("Could not open PDF: " + (error?.message || "unknown error"), "error");
    try { pdfViewer.setDocument(null); } catch (_) {}
    try { linkService.setDocument(null, null); } catch (_) {}
    try { await loadingTask?.destroy(); } catch (_) {}
    throw error;
  }

  return {
    get isDirty() { return dirty; },
    async exportEditedBlob() { return exportEditedBlob(); },
    getViewState() { return getViewState(); },
    markSaved() {
      dirty = false;
      setStatus("Saved to Dropbox", "saved");
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      toolbar.remove();
      try { pdfViewer.setDocument(null); } catch (_) {}
      try { linkService.setDocument(null, null); } catch (_) {}
      try { await loadingTask?.destroy(); } catch (_) {}
    }
  };
}
