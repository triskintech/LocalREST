# Changelog

Notable changes to LocalREST. Versions follow the
[Chrome Web Store's grammar](https://developer.chrome.com/docs/extensions/reference/manifest/version)
— one to four dot-separated integers — which is close to, but not, semver: a
suffix like `1.0.0-beta` is rejected at upload, so none is used here.

The published version is whatever `manifest.json` says; `package.json` is kept
in step and a test fails the build if the two ever drift.

## 1.0.0 — unreleased

The first public release. Awaiting Chrome Web Store review; this entry gets its
date when the listing goes live.

### Requests

- Method, URL, query params, headers, and a body as JSON, text, form-data or
  url-encoded. The params table and the URL stay in step in both directions:
  a query typed into the URL becomes editable rows, and a row edited in the
  table rewrites the URL.
- Bearer, Basic and API-key auth, the last of which can travel in a header or
  the query string.
- Several requests open at once as tabs, reorderable by dragging.
- Paste a curl command anywhere in the URL bar and it becomes a request —
  including what Chrome DevTools → Network → *Copy as cURL* produces.
- Copy any request back out as curl, with environment values either filled in
  or left as `{{variables}}`.

### Responses

- Status, time and size, with the body pretty-printed: line numbers, syntax
  colouring, and objects and arrays that fold down to a one-line summary.
- Find within a response, with match stepping.
- Response headers in full, and the body saveable to a file named after the
  request path.
- A reply with no body says so rather than showing an empty pane.

### Organising

- Collections and folders, with requests saved into them.
- Environments: `{{variables}}` substituted into the URL, params, headers, body
  and auth, with the unset ones marked in the URL bar and their values on hover.
- History of the last 50 requests, one click to reopen.
- Import and export Postman collections, v2.0 and v2.1.
- Back up and restore the entire workspace as a single JSON file.

### Privacy and permissions

- No account, no server, no analytics, no sync.
- Installs asking for nothing. Host access is optional and requested per host at
  the moment you first send to it, so the install carries no "read your data on
  all websites" warning.
- Everything is stored in this browser's extension storage and never sent
  anywhere. Uninstalling or clearing the profile deletes it; a backup file is
  the only copy that survives.

### Appearance

- Light and dark, following the OS by default and switching live with it.
- Resizable sidebar and request/response split, both remembered.
- Keyboard throughout: dialogs trap focus and close on Escape, menus move on the
  arrow keys, and every control has an accessible name. Text meets WCAG AA
  contrast in both themes, measured against the surface each piece of text is
  actually painted on.
