# Privacy Policy

**Effective 30 August 2026.** Applies to the LocalREST Chrome extension.

## The short version

LocalREST has no server, no account system, and no analytics. Nothing you
create in it is transmitted anywhere. The only network requests the extension
makes are the HTTP requests you explicitly build and send, to the hosts you
type in yourself.

There is no data for us to collect, because there is nowhere for it to go.

## What is stored, and where

Everything lives in your browser's own extension storage
(`chrome.storage.local`), scoped to your Chrome profile on your machine:

- Requests you build — method, URL, query parameters, headers, body
- Authentication values you enter — bearer tokens, basic-auth credentials,
  API keys
- Collections and request names
- Request history — the most recent 50 requests, including their URLs
- Environments and their variables
- Interface preferences — theme, pane sizes, open tabs

Two small values are additionally mirrored in `localStorage`
(`localrest:theme`, `localrest:onboarding`) so the correct theme can be
applied before the first paint and the first-run prompt is not repeated.

**None of this is sent to us or to anyone else.** We cannot read it. There is
no account to attach it to and no server to receive it.

## What leaves your browser

Only the requests you send. When you press Send, the extension makes exactly
the HTTP request you built, to the host you specified.

That request goes to a third-party server you chose. Whatever you put in it —
headers, authentication values, body — is visible to that server, exactly as
it would be from `curl` or any other HTTP client. What that server does with
it is governed by its operator's policies, not this one.

The extension adds nothing to your requests, and sends no request of its own
alongside them.

## Permissions, and why each exists

- **`storage` / `unlimitedStorage`** — to keep your collections and history in
  the browser. This is what makes the tool work offline and without an
  account.
- **Host access** — requested per site, at the moment you first send a request
  to it, and never at install time. The extension ships holding no host access
  at all. You can review or revoke every site under
  *chrome://extensions → LocalREST → Site access*, and you can grant access to
  all sites in one step from *Settings ⚙ → Site access* if being asked per
  host becomes tedious.

Chrome enforces this, not us — which means you can verify the claim rather
than take our word for it.

## Security you should be aware of

Chrome's extension storage is **not encrypted at rest**. Any authentication
value you save in a request or an environment is stored in your browser
profile in readable form, like most local developer tools. Anyone with access
to your computer's user account, or to a backup of it, can read it.

Treat saved credentials the way you would treat a `.env` file on the same
machine. For anything highly sensitive, prefer an environment variable you
clear when finished over a value saved permanently in a collection.

## Your data is yours

- **Export** — *Import ▾ → Backup & data…* writes your entire workspace to a
  JSON file you control.
- **Delete** — remove individual requests, collections or history in the app,
  or uninstall the extension to erase everything at once.

**Uninstalling deletes all of it, permanently.** There is no copy anywhere
else, so export a backup first if you want to keep it.

## On uninstall

The current version sends nothing when you uninstall.

A one-question "why did you leave?" page may be added in a future release. If
it is, it will carry only the version number you were using, it will be
disclosed in the app with a switch to turn it off, and this policy will be
updated to say so before it ships.

## Children

LocalREST is a developer tool and is not directed at children under 13. We do
not knowingly collect information from anyone, of any age.

## Changes

Material changes will be reflected here with a new effective date, and in the
extension's changelog. Because the source is public, every change is
visible in the commit history.

## Contact

Questions about this policy: triskintech@gmail.com

Or open an issue: https://github.com/triskintech/LocalREST/issues
