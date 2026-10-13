import { mountPdfEditor } from "./pdf-engine.js";

/*
 * Lux Omni — multipurpose Dropbox viewport bridge.
 * PDF/image files use native browser previews; Markdown and common text files
 * are displayed safely as DOM text. Other binary files remain downloadable.
 * File contents are never injected as raw HTML.
 */

const ASSIGNMENT_EVENT = "lux:dropbox-viewport-assignment-request";
const RESULT_EVENT = "lux:dropbox-viewport-assignment-result";
const VALID_VIEWPORTS = new Set(["left", "right", "full"]);
const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;
const viewportAssignments = new Map();
const viewportObservers = new Map();

const TEXT_EXTENSIONS = new Set([
  "md", "markdown", "mdown", "mkdn", "mdx", "txt", "text", "log", "csv", "tsv",
  "json", "jsonc", "xml", "yaml", "yml", "toml", "ini", "conf", "properties",
  "env", "diff", "patch", "html", "htm", "css", "scss", "less", "js", "mjs",
  "cjs", "jsx", "ts", "tsx", "py", "pyw", "rb", "php", "java", "kt", "kts",
  "c", "h", "cc", "cpp", "cxx", "hpp", "hh", "cs", "go", "rs", "swift",
  "sh", "bash", "zsh", "ps1", "sql", "r", "lua", "pl", "pm", "ex", "exs",
  "erl", "hrl", "hs", "lhs", "scala", "clj", "cljs", "graphql", "gql",
  "proto", "rst", "adoc", "asciidoc", "tex", "bib", "ipynb", "org", "make", "mk", "cmake", "dockerfile", "makefile", "gitignore",
  "gitattributes", "editorconfig"
]);

function activateViewportLayout(viewportType) {
  const selector = viewportType === "full" ? "#viewport-fullscreen" : "#viewport-split-screen";
  const button = document.querySelector(selector);
  if (!button) throw new Error("The requested viewport layout control was not found.");
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

function getViewportScrollElement(viewportType) {
  const viewport = getViewportElement(viewportType);
  return viewport?.querySelector(":scope > .viewport-scroll-area") || viewport;
}

function getViewportToolbarElement(viewportType) {
  return document.querySelector('[data-viewport-tools="' + viewportType + '"]');
}

function getExtension(fileName) {
  const baseName = String(fileName || "").toLowerCase().split(/[\/]/).pop() || "";
  if (/^\.(gitignore|gitattributes|editorconfig|env)$/.test(baseName)) return baseName.slice(1);
  if (baseName === "dockerfile" || baseName === "makefile") return baseName;
  const dotIndex = baseName.lastIndexOf(".");
  return dotIndex > 0 ? baseName.slice(dotIndex + 1) : "";
}

function getImageMimeFromName(fileName) {
  const types = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", bmp: "image/bmp", svg: "image/svg+xml", avif: "image/avif",
    ico: "image/x-icon", tif: "image/tiff", tiff: "image/tiff"
  };
  return types[getExtension(fileName)] || "";
}

function isMarkdownFile(fileName) {
  return ["md", "markdown", "mdown", "mkdn", "mdx"].includes(getExtension(fileName));
}

function isTextFile(blob, fileName) {
  const type = String(blob?.type || "").toLowerCase();
  const baseName = String(fileName || "").toLowerCase().split(/[\\/]/).pop() || "";
  const wellKnownTextNames = ["readme", "license", "copying", "notice", "copyright", "changelog", "changes", "contributing", "authors", "authors.txt", "makefile", "dockerfile"];
  if (wellKnownTextNames.includes(baseName)) return true;
  if (TEXT_EXTENSIONS.has(getExtension(fileName)) || type.startsWith("text/")) return true;
  return [
    "application/json", "application/ld+json", "application/xml",
    "application/javascript", "application/x-javascript", "application/yaml",
    "application/x-yaml", "application/x-markdown", "text/markdown", "application/toml", "application/sql",
    "application/x-sh", "application/x-httpd-php"
  ].includes(type);
}

