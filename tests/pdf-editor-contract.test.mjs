import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const engine = read("site/pdf-engine.js");
const bridge = read("site/dropbox-viewport-bridge.js");
const syncUi = read("site/dropbox-ui.js");
const index = read("site/index.html");
const styles = read("site/pdf-editor.css");
const notices = read("THIRD_PARTY_NOTICES.md");
const privacy = read("site/privacy.html");
const readme = read("README.md");

test("PDF.js dependency and worker are pinned to the same release", () => {
  assert.match(engine, /const PDFJS_VERSION = "6\.4\.299"/);
  assert.match(engine, /PDFJS_BASE \+ "\/build\/pdf\.mjs"/);
  assert.match(engine, /PDFJS_BASE \+ "\/web\/pdf_viewer\.mjs"/);
  assert.match(engine, /GlobalWorkerOptions\.workerSrc = PDFJS_BASE \+ "\/build\/pdf\.worker\.mjs"/);
  assert.match(engine, /\/cmaps\//);
  assert.match(engine, /\/standard_fonts\//);
});

test("PDF iframe path is removed while other viewport previews remain independent", () => {
  const start = bridge.indexOf("async function renderAssignment(detail)");
  const end = bridge.indexOf("window.addEventListener(ASSIGNMENT_EVENT", start);
  assert.ok(start >= 0 && end > start, "viewport renderer should be present");
  const renderer = bridge.slice(start, end);
  assert.match(renderer, /mountPdfEditor/);
  assert.doesNotMatch(renderer, /createElement\(["']iframe["']\)/);
  assert.match(renderer, /kind === "image"/);
  assert.match(renderer, /kind === "markdown" \|\| kind === "text"/);
  assert.match(bridge, /const viewportAssignments = new Map\(\)/);
  assert.match(bridge, /assignment\.editor\?\.dispose/);
});

test("annotation toolbar connects to PDF.js editor modes", () => {
  for (const mode of ["HIGHLIGHT", "INK", "FREETEXT", "STAMP"]) {
    assert.ok(engine.includes("AnnotationEditorType." + mode), "missing editor mode " + mode);
  }
  assert.match(engine, /AnnotationEditorType\.SIGNATURE/);
  assert.match(engine, /pdfViewer\.annotationEditorMode = \{ mode: chosenMode \}/);
  assert.match(engine, /scrollContainer\.addEventListener\("input", markDirty, true\)/);
  assert.match(engine, /scrollContainer\.addEventListener\("change", markDirty, true\)/);
  assert.match(engine, /eventBus\.on\("annotationeditorstateschanged"/);
});

test("PDF export feeds the viewport bridge and Dropbox revision-protected Sync", () => {
  assert.match(engine, /pdfDocument\.saveDocument\(\)/);
  assert.match(engine, /onEdited\?\.\(editedBlob\)/);
  assert.match(bridge, /assignment\.editor\.exportEditedBlob\(\)/);
  assert.match(bridge, /assignment\.editor\?\.markSaved\?\.\(\)/);
  assert.match(syncUi, /saveEditedFile\(\{/);
  assert.match(syncUi, /originalRevision: source\.originalRevision/);
  assert.match(syncUi, /viewportBridge\.markSaved\?\.\(viewportType, editedBlob, result\)/);
});

test("PDF editor styling is linked and licence/privacy notices disclose the CDN", () => {
  assert.match(index, /href="\.\/*pdf-editor\.css"/);
  assert.match(styles, /\.lux-pdf-toolbar/);
  assert.match(styles, /\.annotationEditorLayer/);
  assert.match(notices, /Mozilla PDF\.js/);
  assert.match(notices, /Apache License 2\.0/);
  assert.match(notices, /pdfjs-dist@6\.4\.299/);
  assert.match(privacy, /jsDelivr CDN/);
  assert.match(readme, /Mozilla PDF\.js \*\*6\.4\.299\*\*/);
});
