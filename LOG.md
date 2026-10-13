# Lux Omni — Change Log and Decision Record

This is the **single authoritative log** for Lux Omni project decisions, approved implementations, testing, commits, and rollback instructions. Continue adding entries to this file; do not create a separate implementation log.

## Working rules

1. The project owner describes one change at a time.
2. Before implementation, review the relevant code and service connections, explain the proposed scope, risks, tests, and rollback method, then **ask the owner for approval**.
3. Do not edit or implement until that specific change is approved. Silence or general discussion is not approval.
4. Make only the approved change. Do not bundle unrelated cleanup, redesign, dependency changes, or wording changes.
5. After implementation, inspect the actual diff and run appropriate tests where possible. Record the actual results; never report a test as passed unless it was run successfully.
6. Every implemented change must have a unique change ID, a dedicated implementation commit SHA, affected file paths, verification results, and rollback instructions.
7. Add the log record after the implementation commit so that the record can include its full SHA. The log update may be a separate documentation commit. Git cannot include a commit's own final SHA inside that same commit; use GitHub commit history for the log-update commit itself.
8. If verification is incomplete, a test fails, or behavior cannot be confirmed, state that clearly in the relevant record.
9. Keep this file in the repository root as `LOG.md`. This file is the only project change/decision log.

---

## LOG-000 — Establish the single project log

