# Google Drive integration setup for Lux PDF Viewer

This project uses Google Identity Services (GIS) for OAuth tokens, Google Picker for the in-app PDF picker, and the Google Drive REST API v3 for downloading and updating PDF bytes. The Google Drive connect/profile/sync controls live in the left sidebar; the topbar is kept for viewer-wide controls.

## 1. Create/configure the Google Cloud project

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and select the project you will use for Lux PDF Viewer.
2. In **APIs & Services → Library**, enable both **Google Drive API** and **Google Picker API**.
3. Configure **Google Auth Platform** (the OAuth consent screen): set the app name, support email, audience, and contact email. While testing an External app in Testing mode, add your Google account under test users.
4. Add these OAuth scopes to the consent configuration:
   - `openid`
   - `email`
   - `profile`
   - `https://www.googleapis.com/auth/drive.file`
5. Under **APIs & Services → Credentials**, create an **OAuth client ID** of type **Web application**. Add the following authorized JavaScript origins (origins only—no path):
   - `https://luxrajkayal.github.io`
   - Your local development origin, for example `http://localhost:8000`
6. Create an API key for Google Picker. Restrict its website referrers to your real app domain (and local development origin if needed), and restrict API usage to **Google Picker API**. Treat this as a public browser key and restrict it; never put a client secret in front-end code.
7. Copy the **Google Cloud project number** from the project dashboard. Google Picker uses this as its App ID.

## 2. Add your project values

Open `site/drive-integration.js` and replace these two values once in the `DRIVE_CONFIG` object:

- `clientId`: the OAuth 2.0 Web application client ID.
- `apiKey`: the restricted Google Picker API key.

The module derives the Picker App ID (Cloud project number) from the numeric prefix in a standard Google Web OAuth client ID, so it does not ask you to paste that value separately. Check that the prefix matches the project number shown in Google Cloud Console. If your client ID is nonstandard and does not begin with the project number followed by a hyphen, update `getGoogleCloudProjectNumber()` in the same module to return your project number.

The current published app is hosted at `https://luxrajkayal.github.io/Luxy/`. If you deploy elsewhere, add that origin to the OAuth client and the API-key HTTP referrer restrictions.

## 3. What this integration does

- The first Google Drive button click starts the GIS token flow. Google owns the authorization popup and closes it after the OAuth response.
- Once connected, the UI shows a Drive-connected state and the profile avatar. Clicking the avatar opens the Google Picker modal embedded in the app, filtered to PDFs.
- Selecting a PDF fetches its metadata and byte content through Drive API v3. The module calls `loadPdfIntoViewer(pdfBlob, fileName, fileId)`, which currently dispatches a `lux:drive-pdf-loaded` event as a renderer integration point.
- The Sync button appears only while a Drive-selected PDF is active. The current mock export clones the selected file's original bytes. Replace `createMockEditedPdfBlob()` with the actual PDF renderer's edited/exported bytes before relying on annotation sync.
- The Drive update uses `PATCH https://www.googleapis.com/upload/drive/v3/files/{fileId}?uploadType=media` with an `application/pdf` body.

## 4. Token and session security

The GIS browser token model issues short-lived access tokens. This module keeps the access token in JavaScript memory and does **not** write it to localStorage. It stores only the user's basic profile as a UI/session hint so the connected UI can be restored after refresh; when Drive is used again, GIS must provide a fresh usable access token. If consent has expired or been revoked, Google may ask the user to authorize again.

Do not store access tokens, OAuth client secrets, or refresh tokens in localStorage. A front-end-only app cannot securely hold a client secret. If the product later needs unattended background syncing or long-lived server sessions, implement a backend authorization-code flow and store refresh tokens server-side.

## 5. Important implementation note

The PDF renderer is not connected to Drive yet. Listen for the `lux:drive-pdf-loaded` event and load its `detail.pdfBlob` into the renderer. Once edited PDF bytes are available, replace the mock export function before enabling production overwrite behavior.