function classifyFile(blob, fileName) {
  const type = String(blob?.type || "").toLowerCase();
  if (type.includes("application/pdf") || /\.pdf$/i.test(fileName || "")) return "pdf";
  if (type.startsWith("image/") || getImageMimeFromName(fileName)) return "image";
  if (isTextFile(blob, fileName)) return (isMarkdownFile(fileName) || type.includes("markdown")) ? "markdown" : "text";
  return "download";
}

function createPreviewBlob(blob, fileName, kind) {
  if (kind === "pdf" && !blob.type.toLowerCase().includes("application/pdf")) {
    return new Blob([blob], { type: "application/pdf" });
  }
  if (kind === "image" && !blob.type.toLowerCase().startsWith("image/")) {
    const mime = getImageMimeFromName(fileName);
    if (mime) return new Blob([blob], { type: mime });
  }
  return blob;
}

function revokeAssignment(viewportType, assignment) {
  if (assignment?.editor?.dispose) {
    void assignment.editor.dispose().catch((error) => console.warn("PDF.js viewport cleanup failed:", error));
  }
  if (assignment?.objectUrl) URL.revokeObjectURL(assignment.objectUrl);
  if (viewportAssignments.get(viewportType) === assignment) viewportAssignments.delete(viewportType);
}

function ensureViewportObserver(viewportType, scrollArea) {
  if (viewportObservers.has(viewportType)) return;
  const observer = new MutationObserver(() => {
    const current = viewportAssignments.get(viewportType);
    if (current?.mount && !scrollArea.contains(current.mount)) {
      revokeAssignment(viewportType, current);
      const viewport = getViewportElement(viewportType);
      if (viewport?.dataset.fileName === current.fileData?.name) delete viewport.dataset.fileName;
    }
  });
  observer.observe(scrollArea, { childList: true, subtree: true });
  viewportObservers.set(viewportType, observer);
}

function style(element, values) {
  Object.assign(element.style, values);
  return element;
}

function createDocumentShell(fileName, mode) {
  const article = document.createElement("article");
  article.className = mode === "markdown" ? "lux-dropbox-document lux-dropbox-markdown" : "lux-dropbox-document lux-dropbox-text";
  style(article, {
    boxSizing: "border-box", width: "100%", minHeight: "100%", margin: "0 auto",
    padding: "clamp(16px, 3vw, 32px)", color: "#1f2937", background: "#ffffff",
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: "14px", lineHeight: "1.65", overflowWrap: "anywhere"
  });

  const header = document.createElement("header");
  style(header, { marginBottom: "1.25rem", paddingBottom: "0.75rem", borderBottom: "1px solid #e5e7eb" });
  const title = document.createElement("h1");
  title.textContent = fileName;
  style(title, { margin: "0", fontSize: "1.15rem", fontWeight: "650", lineHeight: "1.35", overflowWrap: "anywhere" });
  const label = document.createElement("p");
  label.textContent = mode === "markdown" ? "Markdown preview · read-only" : "Text preview · read-only";
  style(label, { margin: "0.35rem 0 0", color: "#6b7280", fontSize: "0.75rem" });
  header.append(title, label);
  article.append(header);
  return article;
}

