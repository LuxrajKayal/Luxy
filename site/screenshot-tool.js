const buttons = ["full", "left", "right"]
  .map((side) => document.querySelector("#viewport-screenshot-" + side))
  .filter(Boolean);
const selection = document.querySelector("#lux-screenshot-selection");
const box = document.querySelector("#lux-screenshot-selection-box");
const selectionHelp = document.querySelector("#lux-screenshot-selection-help");
const modal = document.querySelector("#lux-screenshot-modal");
const closeButton = document.querySelector("#lux-screenshot-discard");
const copyButton = document.querySelector("#lux-screenshot-copy");
const workarea = document.querySelector("#lux-screenshot-workarea");
const stage = document.querySelector("#lux-screenshot-canvas-stage");
const imageCanvas = document.querySelector("#lux-screenshot-image");
const inkCanvas = document.querySelector("#lux-screenshot-annotations");
const zoomLabel = document.querySelector("#lux-screenshot-zoom-label");
const status = document.querySelector("#lux-screenshot-status");
const notice = document.querySelector("#lux-screenshot-notice");
const imageCtx = imageCanvas?.getContext("2d");
const inkCtx = inkCanvas?.getContext("2d");

let snapshot = null;
let viewportWidth = 0;
let viewportHeight = 0;
let launchButton = null;
let startPoint = null;
let drawing = false;
let capturing = false;
let tool = "pen";
let color = "#dc2626";
let zoom = 1;
let baseWidth = 0;
let baseHeight = 0;
let textEditor = null;

function message(text) {
  if (!notice) return;
  notice.textContent = text;
  notice.hidden = false;
  clearTimeout(message.timer);
  message.timer = setTimeout(() => { notice.hidden = true; }, 6500);
}
function setStatus(text) {
  if (status) status.textContent = text;
}
function stopTracks(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}
function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function captureTabFrame() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("This browser cannot capture tab pixels. Open Lux Omni over HTTPS in a supported browser.");
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface: "browser" },
    audio: false
  });
  try {
    const track = stream.getVideoTracks()[0];
    if (!track) throw new Error("The browser did not provide a video capture stream.");
    const surface = track.getSettings?.().displaySurface;
    if (surface && surface !== "browser") {
      throw new Error("Please choose the Lux Omni browser tab, not an entire screen or another window.");
    }

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px";
    document.body.append(video);
    try {
      await video.play();
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise((resolve, reject) => {
          video.addEventListener("loadeddata", resolve, { once: true });
          video.addEventListener("error", () => reject(new Error("The browser capture stream did not start.")), { once: true });
        });
      }
      if (video.requestVideoFrameCallback) {
        await new Promise((resolve) => video.requestVideoFrameCallback(() => resolve()));
      } else {
        await nextFrame();
      }
      if (!video.videoWidth || !video.videoHeight) throw new Error("The captured tab returned an empty frame.");
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Screenshot image processing is unavailable.");
      context.drawImage(video, 0, 0);
      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;
      return canvas;
    } finally {
      video.pause();
      video.srcObject = null;
      video.remove();
    }
  } finally {
    // Capture one frame only; do not keep a live screen-sharing stream open.
    stopTracks(stream);
  }
}

async function startSelection(button) {
  if (capturing || !selection || !modal) return;
  capturing = true;
  launchButton = button;
  button.setAttribute("aria-busy", "true");
  message("In the browser capture picker, choose the Lux Omni tab.");
  try {
    snapshot = await captureTabFrame();
    startPoint = null;
    box.hidden = true;
    selectionHelp.textContent = "Drag to select an area of this viewport · Esc to cancel";
    selection.hidden = false;
    document.body.classList.add("lux-screenshot-selecting");
    selection.focus({ preventScroll: true });
  } catch (error) {
    if (error?.name !== "AbortError" && error?.name !== "NotAllowedError") {
      message(error?.message || "Unable to capture this browser tab.");
    } else {
      notice.hidden = true;
    }
  } finally {
    capturing = false;
    button.removeAttribute("aria-busy");
  }
}

function clippedPoint(event) {
  return {
    x: Math.max(0, Math.min(window.innerWidth, event.clientX)),
    y: Math.max(0, Math.min(window.innerHeight, event.clientY))
  };
}
function updateBox(a, b) {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  box.style.left = left + "px";
  box.style.top = top + "px";
  box.style.width = width + "px";
  box.style.height = height + "px";
  box.hidden = false;
  selectionHelp.textContent = Math.round(width) + " × " + Math.round(height) + " px · Release to capture · Esc to cancel";
  return { left, top, width, height };
}
function cancelSelection() {
  selection.hidden = true;
  document.body.classList.remove("lux-screenshot-selecting");
  snapshot = null;
  startPoint = null;
  box.hidden = true;
  launchButton?.focus?.({ preventScroll: true });
}
function cropSnapshot(bounds) {
  if (!snapshot || bounds.width < 8 || bounds.height < 8) return null;
  const scaleX = snapshot.width / viewportWidth;
  const scaleY = snapshot.height / viewportHeight;
  const sx = Math.max(0, Math.floor(bounds.left * scaleX));
  const sy = Math.max(0, Math.floor(bounds.top * scaleY));
  const sw = Math.min(snapshot.width - sx, Math.max(1, Math.round(bounds.width * scaleX)));
  const sh = Math.min(snapshot.height - sy, Math.max(1, Math.round(bounds.height * scaleY)));
  if (sw <= 0 || sh <= 0) return null;
  const crop = document.createElement("canvas");
  crop.width = sw;
  crop.height = sh;
  const ctx = crop.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(snapshot, sx, sy, sw, sh, 0, 0, sw, sh);
  return crop;
}

