// Lux Omni core interface controls.
// Dark Mode, Focus Mode, and the manually controlled sidebar only.

const themeToggle = document.querySelector("#theme-toggle");
const focusModeToggle = document.querySelector("#focus-mode-toggle");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const topbar = document.querySelector(".topbar");
const fullScreenViewportButton = document.querySelector("#viewport-fullscreen");
const splitScreenViewportButton = document.querySelector("#viewport-split-screen");
const workspace = document.querySelector(".workspace");
const workspaceEmptyState = workspace?.querySelector(".workspace-empty-state");
const viewportComposition = document.querySelector("#viewport-composition");
const fullScreenViewportLayout = document.querySelector("#viewport-fullscreen-layout");
const splitScreenViewportLayout = document.querySelector("#viewport-split-layout");
const viewportTopbar = document.querySelector("#viewport-topbar");
const viewportToolbarFull = document.querySelector("#viewport-toolbar-full");
const viewportToolbarLeft = document.querySelector("#viewport-toolbar-left");
const viewportToolbarRight = document.querySelector("#viewport-toolbar-right");
const viewportNumberFull = document.querySelector("#viewport-number-full");
const viewportNumberLeft = document.querySelector("#viewport-number-left");
const viewportNumberRight = document.querySelector("#viewport-number-right");
const viewportMinimizedDock = document.querySelector("#viewport-minimized-dock");
const viewportMinimizedItems = document.querySelector("#viewport-minimized-items");
const splitViewportDivider = document.querySelector("#viewport-split-divider");

const viewportMinimizeFullButton = document.querySelector("#viewport-minimize-full");
const viewportMinimizeLeftButton = document.querySelector("#viewport-minimize-left");
const viewportMinimizeRightButton = document.querySelector("#viewport-minimize-right");
const sidebarYoutubeButton = document.querySelector("#sidebar-youtube-button");
const youtubeTile = document.querySelector("#youtube-tile");
const youtubeVideoUrl = document.querySelector("#youtube-video-url");
const youtubeTileFeedback = document.querySelector("#youtube-tile-feedback");
const youtubeTargetButtons = document.querySelectorAll("[data-youtube-target]");

const THEME_STORAGE_KEY = "lux-pdf-viewer-theme";
const FOCUS_MODE_STORAGE_KEY = "lux-pdf-viewer-focus-mode";
const SIDEBAR_STORAGE_KEY = "lux-pdf-viewer-sidebar-open";

// Dark Mode
function setDarkMode(enabled, savePreference = true) {
  if (enabled) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }

  themeToggle?.setAttribute("aria-pressed", String(enabled));
  themeToggle?.setAttribute(
    "aria-label",
    enabled ? "Switch to white mode" : "Switch to dark mode"
  );
  themeToggle?.setAttribute(
    "title",
    enabled ? "Switch to white mode" : "Switch to dark mode"
  );

  if (savePreference) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, enabled ? "dark" : "light");
    } catch {
      // Theme switching remains available while this page is open.
    }
  }
}

let savedDarkMode = document.documentElement.getAttribute("data-theme") === "dark";
try {
  savedDarkMode = localStorage.getItem(THEME_STORAGE_KEY) === "dark";
} catch {
  // Use the theme initialized in the HTML.
}
setDarkMode(savedDarkMode, false);

themeToggle?.addEventListener("click", () => {
  const enabled = document.documentElement.getAttribute("data-theme") === "dark";
  setDarkMode(!enabled);
});

// Focus Mode
function isFocusModeEnabled() {
  return document.body.dataset.focusMode === "true";
}

function showTopbar() {
  if (isFocusModeEnabled()) topbar?.classList.add("is-visible");
}

function hideTopbar() {
  if (isFocusModeEnabled()) topbar?.classList.remove("is-visible");
}

function setFocusMode(enabled, savePreference = true) {
  document.body.dataset.focusMode = String(enabled);
  topbar?.classList.remove("is-visible");

  focusModeToggle?.setAttribute("aria-pressed", String(enabled));
  focusModeToggle?.setAttribute(
    "aria-label",
    enabled ? "Turn off Focus Mode" : "Turn on Focus Mode"
  );
  focusModeToggle?.setAttribute(
    "title",
    enabled ? "Turn off Focus Mode" : "Turn on Focus Mode"
  );

  if (savePreference) {
    try {
      localStorage.setItem(FOCUS_MODE_STORAGE_KEY, String(enabled));
    } catch {
      // Focus Mode remains available while this page is open.
    }
  }

  lastScrollY = window.scrollY;
}

