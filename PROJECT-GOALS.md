# Lux PDF Viewer — Living Project Goals

Last updated: 2026-10-12

This is the working source of truth for the product direction agreed by the project owner. It is intentionally a living document: goals may change, but do not silently reinterpret or replace an owner's decision. Update this file only when the owner explicitly changes or approves a decision.

## 1. Product identity and ownership

- **Product name:** Lux PDF Viewer
- **GitHub repository:** `LuxrajKayal/Luxy`
- **Project owner / intended author of first-party work:** Luxraj Kayal, also known as Subrata Kayal.
- The product is being developed as a real product intended for users and eventual commercial distribution, not merely as a coding exercise.
- Attribute original first-party product work to the project owner. Do not claim that third-party library authors authored the Lux PDF Viewer application, and do not claim ownership of third-party code.

The owner has expressed an intent to control use and reproduction of first-party product work and to provide a free version for students. The exact license, eligibility rules, and legally enforceable terms have not yet been finalized. Do not draft or publish a final license or assert legal conclusions without discussing the terms with the owner. Any first-party restrictions must not be represented as overriding rights granted by third-party library licenses.

## 2. Long-term product direction

The intended product path is:

1. Build and refine the **standalone web-based application** first.
2. After the website-based product has a solid foundation, discuss and plan external website integration features with the owner.
3. Implement both intended embedding approaches as future features:
   - **Iframe embedding:** allow a website to display the hosted Lux PDF Viewer application in an iframe.
   - **Web Component integration:** allow a website to incorporate a Lux PDF Viewer custom element, with a documented integration API.
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

The first interface has not yet been designed or approved. This document does not prescribe a particular appearance or user experience.

## 4. Independent development — strict separation from prior repositories

- This project starts from zero in `LuxrajKayal/Luxy`.
- Do not copy, fork, clone, transplant, rename or reproduce source code, interface, wording, comments, documentation or project structure from the old `Luxraj-PDF` or `pdf-annotation-test` repositories, or from another PDF editor.
- The old `Luxraj-PDF` repository may be inspected for observation or high-level comparison only. It is not a template or source for implementation.
- Prior conversation code must not be silently reused.
- Feature descriptions are requirements only; they are not permission to copy another implementation.
- If a proposed approach resembles a previously observed project, make decisions based on requirements and independently reasoned engineering choices, not by transplanting that project's design or code.

## 5. Third-party dependencies and first-party work

The owner has approved evaluating these two external PDF libraries with proper attribution:

- **Mozilla PDF.js** — Apache License 2.0.
- **pdf-lib** — MIT License.

The current repository records pinned upstream Git submodule references under `Used third party dependencies/`. A submodule reference pins an upstream commit; it is not itself a copy of every upstream source file, and does not prove that the dependency has been integrated into or tested with the application.

Rules:

- Do not add any other third-party library, framework, CDN, external service, authentication provider or build dependency without first explaining its purpose, dependency boundaries, exact applicable license, local-hosting options, alternatives and limitations, then receiving owner approval.
- Keep third-party source distinct from first-party application code.
- Preserve applicable upstream license text, copyright notices and required attribution when distributing the libraries or product builds that contain them.
- Keep third-party disclosures in the designated `Used third party dependencies/` folder where legally sufficient; do not add credits to the application UI unless the owner approves, except where a specific legal requirement makes another placement necessary.
- Do not remove upstream legal notices or misrepresent ownership.
- Do not claim the product has only two total dependency packages until the actual bundles and any transitive dependencies have been audited.
- Do not describe any first-party PDF-engine component as complete or generally compatible without code evidence, representative test results and a stated support scope.
- Replace third-party functionality only after an independently developed replacement has been tested sufficiently for the intended use cases.

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

- Product name: Lux PDF Viewer.
- New repository: public `LuxrajKayal/Luxy`.
- First development focus: the standalone web-based application interface.
- Both iframe embedding and Web Component integration are intended future features, not initial tasks.
- Chrome extension adaptation is a later product goal, not the current focus.
- PDF.js and pdf-lib are the two currently approved third-party PDF-library candidates, subject to correct licensing and notices.
- Interface design and product wording are controlled by the owner.
- No code or assets from prior repositories may be copied into this project.

### Not yet decided

- Exact interface design and interaction details.
- Final source layout and public application/module boundaries.
- Exact iframe API, Web Component API, and which one to implement first.
- Authentication architecture and Google Drive permissions.
- Final first-party product license and student eligibility terms.
- Release and distribution approach for the eventual commercial product.

If future conversation conflicts with this ledger, point out the conflict and ask the owner to resolve it instead of silently selecting a new direction.
