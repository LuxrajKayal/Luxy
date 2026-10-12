// Lux PDF Viewer core interface controls.
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

// Sidebar: manually toggled, with no hover- or scroll-driven behavior.
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