// Minimal first-party Markdown inline renderer. It creates DOM elements and text
// nodes only; file-provided HTML is never parsed or executed.
function createInlineMarkdown(source) {
  const fragment = document.createDocumentFragment();
  const pattern = new RegExp("(\\*\\*[^*]+\\*\\*|__[^_]+__|~~[^~]+~~|\\x60[^\\x60]+\\x60|\\[[^\\]]+\\]\\([^)]+\\)|\\*[^*\\n]+\\*|_[^_\\n]+_)", "g");
  let cursor = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    if (match.index > cursor) fragment.append(document.createTextNode(source.slice(cursor, match.index)));
    const token = match[0];
    let node = null;

    if ((token.startsWith("**") && token.endsWith("**")) || (token.startsWith("__") && token.endsWith("__"))) {
      node = document.createElement("strong");
      node.textContent = token.slice(2, -2);
    } else if (token.startsWith("~~") && token.endsWith("~~")) {
      node = document.createElement("del");
      node.textContent = token.slice(2, -2);
    } else if (token.charCodeAt(0) === 96 && token.charCodeAt(token.length - 1) === 96) {
      node = document.createElement("code");
      node.textContent = token.slice(1, -1);
      style(node, { padding: "0.1em 0.3em", borderRadius: "4px", background: "#f3f4f6", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" });
    } else if ((token.startsWith("*") && token.endsWith("*")) || (token.startsWith("_") && token.endsWith("_"))) {
      node = document.createElement("em");
      node.textContent = token.slice(1, -1);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        try {
          const url = new URL(link[2].trim(), window.location.href);
          if (["https:", "http:", "mailto:"].includes(url.protocol)) {
            node = document.createElement("a");
            node.href = url.href;
            node.textContent = link[1];
            node.rel = "noopener noreferrer";
            if (url.protocol !== "mailto:") node.target = "_blank";
            style(node, { color: "#1d4ed8", textDecoration: "underline" });
          }
        } catch (_) { /* Invalid links remain plain text. */ }
      }
    }

    fragment.append(node || document.createTextNode(token));
    cursor = match.index + token.length;
  }
  if (cursor < source.length) fragment.append(document.createTextNode(source.slice(cursor)));
  return fragment;
}

function isMarkdownBlockStart(lines, index) {
  const line = lines[index] || "";
  return /^\s{0,3}#{1,6}\s+/.test(line) ||
    /^\s{0,3}(?:\x60{3}|~~~)/.test(line) ||
    /^\s{0,3}>\s?/.test(line) ||
    /^\s{0,3}[-+*]\s+/.test(line) ||
    /^\s{0,3}\d+[.)]\s+/.test(line) ||
    /^\s{0,3}(?:---+|\*\*\*+|___+)\s*$/.test(line);
}

function appendMarkdown(source, target) {
  const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }

    const fence = line.match(/^\s{0,3}(\x60{3}|~~~)(.*)$/);
    if (fence) {
      const fenceToken = fence[1];
      const codeLines = [];
      index += 1;
      while (index < lines.length && !new RegExp("^\\s{0,3}" + fenceToken + "\\s*$").test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      code.textContent = codeLines.join("\n");
      style(pre, { margin: "0.8rem 0 1rem", padding: "0.9rem", overflow: "visible", border: "1px solid #e5e7eb", borderRadius: "7px", background: "#f8fafc", whiteSpace: "pre", fontSize: "0.88rem" });
      style(code, { color: "#111827", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" });
      pre.append(code);
      target.append(pre);
      continue;
    }

    const headingMatch = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const heading = document.createElement("h" + level);
      heading.append(createInlineMarkdown(headingMatch[2]));
      style(heading, { margin: "1rem 0 0.55rem", fontSize: ["", "1.8rem", "1.5rem", "1.25rem", "1.1rem", "1rem", "0.95rem"][level], lineHeight: "1.3", fontWeight: level <= 2 ? "700" : "650" });
      target.append(heading);
      index += 1;
      continue;
    }

    if (/^\s{0,3}(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      target.append(style(document.createElement("hr"), { margin: "1.2rem 0", border: "0", borderTop: "1px solid #d1d5db" }));
      index += 1;
      continue;
    }

    if (/^\s{0,3}>\s?/.test(line)) {
      const quoteLines = [];
      while (index < lines.length && /^\s{0,3}>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s{0,3}>\s?/, ""));
        index += 1;
      }
      const quote = document.createElement("blockquote");
      const paragraph = document.createElement("p");
      paragraph.append(createInlineMarkdown(quoteLines.join(" ")));
      style(quote, { margin: "0.9rem 0", padding: "0.2rem 0 0.2rem 1rem", borderLeft: "3px solid #cbd5e1", color: "#4b5563" });
      style(paragraph, { margin: "0" });
      quote.append(paragraph);
      target.append(quote);
      continue;
    }

    const firstUnordered = line.match(/^\s{0,3}[-+*]\s+(.+)$/);
    const firstOrdered = line.match(/^\s{0,3}\d+[.)]\s+(.+)$/);
    if (firstUnordered || firstOrdered) {
      const isOrdered = Boolean(firstOrdered);
      const list = document.createElement(isOrdered ? "ol" : "ul");
      style(list, { margin: "0.5rem 0 1rem", paddingLeft: "1.6rem" });
      while (index < lines.length) {
        const itemMatch = isOrdered
          ? lines[index].match(/^\s{0,3}\d+[.)]\s+(.+)$/)
          : lines[index].match(/^\s{0,3}[-+*]\s+(.+)$/);
        if (!itemMatch) break;
        const item = document.createElement("li");
        item.append(createInlineMarkdown(itemMatch[1]));
        style(item, { paddingLeft: "0.15rem", margin: "0.2rem 0" });
        list.append(item);
        index += 1;
      }
      target.append(list);
      continue;
    }

    const paragraphLines = [];
    while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines, index)) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    if (!paragraphLines.length) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    const paragraph = document.createElement("p");
    paragraph.append(createInlineMarkdown(paragraphLines.join(" ")));
    style(paragraph, { margin: "0.65rem 0 1rem" });
    target.append(paragraph);
  }
}

