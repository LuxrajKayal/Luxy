# Lux Omni

Lux Omni is a browser-based workspace created by **Luxraj Kayal (Subrata Kayal)**.

## Current features

- **Dropbox connection:** connect to Dropbox through the browser, browse supported files, and open a selected file.
- **Workspace viewports:** open a full-screen viewport or a resizable split-screen layout; minimize, restore, or close viewports.
- **YouTube playback:** load a YouTube video into a workspace viewport.
- **Display controls:** switch between light and dark themes and enable Focus Mode.
- **Lux Omni Clipboard:** type or paste plain text, copy it, clear it, or download it as a `.txt` file.

## Current application status

The current build includes the interface and Dropbox integration. The PDF workspace still uses a browser preview placeholder; a complete PDF editing, annotation, and export engine is not connected. Features should be understood from the current implementation rather than assumed from the product name.

## Run locally

Python 3 can serve the static website for local preview. From the repository root, run:

```sh
python3 -m http.server 8000 --directory site
```

Then open [http://localhost:8000/](http://localhost:8000/).

Dropbox authentication requires the redirect URI used by the local address to be allowed in the Dropbox app configuration. The integration uses a browser-based OAuth flow and requires a supported browser environment.

## Project files

- `site/index.html` — main Lux Omni interface.
- `site/app.js` — interface interactions, themes, Focus Mode, and viewport behavior.
- `site/styles.css` — main interface styling.
- `site/dropbox-integration.js` — Dropbox connection and file selection logic.
- `site/clipboard.html` — standalone Lux Omni Clipboard page.
- `site/privacy.html` — privacy policy for the current website.
- `PROJECT-GOALS.md` — product requirements and development decisions.

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