- **Status:** Created by owner instruction.
- **Purpose:** Centralize project decisions, implementation records, commit references, verification, and rollback instructions in this one Markdown file.
- **Log creation commit:** [\`c72cebd5932bed77f08ef7b67a82b3041dfcd640\`](https://github.com/LuxrajKayal/Luxy/commit/c72cebd5932bed77f08ef7b67a82b3041dfcd640) — creates this file; this follow-up record points back to it.
- **Application code changed:** No.
- **Initial repository baseline before this log was added:** `1e4c96cdfee79ef31b2e580667077b84352b39da`
- **Baseline commit:** [Minimize viewports and support safe drag-and-drop](https://github.com/LuxrajKayal/Luxy/commit/1e4c96cdfee79ef31b2e580667077b84352b39da)
- **Baseline observation:** The main branch was at the SHA above when this log was prepared. Verify the current branch head before any future implementation.
- **Rollback:** This is a documentation-only file. It can be removed by reverting the commit that created `LOG.md`; do not revert unrelated application commits.

## LOG-001 — PDF.js annotation-control review (planning only)

- **Status:** Reviewed; no PDF implementation approved or changed.
- **Owner's concern:** PDF annotation tools and controls have bugs. The owner wants to give requirements one by one and decide what changes should be implemented.
- **Owner's explicit decision:** Keep the existing application and PDF implementation as-is for now. Each future step must be discussed first, and the assistant must ask for explicit approval before every implementation.
- **Scope of this review:** Read current PDF.js integration, viewport bridge, Dropbox Sync path, deployment workflow, and PDF-related tests. This was a source review, not a verified live-browser test run.
- **Architecture found:**
  - `site/pdf-engine.js` is Lux Omni's adapter/custom toolbar; it dynamically loads Mozilla `pdfjs-dist@6.4.299` from jsDelivr. It is not itself Mozilla's engine.
  - `site/pdf-editor.css` styles the custom PDF toolbar and viewport.
  - `site/dropbox-viewport-bridge.js` imports `mountPdfEditor`, assigns PDF/image/Markdown/text/other file previews into Full/Left/Right viewports, tracks editor/export state, and exposes `window.LuxOmniViewportBridge`.
  - `site/dropbox-ui.js` calls the viewport export bridge for Sync.
  - `site/dropbox-api.js` contains Dropbox upload and revision-aware save behavior.
  - `site/index.html` registers the workspace modules/styles; `site/app.js` manages viewport layout and interactions.
  - `.github/workflows/pages.yml` deploys the `site` directory. The root-level PDF.js source submodule is not automatically the live viewer merely by existing in the repository.
  - `tests/pdf-editor-contract.test.mjs` contains static contract checks. `tests/pdf-editor-browser-smoke.mjs` contains browser-level PDF smoke checks.
  - `README.md`, `THIRD_PARTY_NOTICES.md`, and `site/privacy.html` describe the current PDF.js integration and CDN usage.
- **Risk identified:** Deleting `site/pdf-engine.js` without replacing its import in `site/dropbox-viewport-bridge.js` would stop that ES module from loading; its viewport assignment/export bridge would not initialize. This could affect non-PDF previews and Dropbox Sync through the shared bridge, not just PDF rendering.
- **Proposed direction (not approved for implementation):** Keep current files unchanged until the owner provides a specific bug scenario. Diagnose that scenario and propose a minimal, testable fix. A future migration to Mozilla's complete Generic Viewer may be considered only after separate discussion and explicit approval.
- **Verification status:** Repository source was inspected. The live website and test suites were not run as part of this review. Do not treat the current behavior as runtime-verified.
- **Implementation commit:** None; planning only.
- **Rollback:** No application change to roll back.

---

## Future entry template

Copy this template for each new change, then fill it with confirmed details after the work:

### LOG-XXX — <short change title>

- **Status:** Proposed / Approved / Implemented / Verified / Blocked / Rolled back.
- **Requested by owner:** <concise request in the owner's meaning>
- **Approval:** <specific approval message/context; do not claim approval before it is given>
- **Reason:** <problem or goal>
- **Plan actually implemented:** <what changed>
- **Files changed:** <exact paths>
- **Service connections checked:** <affected integrations and dependencies>
- **Tests run:** <commands or scenarios actually executed>
- **Results:** <pass/fail/not run, including limitations>
- **Implementation commit:** <full SHA and GitHub URL, or "None">
- **Log-update commit:** <full SHA and GitHub URL if useful and available>
- **Rollback:** <exact safe revert/restore steps>
- **Notes / follow-up:** <remaining risks or owner's next decision>


## LOG-002 — Gradual migration to the Smart Viewport Toolbar (planning decision)

- **Status:** Agreed approach; feature-by-feature implementation not yet approved.
- **Owner's decision:** Keep the existing PDF toolbar while introducing a new Smart Toolbar in the outer Viewport Toolbar. Migrate one feature at a time: add one feature to the Smart Toolbar, connect it to the same active document/viewer, verify its behavior, and only then remove that same feature from the old PDF toolbar.
- **Core principle:** Both toolbars temporarily coexist. They must not create separate document state or separate annotation systems. Equivalent controls must act on the same viewer and keep their state consistent while they coexist.
- **Per-feature workflow:** (1) owner describes the first feature; (2) inspect relevant implementation and dependencies; (3) propose the exact change and tests; (4) ask for approval; (5) implement only after explicit approval; (6) test the new control and existing behavior; (7) remove only the corresponding old control after the new control is verified; (8) inspect the diff; (9) record the actual implementation commit and results in this file.
- **Non-goals for the initial step:** Do not remove the existing toolbar as a whole, do not migrate multiple features in one implementation, do not rebuild the annotation engine, and do not alter Dropbox/viewport behavior unrelated to the approved feature.
- **Document-type behavior:** The new toolbar should eventually show relevant tools for the document assigned to each viewport. PDF, image, and Markdown tool sets are separate future feature work; do not presume their controls or invent designs before the owner specifies them.
- **Scope of this entry:** Planning decision only. No application code changed and no toolbar feature implemented.
- **Next action:** Wait for the owner to specify the first toolbar feature. Analyze it and present a narrow implementation plan; ask for approval before editing application code.


## LOG-003 — Connect PDF scrolling to the existing viewport scrollbar (proposal; awaiting approval)

- **Status:** Proposed only; implementation not approved or started.
- **Owner's requested feature:** Wire the existing viewport scrollbar to the Mozilla PDF.js viewer.
- **Code findings:**
  - `site/styles.css` gives each outer `.viewport` `overflow-y: scroll`; this is the workspace's existing scrollbar.
  - For PDFs, `site/dropbox-viewport-bridge.js` makes the PDF preview mount fill the viewport and sets its overflow to hidden.
  - `site/pdf-engine.js` creates a separate `.lux-pdf-viewer-container` with `overflow: auto`, inside the PDF editor's Shadow DOM. That element is passed to Mozilla's `PDFViewer` as its scroll container.
  - Consequently, PDF pages currently scroll through the inner PDF.js container rather than the outer workspace viewport's scrollbar. The outer `.viewport` scrollbar remains a separate scroll owner.
  - Mozilla's current `PDFViewer` implementation expects a DIV scroll container and, in the Generic build, checks that a positioned container is used. The current outer viewport is a grid item and the viewer is nested in a Shadow DOM, so connecting it directly is not a one-line CSS change.
- **Proposed implementation (not yet approved):**
  1. Make the outer Full/Left/Right `.viewport` the single vertical scroll owner for PDF documents, while preserving the existing per-viewport layout and the current PDF toolbar.
  2. Adjust PDF viewer DOM/CSS integration so Mozilla PDF.js observes the chosen viewport scroll host and the page stack plus annotation layers move together. Keep the PDF toolbar accessible without introducing a second scrolling region.
  3. Apply PDF-specific behavior only while that viewport contains a PDF. Do not alter scrolling behavior for image, Markdown, text, YouTube, or other content.
  4. Avoid two-way scroll-position synchronization if a single native scroll owner is feasible; duplicated scroll state could drift during page navigation, zoom, annotation, or viewport movement.
  5. Add/adjust browser smoke coverage with a multi-page PDF: verify dragging the existing outer scrollbar changes PDF page position and the PDF.js current page remains in sync; verify zoom, text selection, annotations and export still work; verify Full/Left/Right viewports stay independent; verify image/Markdown/text scrolling remains unchanged.
- **Files expected to review/change if approved:** `site/pdf-engine.js`, `site/dropbox-viewport-bridge.js`, `site/pdf-editor.css`, potentially `site/styles.css` for PDF-only scroll-host layout, and PDF browser/contract tests. The final file list must be based on the actual implementation diff.
- **Risks to resolve in implementation/testing:** PDF.js container positioning requirements; Shadow DOM boundaries; keeping the toolbar visible; preserving the existing viewport grid geometry; page navigation/zoom and annotation-layer alignment; avoiding regressions in non-PDF previews.
- **Proposed verification:** Run JavaScript syntax checks, contract tests, and a real browser test with a multi-page fixture and interactions. Also verify PDF loading still fails gracefully if the PDF.js CDN is unavailable. Record only tests that were actually run.
- **Approval:** Waiting for the owner to approve this proposed scope.
- **Application code changed:** No.
- **Implementation commit:** None.
- **Rollback:** No application change to roll back. If approved later, record the actual implementation commit and exact rollback instructions after testing.
