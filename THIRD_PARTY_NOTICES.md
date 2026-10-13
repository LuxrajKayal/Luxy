# Third-Party Notices

Lux Omni uses the following third-party software in the browser-based PDF workspace. First-party Lux Omni code remains governed by the repository's LICENSE file; the notices and licences below apply to their respective upstream components.

## Mozilla PDF.js — version 6.4.299

- **Project:** Mozilla PDF.js, the JavaScript PDF parsing, rendering, text-layer, annotation, and form-editing engine.
- **Upstream source:** https://github.com/mozilla/pdf.js
- **Pinned distribution:** https://www.npmjs.com/package/pdfjs-dist/v/6.4.299
- **Licence:** Apache License 2.0.
- **Licence text:** https://www.apache.org/licenses/LICENSE-2.0
- **Files used:** the PDF.js core module, worker module, viewer components, viewer stylesheet, and supporting character maps, standard fonts, ICC profiles, and WebAssembly assets as requested by the engine.
- **Delivery:** browser assets are loaded on demand from the version-pinned https://cdn.jsdelivr.net/npm/pdfjs-dist@6.4.299/ distribution when a PDF is opened. They are not copied into this repository. A network connection to the CDN is therefore required to use the PDF workspace, and CDN availability may affect that feature.
- **Attribution:** Copyright © Mozilla Foundation and contributors. PDF.js is distributed under Apache-2.0. Preserve the upstream licence and applicable notices when redistributing the library or its supporting assets.

Lux Omni does not claim PDF.js as first-party code. Mozilla and PDF.js names identify the upstream project and are not claims of Lux Omni ownership. Any other third-party resources distributed as part of the PDF.js package remain governed by their applicable licence and notice terms.
