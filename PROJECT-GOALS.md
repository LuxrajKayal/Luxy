# Lux Omni — Living Project Goals

Last updated: 2026-10-12

This is the working source of truth for the product direction agreed by the project owner. It is intentionally a living document: goals may change, but do not silently reinterpret or replace an owner's decision. Update this file only when the owner explicitly changes or approves a decision.

## 1. Product identity and ownership

- **Product name:** Lux Omni
- **GitHub repository:** `LuxrajKayal/Luxy`
- **Project owner / intended author of first-party work:** Luxraj Kayal, also known as Subrata Kayal.
- The product is being developed as a real product intended for users and eventual commercial distribution, not merely as a coding exercise.
- Attribute original first-party product work to the project owner. Do not claim that third-party library authors authored the Lux Omni application, and do not claim ownership of third-party code.

The first-party rights notice for original Lux Omni materials is recorded in the root `LICENSE` and `COPYRIGHT.md` files. Third-party software intentionally loaded by the current application is identified in `THIRD_PARTY_NOTICES.md`; its own licence terms remain separate from the first-party terms.

## 2. Long-term product direction

The intended product path is:

1. Build and refine the **standalone web-based application** first.
2. After the website-based product has a solid foundation, discuss and plan external website integration features with the owner.
3. Implement both intended embedding approaches as future features:
   - **Iframe embedding:** allow a website to display the hosted Lux Omni application in an iframe.
   - **Web Component integration:** allow a website to incorporate a Lux Omni custom element, with a documented integration API.
4. Later, revisit adapting the product into a Chrome extension and commercial distribution.

Iframe embedding and Web Component integration are both part of the product's intended feature set, but **neither is part of the initial development scope**. The order, API, permissions, security model, packaging and implementation details remain undecided until discussed with the owner.

## 3. Current phase: website-based interface

**Current priority: work on the website-based application interface.**

- Proceed one small, reviewable step at a time.
- The owner decides the interface design, layout, colors, toolbar, panels, icons, labels, wording, branding and interactions.
- Do not invent or finalize product-facing text or visual design without approval.
- Discuss one material design or architecture decision at a time.
- Do not begin iframe support, Web Components, Chrome extension packaging, Google Drive OAuth, or unrelated features merely because they are long-term goals.
- Keep the product architecture understandable and modular where useful, but do not overbuild for future features before the current scope requires it.
- The website implementation approach and module boundaries must be discussed when relevant. Do not add a third-party UI framework or build dependency without explaining the trade-offs and obtaining approval.

### Approved initial PDF/Markdown interaction

These behavior decisions were explicitly approved by the owner:

1. **PDF-first start:** The application starts in its PDF workspace. The Markdown editor is not open by default.
2. **Dedicated open action:** Provide a new Markdown Editor button/action in the PDF workspace. The exact label and presentation remain subject to the owner's interface decisions.
3. **Side-by-side after opening:** When the user activates the Markdown Editor action, show the PDF panel and Markdown editor panel side by side by default.
4. **User-resizable panels:** The user can resize the two panels to suit their needs.
5. **Separate panel controls:** The PDF panel has controls appropriate to PDF viewing and annotation; the Markdown panel has its own controls appropriate to Markdown editing and saving. Do not merge their toolbars or assume that one panel's controls apply to the other.
6. Further behavior—such as panel collapsing, remembering sizes, mobile layout, Markdown formatting controls, and save/Save As behavior—remains undecided and must be discussed when relevant.

The visual design details (exact header, placement, dimensions, colors, icons, toolbar layout, and panel styling) are not finalized by these behavior decisions. Do not invent them.

## 4. Independent development — strict separation from prior repositories

- This project starts from zero in `LuxrajKayal/Luxy`.
- Do not copy, fork, clone, transplant, rename or reproduce source code, interface, wording, comments, documentation or project structure from the old `Luxraj-PDF` or `pdf-annotation-test` repositories, or from another PDF editor.
- The old `Luxraj-PDF` repository may be inspected for observation or high-level comparison only. It is not a template or source for implementation.
- Prior conversation code must not be silently reused.
- Feature descriptions are requirements only; they are not permission to copy another implementation.
- If a proposed approach resembles a previously observed project, make decisions based on requirements and independently reasoned engineering choices, not by transplanting that project's design or code.

## 5. First-party work and dependencies

- Original Lux Omni source code, project documentation, and original assets are attributed to the project owner where created by or rightsfully owned by the owner.
- Only describe a third-party library as used by the application when it is intentionally loaded or integrated into the current build.
- No third-party authentication or cloud-storage SDK is currently loaded by the active website.
- Do not add another third-party library, framework, CDN, external service, authentication provider, or build dependency without first explaining its purpose, boundaries, licence, alternatives, and limitations, then receiving the owner's approval.
- Keep first-party work separate from third-party material. Preserve required third-party copyright and licence notices for software intentionally used or distributed.
- Do not claim ownership of third-party code or misrepresent what is actually integrated and tested.
- Do not describe PDF editing, export, or other components as complete without code evidence and suitable testing.

## 6. Working method

For each step:

1. Explain the immediate decision or problem plainly.
2. Present options and trade-offs when the decision is material.
3. Wait for the owner's decision before making that decision on their behalf.
4. Identify the intended repository and exact scope before edits.
5. Make only the approved changes.
6. Inspect the actual diff and run suitable tests where possible.
7. Report what changed, what was verified, what remains incomplete and known limitations.
8. Wait for direction before the next substantial step.

Do not claim that files, commits, tests, deployments, permissions or features exist unless the actual result has been checked. If a capability cannot be verified, state that clearly.

## 7. Decision status ledger

### Agreed

- Product name: Lux Omni.
- Repository: `LuxrajKayal/Luxy`.
- First development focus: the standalone web-based application interface.
- The initial workspace starts in PDF mode, with the Markdown editor opened via a dedicated action.
- Opening the Markdown editor displays PDF and Markdown panels side by side by default; users can resize them, and each panel has its own controls.
- Both iframe embedding and Web Component integration are intended future features, not initial tasks.
- Chrome extension adaptation is a later product goal, not the current focus.
- No third-party authentication or cloud-storage SDK is currently loaded by the active website.
- Interface design and product wording are controlled by the owner.
- No code or assets from prior repositories may be copied into this project.

### Not yet decided

- Remaining interface appearance and detailed interaction behavior.
- Final source layout and public application/module boundaries.
- Exact iframe API, Web Component API, and which one to implement first.
- Authentication architecture and Google Drive permissions.
- Additional licensing permissions, if any, beyond the current root `LICENSE` remain subject to a separate decision.
- Release and distribution approach for the eventual commercial product.

If future conversation conflicts with this ledger, point out the conflict and ask the owner to resolve it instead of silently selecting a new direction.