function setToolButtons() {
  document.querySelectorAll("[data-lux-screenshot-tool]").forEach((button) => {
    const active = button.dataset.luxScreenshotTool === tool;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  inkCanvas?.classList.toggle("is-text-tool", tool === "text");
}
function setColorButtons() {
  document.querySelectorAll("[data-lux-screenshot-color]").forEach((button) => {
    const active = button.dataset.luxScreenshotColor === color;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}
function setZoom() {
  const width = Math.max(1, baseWidth * zoom);
  const height = Math.max(1, baseHeight * zoom);
  stage.style.width = width + "px";
  stage.style.height = height + "px";
  [imageCanvas, inkCanvas].forEach((canvas) => {
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
  });
  zoomLabel.textContent = Math.round(zoom * 100) + "%";
}
function openEditor(crop, bounds) {
  if (!crop || !imageCtx || !inkCtx) {
    message("The selected area could not be captured. Please try again.");
    cancelSelection();
    return;
  }
  imageCanvas.width = crop.width;
  imageCanvas.height = crop.height;
  inkCanvas.width = crop.width;
  inkCanvas.height = crop.height;
  imageCtx.clearRect(0, 0, crop.width, crop.height);
  imageCtx.drawImage(crop, 0, 0);
  inkCtx.clearRect(0, 0, crop.width, crop.height);
  baseWidth = bounds.width;
  baseHeight = bounds.height;
  zoom = 1;
  tool = "pen";
  color = "#dc2626";
  setToolButtons();
  setColorButtons();
  modal.hidden = false;
  selection.hidden = true;
  document.body.classList.remove("lux-screenshot-selecting");
  document.body.classList.add("lux-screenshot-editor-open");
  snapshot = null;
  setStatus("Ready to annotate. Use the red × to discard this capture.");
  requestAnimationFrame(() => {
    const availableWidth = Math.max(160, workarea.clientWidth - 28);
    const availableHeight = Math.max(120, workarea.clientHeight - 28);
    zoom = Math.min(1, availableWidth / baseWidth, availableHeight / baseHeight);
    setZoom();
    closeButton.focus({ preventScroll: true });
  });
}

selection?.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  startPoint = clippedPoint(event);
  updateBox(startPoint, startPoint);
  selection.setPointerCapture?.(event.pointerId);
});
selection?.addEventListener("pointermove", (event) => {
  if (!startPoint) return;
  event.preventDefault();
  updateBox(startPoint, clippedPoint(event));
});
selection?.addEventListener("pointerup", (event) => {
  if (!startPoint) return;
  const bounds = updateBox(startPoint, clippedPoint(event));
  startPoint = null;
  openEditor(cropSnapshot(bounds), bounds);
});
selection?.addEventListener("pointercancel", () => {
  startPoint = null;
  box.hidden = true;
});

function finishTextEntry(save) {
  const input = textEditor;
  if (!input) return;
  textEditor = null;
  const value = input.value.trimEnd();
  const x = Number(input.dataset.canvasX);
  const y = Number(input.dataset.canvasY);
  const fontSize = Number(input.dataset.fontSize);
  input.remove();
  if (!save || !value.trim()) return;
  inkCtx.save();
  inkCtx.globalCompositeOperation = "source-over";
  inkCtx.fillStyle = color;
  inkCtx.font = "600 " + fontSize + "px system-ui, sans-serif";
  inkCtx.textBaseline = "top";
  value.split("\n").forEach((line, index) => inkCtx.fillText(line, x, y + index * fontSize * 1.25));
  inkCtx.restore();
}
function canvasPoint(event) {
  const rect = inkCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(inkCanvas.width, (event.clientX - rect.left) * inkCanvas.width / rect.width)),
    y: Math.max(0, Math.min(inkCanvas.height, (event.clientY - rect.top) * inkCanvas.height / rect.height))
  };
}
function addTextEntry(point) {
  finishTextEntry(true);
  const input = document.createElement("textarea");
  input.className = "lux-screenshot-text-entry";
  input.rows = 1;
  input.placeholder = "Type text…";
  input.setAttribute("aria-label", "Text to add to screenshot");
  const scale = baseWidth / inkCanvas.width;
  input.style.left = (point.x / inkCanvas.width * baseWidth * zoom) + "px";
  input.style.top = (point.y / inkCanvas.height * baseHeight * zoom) + "px";
  input.style.fontSize = (18 * zoom) + "px";
  input.style.minWidth = (150 * zoom) + "px";
  input.dataset.canvasX = String(point.x);
  input.dataset.canvasY = String(point.y);
  input.dataset.fontSize = String(18 / scale);
  stage.append(input);
  textEditor = input;
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      finishTextEntry(false);
    } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      finishTextEntry(true);
    }
  });
  input.addEventListener("blur", () => {
    if (textEditor === input) finishTextEntry(true);
  });
  input.focus();
}
function beginInk(event) {
  if (event.button !== 0) return;
  if (tool === "text") {
    event.preventDefault();
    addTextEntry(canvasPoint(event));
    return;
  }
  if (!["pen", "brush", "eraser"].includes(tool)) return;
  finishTextEntry(true);
  event.preventDefault();
  drawing = true;
  inkCanvas.setPointerCapture?.(event.pointerId);
  const point = canvasPoint(event);
  inkCtx.save();
  inkCtx.lineCap = "round";
  inkCtx.lineJoin = "round";
  inkCtx.lineWidth = (tool === "brush" ? 8 : tool === "eraser" ? 18 : 2.6) * inkCanvas.width / baseWidth;
  inkCtx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
  inkCtx.strokeStyle = color;
  inkCtx.beginPath();
  inkCtx.moveTo(point.x, point.y);
  inkCtx.lineTo(point.x + 0.01, point.y + 0.01);
  inkCtx.stroke();
  inkCtx.beginPath();
  inkCtx.moveTo(point.x, point.y);
}
function continueInk(event) {
  if (!drawing) return;
  event.preventDefault();
  const point = canvasPoint(event);
  inkCtx.lineTo(point.x, point.y);
  inkCtx.stroke();
}
function endInk() {
  if (!drawing) return;
  drawing = false;
  inkCtx.closePath();
  inkCtx.restore();
}
inkCanvas?.addEventListener("pointerdown", beginInk);
inkCanvas?.addEventListener("pointermove", continueInk);
inkCanvas?.addEventListener("pointerup", endInk);
inkCanvas?.addEventListener("pointercancel", endInk);
inkCanvas?.addEventListener("lostpointercapture", endInk);

