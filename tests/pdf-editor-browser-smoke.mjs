import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("../site/", import.meta.url)));
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm"
};

function makeOnePagePdf() {
  const stream = "BT /F1 24 Tf 72 720 Td (Lux Omni PDF runtime smoke test) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Length " + Buffer.byteLength(stream, "ascii") + " >>\nstream\n" + stream + "endstream"
  ];
  let pdf = "%PDF-1.7\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets[index + 1] = Buffer.byteLength(pdf, "ascii");
    pdf += (index + 1) + " 0 obj\n" + object + "\nendobj\n";
  });
  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    pdf += offset.toString().padStart(10, "0") + " 00000 n \n";
  }
  pdf += "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF\n";
  return Buffer.from(pdf, "ascii");
}

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    const relative = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
    const filePath = resolve(root, "." + relative);
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(content);
  } catch (error) {
    response.writeHead(error?.code === "ENOENT" ? 404 : 500).end("Not found");
  }
});

await new Promise((resolvePromise, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolvePromise);
});

const address = server.address();
if (!address || typeof address === "string") throw new Error("The smoke-test server did not bind to a TCP port.");
const baseUrl = "http://127.0.0.1:" + address.port;
const browserErrors = [];
const networkFailures = [];
let browser;

try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const nativeDialogs = [];
  page.on("dialog", async (dialog) => {
    nativeDialogs.push(dialog.type());
    await dialog.dismiss();
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("requestfailed", (request) => {
    if (request.url().includes("cdn.jsdelivr.net")) {
      networkFailures.push(request.url() + " — " + (request.failure()?.errorText || "request failed"));
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.route("https://www.youtube.com/embed/**", (route) => route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: "<!doctype html><title>Embedded YouTube smoke test</title>"
  }));

  const response = await page.goto(baseUrl, { waitUntil: "load", timeout: 30000 });
  assert.equal(response?.status(), 200, "Lux Omni index should load successfully");
  await page.waitForFunction(() => typeof window.LuxOmniViewportBridge?.exportEditedBlob === "function", null, { timeout: 15000 });

  assert.equal(await page.locator("#sidebar-youtube-button").count(), 1, "YouTube action should live in the sidebar");
  assert.equal(
    await page.locator("#viewport-youtube-full, #viewport-youtube-left, #viewport-youtube-right").count(),
    0,
    "YouTube actions should not occupy viewport toolbars"
  );

  const youtubeTile = page.locator("#youtube-tile");
  const youtubeUrl = page.locator("#youtube-video-url");
  await page.locator("#sidebar-youtube-button").click();
  await youtubeTile.waitFor({ state: "visible", timeout: 3000 });
  assert.equal(await youtubeTile.locator("[data-youtube-target]").count(), 3, "tile should show exactly three destination buttons");
  assert.equal(await youtubeUrl.isVisible(), true, "tile should contain an in-page link field");
  await youtubeUrl.fill("not a YouTube link");
  await youtubeTile.locator('[data-youtube-target="full"]').click();
  await page.locator("#youtube-tile-feedback").waitFor({ state: "visible", timeout: 3000 });
  assert.equal(await page.locator('[data-viewport-side="full"] .viewport-youtube-frame').count(), 0, "invalid links must not switch the viewport");
  await youtubeUrl.fill("https://youtu.be/dQw4w9WgXcQ");
  await youtubeTile.locator('[data-youtube-target="full"]').click();
  const fullYoutubeFrame = page.locator('[data-viewport-side="full"] .viewport-youtube-frame');
  await fullYoutubeFrame.waitFor({ state: "attached", timeout: 5000 });
  assert.equal(await fullYoutubeFrame.getAttribute("src"), "https://www.youtube.com/embed/dQw4w9WgXcQ");
  assert.equal(await youtubeTile.evaluate((element) => element.hidden), true, "tile should close after choosing a destination");

  await page.locator("#sidebar-youtube-button").click();
  await youtubeUrl.fill("https://www.youtube.com/watch?v=oHg5SJYRHA0");
  await youtubeTile.locator('[data-youtube-target="left"]').click();
  const leftYoutubeFrame = page.locator('[data-viewport-side="left"] .viewport-youtube-frame');
  await leftYoutubeFrame.waitFor({ state: "attached", timeout: 5000 });
  assert.equal(await leftYoutubeFrame.getAttribute("src"), "https://www.youtube.com/embed/oHg5SJYRHA0");

  await page.locator("#sidebar-youtube-button").click();
  await youtubeUrl.fill("https://www.youtube.com/shorts/M7lc1UVf-VE");
  await youtubeTile.locator('[data-youtube-target="right"]').click();
  const rightYoutubeFrame = page.locator('[data-viewport-side="right"] .viewport-youtube-frame');
  await rightYoutubeFrame.waitFor({ state: "attached", timeout: 5000 });
  assert.equal(await rightYoutubeFrame.getAttribute("src"), "https://www.youtube.com/embed/M7lc1UVf-VE");

  await page.locator("#sidebar-youtube-button").click();
  await youtubeUrl.fill("https://youtu.be/dQw4w9WgXcQ");
  await youtubeTile.locator('[data-youtube-target="full"]').click();
  await fullYoutubeFrame.waitFor({ state: "attached", timeout: 5000 });
  assert.equal(nativeDialogs.length, 0, "YouTube workflow must not open native browser dialogs");
  console.log("PASS: YouTube opens an in-page tile with a link field and exactly three destination buttons.");
  console.log("PASS: Left, Right, and Full Screen load the chosen URL into the correct viewport.");
  console.log("PASS: invalid links show inline feedback and no native browser dialogs are opened.");

  const sidebarBefore = await page.locator("#sidebar").evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    position: getComputedStyle(element).position,
    innerWidth: element.querySelector(".sidebar-inner")?.getBoundingClientRect().width
  }));
  const pdfBytes = makeOnePagePdf();
  const assignment = await page.evaluate(async (numericBytes) => {
    const requestId = "pdfjs-smoke-" + Date.now();
    return await new Promise((resolveResult, rejectResult) => {
      const timeoutId = window.setTimeout(() => {
        window.removeEventListener("lux:dropbox-viewport-assignment-result", listener);
        rejectResult(new Error("Timed out waiting for the PDF viewport assignment result."));
      }, 60000);
      function listener(event) {
        if (event.detail?.requestId !== requestId) return;
        window.clearTimeout(timeoutId);
        window.removeEventListener("lux:dropbox-viewport-assignment-result", listener);
        resolveResult(event.detail);
      }
      window.addEventListener("lux:dropbox-viewport-assignment-result", listener);
      const blob = new Blob([new Uint8Array(numericBytes)], { type: "application/pdf" });
      window.dispatchEvent(new CustomEvent("lux:dropbox-viewport-assignment-request", {
        detail: {
          requestId,
          blob,
          fileData: { name: "lux-omni-runtime-smoke.pdf", path_display: "/lux-omni-runtime-smoke.pdf" },
          metadata: { rev: "smoke-test-revision" },
          originalPath: "/lux-omni-runtime-smoke.pdf",
          originalRevision: "smoke-test-revision",
          viewportType: "full"
        }
      }));
    });
  }, Array.from(pdfBytes));

  assert.equal(assignment.success, true, "the viewport bridge should successfully open the PDF: " + (assignment.message || ""));
  await page.locator(".lux-pdf-toolbar").waitFor({ state: "visible", timeout: 45000 });
  await page.locator(".pdfViewer .page canvas").first().waitFor({ state: "visible", timeout: 30000 });
  await page.waitForFunction(() => {
    const host = document.querySelector('[data-viewport-side="full"] .lux-dropbox-preview');
    return host?.shadowRoot?.querySelectorAll(".pdfViewer .page").length === 1;
  }, null, { timeout: 15000 });

  const sidebarAfter = await page.locator("#sidebar").evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    position: getComputedStyle(element).position,
    innerWidth: element.querySelector(".sidebar-inner")?.getBoundingClientRect().width
  }));
  assert.deepEqual(sidebarAfter, sidebarBefore, "loading the PDF.js viewer must not change the Lux Omni sidebar geometry");
  assert.equal(sidebarAfter.width, 68, "the desktop compact sidebar must retain its original 68px width");
  console.log("PASS: generated PDF rendered through PDF.js inside the Lux Omni viewport.");
  console.log("PASS: PDF.js styles do not alter the previous 68px sidebar width or geometry.");

  const pageCount = await page.locator(".lux-pdf-page-count").textContent();
  assert.match(pageCount || "", /of 1$/, "page count should be correct");

  const highlightButton = page.locator('[data-pdf-command="highlight"]');
  await highlightButton.click();
  assert.equal(await highlightButton.getAttribute("aria-pressed"), "true", "highlight tool should activate");
  const penButton = page.locator('[data-pdf-command="pen"]');
  await penButton.click();
  assert.equal(await penButton.getAttribute("aria-pressed"), "true", "pen tool should activate");
  console.log("PASS: highlight and pen toolbar commands activate without runtime errors.");

  await page.locator('[data-pdf-command="text"]').click();
  const pdfPage = page.locator(".pdfViewer .page").first();
  const bounds = await pdfPage.boundingBox();
  assert.ok(bounds && bounds.width > 100 && bounds.height > 100, "PDF page should have a measurable rendered size");
  await page.mouse.click(bounds.x + Math.min(150, bounds.width * 0.3), bounds.y + Math.min(180, bounds.height * 0.3));
  const editorTextBox = page.locator('.annotationEditorLayer [contenteditable="true"]').last();
  await editorTextBox.waitFor({ state: "visible", timeout: 12000 });
  await editorTextBox.fill("Lux Omni annotation smoke test");
  await page.mouse.click(bounds.x + bounds.width * 0.85, bounds.y + bounds.height * 0.85);
  await page.waitForFunction(() => {
    const host = document.querySelector('[data-viewport-side="full"] .lux-dropbox-preview');
    const status = host?.shadowRoot?.querySelector(".lux-pdf-status");
    return status?.dataset.state === "dirty";
  }, null, { timeout: 12000 });
  console.log("PASS: a free-text annotation can be created and marks the document as changed.");

  const exported = await page.evaluate(async () => {
    const blob = await window.LuxOmniViewportBridge.exportEditedBlob("full");
    return {
      isBlob: blob instanceof Blob,
      mime: blob.type,
      size: blob.size,
      header: await blob.slice(0, 5).text()
    };
  });
  assert.equal(exported.isBlob, true, "edited export should be a Blob");
  assert.equal(exported.mime, "application/pdf", "edited export should keep the PDF MIME type");
  assert.equal(exported.header, "%PDF-", "edited export should contain PDF bytes");
  assert.ok(exported.size > 100, "edited PDF export should not be empty");
  console.log("PASS: viewport bridge exports serialized PDF bytes after annotation.");

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 20000 }),
    page.locator('[data-pdf-command="download"]').click()
  ]);
  assert.match(download.suggestedFilename(), /\.pdf$/i, "Save PDF should download a .pdf file");
  console.log("PASS: Save PDF initiates a PDF download.");

  if (browserErrors.length || networkFailures.length) {
    throw new Error("Browser errors:\n" + browserErrors.join("\n") + "\nCDN request failures:\n" + networkFailures.join("\n"));
  }
  console.log("PASS: no uncaught browser/console errors or failed PDF.js CDN requests.");
} finally {
  await browser?.close();
  await new Promise((resolvePromise) => server.close(resolvePromise));
}
