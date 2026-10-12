# Open Source Library Use Disclosure

This folder records the third-party source projects selected for evaluation for Lux PDF Viewer. Their upstream source remains separate from first-party application code.

## Components referenced

| Component | Upstream project | Pinned release | License | Pinned upstream commit |
|---|---|---:|---|---|
| PDF.js | Mozilla and contributors | v6.4.299 | Apache License 2.0 | `d0991a0d53f3bb3a7307e3b83f279c1d117aafb3` |
| pdf-lib | Andrew Dillon and contributors | v1.17.1 | MIT License | `4beebbef7a261ed0be089bb1d63a5b6e28cc488a` |

- PDF.js upstream: https://github.com/mozilla/pdf.js
- PDF.js license: https://github.com/mozilla/pdf.js/blob/v6.4.299/LICENSE
- pdf-lib upstream: https://github.com/Hopding/pdf-lib
- pdf-lib license: https://github.com/Hopding/pdf-lib/blob/v1.17.1/LICENSE.md

## Current status

The projects are referenced as Git submodules under this folder at the release commits listed above. The upstream files are not being modified by this commit. Submodule presence is not evidence that either library has been integrated into the application, built for the browser, or tested in Lux PDF Viewer.

The source repositories retain their own license and notice files. To obtain the complete source checkouts when cloning this repository, initialize the submodules (for example, with `git clone --recurse-submodules`).

## License and ownership boundaries

- The upstream authors and contributors retain the rights and notices applicable to their respective projects.
- The Apache-2.0 and MIT licenses apply to the relevant third-party components. They do not automatically license first-party Lux PDF Viewer code under those licenses.
- A separate license for first-party Lux PDF Viewer code cannot remove permissions granted by the applicable third-party licenses for those components.
- When distributing a product build or source package containing either library or substantial portions of its code, include the applicable license copies and notices with that distribution. These notices can be supplied as a bundled third-party notices/license folder rather than as credits in the application interface, where the license terms permit that placement.
- If a PDF.js file is modified in the future and the modified file is distributed, the Apache-2.0 license requires a prominent notice that the file was changed. Original notices must be preserved. We will keep upstream files unchanged and implement product-specific behavior in separate first-party modules wherever practical.
- Before producing a release, audit the exact bundled files, embedded assets, package manifests, and any transitive dependencies. This list identifies the two selected upstream projects; it is not a claim that their eventual browser bundles have no other licensing obligations.

This disclosure is a project record, not legal advice and not a substitute for the upstream license texts.