let savedFocusMode = document.body.dataset.focusMode === "true";
try {
  const storedFocusMode = localStorage.getItem(FOCUS_MODE_STORAGE_KEY);
  if (storedFocusMode === "true" || storedFocusMode === "false") {
    savedFocusMode = storedFocusMode === "true";
  }
} catch {
  // Use the state initialized in the HTML.
}
let lastScrollY = window.scrollY;
setFocusMode(savedFocusMode, false);

focusModeToggle?.addEventListener("click", () => {
  setFocusMode(!isFocusModeEnabled());
});

window.addEventListener(
  "scroll",
  () => {
    const currentScrollY = window.scrollY;

    if (isFocusModeEnabled()) {
      if (currentScrollY < lastScrollY || currentScrollY <= 10) {
        showTopbar();
      } else if (currentScrollY > lastScrollY) {
        hideTopbar();
      }
    } else {
      topbar?.classList.remove("is-visible");
    }

    lastScrollY = currentScrollY;
  },
  { passive: true }
);

document.addEventListener("mousemove", (event) => {
  if (isFocusModeEnabled() && event.clientY <= 10) showTopbar();
});

topbar?.addEventListener("mouseenter", showTopbar);
topbar?.addEventListener("mouseleave", hideTopbar);
topbar?.addEventListener("focusin", showTopbar);

// Sidebar: only the user's button controls its state; scrolling and hover do nothing.
function setSidebarOpen(isOpen, savePreference = true) {
  document.documentElement.setAttribute("data-sidebar-open", String(isOpen));
  sidebarToggle?.setAttribute("aria-expanded", String(isOpen));
  sidebarToggle?.setAttribute(
    "aria-label",
    isOpen ? "Close sidebar" : "Open sidebar"
  );
  sidebarToggle?.setAttribute(
    "title",
    isOpen ? "Close sidebar" : "Open sidebar"
  );

  if (savePreference) {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(isOpen));
    } catch {
      // Sidebar toggling remains available while this page is open.
    }
  }
}

let savedSidebarOpen = document.documentElement.getAttribute("data-sidebar-open") !== "false";
try {
  const storedSidebarState = localStorage.getItem(SIDEBAR_STORAGE_KEY);
  if (storedSidebarState === "true" || storedSidebarState === "false") {
    savedSidebarOpen = storedSidebarState === "true";
  }
} catch {
  // Use the state initialized in the HTML.
}
setSidebarOpen(savedSidebarOpen, false);

sidebarToggle?.addEventListener("click", () => {
  const isOpen = document.documentElement.getAttribute("data-sidebar-open") === "true";
  setSidebarOpen(!isOpen);
});

// Viewport layouts, minimize/restore, and close controls.
let activeViewportMode = null;
let soloSplitSide = null;
let rememberedSplitRatio = 0.5;
const minimizedViewportStates = new Map();

function getViewportElement(side) {
  if (side === "full") {
    return fullScreenViewportLayout?.querySelector(':scope > .viewport[data-viewport-side="full"]') ||
      fullScreenViewportLayout?.querySelector(":scope > .viewport") ||
      null;
  }
  return splitScreenViewportLayout?.querySelector(`:scope > .viewport[data-viewport-side="${side}"]`) || null;
}

function createSplitViewport(side) {
  const viewport = document.createElement("div");
  viewport.className = "viewport viewport--split";
  viewport.dataset.viewportSide = side;
  return viewport;
}

function ensureSplitViewports() {
  if (!splitScreenViewportLayout) return;

  if (!getViewportElement("left")) {
    splitScreenViewportLayout.prepend(createSplitViewport("left"));
  }
  if (!getViewportElement("right")) {
    splitScreenViewportLayout.append(createSplitViewport("right"));
  }
}

function ensureFullViewport() {
  if (!fullScreenViewportLayout || getViewportElement("full")) return;

  const viewport = document.createElement("div");
  viewport.className = "viewport";
  viewport.dataset.viewportSide = "full";
  fullScreenViewportLayout.append(viewport);
}

function getViewportNumber(side) {
  if (side === "left") return "1/2";
  if (side === "right") return "2/2";
  return "0";
}

