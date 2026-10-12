# Lux All-in-One Learning Tool

**Lux Learning Tool** is an interface-first learning workspace concept that brings source material and note-taking into a resizable dual-pane interface. The left pane is designed for reading or viewing a PDF, image, or YouTube video; the right pane provides a plain Markdown notes text area.

**Live site:** https://luxrajkayal.github.io/Luxy/  
**Publisher:** LuxRaj Kayal

## Vision

Lux All-in-One Learning Tool is planned to combine:

- PDF reader and PDF annotation workspace.
- YouTube video embedding, closed-caption (CC) extraction, and video screenshots.
- A Markdown editor for study notes.
- Copying PDF text and video screenshots into notes.
- A resizable media-and-notes workspace.
- Dropbox workflows for opening source files and, in a later stage, syncing Markdown notes and annotated PDFs.

## Current status

This repository is in the interface-first phase. The dual-pane layout, source-tool placeholders, Markdown text area, and pane-resize control are part of the UI shell. The notes text area accepts typing.

The following are not connected yet: YouTube embedding, caption extraction, screenshot capture, PDF annotation, PDF text extraction, rich Markdown formatting, screenshot/text insertion, and Markdown-note syncing to Dropbox. Placeholder buttons are intentionally disabled.

The current Dropbox integration supports browsing a defined set of file types. The existing Sync workflow is for overwriting an opened PDF at its original Dropbox path only when an edited PDF Blob has been supplied. It does not sync the Markdown notes text area.

## Interface-first principle

No PDF.js renderer, YouTube API, caption/screenshot engine, Markdown parser, or new backend is being introduced in this phase. Engines and integrations will be considered only after the owner approves a later implementation step.

## Search and discoverability

The project is intended for learners searching for a PDF reader, PDF annotation tool, Markdown editor, YouTube-to-notes workflow, YouTube captions, and study-note workspace. The current public site should be described as a prototype rather than as a complete implementation of the planned features.

## Privacy

Read the [Privacy Policy](https://luxrajkayal.github.io/Luxy/privacy.html) for details about the current browser-based Dropbox integration.

## Development rules

See [writing-block.md](writing-block.md) for the project vision, scope boundaries, current-status distinctions, and incremental development rules.
