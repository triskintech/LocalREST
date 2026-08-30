// The service worker does one thing: open the app, or focus it if it is
// already open. Everything else — including the outgoing fetch — happens on
// the app page, which is where the per-origin host permission is asked for
// and held, and so bypasses CORS without a message-passing round trip.

import { FEEDBACK_BASE_URL, uninstallUrl } from '../lib/feedback/uninstallUrl';
import { STORAGE_KEY } from '../lib/storage/schema';

const APP_PATH = 'app.html';
const TAB_KEY = 'appTabId';

async function focusExistingTab(tabId: number): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.tabs.update(tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
    return true;
  } catch {
    // The tab was closed since we recorded it.
    return false;
  }
}

async function openApp(): Promise<void> {
  const stored = await chrome.storage.session.get(TAB_KEY);
  const tabId = stored[TAB_KEY];

  if (typeof tabId === 'number' && (await focusExistingTab(tabId))) return;

  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL(APP_PATH) });
  await chrome.storage.session.set({ [TAB_KEY]: tab.id });
}

chrome.action.onClicked.addListener(() => {
  void openApp();
});

// A fresh install opens the app once, unasked. This is the only place the
// first-run site-access choice can be offered from: chrome.permissions.request()
// is honoured only inside a user gesture on a real page, so the service worker
// can open the page but never raise the prompt itself.
//
// Install only. An update re-runs this listener, and a window appearing out of
// nowhere because Chrome refreshed the extension is not something anyone asked
// for.
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') return;
  void openApp();
});

/**
 * Register (or clear) the page Chrome opens when someone uninstalls.
 *
 * Chrome remembers the registration itself, so this does not need the worker
 * to be alive at uninstall time — it only has to run whenever the answer
 * could have changed: on install, on browser start, and when the setting is
 * switched.
 *
 * Nothing is registered at all until FEEDBACK_BASE_URL points somewhere,
 * which is what keeps this dormant rather than half-built while the feedback
 * page does not exist yet.
 */
async function syncUninstallUrl(): Promise<void> {
  if (!chrome.runtime.setUninstallURL) return;

  const url = uninstallUrl(FEEDBACK_BASE_URL, chrome.runtime.getManifest().version);
  if (url === null) return;

  try {
    const bag = await chrome.storage.local.get(STORAGE_KEY);
    const data = bag[STORAGE_KEY] as { uninstallFeedback?: unknown } | undefined;
    // Absent means a store written before the setting existed, which takes the
    // shipped default; only an explicit false is someone opting out.
    const enabled = data?.uninstallFeedback !== false;
    await chrome.runtime.setUninstallURL(enabled ? url : '');
  } catch {
    // A worker that cannot read storage should leave whatever is registered
    // alone rather than guess, and certainly not throw on startup.
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void syncUninstallUrl();
});

chrome.runtime.onStartup.addListener(() => {
  void syncUninstallUrl();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[STORAGE_KEY]) return;
  void syncUninstallUrl();
});