function getViewportFileName(side) {
  const viewport = getViewportElement(side);
  const explicitName = viewport?.dataset.fileName?.trim();
  const headingName = viewport?.querySelector(".pdf-preview-heading")?.textContent?.trim();
  const ariaName = viewport?.getAttribute("aria-label")?.trim();
  return explicitName || headingName || ariaName || "Untitled";
}

function renderMinimizedViewportDock() {
  if (!viewportMinimizedDock || !viewportMinimizedItems) return;

  viewportMinimizedItems.replaceChildren();
  const order = ["full", "left", "right"];
  for (const side of order) {
    const savedState = minimizedViewportStates.get(side);
    if (!savedState) continue;

    const fileName = getViewportFileName(side);
    const number = getViewportNumber(side);
    const button = document.createElement("button");
    button.className = "viewport-minimized-bar";
    button.type = "button";
    button.setAttribute("aria-label", `Restore viewport ${number}, ${fileName}`);
    button.title = `Restore viewport ${number}`;

    const numberLabel = document.createElement("span");
    numberLabel.className = "viewport-minimized-number";
    numberLabel.textContent = number;

    const fileLabel = document.createElement("span");
    fileLabel.className = "viewport-minimized-file";
    fileLabel.textContent = fileName;

    const restoreMark = document.createElement("span");
    restoreMark.className = "viewport-minimized-restore";
    restoreMark.setAttribute("aria-hidden", "true");
    restoreMark.textContent = "↗";

    button.append(numberLabel, fileLabel, restoreMark);
    button.addEventListener("click", () => restoreMinimizedViewport(side));
    viewportMinimizedItems.append(button);
  }

  viewportMinimizedDock.hidden = minimizedViewportStates.size === 0;
}

function renderViewportComposition() {
  if (!viewportComposition || !fullScreenViewportLayout || !splitScreenViewportLayout) return;

  const isFull = activeViewportMode === "full";
  const isSplit = activeViewportMode === "split";
  const isSolo = activeViewportMode === "solo";
  const hasActiveViewport = activeViewportMode !== null;
  const hasMinimizedViewports = minimizedViewportStates.size > 0;

  viewportComposition.dataset.mode = isSolo ? `solo-${soloSplitSide}` : (activeViewportMode || "minimized");
  viewportComposition.hidden = !hasActiveViewport && !hasMinimizedViewports;
  viewportComposition.classList.toggle("is-minimized-only", !hasActiveViewport && hasMinimizedViewports);

  fullScreenViewportLayout.hidden = !isFull;
  splitScreenViewportLayout.hidden = !(isSplit || isSolo);
  if (viewportTopbar) viewportTopbar.hidden = !hasActiveViewport;
  if (viewportToolbarFull) viewportToolbarFull.hidden = !(isFull || isSolo);
  if (viewportToolbarLeft) viewportToolbarLeft.hidden = !isSplit;
  if (viewportToolbarRight) viewportToolbarRight.hidden = !isSplit;
  if (splitViewportDivider) splitViewportDivider.hidden = !isSplit;

  if (viewportNumberFull) viewportNumberFull.hidden = !isFull;
  if (viewportNumberLeft) viewportNumberLeft.hidden = !(isSplit || (isSolo && soloSplitSide === "left"));
  if (viewportNumberRight) viewportNumberRight.hidden = !(isSplit || (isSolo && soloSplitSide === "right"));

  fullScreenViewportButton?.setAttribute("aria-pressed", String(isFull || isSolo));
  splitScreenViewportButton?.setAttribute("aria-pressed", String(isSplit));

  const soloLabel = soloSplitSide === "left" ? "left" : "right";
  viewportMinimizeFullButton?.setAttribute("aria-label", isSolo ? `Minimize ${soloLabel} viewport` : "Minimize full-screen viewport");
  viewportMinimizeFullButton?.setAttribute("title", isSolo ? `Minimize ${soloLabel} viewport` : "Minimize viewport");
  document.querySelector("#viewport-close-full")?.setAttribute("aria-label", isSolo ? `Close ${soloLabel} viewport` : "Close full-screen viewport");
  document.querySelector("#viewport-close-full")?.setAttribute("title", isSolo ? `Close ${soloLabel} viewport` : "Close viewport");

  renderMinimizedViewportDock();
}

function showNormalWorkspaceAfterViewportClose(clearWorkspace = false) {
  if (!workspaceEmptyState || !workspace) return;
  if (clearWorkspace) {
    workspace.replaceChildren(workspaceEmptyState);
  }
  if (workspace.contains(workspaceEmptyState)) workspaceEmptyState.hidden = false;
}

