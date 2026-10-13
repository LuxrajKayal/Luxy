(() => {
  "use strict";

  const launchButton = document.querySelector("#sidebar-screenshot");
  const capturePanel = document.querySelector("#lux-snip-capture-panel");
  const startButton = document.querySelector("#lux-snip-new");
  const cancelButton = document.querySelector("#lux-snip-cancel");
  const modeButtons = Array.from(document.querySelectorAll("[data-lux-snip-mode]"));
  const delaySelect = document.querySelector("#lux-snip-delay");
  const selectionLayer = document.querySelector("#lux-snip-selection");
  const selectionBox = document.querySelector("#lux-snip-selection-box");
  const selectionHelp = document.querySelector("#lux-snip-selection-help");
  const selectionToolbar = document.querySelector("#lux-snip-selection-toolbar");
  const countdown = document.querySelector("#lux-snip-countdown");
  const editorModal = document.querySelector("#lux-snip-editor-modal");
  const editorClose = document.querySelector("#lux-snip-discard");
  const editorCopy = document.querySelector("#lux-snip-copy");
  const editorSave = document.querySelector("#lux-snip-save");
  const editorStatus = document.querySelector("#lux-snip-status");
  const editorWorkarea = document.querySelector("#lux-snip-workarea");
  const editorStage = document.querySelector("#lux-snip-stage");
  const baseCanvas = document.querySelector("#lux-snip-base");
  const inkCanvas = document.querySelector("#lux-snip-ink");
  const zoomLabel = document.querySelector("#lux-snip-zoom-label");
  const cropBox = document.querySelector("#lux-snip-crop-box");
  const notice = document.querySelector("#lux-snip-notice");

  const baseContext = baseCanvas?.getContext("2d");
  const inkContext = inkCanvas?.getContext("2d");
  let stream = null;
  let video = null;
  let currentMode = "rectangle";
  let selectionStart = null;
  let freeformPoints = [];
  let selecting = false;
  let drawing = false;
  let cropping = false;
  let currentTool = "pen";
  let currentColor = "#e03131";
  let currentWidth = 3;
  let zoom = 1;
  let captureWidth = 0;
  let captureHeight = 0;
  let activeLaunchControl = null;
  let textEditor = null;
  let countdownTimer = 0;
  let countdownInterval = 0;
  let undoStack = [];
  let redoStack = [];

  const COLORS = ["#e03131", "#ff922b", "#f08c00", "#2f9e44", "#1971c2", "#7048e8", "#111827", "#ffffff"];

  function setStatus(text) {
    if (editorStatus) editorStatus.textContent = text;
  }
  function showNotice(text) {
    if (!notice) return;
    notice.textContent = text;
    notice.hidden = false;
    clearTimeout(showNotice.timer);
    showNotice.timer = setTimeout(() => { notice.hidden = true; }, 6500);
  }
  function stopCapture() {
    if (video) {
      video.pause();
      video.srcObject = null;
      video.remove();
      video = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  }
  function frame() {
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }
  function nextVideoFrame() {
    return new Promise((resolve) => {
      if (video && typeof video.requestVideoFrameCallback === "function") {
        video.requestVideoFrameCallback(() => resolve());
      } else {
        requestAnimationFrame(resolve);
      }
    });
  }
  async function captureFrameWithoutToolOverlay() {
    if (!video || !video.videoWidth || !video.videoHeight) {
      throw new Error("The browser did not provide a usable screenshot frame.");
    }
    selectionLayer.hidden = true;
    capturePanel.hidden = true;
    countdown.hidden = true;
    await frame();
    await nextVideoFrame();
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Screenshot image processing is unavailable.");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
  async function startBrowserTabCapture() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("Screen capture is unavailable in this browser. Open Lux Omni over HTTPS in a supported browser.");
    }
    // Websites must use the browser's own consent picker for display capture.
    // Ask for the current browser tab and reject other surfaces to respect the
    // viewport-only capture scope set for Lux Omni.
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: "browser" },
      audio: false,
      preferCurrentTab: true,
      selfBrowserSurface: "include",
      monitorTypeSurfaces: "exclude"
    });
    const track = stream.getVideoTracks()[0];
    const surface = track?.getSettings?.().displaySurface;
    if (!track || surface !== "browser") {
      stopCapture();
      throw new Error("Please select the Lux Omni browser tab in the capture picker. Other windows and the computer screen are not captured.");
    }

    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px";
    document.body.append(video);
    await video.play();
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise((resolve, reject) => {
        video.addEventListener("loadeddata", resolve, { once: true });
        video.addEventListener("error", () => reject(new Error("The browser capture stream did not start.")), { once: true });
      });
    }
    captureWidth = window.innerWidth;
    captureHeight = window.innerHeight;
    track.addEventListener("ended", () => {
      if (stream) {
        stopCapture();
        cancelCountdown();
        hideCaptureUi();
        showNotice("Screen capture was stopped by the browser.");
      }
    }, { once: true });
  }

  function showCaptureUi() {
    capturePanel.hidden = false;
    selectionLayer.hidden = true;
    document.body.classList.add("lux-snip-capturing");
    startButton.focus({ preventScroll: true });
  }
  function hideCaptureUi() {
    capturePanel.hidden = true;
    selectionLayer.hidden = true;
    countdown.hidden = true;
    document.body.classList.remove("lux-snip-capturing");
    selectionBox.hidden = true;
    selectionToolbar.hidden = true;
    selecting = false;
    selectionStart = null;
    freeformPoints = [];
  }
  function openCaptureToolbar() {
    if (stream) {
      showCaptureUi();
      return;
    }
    activeLaunchControl = launchButton;
    launchButton?.setAttribute("aria-busy", "true");
    startBrowserTabCapture().then(showCaptureUi).catch((error) => {
      if (error?.name !== "AbortError" && error?.name !== "NotAllowedError") {
        showNotice(error?.message || "Could not start screen capture.");
      }
    }).finally(() => launchButton?.removeAttribute("aria-busy"));
  }

  function setMode(mode) {
    currentMode = mode;
    modeButtons.forEach((button) => {
      const active = button.dataset.luxSnipMode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.luxSnipMode)));

  function cancelCountdown() {
    clearTimeout(countdownTimer);
    clearInterval(countdownInterval);
    countdownTimer = 0;
    countdownInterval = 0;
  }
  function startSnip() {
    if (!stream || !video) {
      openCaptureToolbar();
      return;
    }
    capturePanel.hidden = true;
    const delaySeconds = Number(delaySelect.value || 0);
    cancelCountdown();
    if (delaySeconds > 0) {
      let remaining = delaySeconds;
      countdown.hidden = false;
      countdown.textContent = "Snip starts in " + remaining + "…";
      countdownInterval = window.setInterval(() => {
        remaining -= 1;
        if (remaining > 0) countdown.textContent = "Snip starts in " + remaining + "…";
      }, 1000);
      countdownTimer = window.setTimeout(() => {
        cancelCountdown();
        countdown.hidden = true;
        beginChosenMode();
      }, delaySeconds * 1000);
    } else {
      beginChosenMode();
    }
  }
  function beginChosenMode() {
    if (!stream || !video) return;
    if (currentMode === "viewport") {
      takeViewportSnip();
      return;
    }
    selectionLayer.hidden = false;
    selectionToolbar.hidden = false;
    selectionHelp.textContent = currentMode === "freeform"
      ? "Draw around the area to snip · Esc to cancel"
      : "Drag a rectangle around the area to snip · Esc to cancel";
    document.body.classList.add("lux-snip-selecting");
    selectionLayer.focus({ preventScroll: true });
  }

  function viewportPoint(event) {
    return {
      x: Math.max(0, Math.min(window.innerWidth, event.clientX)),
      y: Math.max(0, Math.min(window.innerHeight, event.clientY))
    };
  }
  function pointInSnapshot(point, width, height) {
    return {
      x: point.x * width / captureWidth,
      y: point.y * height / captureHeight
    };
  }
  function updateSelectionGeometry(a, b) {
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const width = Math.abs(b.x - a.x);
    const height = Math.abs(b.y - a.y);
    selectionBox.style.left = left + "px";
    selectionBox.style.top = top + "px";
    selectionBox.style.width = width + "px";
    selectionBox.style.height = height + "px";
    selectionBox.hidden = false;
    selectionHelp.textContent = Math.round(width) + " × " + Math.round(height) + " px · Release to capture";
    return { left, top, width, height };
  }
  function drawFreeformPath() {
    let path = selectionLayer.querySelector("#lux-snip-freeform-path");
    if (!path) {
      path = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      path.id = "lux-snip-freeform-path";
      path.setAttribute("aria-hidden", "true");
      path.innerHTML = '<polyline fill="none" stroke="#2563eb" stroke-width="2" stroke-dasharray="5 4" points=""></polyline>';
      selectionLayer.append(path);
    }
    path.style.left = "0";
    path.style.top = "0";
    path.setAttribute("width", String(window.innerWidth));
    path.setAttribute("height", String(window.innerHeight));
    path.setAttribute("viewBox", "0 0 " + window.innerWidth + " " + window.innerHeight);
    path.style.position = "absolute";
    path.style.inset = "0";
    const polyline = path.querySelector("polyline");
    polyline.setAttribute("points", freeformPoints.map((point) => point.x + "," + point.y).join(" "));
  }
  function clearFreeformPath() {
    selectionLayer.querySelector("#lux-snip-freeform-path")?.remove();
  }
  selectionLayer?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("#lux-snip-selection-toolbar")) return;
    event.preventDefault();
    selecting = true;
    selectionStart = viewportPoint(event);
    selectionBox.hidden = false;
    if (currentMode === "freeform") {
      freeformPoints = [selectionStart];
      drawFreeformPath();
    } else {
      updateSelectionGeometry(selectionStart, selectionStart);
    }
    selectionLayer.setPointerCapture?.(event.pointerId);
  });
  selectionLayer?.addEventListener("pointermove", (event) => {
    if (!selecting || !selectionStart) return;
    event.preventDefault();
    const point = viewportPoint(event);
    if (currentMode === "freeform") {
      freeformPoints.push(point);
      drawFreeformPath();
      const minX = Math.min(...freeformPoints.map((item) => item.x));
      const minY = Math.min(...freeformPoints.map((item) => item.y));
      const maxX = Math.max(...freeformPoints.map((item) => item.x));
      const maxY = Math.max(...freeformPoints.map((item) => item.y));
      updateSelectionGeometry({ x: minX, y: minY }, { x: maxX, y: maxY });
    } else {
      updateSelectionGeometry(selectionStart, point);
    }
  });
  selectionLayer?.addEventListener("pointerup", async (event) => {
    if (!selecting || !selectionStart) return;
    const end = viewportPoint(event);
    let bounds;
    if (currentMode === "freeform") {
      freeformPoints.push(end);
      const xs = freeformPoints.map((item) => item.x);
      const ys = freeformPoints.map((item) => item.y);
      bounds = {
        left: Math.min(...xs), top: Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs),
        height: Math.max(...ys) - Math.min(...ys)
      };
      drawFreeformPath();
    } else {
      bounds = updateSelectionGeometry(selectionStart, end);
    }
    selecting = false;
    selectionStart = null;
    if (bounds.width < 5 || bounds.height < 5) {
      showCaptureUi();
      clearFreeformPath();
      selectionBox.hidden = true;
      return;
    }
    try {
      const fullImage = await captureFrameWithoutToolOverlay();
      const cropped = cropSource(fullImage, bounds, currentMode === "freeform" ? freeformPoints : null);
      stopCapture();
      hideCaptureUi();
      document.body.classList.remove("lux-snip-selecting");
      clearFreeformPath();
      openEditor(cropped);
    } catch (error) {
      stopCapture();
      hideCaptureUi();
      showNotice(error?.message || "The screenshot could not be captured.");
    }
  });
  selectionLayer?.addEventListener("pointercancel", () => {
    selecting = false;
    selectionStart = null;
    selectionBox.hidden = true;
    clearFreeformPath();
  });

  document.querySelectorAll("[data-lux-snip-selection-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.luxSnipSelectionMode;
      setMode(mode);
      if (mode === "viewport") {
        takeViewportSnip();
      } else {
        selectionBox.hidden = true;
        clearFreeformPath();
        selectionHelp.textContent = mode === "freeform"
          ? "Draw around the area to snip · Esc to cancel"
          : "Drag a rectangle around the area to snip · Esc to cancel";
      }
    });
  });
  document.querySelector("#lux-snip-selection-cancel")?.addEventListener("click", closeCaptureUi);

  function cropSource(source, bounds, pathPoints) {
    const scaleX = source.width / captureWidth;
    const scaleY = source.height / captureHeight;
    const sx = Math.max(0, Math.floor(bounds.left * scaleX));
    const sy = Math.max(0, Math.floor(bounds.top * scaleY));
    const sw = Math.min(source.width - sx, Math.max(1, Math.round(bounds.width * scaleX)));
    const sh = Math.min(source.height - sy, Math.max(1, Math.round(bounds.height * scaleY)));
    if (sw < 1 || sh < 1) return null;
    const output = document.createElement("canvas");
    output.width = sw;
    output.height = sh;
    const context = output.getContext("2d");
    if (!context) return null;
    if (pathPoints?.length > 2) {
      context.beginPath();
      pathPoints.forEach((point, index) => {
        const x = (point.x - bounds.left) * scaleX;
        const y = (point.y - bounds.top) * scaleY;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.clip();
    }
    context.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    return output;
  }

  async function takeViewportSnip() {
    try {
      const image = await captureFrameWithoutToolOverlay();
      stopCapture();
      hideCaptureUi();
      document.body.classList.remove("lux-snip-selecting");
      openEditor(image);
    } catch (error) {
      stopCapture();
      hideCaptureUi();
      showNotice(error?.message || "The viewport screenshot could not be captured.");
    }
  }

  function pushHistory() {
    try {
      undoStack.push({
        width: baseCanvas.width,
        height: baseCanvas.height,
        base: baseContext.getImageData(0, 0, baseCanvas.width, baseCanvas.height),
        ink: inkContext.getImageData(0, 0, inkCanvas.width, inkCanvas.height)
      });
      if (undoStack.length > 30) undoStack.shift();
      redoStack = [];
      updateUndoRedoButtons();
    } catch {
      setStatus("This screenshot is too large to record undo history.");
    }
  }
  function restoreSnapshot(snapshot) {
    baseCanvas.width = snapshot.width;
    baseCanvas.height = snapshot.height;
    inkCanvas.width = snapshot.width;
    inkCanvas.height = snapshot.height;
    baseContext.putImageData(snapshot.base, 0, 0);
    inkContext.putImageData(snapshot.ink, 0, 0);
    setCanvasZoom();
  }
  function updateUndoRedoButtons() {
    const undo = document.querySelector("#lux-snip-undo");
    const redo = document.querySelector("#lux-snip-redo");
    if (undo) undo.disabled = undoStack.length === 0;
    if (redo) redo.disabled = redoStack.length === 0;
  }
  function undo() {
    finishText(false);
    if (!undoStack.length) return;
    try {
      redoStack.push({
        width: baseCanvas.width, height: baseCanvas.height,
        base: baseContext.getImageData(0, 0, baseCanvas.width, baseCanvas.height),
        ink: inkContext.getImageData(0, 0, inkCanvas.width, inkCanvas.height)
      });
      restoreSnapshot(undoStack.pop());
    } catch {
      setStatus("Unable to undo that action.");
    }
    updateUndoRedoButtons();
  }
  function redo() {
    finishText(false);
    if (!redoStack.length) return;
    try {
      undoStack.push({
        width: baseCanvas.width, height: baseCanvas.height,
        base: baseContext.getImageData(0, 0, baseCanvas.width, baseCanvas.height),
        ink: inkContext.getImageData(0, 0, inkCanvas.width, inkCanvas.height)
      });
      restoreSnapshot(redoStack.pop());
    } catch {
      setStatus("Unable to redo that action.");
    }
    updateUndoRedoButtons();
  }

  function setTool(toolName) {
    finishText(true);
    currentTool = toolName;
    document.querySelectorAll("[data-lux-snip-tool]").forEach((button) => {
      const active = button.dataset.luxSnipTool === currentTool;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    inkCanvas.classList.toggle("is-text-tool", currentTool === "text");
    inkCanvas.classList.toggle("is-crop-tool", currentTool === "crop");
  }
  function setColor(colorValue) {
    finishText(true);
    currentColor = colorValue;
    document.querySelectorAll("[data-lux-snip-color]").forEach((button) => {
      const active = button.dataset.luxSnipColor === currentColor;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  function setCanvasZoom() {
    const width = Math.max(1, baseCanvas.width * zoom);
    const height = Math.max(1, baseCanvas.height * zoom);
    editorStage.style.width = width + "px";
    editorStage.style.height = height + "px";
    [baseCanvas, inkCanvas].forEach((canvas) => {
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
    });
    zoomLabel.textContent = Math.round(zoom * 100) + "%";
  }
  function openEditor(image) {
    if (!image || !baseContext || !inkContext) {
      showNotice("The selected screenshot could not be prepared.");
      return;
    }
    baseCanvas.width = image.width;
    baseCanvas.height = image.height;
    inkCanvas.width = image.width;
    inkCanvas.height = image.height;
    baseContext.clearRect(0, 0, image.width, image.height);
    baseContext.drawImage(image, 0, 0);
    inkContext.clearRect(0, 0, image.width, image.height);
    zoom = 1;
    currentTool = "pen";
    currentColor = "#e03131";
    currentWidth = 3;
    undoStack = [];
    redoStack = [];
    setTool("pen");
    setColor(currentColor);
    updateUndoRedoButtons();
    editorModal.hidden = false;
    document.body.classList.add("lux-snip-editor-open");
    setStatus("Use Esc or the red × to discard this snip. Nothing is saved automatically.");
    requestAnimationFrame(() => {
      const maxWidth = Math.max(180, editorWorkarea.clientWidth - 30);
      const maxHeight = Math.max(120, editorWorkarea.clientHeight - 30);
      zoom = Math.min(1, maxWidth / baseCanvas.width, maxHeight / baseCanvas.height);
      setCanvasZoom();
      editorClose.focus({ preventScroll: true });
    });
  }

  function closeCaptureUi() {
    cancelCountdown();
    stopCapture();
    hideCaptureUi();
    document.body.classList.remove("lux-snip-capturing", "lux-snip-selecting");
    activeLaunchControl?.focus?.({ preventScroll: true });
  }
  startButton?.addEventListener("click", startSnip);
  cancelButton?.addEventListener("click", closeCaptureUi);
  launchButton?.addEventListener("click", openCaptureToolbar);

  function finishText(save) {
    const editor = textEditor;
    if (!editor) return;
    textEditor = null;
    const value = editor.value.trimEnd();
    const x = Number(editor.dataset.x);
    const y = Number(editor.dataset.y);
    const size = Number(editor.dataset.size);
    editor.remove();
    if (!save || !value.trim()) return;
    pushHistory();
    inkContext.save();
    inkContext.globalCompositeOperation = "source-over";
    inkContext.globalAlpha = 1;
    inkContext.fillStyle = currentColor;
    inkContext.font = "600 " + size + "px system-ui, sans-serif";
    inkContext.textBaseline = "top";
    value.split("\n").forEach((line, index) => inkContext.fillText(line, x, y + index * size * 1.25));
    inkContext.restore();
  }
  function editorPoint(event) {
    const rect = inkCanvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(inkCanvas.width, (event.clientX - rect.left) * inkCanvas.width / rect.width)),
      y: Math.max(0, Math.min(inkCanvas.height, (event.clientY - rect.top) * inkCanvas.height / rect.height))
    };
  }
  function createText(point) {
    finishText(true);
    const input = document.createElement("textarea");
    input.className = "lux-snip-text-entry";
    input.rows = 1;
    input.placeholder = "Type text…";
    input.setAttribute("aria-label", "Text to add to screenshot");
    input.style.left = (point.x * zoom) + "px";
    input.style.top = (point.y * zoom) + "px";
    input.style.fontSize = (18 * zoom) + "px";
    input.style.minWidth = (150 * zoom) + "px";
    input.dataset.x = String(point.x);
    input.dataset.y = String(point.y);
    input.dataset.size = String(Math.max(10, 18));
    editorStage.append(input);
    textEditor = input;
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finishText(false);
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        event.stopPropagation();
        finishText(true);
      }
    });
    input.addEventListener("blur", () => {
      if (textEditor === input) finishText(true);
    });
    input.focus();
  }

  function beginEditorAction(event) {
    if (event.button !== 0) return;
    const point = editorPoint(event);
    if (currentTool === "text") {
      event.preventDefault();
      createText(point);
      return;
    }
    if (currentTool === "crop") {
      event.preventDefault();
      cropping = true;
      cropBox.hidden = false;
      cropBox.dataset.startX = String(point.x);
      cropBox.dataset.startY = String(point.y);
      cropBox.style.left = (point.x * zoom) + "px";
      cropBox.style.top = (point.y * zoom) + "px";
      cropBox.style.width = "0";
      cropBox.style.height = "0";
      inkCanvas.setPointerCapture?.(event.pointerId);
      return;
    }
    if (!["pen", "highlighter", "eraser"].includes(currentTool)) return;
    finishText(true);
    event.preventDefault();
    pushHistory();
    drawing = true;
    inkCanvas.setPointerCapture?.(event.pointerId);
    inkContext.save();
    inkContext.lineCap = "round";
    inkContext.lineJoin = "round";
    inkContext.lineWidth = currentWidth * (currentTool === "highlighter" ? 4 : currentTool === "eraser" ? 7 : 1) * inkCanvas.width / Math.max(1, baseCanvas.width);
    inkContext.globalCompositeOperation = currentTool === "eraser" ? "destination-out" : "source-over";
    inkContext.globalAlpha = currentTool === "highlighter" ? 0.32 : 1;
    inkContext.strokeStyle = currentTool === "eraser" ? "rgba(0,0,0,1)" : currentColor;
    inkContext.beginPath();
    inkContext.moveTo(point.x, point.y);
    inkContext.lineTo(point.x + 0.01, point.y + 0.01);
    inkContext.stroke();
    inkContext.beginPath();
    inkContext.moveTo(point.x, point.y);
  }
  function moveEditorAction(event) {
    const point = editorPoint(event);
    if (cropping) {
      const x = Number(cropBox.dataset.startX);
      const y = Number(cropBox.dataset.startY);
      cropBox.style.left = (Math.min(x, point.x) * zoom) + "px";
      cropBox.style.top = (Math.min(y, point.y) * zoom) + "px";
      cropBox.style.width = (Math.abs(point.x - x) * zoom) + "px";
      cropBox.style.height = (Math.abs(point.y - y) * zoom) + "px";
      return;
    }
    if (!drawing) return;
    event.preventDefault();
    inkContext.lineTo(point.x, point.y);
    inkContext.stroke();
  }
  function endEditorAction() {
    if (cropping) {
      const left = parseFloat(cropBox.style.left) / zoom;
      const top = parseFloat(cropBox.style.top) / zoom;
      const width = parseFloat(cropBox.style.width) / zoom;
      const height = parseFloat(cropBox.style.height) / zoom;
      cropBox.hidden = true;
      cropping = false;
      if (width < 6 || height < 6) return;
      pushHistory();
      const oldBase = document.createElement("canvas");
      oldBase.width = baseCanvas.width; oldBase.height = baseCanvas.height;
      oldBase.getContext("2d").drawImage(baseCanvas, 0, 0);
      const oldInk = document.createElement("canvas");
      oldInk.width = inkCanvas.width; oldInk.height = inkCanvas.height;
      oldInk.getContext("2d").drawImage(inkCanvas, 0, 0);
      const x = Math.max(0, Math.floor(left));
      const y = Math.max(0, Math.floor(top));
      const w = Math.min(oldBase.width - x, Math.floor(width));
      const h = Math.min(oldBase.height - y, Math.floor(height));
      if (w <= 0 || h <= 0) return;
      baseCanvas.width = w; baseCanvas.height = h;
      inkCanvas.width = w; inkCanvas.height = h;
      baseContext.drawImage(oldBase, x, y, w, h, 0, 0, w, h);
      inkContext.drawImage(oldInk, x, y, w, h, 0, 0, w, h);
      zoom = Math.min(zoom, 1);
      setCanvasZoom();
      setStatus("Screenshot cropped.");
      return;
    }
    if (!drawing) return;
    drawing = false;
    inkContext.closePath();
    inkContext.restore();
  }
  inkCanvas?.addEventListener("pointerdown", beginEditorAction);
  inkCanvas?.addEventListener("pointermove", moveEditorAction);
  inkCanvas?.addEventListener("pointerup", endEditorAction);
  inkCanvas?.addEventListener("pointercancel", endEditorAction);
  inkCanvas?.addEventListener("lostpointercapture", () => {
    if (drawing) {
      drawing = false;
      inkContext.restore();
    }
  });

  document.querySelectorAll("[data-lux-snip-tool]").forEach((button) => {
    button.addEventListener("click", () => setTool(button.dataset.luxSnipTool));
  });
  document.querySelectorAll("[data-lux-snip-color]").forEach((button) => {
    button.addEventListener("click", () => setColor(button.dataset.luxSnipColor));
  });
  document.querySelector("#lux-snip-width")?.addEventListener("change", (event) => {
    currentWidth = Number(event.target.value) || 3;
  });
  document.querySelector("#lux-snip-undo")?.addEventListener("click", undo);
  document.querySelector("#lux-snip-redo")?.addEventListener("click", redo);
  document.querySelector("#lux-snip-zoom-out")?.addEventListener("click", () => {
    finishText(true);
    zoom = Math.max(0.25, Math.round((zoom - 0.15) * 100) / 100);
    setCanvasZoom();
  });
  document.querySelector("#lux-snip-zoom-in")?.addEventListener("click", () => {
    finishText(true);
    zoom = Math.min(3, Math.round((zoom + 0.15) * 100) / 100);
    setCanvasZoom();
  });

  function composeImage() {
    const output = document.createElement("canvas");
    output.width = baseCanvas.width;
    output.height = baseCanvas.height;
    const context = output.getContext("2d");
    context.drawImage(baseCanvas, 0, 0);
    context.drawImage(inkCanvas, 0, 0);
    return output;
  }
  async function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The screenshot could not be encoded.")), "image/png");
    });
  }
  editorCopy?.addEventListener("click", async () => {
    finishText(true);
    editorCopy.disabled = true;
    try {
      const blob = await canvasBlob(composeImage());
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("Image clipboard access is unavailable. Use HTTPS and allow clipboard access.");
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setStatus("Copied to clipboard.");
    } catch (error) {
      setStatus(error?.message || "Could not copy the screenshot.");
    } finally {
      editorCopy.disabled = false;
    }
  });
  editorSave?.addEventListener("click", async () => {
    finishText(true);
    editorSave.disabled = true;
    try {
      const blob = await canvasBlob(composeImage());
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "lux-omni-snipping-tool.png";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("Screenshot saved through your browser download.");
    } catch (error) {
      setStatus(error?.message || "Could not save the screenshot.");
    } finally {
      editorSave.disabled = false;
    }
  });
  function discardEditor() {
    finishText(false);
    editorModal.hidden = true;
    document.body.classList.remove("lux-snip-editor-open");
    [baseCanvas, inkCanvas].forEach((canvas) => {
      canvas.width = 1;
      canvas.height = 1;
    });
    editorStage.style.width = "";
    editorStage.style.height = "";
    undoStack = [];
    redoStack = [];
    setStatus("");
    activeLaunchControl?.focus?.({ preventScroll: true });
  }
  editorClose?.addEventListener("click", discardEditor);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (editorModal && !editorModal.hidden) {
        event.preventDefault();
        discardEditor();
      } else if ((selectionLayer && !selectionLayer.hidden) || (capturePanel && !capturePanel.hidden)) {
        event.preventDefault();
        closeCaptureUi();
      }
    }
    if (!editorModal.hidden && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    } else if (!editorModal.hidden && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    }
  });

  startButton?.addEventListener("click", startSnip);
  cancelButton?.addEventListener("click", closeCaptureUi);
  launchButton?.addEventListener("click", openCaptureToolbar);
  setMode("rectangle");
})();
