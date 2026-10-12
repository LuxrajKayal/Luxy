// Lux PDF Viewer core interface controls.
// Dark Mode, Focus Mode, and the manually controlled sidebar only.

const themeToggle = document.querySelector("#theme-toggle");
const focusModeToggle = document.querySelector("#focus-mode-toggle");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const topbar = document.querySelector(".topbar");
const fullScreenViewportButton = document.querySelector("#viewport-fullscreen");
const splitScreenViewportButton = document.querySelector("#viewport-split-screen");
const workspace = document.querySelector(".workspace");
const fullScreenViewportLayout = document.querySelector("#viewport-fullscreen-layout");
const splitScreenViewportLayout = document.querySelector("#viewport-split-layout");
const viewportTopbar = document.querySelector("#viewport-topbar");
const splitViewportDivider = document.querySelector("#viewport-split-divider");

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

// Viewport layouts: one empty viewport or two separate empty viewports.
function setViewportMode(mode) {
  if (!workspace || !fullScreenViewportLayout || !splitScreenViewportLayout) return;

  const isFullScreen = mode === "full";
  if (viewportTopbar) viewportTopbar.hidden = false;
  fullScreenViewportLayout.hidden = !isFullScreen;
  splitScreenViewportLayout.hidden = isFullScreen;

  // Reattach the layout containers if another workspace feature replaced its contents.
  workspace.replaceChildren(fullScreenViewportLayout, splitScreenViewportLayout);

  fullScreenViewportButton?.setAttribute("aria-pressed", String(isFullScreen));
  splitScreenViewportButton?.setAttribute("aria-pressed", String(!isFullScreen));
}

fullScreenViewportButton?.addEventListener("click", () => setViewportMode("full"));
splitScreenViewportButton?.addEventListener("click", () => setViewportMode("split"));

// Resize the two split viewports by dragging the narrow vertical divider.
function setSplitViewportRatio(ratio) {
  if (!splitScreenViewportLayout || !splitViewportDivider) return;

  const boundedRatio = Math.max(0.2, Math.min(0.8, ratio));
  splitScreenViewportLayout.style.setProperty("--split-left-share", boundedRatio + "fr");
  splitScreenViewportLayout.style.setProperty("--split-right-share", (1 - boundedRatio) + "fr");
  splitViewportDivider.setAttribute("aria-valuenow", String(Math.round(boundedRatio * 100)));
}

if (splitViewportDivider && splitScreenViewportLayout) {
  let activePointerId = null;

  function updateSplitRatioFromPointer(event) {
    if (event.pointerId !== activePointerId) return;

    const layoutBounds = splitScreenViewportLayout.getBoundingClientRect();
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