function setViewportMode(mode) {
  if (!workspace || !viewportComposition || !fullScreenViewportLayout || !splitScreenViewportLayout) return;

  if (mode === "full") {
    ensureFullViewport();
    minimizedViewportStates.delete("full");
    activeViewportMode = "full";
    soloSplitSide = null;
  } else {
    ensureSplitViewports();
    // Explicitly opening Split Screen restores both original split panes.
    minimizedViewportStates.delete("left");
    minimizedViewportStates.delete("right");
    activeViewportMode = "split";
    soloSplitSide = null;
    setSplitViewportRatio(rememberedSplitRatio);
  }

  if (workspaceEmptyState) workspaceEmptyState.hidden = true;
  renderViewportComposition();
}

function rememberMinimizedViewport(side, originalMode) {
  const viewport = getViewportElement(side);
  if (!viewport) return;

  minimizedViewportStates.set(side, {
    side,
    originalMode,
    splitRatio: rememberedSplitRatio
  });
}

function minimizeFullScreenViewport() {
  if (activeViewportMode === "solo" && soloSplitSide) {
    minimizeSplitViewport(soloSplitSide);
    return;
  }
  if (activeViewportMode !== "full") return;

  rememberMinimizedViewport("full", "full");
  activeViewportMode = null;
  soloSplitSide = null;
  renderViewportComposition();
  showNormalWorkspaceAfterViewportClose(false);
}

function minimizeSplitViewport(side) {
  if (activeViewportMode === "split") {
    const currentRatio = Number(splitViewportDivider?.getAttribute("aria-valuenow") || "50") / 100;
    rememberedSplitRatio = currentRatio;
    rememberMinimizedViewport(side, "split");
    activeViewportMode = "solo";
    soloSplitSide = side === "left" ? "right" : "left";
  } else if (activeViewportMode === "solo" && soloSplitSide === side) {
    rememberMinimizedViewport(side, "split");
    activeViewportMode = null;
    soloSplitSide = null;
  } else {
    return;
  }

  renderViewportComposition();
  if (!activeViewportMode) showNormalWorkspaceAfterViewportClose(false);
}

function restoreMinimizedViewport(side) {
  const savedState = minimizedViewportStates.get(side);
  if (!savedState) return;

  if (side === "full" || savedState.originalMode === "full") {
    // Keep any currently visible split viewport(s) minimized when restoring Full Screen.
    if (activeViewportMode === "solo" && soloSplitSide) {
      rememberMinimizedViewport(soloSplitSide, "split");
    } else if (activeViewportMode === "split") {
      rememberMinimizedViewport("left", "split");
      rememberMinimizedViewport("right", "split");
    }

    minimizedViewportStates.delete("full");
    activeViewportMode = "full";
    soloSplitSide = null;
  } else {
    const otherSplitSide = side === "left" ? "right" : "left";
    const restoringPair =
      activeViewportMode === "solo" &&
      soloSplitSide === otherSplitSide &&
      minimizedViewportStates.has(side);

    if (restoringPair) {
      // The other split pane is already visible. Restoring its minimized partner
      // returns both panes to their original side-by-side layout.
      minimizedViewportStates.delete("left");
      minimizedViewportStates.delete("right");
      ensureSplitViewports();
      rememberedSplitRatio = savedState.splitRatio || rememberedSplitRatio;
      setSplitViewportRatio(rememberedSplitRatio);
      activeViewportMode = "split";
      soloSplitSide = null;
    } else {
      if (activeViewportMode === "full") {
        rememberMinimizedViewport("full", "full");
      }

      minimizedViewportStates.delete(side);
      ensureSplitViewports();
      rememberedSplitRatio = savedState.splitRatio || rememberedSplitRatio;
      setSplitViewportRatio(rememberedSplitRatio);
      activeViewportMode = "solo";
      soloSplitSide = side;
    }
  }

  if (workspaceEmptyState) workspaceEmptyState.hidden = true;
  renderViewportComposition();
}

function closeFullScreenViewport() {
  if (activeViewportMode === "solo" && soloSplitSide) {
    closeSplitViewport(soloSplitSide);
    return;
  }
  if (activeViewportMode !== "full" || !window.confirm("Discard documents?")) return;
  getViewportElement("full")?.replaceChildren();
  activeViewportMode = null;
  soloSplitSide = null;
  renderViewportComposition();
  showNormalWorkspaceAfterViewportClose(minimizedViewportStates.size === 0);
}

