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