function makeDownloadLink(objectUrl, fileName) {
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.textContent = "Download " + fileName;
  style(link, { color: "#1d4ed8", textDecoration: "underline", overflowWrap: "anywhere" });
  return link;
}

async function renderAssignment(detail) {
  const { blob, fileData, metadata, originalPath, originalRevision, viewportType } = detail || {};
  if (!VALID_VIEWPORTS.has(viewportType)) throw new TypeError("Invalid Dropbox viewport target.");
  if (!(blob instanceof Blob)) throw new TypeError("The Dropbox viewport assignment must contain a Blob.");

  activateViewportLayout(viewportType);
  const viewport = getViewportElement(viewportType);
  const scrollArea = getViewportScrollElement(viewportType);
  if (!viewport || !scrollArea) throw new Error("The " + viewportType + " viewport container was not found.");

  const fileName = fileData?.name || "Dropbox file";
  const kind = classifyFile(blob, fileName);
  const previewBlob = createPreviewBlob(blob, fileName, kind);
  const mount = document.createElement("div");
  mount.className = "lux-dropbox-preview";
  style(mount, { display: "flex", width: "100%", height: "auto", minHeight: "100%", boxSizing: "border-box", justifyContent: "center", alignItems: "center", overflow: "visible", background: "#ffffff" });

  let objectUrl = null;
  let needsPdfMount = false;

  if (kind === "pdf") {
    objectUrl = URL.createObjectURL(previewBlob);
    mount.classList.add("lux-dropbox-pdf-preview");
    mount.style.flexDirection = "column";
    mount.style.justifyContent = "flex-start";
    mount.style.alignItems = "stretch";
    const loading = document.createElement("p");
    loading.className = "lux-pdf-loading";
    loading.textContent = "Loading Mozilla PDF.js…";
    style(loading, { margin: "auto", padding: "24px", color: "#475569", textAlign: "center" });
    mount.append(loading);
    needsPdfMount = true;
  } else if (kind === "image") {
    objectUrl = URL.createObjectURL(previewBlob);
    const image = document.createElement("img");
    image.src = objectUrl;
    image.alt = fileName;
    style(image, { display: "block", maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain" });
    mount.append(image);
  } else if (kind === "markdown" || kind === "text") {
    mount.style.alignItems = "stretch";
    mount.style.justifyContent = "flex-start";
    const article = createDocumentShell(fileName, kind === "markdown" ? "markdown" : "text");

    if (blob.size > MAX_TEXT_PREVIEW_BYTES) {
      objectUrl = URL.createObjectURL(blob);
      const note = document.createElement("p");
      note.textContent = "This file is larger than the 2 MB in-view text preview limit. Download it to read it without freezing the workspace.";
      article.append(note, makeDownloadLink(objectUrl, fileName));
    } else {
      const text = await blob.text();
      if (kind === "markdown") {
        appendMarkdown(text, article);
      } else {
        const pre = document.createElement("pre");
        pre.textContent = text;
        style(pre, { margin: "0", padding: "0.9rem", overflow: "visible", border: "1px solid #e5e7eb", borderRadius: "7px", background: "#f8fafc", color: "#111827", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", fontSize: "0.88rem", lineHeight: "1.6" });
        article.append(pre);
      }
    }
    mount.append(article);
  } else {
    objectUrl = URL.createObjectURL(blob);
    mount.style.flexDirection = "column";
    mount.style.alignItems = "flex-start";
    mount.style.justifyContent = "flex-start";
    mount.style.gap = "0.75rem";
    mount.style.padding = "1rem";
    const note = document.createElement("p");
    note.textContent = "This file type does not have an in-view preview yet. You can still download it.";
    style(note, { margin: "0", color: "#374151" });
    mount.append(note, makeDownloadLink(objectUrl, fileName));
  }

  const previous = viewportAssignments.get(viewportType);
  scrollArea.scrollTop = 0;
  scrollArea.scrollLeft = 0;
  scrollArea.replaceChildren(mount);
  viewport.dataset.fileName = fileName;
  const assignment = {
    blob, editedBlob: null, editor: null, hasPdfEdits: false, kind,
    objectUrl, mount, fileData, metadata, originalPath, originalRevision, viewportType
  };
  viewportAssignments.set(viewportType, assignment);
  if (previous) revokeAssignment(viewportType, previous);
  ensureViewportObserver(viewportType, scrollArea);

  if (needsPdfMount) {
    try {
      const pdfEditor = await mountPdfEditor({
        root: mount,
        blob: previewBlob,
        fileName,
        viewportType,
        scrollContainer: scrollArea,
        toolbarContainer: getViewportToolbarElement(viewportType),
        onDirty() {
          assignment.hasPdfEdits = true;
        },
        onEdited(editedBlob) {
          assignment.editedBlob = editedBlob;
          assignment.hasPdfEdits = true;
        }
      });
      const currentViewportType = assignment.viewportType || viewportType;
      const currentViewport = getViewportElement(currentViewportType);
      if (viewportAssignments.get(currentViewportType) !== assignment || !currentViewport?.contains(mount)) {
        await pdfEditor.dispose();
        return;
      }
      assignment.editor = pdfEditor;
    } catch (error) {
      const errorPanel = document.createElement("div");
      errorPanel.className = "lux-pdf-load-error";
      style(errorPanel, { margin: "auto", maxWidth: "520px", padding: "24px", color: "#273449", lineHeight: "1.6" });
      const heading = document.createElement("h2");
      heading.textContent = "PDF.js could not open this document";
      style(heading, { margin: "0 0 8px", fontSize: "1.1rem" });
      const explanation = document.createElement("p");
      explanation.textContent = (error?.message || "Unknown loading error") + " Check the connection to the pinned Mozilla PDF.js assets and try opening the PDF again.";
      const download = makeDownloadLink(objectUrl, fileName);
      errorPanel.append(heading, explanation, download);
      const errorTarget = mount.shadowRoot || mount;
      errorTarget.replaceChildren(errorPanel);
      throw error;
    }
  }
}
window.addEventListener(ASSIGNMENT_EVENT, (event) => {
  const detail = event.detail || {};
  void (async () => {
    try {
      await renderAssignment(detail);
      window.dispatchEvent(new CustomEvent(RESULT_EVENT, {
        detail: { requestId: detail.requestId, success: true, viewportType: detail.viewportType, fileName: detail.fileData?.name || "Dropbox file" }
      }));
    } catch (error) {
      console.error("Dropbox viewport rendering failed:", error);
      window.dispatchEvent(new CustomEvent(RESULT_EVENT, {
        detail: { requestId: detail.requestId, success: false, viewportType: detail.viewportType, message: error?.message || "The viewport could not render this file." }
      }));
    }
  })();
});

window.LuxOmniViewportBridge = {
  async exportEditedBlob(viewportType) {
    if (!VALID_VIEWPORTS.has(viewportType)) throw new TypeError('viewportType must be "left", "right", or "full".');
    const assignment = viewportAssignments.get(viewportType);
    if (!assignment) throw new Error("No file is loaded in the " + viewportType + " viewport.");
    if (assignment.editor && assignment.hasPdfEdits) {
      assignment.editedBlob = await assignment.editor.exportEditedBlob();
    }
    return assignment.editedBlob || assignment.blob;
  },

  setEditedBlob(viewportType, blob) {
    if (!VALID_VIEWPORTS.has(viewportType)) throw new TypeError('viewportType must be "left", "right", or "full".');
    if (!(blob instanceof Blob)) throw new TypeError("The edited document must be provided as a Blob.");
    const assignment = viewportAssignments.get(viewportType);
    if (!assignment) throw new Error("No file is loaded in the " + viewportType + " viewport.");
    assignment.editedBlob = blob;
    assignment.hasPdfEdits = true;
  },

  markSaved(viewportType, blob, result = {}) {
    const assignment = viewportAssignments.get(viewportType);
    if (!assignment) return;
    assignment.blob = blob;
    assignment.editedBlob = null;
    assignment.hasPdfEdits = false;
    assignment.editor?.markSaved?.();
    assignment.originalRevision = result?.rev || assignment.originalRevision;
    assignment.metadata = { ...(assignment.metadata || {}), ...(result || {}) };
  },

  getViewportAssignment(viewportType) {
    const assignment = viewportAssignments.get(viewportType);
    if (!assignment) return null;
    return {
      fileData: assignment.fileData,
      originalPath: assignment.originalPath,
      originalRevision: assignment.originalRevision,
      hasEditedBlob: Boolean(assignment.editedBlob || assignment.hasPdfEdits)
    };
  },

  async moveViewportContents(sourceSide, targetSide) {
    if (!VALID_VIEWPORTS.has(sourceSide) || !VALID_VIEWPORTS.has(targetSide) || sourceSide === targetSide) {
      return false;
    }

    const sourceViewport = getViewportElement(sourceSide);
    const targetViewport = getViewportElement(targetSide);
    const sourceScrollArea = getViewportScrollElement(sourceSide);
    const targetScrollArea = getViewportScrollElement(targetSide);
    if (!sourceViewport || !targetViewport || !sourceScrollArea || !targetScrollArea) return false;

    const sourceName = sourceViewport.dataset.fileName || "";
    const sourceAssignment = viewportAssignments.get(sourceSide);
    const targetAssignment = viewportAssignments.get(targetSide);
    const sourceNodes = Array.from(sourceScrollArea.childNodes);
    if (!sourceName && sourceNodes.length === 0 && !sourceAssignment) return false;

    // PDF.js is attached to a concrete viewport scroll element. Capture the
    // live state and serialize pending edits before reattaching it to a new
    // viewport so the destination owns the native vertical/horizontal bars.
    let pdfViewState = null;
    if (sourceAssignment?.editor) {
      pdfViewState = sourceAssignment.editor.getViewState?.() || null;
      if (sourceAssignment.hasPdfEdits || sourceAssignment.editor.isDirty) {
        sourceAssignment.editedBlob = await sourceAssignment.editor.exportEditedBlob();
        sourceAssignment.hasPdfEdits = true;
      }
      await sourceAssignment.editor.dispose();
      sourceAssignment.editor = null;
    }

    // Disconnect observers before the deliberate DOM move; otherwise the old
    // viewport could interpret the reparenting as a closed document.
    for (const side of [sourceSide, targetSide]) {
      viewportObservers.get(side)?.disconnect();
      viewportObservers.delete(side);
    }

    // The UI only calls this after the occupied-destination confirmation.
    if (targetAssignment) revokeAssignment(targetSide, targetAssignment);

    const preservedScrollTop = pdfViewState?.scrollTop ?? sourceScrollArea.scrollTop;
    const preservedScrollLeft = pdfViewState?.scrollLeft ?? sourceScrollArea.scrollLeft;
    viewportAssignments.delete(sourceSide);
    targetScrollArea.replaceChildren();
    sourceScrollArea.replaceChildren();
    targetScrollArea.append(...sourceNodes);
    targetViewport.dataset.fileName = sourceName;
    delete sourceViewport.dataset.fileName;
    sourceScrollArea.scrollTop = 0;
    sourceScrollArea.scrollLeft = 0;
    targetScrollArea.scrollTop = 0;
    targetScrollArea.scrollLeft = 0;

    if (sourceAssignment) {
      sourceAssignment.viewportType = targetSide;
      viewportAssignments.set(targetSide, sourceAssignment);
    }

    ensureViewportObserver(sourceSide, sourceScrollArea);
    ensureViewportObserver(targetSide, targetScrollArea);

    if (sourceAssignment?.kind === "pdf") {
      try {
        const pdfEditor = await mountPdfEditor({
          root: sourceAssignment.mount,
          blob: sourceAssignment.editedBlob || sourceAssignment.blob,
          fileName: sourceAssignment.fileData?.name || sourceName,
          viewportType: targetSide,
          scrollContainer: targetScrollArea,
          toolbarContainer: getViewportToolbarElement(targetSide),
          initiallyDirty: Boolean(sourceAssignment.hasPdfEdits),
          viewState: pdfViewState,
          onDirty() {
            sourceAssignment.hasPdfEdits = true;
          },
          onEdited(editedBlob) {
            sourceAssignment.editedBlob = editedBlob;
            sourceAssignment.hasPdfEdits = true;
          }
        });
        if (viewportAssignments.get(targetSide) === sourceAssignment &&
            targetScrollArea.contains(sourceAssignment.mount)) {
          sourceAssignment.editor = pdfEditor;
          targetScrollArea.scrollTop = Math.max(0, Number(preservedScrollTop) || 0);
          targetScrollArea.scrollLeft = Math.max(0, Number(preservedScrollLeft) || 0);
        } else {
          await pdfEditor.dispose();
          sourceAssignment.editor = null;
        }
      } catch (error) {
        // Keep the assignment recoverable even if a transient CDN/runtime issue
        // prevents the editor from reopening after the move.
        console.error("PDF editor could not reattach to the destination viewport:", error);
        sourceAssignment.editor = null;
        const errorPanel = document.createElement("div");
        errorPanel.className = "lux-pdf-load-error";
        style(errorPanel, { margin: "auto", maxWidth: "520px", padding: "24px", color: "#273449", lineHeight: "1.6" });
        const heading = document.createElement("h2");
        heading.textContent = "PDF moved, but the editor could not restart";
        style(heading, { margin: "0 0 8px", fontSize: "1.1rem" });
        const explanation = document.createElement("p");
        explanation.textContent = (error?.message || "Unknown loading error") + " The document remains assigned to this viewport. Check the PDF.js connection and reload it to continue editing.";
        style(explanation, { margin: "0 0 12px" });
        const fallbackBlob = sourceAssignment.editedBlob || sourceAssignment.blob;
        const fallbackUrl = URL.createObjectURL(fallbackBlob);
        const download = makeDownloadLink(fallbackUrl, sourceName || "document.pdf");
        errorPanel.append(heading, explanation, download);
        (sourceAssignment.mount.shadowRoot || sourceAssignment.mount).replaceChildren(errorPanel);
      }
    }
    return true;
  }};

window.addEventListener("pagehide", () => {
  for (const [viewportType, assignment] of viewportAssignments) revokeAssignment(viewportType, assignment);
  for (const observer of viewportObservers.values()) observer.disconnect();
  viewportObservers.clear();
});
