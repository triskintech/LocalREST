<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/lockup-dark.png">
    <img src="brand/lockup-light.png" alt="LocalREST" width="466">
  </picture>
</h1>

An API client that runs entirely in your browser. Build a request, send it, read the response,
keep your requests in collections — no account, no cloud sync, no 200MB desktop app.

> **Not on the Chrome Web Store yet.** This line becomes the install link once the listing is live.

Once installed, click the LocalREST icon in your toolbar. There is nothing to sign up for and
nothing to configure.

## Why this one

- **No account.** Open it and start working. There is no sign-in, no team, no workspace to create.
- **Nothing leaves your browser.** Your requests, collections and history are stored on this
  machine. The only network requests LocalREST makes are the ones you press Send on.
- **No analytics.** Not anonymised, not aggregated, none.
- **It starts instantly.** It is a browser tab, not an Electron app.
- **It asks for nothing on install.** No "read your data on all websites" warning to accept — see
  [Site access](#site-access).

## What you can do

- **Work in tabs.** Several requests open at once, reorderable by dragging, closable by
  middle-click. A dot marks a tab you haven't saved yet. Open tabs survive a browser restart.
- **Build a request.** Method, URL, query params, headers, and a body as JSON, text, form-data or
  urlencoded. Auth as bearer token, basic, or an API key in a header or the query string.
  Query strings stay in step with the Params rows in both directions.
- **Paste a curl command.** Including what Chrome DevTools → Network → *Copy as cURL* puts on your
  clipboard. **Copy as curl** goes the other way, so you can hand a request to a teammate or a
  terminal.
- **Bring your Postman collections.** Import and export v2.1 and v2.0. Collection variables come
  across as an environment.
- **Read the response properly.** Line numbers, and objects and arrays fold down to
  `6 keys present` / `17 elements present`. **⌘F / Ctrl+F** searches the body — every match is
  tinted, Enter and Shift+Enter step through them, and a hit inside a folded section opens it.
  **Save response** writes the body to a file. Drag the divider to give the response more room.
- **Use environments.** `{{variables}}` are substituted into the URL, params, headers, body and
  auth when you send. Your saved request keeps the `{{variable}}`, not the value it had that day —
  so switching from staging to production is one dropdown.
- **Replay from history.** The last 50 requests, one click to reopen.
- **Light and dark.** *System / Light / Dark* in the top bar. System follows your OS and switches
  live when it does.

## Site access

LocalREST installs with **no access to any website**, so the first time you open it, it asks.

**Click "Allow all sites."** Chrome confirms once, and sending never prompts again.

The other option, *Ask me per site*, is narrower: Chrome then asks the first time you send to each
new host. Either way you can change it later under **Settings ⚙ → Site access**.

## Where your data lives

In your browser profile, on this machine. It is never transmitted anywhere.

The tradeoff is worth knowing: **uninstalling the extension, or clearing the browser profile,
deletes everything.** *Import ▾ → Backup & data…* exports your whole workspace as a single JSON
file and restores it again — on this machine or a different one. That file is the only copy that
survives an uninstall, so take one before you reinstall or switch laptops.

## Privacy

Nothing you create leaves this browser. The full statement — what is stored, and the one security
caveat worth knowing about saved credentials — is in [PRIVACY.md](PRIVACY.md).

## Licence

The source is public so you can read it. It is not licensed for reuse or
redistribution — see [LICENSE](LICENSE).
