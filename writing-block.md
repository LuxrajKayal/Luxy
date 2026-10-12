# Writing Block — Lux All-in-One Learning Tool

## Project identity
Product name: Lux All-in-One Learning Tool
Short topbar brand: Lux Learning Tool
Repository: https://github.com/LuxrajKayal/Luxy
Public site: https://luxrajkayal.github.io/Luxy/
Publisher: LuxRaj Kayal

## Core vision
Build an independent, browser-based learning workspace that brings source material and note-taking together. The central interface is a resizable dual-pane workspace: source material on the left and Markdown notes on the right. The tool should help learners study PDFs and YouTube videos, capture useful information, organize it as notes, and eventually sync the resulting notes and annotated files back to Dropbox.

## Intended feature set
1. Open and view PDF documents.
2. Annotate PDFs when a first-party or properly selected annotation implementation is intentionally approved.
3. Open images and display YouTube videos in the source-material pane.
4. Extract and view YouTube closed captions (CC).
5. Capture screenshots from a YouTube video player.
6. Write and organize notes in a Markdown editor in the right pane.
7. Copy selected PDF text and YouTube screenshots directly into the Markdown notes editor.
8. Provide formatting tools for Markdown notes.
9. Sync resulting Markdown notes and annotated PDFs back to the user's Dropbox, with the source/target path and overwrite behavior made explicit.
10. Provide a draggable divider so learners can resize the source and notes panes.

## Current development stage: interface first
This phase builds the user interface and interaction shell only. Do not implement or add backend/media/document engines as part of this phase.

Explicitly out of scope until LuxRaj authorizes a later implementation step:
- PDF.js or another PDF renderer/annotation engine.
- YouTube API integrations, caption extraction engines, or screenshot-capture logic.
- Markdown parser, preview renderer, or rich-text formatting engine.
- A new backend, database, or server-side processing system.
- Claims that any disabled toolbar action already works.

The dual-pane layout, editable text area, toolbars, URL field, and resize divider are interface elements. Buttons for unimplemented functions must remain visibly disabled or clearly identified as placeholders. Do not fake successful operations.

## Existing behavior to preserve
- Preserve the current topbar and its Dropbox account control, status, Dark Mode, Focus Mode, and Sync controls.
- Preserve the compact Dropbox sidebar and its modal, OAuth authorization-code flow with PKCE, account-connect/disconnect confirmation, and current supported-file picker.
- Do not introduce a Google Drive integration.
- Do not remove existing Dropbox authentication scopes or change token-handling behavior as part of an interface task.
- Existing Dropbox PDF Sync is a separate, limited workflow: it requires an edited PDF Blob and overwrites the selected PDF at its original Dropbox path. It is not Markdown-note syncing.
- Any changes to the Dropbox fallback viewer must target the source-material pane rather than replacing the whole dual-pane workspace.

## Interface and design guidance
- Keep the existing Lux icon and the compact topbar/sidebar identity.
- Use the existing light and dark theme tokens and accessible focus styling.
- Make both panes responsive. The divider should support pointer dragging and keyboard resizing on desktop; on narrow screens the panes may stack and the divider orientation should adapt.
- Give source tools clear labels: Embed Video, Take Screenshot, Extract CC, and Copy PDF Text.
- Give notes tools clear labels: Bold, Italic, Heading, Bullet List, Paste Screenshot, and Paste PDF Text.
- Explain that planned features are not connected yet.
- Keep the workspace usable even without a selected Dropbox file: users should still be able to type plain text into the notes textarea.

## SEO and public description
Use the product terms naturally in the page title, description, headings, visible copy, and README: PDF reader, PDF annotation, Markdown editor, YouTube to notes, YouTube captions, screenshot capture, study notes, and Dropbox sync. Describe the current site honestly as an interface-first prototype. Search metadata can improve discoverability signals but does not guarantee search rankings.

## Rules for every future change
1. Inspect the current repository source before editing.
2. Make only the incremental changes the owner asks for.
3. Preserve existing working flows and DOM identifiers unless a change is necessary and explicit.
4. Do not copy code, writing, or design from the owner's other projects or from third-party PDF editors.
5. Never claim a placeholder is implemented functionality.
6. Do not add external engines or dependencies without explicit approval.
7. Validate syntax and relevant source structure after changes.
8. State exactly which files changed and distinguish code checks from real browser testing and live deployment verification.
9. Keep the Dropbox modal and topbar UI intact unless specifically asked to change them.
10. The owner decides feature priority, interface details, dependencies, and implementation timing. Do not independently expand scope.
