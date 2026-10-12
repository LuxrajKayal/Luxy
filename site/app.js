import { initDriveIntegration } from "./drive-integration.js";

const findButton = document.querySelector("#find-text-button");
const findPanel = document.querySelector("#find-panel");
const searchInput = document.querySelector("#find-input");
const nextButton = document.querySelector("#find-next");
const previousButton = document.querySelector("#find-previous");
const closeButton = document.querySelector("#find-close");
const findStatus = document.querySelector("#find-status");
const workspace = document.querySelector(".workspace");

const marker =
  workspace && typeof window.Mark === "function"
    ? new window.Mark(workspace)
    : null;

let requestedQuery = "";
let refreshRevision = 0;
let refreshRunning = false;
let matches = [];
let activeMatchIndex = -1;

function setFindStatus(message) {
  if (findStatus) findStatus.textContent = message;
}

function refreshHighlights(query) {
  requestedQuery = query.trim();
  refreshRevision += 1;

  if (!marker) {
    setFindStatus("Search highlighting is unavailable because mark.js did not load.");
    return;
  }

  if (!refreshRunning) runHighlightRefresh();
}

function runHighlightRefresh() {
  refreshRunning = true;

  marker.unmark({
    done: () => {
      matches = [];
      activeMatchIndex = -1;

      const revisionForThisMark = refreshRevision;
      const query = requestedQuery;

      if (!query) {
        setFindStatus("0 matches");
        refreshRunning = false;
        return;
      }

      marker.mark(query, {
        separateWordSearch: false,
        acrossElements: false,
        className: "lux-find-match",
        done: () => {
          // If the user typed again while marking, discard this result and
          // run a clean pass for the most recent query.
          if (revisionForThisMark !== refreshRevision) {
            runHighlightRefresh();
            return;
          }

          matches = Array.from(
            workspace.querySelectorAll("mark.lux-find-match")
          );

          setFindStatus(
            matches.length === 0
              ? "No matches"
              : `${matches.length} ${matches.length === 1 ? "match" : "matches"}`
          );

          refreshRunning = false;
        }
      });
    }
  });
}

function goToMatch(direction) {
  if (matches.length === 0) {
    setFindStatus(requestedQuery ? "No matches" : "Type to search this page.");
    searchInput?.focus();
    return;
  }

  if (activeMatchIndex === -1) {
    activeMatchIndex = direction > 0 ? 0 : matches.length - 1;
  } else {
    activeMatchIndex =
      (activeMatchIndex + direction + matches.length) % matches.length;
  }

  matches.forEach((match, index) => {
    match.classList.toggle("lux-find-active", index === activeMatchIndex);
  });

  setFindStatus(`${activeMatchIndex + 1} of ${matches.length}`);
  matches[activeMatchIndex].scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "center",
    inline: "nearest"
  });
}

function closeSearch() {
  if (searchInput) searchInput.value = "";
  refreshHighlights("");
  if (findPanel) findPanel.hidden = true;
  findButton?.setAttribute("aria-expanded", "false");
  findButton?.focus();
}

findButton?.addEventListener("click", () => {
  const isOpen = findPanel && !findPanel.hidden;

  if (isOpen) {
    closeSearch();
    return;
  }

  if (findPanel) findPanel.hidden = false;
  findButton.setAttribute("aria-expanded", "true");

  if (!marker) {
    setFindStatus("Search highlighting is unavailable because mark.js did not load.");
  } else if (!searchInput?.value) {
    setFindStatus("Type to search this page.");
  }

  searchInput?.focus();
});

searchInput?.addEventListener("input", () => {
  refreshHighlights(searchInput.value);
});

searchInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    goToMatch(event.shiftKey ? -1 : 1);
  }
});

nextButton?.addEventListener("click", () => goToMatch(1));
previousButton?.addEventListener("click", () => goToMatch(-1));
closeButton?.addEventListener("click", closeSearch);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && findPanel && !findPanel.hidden) {
    event.preventDefault();
    closeSearch();
  }
});


// Dark mode toggle
const themeToggle = document.querySelector("#theme-toggle");
const themeStorageKey = "lux-pdf-viewer-theme";

