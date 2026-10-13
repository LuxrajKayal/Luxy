// Lux Omni Temporary Log context menu.
// Saves selected text only after the user chooses the menu action.
// Content is stored in this browser's existing Clipboard Log IndexedDB; nothing is uploaded.
(() => {
  "use strict";

  const DATABASE_NAME = "lux-omni-clipboard-history";
  const STORE_NAME = "entries";
  const HISTORY_LIMIT = 10;
  let databasePromise = null;
  let pendingText = "";
  let previousFocus = null;
  let toastTimer = 0;

  const menu = document.createElement("div");
  menu.id = "lux-temp-log-context-menu";
  menu.className = "lux-temp-log-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Selected text actions");
  menu.hidden = true;

  const heading = document.createElement("div");
  heading.className = "lux-temp-log-menu-heading";
  heading.textContent = "LUX OMNI";
  menu.appendChild(heading);

  function makeMenuButton(label, action, iconPath) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lux-temp-log-menu-item";
    button.setAttribute("role", "menuitem");
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + iconPath + '</svg><span></span>';
    button.querySelector("span").textContent = label;
    button.addEventListener("click", action);
    menu.appendChild(button);
    return button;
  }

  const saveButton = makeMenuButton(
    "Save to Temporary Log",
    savePendingText,
    '<path d="M12 5v14M5 12h14"/><path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/>'
  );

  const menuDivider = document.createElement("div");
  menuDivider.className = "lux-temp-log-menu-divider";
  menu.appendChild(menuDivider);

  makeMenuButton(
    "Copy selected text",
    copyPendingText,
    '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h3"/>'
  );

  const privacyHint = document.createElement("p");
  privacyHint.className = "lux-temp-log-menu-hint";
  privacyHint.textContent = "Saved locally in this browser only.";
  menu.appendChild(privacyHint);

  const toast = document.createElement("div");
  toast.id = "lux-temp-log-toast";
  toast.className = "lux-temp-log-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.hidden = true;

  document.body.append(menu, toast);

  function showToast(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle("is-error", isError);
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 4200);
  }

  function closeMenu(restoreFocus = false) {
    menu.hidden = true;
    pendingText = "";
    if (restoreFocus && previousFocus instanceof HTMLElement && previousFocus.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
    previousFocus = null;
  }

  function isEditableTarget(target) {
    const element = target instanceof Element ? target : target?.parentElement;
    return Boolean(element?.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'
    ));
  }

  function getSelectedText() {
    const selection = window.getSelection();
    return selection ? selection.toString().trim() : "";
  }

  function openMenu(event, selectedText) {
    pendingText = selectedText;
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    menu.hidden = false;
    menu.style.left = "8px";
    menu.style.top = "8px";

    const x = event.clientX;
    const y = event.clientY;
    requestAnimationFrame(() => {
      if (menu.hidden) return;
      const rect = menu.getBoundingClientRect();
      const left = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
      const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
      menu.style.left = left + "px";
      menu.style.top = top + "px";
    });
  }

  function openHistoryDatabase() {
    if (!("indexedDB" in window)) {
      return Promise.reject(new Error("Local browser storage is not available in this browser."));
    }
    if (databasePromise) return databasePromise;

    databasePromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(DATABASE_NAME, 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => {
        databasePromise = null;
        reject(request.error || new Error("Could not open the local Temporary Log."));
      };
      request.onblocked = () => {
        databasePromise = null;
        reject(new Error("The log is busy in another tab. Close other Lux Omni Clipboard tabs and try again."));
      };
    });
    return databasePromise;
  }

  async function saveTextToLog(text) {
    const database = await openHistoryDatabase();
    const entry = {
      id: "selection-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10),
      type: "text",
      createdAt: Date.now(),
      text
    };

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();
      let operationError = null;

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || operationError || new Error("Could not save the selected text."));
      transaction.onabort = () => reject(transaction.error || operationError || new Error("Saving the selected text was cancelled."));

      request.onerror = () => {
        operationError = request.error || new Error("Could not read the existing log.");
        try { transaction.abort(); } catch {}
      };

      request.onsuccess = () => {
        try {
          const existing = Array.isArray(request.result) ? request.result : [];
          const next = existing.concat(entry).sort((a, b) =>
            ((b.createdAt || 0) - (a.createdAt || 0)) || String(b.id).localeCompare(String(a.id))
          ).slice(0, HISTORY_LIMIT);

          store.clear();
          next.forEach(item => store.put(item));
        } catch (error) {
          operationError = error;
          try { transaction.abort(); } catch {}
        }
      };
    });
  }

  async function savePendingText() {
    const text = pendingText;
    closeMenu();
    if (!text) return;

    saveButton.disabled = true;
    try {
      await saveTextToLog(text);
      showToast("Saved to Temporary Log. Open Lux Omni Clipboard → Log List to retrieve it.");
    } catch (error) {
      showToast(error?.message || "Could not save the selected text to the Temporary Log.", true);
    } finally {
      saveButton.disabled = false;
    }
  }

  async function copyPendingText() {
    const text = pendingText;
    closeMenu();
    if (!text) return;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable in this browser.");
      }
      await navigator.clipboard.writeText(text);
      showToast("Selected text copied.");
    } catch (error) {
      showToast(error?.message || "Could not copy the selected text.", true);
    }
  }

  document.addEventListener("contextmenu", event => {
    if (menu.contains(event.target)) return;
    if (isEditableTarget(event.target)) return;

    const selectedText = getSelectedText();
    if (!selectedText) {
      closeMenu();
      return;
    }

    // A custom context menu is needed because websites cannot append items to
    // the browser's native context menu without an extension.
    event.preventDefault();
    openMenu(event, selectedText);
  });

  document.addEventListener("pointerdown", event => {
    if (!menu.hidden && !menu.contains(event.target)) closeMenu();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !menu.hidden) {
      event.preventDefault();
      closeMenu(true);
    }
  });

  window.addEventListener("resize", () => closeMenu());
  window.addEventListener("scroll", () => closeMenu(), true);
})();