document.querySelectorAll("[data-lux-screenshot-tool]").forEach((button) => {
  button.addEventListener("click", () => {
    finishTextEntry(true);
    tool = button.dataset.luxScreenshotTool;
    setToolButtons();
  });
});
document.querySelectorAll("[data-lux-screenshot-color]").forEach((button) => {
  button.addEventListener("click", () => {
    finishTextEntry(true);
    color = button.dataset.luxScreenshotColor;
    setColorButtons();
  });
});
document.querySelector("#lux-screenshot-zoom-out")?.addEventListener("click", () => {
  finishTextEntry(true);
  zoom = Math.max(0.25, Math.round((zoom - 0.15) * 100) / 100);
  setZoom();
});
document.querySelector("#lux-screenshot-zoom-in")?.addEventListener("click", () => {
  finishTextEntry(true);
  zoom = Math.min(3, Math.round((zoom + 0.15) * 100) / 100);
  setZoom();
});

async function copyScreenshot() {
  finishTextEntry(true);
  if (!imageCanvas.width) return;
  const output = document.createElement("canvas");
  output.width = imageCanvas.width;
  output.height = imageCanvas.height;
  const ctx = output.getContext("2d");
  if (!ctx) {
    setStatus("Unable to prepare the screenshot for the clipboard.");
    return;
  }
  ctx.drawImage(imageCanvas, 0, 0);
  ctx.drawImage(inkCanvas, 0, 0);
  copyButton.disabled = true;
  setStatus("Preparing the annotated screenshot…");
  try {
    const blob = await new Promise((resolve, reject) => {
      output.toBlob((result) => result ? resolve(result) : reject(new Error("The screenshot could not be encoded.")), "image/png");
    });
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      throw new Error("Image clipboard access is unavailable. Open this page over HTTPS and allow clipboard access.");
    }
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    setStatus("Copied to clipboard. The copied image includes your annotations.");
  } catch (error) {
    setStatus(error?.message || "Could not copy the screenshot. Check the browser clipboard permission.");
  } finally {
    copyButton.disabled = false;
  }
}
copyButton?.addEventListener("click", copyScreenshot);

function discardEditor() {
  finishTextEntry(false);
  modal.hidden = true;
  document.body.classList.remove("lux-screenshot-editor-open");
  stage.style.width = "";
  stage.style.height = "";
  imageCtx?.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
  inkCtx?.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
  snapshot = null;
  setStatus("");
  launchButton?.focus?.({ preventScroll: true });
}
closeButton?.addEventListener("click", discardEditor);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (modal && !modal.hidden) {
    event.preventDefault();
    discardEditor();
  } else if (selection && !selection.hidden) {
    event.preventDefault();
    cancelSelection();
  }
});
buttons.forEach((button) => button.addEventListener("click", () => startSelection(button)));
setToolButtons();
setColorButtons();
