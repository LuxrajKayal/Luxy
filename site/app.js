const findButton = document.querySelector("#find-text-button");

function dispatchCtrlF() {
  const shortcut = {
    key: "f",
    code: "KeyF",
    ctrlKey: true,
    bubbles: true,
    cancelable: true
  };

  // Dispatch Ctrl+F keyboard events for page-level listeners.
  // Synthetic keyboard events cannot invoke browser chrome's native Find UI.
  document.dispatchEvent(new KeyboardEvent("keydown", shortcut));
  document.dispatchEvent(new KeyboardEvent("keyup", shortcut));
}

findButton?.addEventListener("click", dispatchCtrlF);