function setDarkMode(enabled, savePreference = true) {
  if (enabled) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }

  if (themeToggle) {
    const nextMode = enabled ? "light" : "dark";
    themeToggle.setAttribute("aria-label", `Switch to ${nextMode} mode`);
    themeToggle.setAttribute("title", `Switch to ${nextMode} mode`);
    themeToggle.setAttribute("aria-pressed", String(enabled));
  }

  if (savePreference) {
    try {
      localStorage.setItem(themeStorageKey, enabled ? "dark" : "light");
    } catch {
      // Theme switching still works when browser storage is unavailable.
    }
  }
}

let startInDarkMode = false;
try {
  startInDarkMode = localStorage.getItem(themeStorageKey) === "dark";
} catch {
  // Fall back to the light theme when browser storage is unavailable.
}

setDarkMode(startInDarkMode, false);

themeToggle?.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  setDarkMode(!isDark);
});


// Focus Mode: persistent state, scroll-up reveal, and hover-to-hide.
const focusModeToggle = document.querySelector("#focus-mode-toggle");
const topbar = document.querySelector(".topbar");
const focusModeStorageKey = "lux-pdf-viewer-focus-mode";
let lastScrollY = window.scrollY;

function isFocusModeEnabled() {
  return document.body.dataset.focusMode === "true";
}

function showTopbar() {
  if (isFocusModeEnabled()) {
    topbar?.classList.add("is-visible");
  }
}

function hideTopbar() {
  if (isFocusModeEnabled()) {
    topbar?.classList.remove("is-visible");
  }
}

function setFocusMode(enabled, savePreference = true) {
  document.body.dataset.focusMode = enabled ? "true" : "false";

  // Reset reveal state on every toggle so ON always starts hidden, while OFF
  // always restores the fixed, permanently visible topbar.
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
      localStorage.setItem(focusModeStorageKey, String(enabled));
    } catch {
      // Focus Mode still works for this session if storage is unavailable.
    }
  }

  lastScrollY = window.scrollY;
}

let savedFocusMode = document.body.dataset.focusMode === "true";
try {
  const storedFocusMode = localStorage.getItem(focusModeStorageKey);
  if (storedFocusMode === "true" || storedFocusMode === "false") {
    savedFocusMode = storedFocusMode === "true";
  }
} catch {
  // Use the state initialized in the HTML when storage is unavailable.
}

setFocusMode(savedFocusMode, false);

focusModeToggle?.addEventListener("click", () => {
  setFocusMode(!isFocusModeEnabled());
});

// In Focus Mode, scrolling upward reveals the bar and scrolling downward hides it.
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
      // OFF means the bar is always visible regardless of scroll direction.
      topbar?.classList.remove("is-visible");
    }

    lastScrollY = currentScrollY;
  },
  { passive: true }
);

// Reveal when the pointer reaches the browser's top edge.
document.addEventListener("mousemove", (event) => {
  if (isFocusModeEnabled() && event.clientY <= 10) {
    showTopbar();
  }
});

// Keep the revealed bar visible while the pointer is over it; hide it as soon
// as the pointer leaves. These handlers do nothing while Focus Mode is OFF.
topbar?.addEventListener("mouseenter", () => {
  if (isFocusModeEnabled()) showTopbar();
});

topbar?.addEventListener("mouseleave", () => {
  if (isFocusModeEnabled()) hideTopbar();
});

// Keyboard users can reveal the controls too.
topbar?.addEventListener("focusin", showTopbar);


// Manual sidebar toggle: its state changes only when the user presses the button.
const sidebarToggle = document.querySelector("#sidebar-toggle");
const sidebarStorageKey = "lux-pdf-viewer-sidebar-open";

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
      localStorage.setItem(sidebarStorageKey, String(isOpen));
    } catch {
      // The sidebar still works for this page when storage is unavailable.
    }
  }
}

// The HTML sets this before first paint; repeat it here to synchronize the button.
let sidebarStartsOpen = document.documentElement.getAttribute("data-sidebar-open") !== "false";
try {
  const savedSidebarState = localStorage.getItem(sidebarStorageKey);
  if (savedSidebarState === "true" || savedSidebarState === "false") {
    sidebarStartsOpen = savedSidebarState === "true";
  }
} catch {
  // Keep the initially applied state if storage is unavailable.
}

setSidebarOpen(sidebarStartsOpen, false);

sidebarToggle?.addEventListener("click", () => {
  const isOpen = document.documentElement.getAttribute("data-sidebar-open") === "true";
  setSidebarOpen(!isOpen);
});

// Initialize Google Drive UI and handlers.
initDriveIntegration();
