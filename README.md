# Lux Omni

Lux Omni is a browser-based workspace created by **Luxraj Kayal (Subrata Kayal)**.

## Current features

- **Dropbox integration:** browser-based PKCE authorization, persistent same-origin token storage, cross-tab connection status, folder/file browsing, local uploads, and multipurpose Full / Left / Right viewports. PDF documents use the Mozilla PDF.js viewer/editor; image files use browser image rendering; Markdown files receive a basic safe Markdown preview; common text, code, JSON, CSV, YAML, XML, and log files open as readable text. Other binary formats offer a download link.
- **PDF workspace:** version-pinned Mozilla PDF.js rendering, text selection and search, page navigation, zoom, rotation, highlighting, freehand ink, free text, stamps, available signature editing, supported interactive form fields, PDF export/download, and a Dropbox Sync path for exported document bytes.
- **Workspace viewports:** open a full-screen viewport or a resizable split-screen layout; minimize, restore, or close viewports. Each viewport owns an independent PDF viewer/editor session.
- **YouTube playback:** load a YouTube video into a workspace viewport.
- **Display controls:** switch between light and dark themes and enable Focus Mode.
- **Lux Omni Clipboard:** switch between Text Clipboard, Screenshot Clipboard, and Log List; edit and copy text, paste or choose an image to preview and copy, and import entries from the ten most recent text/image copy actions stored locally in the browser.

## Current application status

The PDF viewer/editor integration uses Mozilla PDF.js **6.4.299**. Its JavaScript modules, worker, viewer stylesheet, and supporting assets are fetched on demand from a version-pinned jsDelivr URL; a connection to that CDN is required when opening a PDF. The custom Lux Omni toolbar controls the PDF.js viewer and supported annotation editor modes. Export uses PDF.js document serialization and the viewport bridge supplies those bytes to Dropbox Sync, where the existing file revision is used to guard against conflicting edits.

PDF.js is an annotation/form editor, not a full page-layout editor for rewriting arbitrary existing PDF body text. It does not by itself promise OCR, redaction, page rearranging/merging, or cryptographically verifiable digital signatures. PDF editing features may vary by document format and browser. Review [Third-Party Notices](THIRD_PARTY_NOTICES.md) for the upstream licence and delivery details.

## Run locally

Python 3 can serve the static website for local preview. From the repository root, run:

    python3 -m http.server 8000 --directory site

Then open [http://localhost:8000/](http://localhost:8000/).

## Project files

- site/index.html — main Lux Omni interface and script registration.
- site/app.js — interface interactions, themes, Focus Mode, and viewport behavior.
- site/styles.css — main interface styling.
- site/pdf-editor.css — Lux Omni PDF annotation toolbar and viewport styles.
- site/pdf-engine.js — pinned Mozilla PDF.js integration, viewer controls, annotation tools, and PDF export.
- site/dropbox-config.js — public Dropbox app configuration and OAuth scopes.
- site/dropbox-api.js — PKCE authorization, token storage, and Dropbox API calls.
- site/dropbox-ui.js — Dropbox file-manager UI, upload actions, viewport routing, and Sync.
- site/dropbox-viewport-bridge.js — document rendering, editor lifecycle, and edited-Blob export integration.
- site/clipboard.html — standalone Lux Omni Clipboard page.
- site/privacy.html — privacy policy for the current website.
- tests/pdf-editor-contract.test.mjs — static regression tests for the PDF.js integration contract.
- PROJECT-GOALS.md — product requirements and development decisions.

## Project documentation

- [Copyright notice](COPYRIGHT.md)
- [License and rights notice](LICENSE)
- [Third-party notices](THIRD_PARTY_NOTICES.md)
- [Privacy policy](site/privacy.html)
- [Project goals](PROJECT-GOALS.md)

## Ownership and third-party materials

Original first-party Lux Omni software and project materials are attributed to **Luxraj Kayal (Subrata Kayal)** and are subject to the terms in [LICENSE](LICENSE). Third-party components are not claimed as first-party work and remain subject to their respective owners' licences and notices; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Access to this repository and use of GitHub features are subject to GitHub's terms. Those platform permissions do not grant a general licence to reuse first-party material outside applicable permissions.

## Contact and project issues

For a project issue, use the [GitHub Issues page](https://github.com/LuxrajKayal/Luxy/issues). Do not post private documents, access tokens, or other sensitive information in GitHub issues.
