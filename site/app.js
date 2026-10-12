// Lux Learning Tool core interface controls.
// Dark Mode, Focus Mode, and the manually controlled sidebar only.

const themeToggle = document.querySelector("#theme-toggle");
const focusModeToggle = document.querySelector("#focus-mode-toggle");
const sidebarToggle = document.querySelector("#sidebar-toggle");
const topbar = document.querySelector(".topbar");

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


// Dual-pane workspace splitter: adjusts the interface only.
const learningWorkspace = document.querySelector("#learning-workspace");
const workspaceDivider = document.querySelector("#workspace-divider");
let learningPaneRatio = 50;
let isResizingLearningPanes = false;

function isStackedLearningWorkspace() {
  return window.matchMedia("(max-width: 760px)").matches;
}

function applyLearningPaneRatio(value) {
  learningPaneRatio = Math.min(75, Math.max(25, value));
  const notesRatio = 100 - learningPaneRatio;

  learningWorkspace?.style.setProperty("--source-pane-width", learningPaneRatio + "fr");
  learningWorkspace?.style.setProperty("--notes-pane-width", notesRatio + "fr");
  learningWorkspace?.style.setProperty("--source-pane-height", learningPaneRatio + "fr");
  learningWorkspace?.style.setProperty("--notes-pane-height", notesRatio + "fr");
  workspaceDivider?.setAttribute("aria-valuenow", String(Math.round(learningPaneRatio)));
}

function updateLearningDividerOrientation() {
  const stacked = isStackedLearningWorkspace();
  workspaceDivider?.setAttribute("aria-orientation", stacked ? "horizontal" : "vertical");
  workspaceDivider?.setAttribute(
    "aria-label",
    stacked ? "Resize source and notes sections vertically" : "Resize source and notes panes horizontally"
  );
  if (workspaceDivider) {
    workspaceDivider.title = stacked ? "Drag up or down to resize sections" : "Drag left or right to resize panes";
  }
}

function setLearningRatioFromPointer(event) {
  if (!learningWorkspace) return;
  const bounds = learningWorkspace.getBoundingClientRect();
  if (isStackedLearningWorkspace()) {
    if (bounds.height > 0) applyLearningPaneRatio(((event.clientY - bounds.top) / bounds.height) * 100);
  } else if (bounds.width > 0) {
    applyLearningPaneRatio(((event.clientX - bounds.left) / bounds.width) * 100);
  }
}

function stopLearningPaneResize(event) {
  if (!isResizingLearningPanes) return;
  isResizingLearningPanes = false;
  learningWorkspace?.classList.remove("is-resizing");
  if (event && workspaceDivider?.hasPointerCapture?.(event.pointerId)) {
    workspaceDivider.releasePointerCapture(event.pointerId);
  }
}

workspaceDivider?.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  isResizingLearningPanes = true;
  learningWorkspace?.classList.add("is-resizing");
  workspaceDivider.setPointerCapture(event.pointerId);
  event.preventDefault();
});

workspaceDivider?.addEventListener("pointermove", (event) => {
  if (isResizingLearningPanes) setLearningRatioFromPointer(event);
});

workspaceDivider?.addEventListener("pointerup", stopLearningPaneResize);
workspaceDivider?.addEventListener("pointercancel", stopLearningPaneResize);
workspaceDivider?.addEventListener("lostpointercapture", () => {
  isResizingLearningPanes = false;
  learningWorkspace?.classList.remove("is-resizing");
});

workspaceDivider?.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 10 : 5;
  if (event.key === "Home") {
    applyLearningPaneRatio(25);
    event.preventDefault();
    return;
  }
  if (event.key === "End") {
    applyLearningPaneRatio(75);
    event.preventDefault();
    return;
  }

  if (isStackedLearningWorkspace()) {
    if (event.key === "ArrowUp") {
      applyLearningPaneRatio(learningPaneRatio - step);
      event.preventDefault();
    } else if (event.key === "ArrowDown") {
      applyLearningPaneRatio(learningPaneRatio + step);
      event.preventDefault();
    }
  } else {
    if (event.key === "ArrowLeft") {
      applyLearningPaneRatio(learningPaneRatio - step);
      event.preventDefault();
    } else if (event.key === "ArrowRight") {
      applyLearningPaneRatio(learningPaneRatio + step);
      event.preventDefault();
    }
  }
});

window.addEventListener("resize", updateLearningDividerOrientation);
updateLearningDividerOrientation();
