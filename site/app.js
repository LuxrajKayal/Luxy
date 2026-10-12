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