function closeSplitViewport(side) {
  const isSplit = activeViewportMode === "split";
  const isCurrentSoloSide = activeViewportMode === "solo" && soloSplitSide === side;
  if ((!isSplit && !isCurrentSoloSide) || !window.confirm("Discard documents?")) return;
  getViewportElement(side)?.replaceChildren();
  minimizedViewportStates.delete(side);

  if (isSplit) {
    activeViewportMode = "solo";
    soloSplitSide = side === "left" ? "right" : "left";
  } else {
    activeViewportMode = null;
    soloSplitSide = null;
  }

  renderViewportComposition();
  if (!activeViewportMode) showNormalWorkspaceAfterViewportClose(minimizedViewportStates.size === 0);
}

fullScreenViewportButton?.addEventListener("click", () => setViewportMode("full"));
splitScreenViewportButton?.addEventListener("click", () => setViewportMode("split"));
viewportMinimizeFullButton?.addEventListener("click", minimizeFullScreenViewport);
viewportMinimizeLeftButton?.addEventListener("click", () => minimizeSplitViewport("left"));
viewportMinimizeRightButton?.addEventListener("click", () => minimizeSplitViewport("right"));
document.querySelector("#viewport-close-full")?.addEventListener("click", closeFullScreenViewport);
document.querySelector("#viewport-close-left")?.addEventListener("click", () => closeSplitViewport("left"));
document.querySelector("#viewport-close-right")?.addEventListener("click", () => closeSplitViewport("right"));

function extractYoutubeVideoId(value) {
  const rawValue = value.trim();
  if (!rawValue) return null;

  let url;
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(rawValue) ? rawValue : "https://" + rawValue);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^(?:www\.|m\.)/, "");
  let videoId = "";

  if (hostname === "youtu.be") {
    videoId = url.pathname.split("/").filter(Boolean)[0] || "";
  } else if (hostname === "youtube.com") {
    if (url.pathname === "/watch") {
      videoId = url.searchParams.get("v") || "";
    } else {
      const pathMatch = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/]+)/i);
      videoId = pathMatch?.[1] || "";
    }
  }

  return /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
}

function positionYoutubeTile() {
  if (!youtubeTile || youtubeTile.hidden || !sidebarYoutubeButton) return;

  const buttonRect = sidebarYoutubeButton.getBoundingClientRect();
  const tileRect = youtubeTile.getBoundingClientRect();
  const edge = 10;
  const preferredLeft = buttonRect.right + edge;
  const left = preferredLeft + tileRect.width <= window.innerWidth - edge
    ? preferredLeft
    : Math.max(edge, buttonRect.left - tileRect.width - edge);
  const maxTop = Math.max(edge, window.innerHeight - tileRect.height - edge);
  const preferredTop = buttonRect.top + buttonRect.height / 2 - tileRect.height / 2;
  const top = Math.max(edge, Math.min(preferredTop, maxTop));

  youtubeTile.style.left = left + "px";
  youtubeTile.style.top = top + "px";
}

function closeYoutubeTile({ restoreFocus = false } = {}) {
  if (!youtubeTile || youtubeTile.hidden) return;
  youtubeTile.hidden = true;
  sidebarYoutubeButton?.setAttribute("aria-expanded", "false");
  if (restoreFocus) sidebarYoutubeButton?.focus();
}

function openYoutubeTile() {
  if (!youtubeTile || !youtubeVideoUrl || !sidebarYoutubeButton) return;
  if (!youtubeTile.hidden) {
    closeYoutubeTile();
    return;
  }

  youtubeTileFeedback.hidden = true;
  youtubeTileFeedback.textContent = "";
  youtubeVideoUrl.value = "";
  youtubeTile.hidden = false;
  sidebarYoutubeButton.setAttribute("aria-expanded", "true");
  positionYoutubeTile();
  youtubeVideoUrl.focus();
}

function loadYoutubeVideoIntoViewport(requestedSide, videoId) {
  const viewport = getViewportElement(requestedSide);
  if (!viewport || !videoId) return false;

  const embedUrl = "https://www.youtube.com/embed/" + videoId;
  const content = document.createElement("div");
  content.className = "viewport-youtube-content";

  const frame = document.createElement("iframe");
  frame.className = "viewport-youtube-frame";
  frame.src = embedUrl;
  frame.title = "YouTube video player";
  frame.setAttribute("frameborder", "0");
  frame.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
  frame.setAttribute("allowfullscreen", "");
  content.append(frame);

  viewport.replaceChildren(content);
  viewport.dataset.fileName = "YouTube video " + videoId;
  viewport.scrollTop = 0;
  return true;
}

youtubeTargetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const videoId = extractYoutubeVideoId(youtubeVideoUrl?.value || "");
    if (!videoId) {
      youtubeTileFeedback.textContent = "Enter a valid YouTube video link to continue.";
      youtubeTileFeedback.hidden = false;
      youtubeVideoUrl?.focus();
      positionYoutubeTile();
      return;
    }

    const target = button.dataset.youtubeTarget;
    if (target === "full") {
      setViewportMode("full");
    } else if (target === "left" || target === "right") {
      setViewportMode("split");
    } else {
      return;
    }

    if (!loadYoutubeVideoIntoViewport(target, videoId)) {
      youtubeTileFeedback.textContent = "That viewport is not available. Please choose a destination again.";
      youtubeTileFeedback.hidden = false;
      positionYoutubeTile();
      return;
    }

    closeYoutubeTile();
  });
});

sidebarYoutubeButton?.addEventListener("click", openYoutubeTile);

document.addEventListener("pointerdown", (event) => {
  if (youtubeTile?.hidden) return;
  if (youtubeTile?.contains(event.target) || sidebarYoutubeButton?.contains(event.target)) return;
  closeYoutubeTile();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && youtubeTile && !youtubeTile.hidden) {
    event.preventDefault();
    closeYoutubeTile({ restoreFocus: true });
  }
});

window.addEventListener("resize", positionYoutubeTile);
window.addEventListener("scroll", positionYoutubeTile, true);

// Resize the two split viewports by dragging the narrow vertical divider.
function setSplitViewportRatio(ratio) {
  if (!splitScreenViewportLayout || !splitViewportDivider) return;

  const boundedRatio = Math.max(0.2, Math.min(0.8, ratio));
  rememberedSplitRatio = boundedRatio;
  viewportComposition?.style.setProperty("--split-left-share", boundedRatio + "fr");
  viewportComposition?.style.setProperty("--split-right-share", (1 - boundedRatio) + "fr");
  splitViewportDivider.setAttribute("aria-valuenow", String(Math.round(boundedRatio * 100)));
}

if (splitViewportDivider && splitScreenViewportLayout && viewportComposition) {
  let activePointerId = null;

  function updateSplitRatioFromPointer(event) {
    if (event.pointerId !== activePointerId) return;

    const layoutBounds = viewportComposition.getBoundingClientRect();
    const dividerWidth = splitViewportDivider.getBoundingClientRect().width;
    const usableWidth = layoutBounds.width - dividerWidth;
    if (usableWidth <= 0) return;

    const leftWidth = event.clientX - layoutBounds.left - dividerWidth / 2;
    setSplitViewportRatio(leftWidth / usableWidth);
  }

  function stopSplitResize() {
    if (activePointerId === null) return;
    splitViewportDivider.removeEventListener("pointermove", updateSplitRatioFromPointer);
    splitViewportDivider.removeEventListener("pointerup", stopSplitResize);
    splitViewportDivider.removeEventListener("pointercancel", stopSplitResize);
    if (splitViewportDivider.hasPointerCapture(activePointerId)) {
      splitViewportDivider.releasePointerCapture(activePointerId);
    }
    activePointerId = null;
  }

  splitViewportDivider.addEventListener("pointerdown", (event) => {
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();

    activePointerId = event.pointerId;
    splitViewportDivider.setPointerCapture(activePointerId);
    splitViewportDivider.addEventListener("pointermove", updateSplitRatioFromPointer);
    splitViewportDivider.addEventListener("pointerup", stopSplitResize);
    splitViewportDivider.addEventListener("pointercancel", stopSplitResize);
  });

  splitViewportDivider.addEventListener("keydown", (event) => {
    const currentRatio = Number(splitViewportDivider.getAttribute("aria-valuenow") || "50") / 100;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setSplitViewportRatio(currentRatio - 0.02);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setSplitViewportRatio(currentRatio + 0.02);
    } else if (event.key === "Home") {
      event.preventDefault();
      setSplitViewportRatio(0.2);
    } else if (event.key === "End") {
      event.preventDefault();
      setSplitViewportRatio(0.8);
    }
  });
}
