const findButton = document.querySelector("#find-text-button");
const findHelp = document.querySelector("#find-help");

findButton?.addEventListener("click", () => {
  const isOpen = findButton.getAttribute("aria-expanded") === "true";
  findButton.setAttribute("aria-expanded", String(!isOpen));
  if (findHelp) findHelp.hidden = isOpen;
});

document.addEventListener("pointerdown", (event) => {
  if (!findButton?.parentElement?.contains(event.target)) {
    findButton?.setAttribute("aria-expanded", "false");
    if (findHelp) findHelp.hidden = true;
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    findButton?.setAttribute("aria-expanded", "false");
    if (findHelp) findHelp.hidden = true;
  }
});
