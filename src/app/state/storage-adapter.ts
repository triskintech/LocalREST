/**
 * The app's one dependency on the extension platform.
 *
 * Behind this interface, `chrome.storage.local` is the real store. In front of
 * it, the app is ordinary React that also runs under `vite dev` on localhost,
 * where it falls back to localStorage — which is what makes the UI drivable and
 * screenshottable outside the extension sandbox, and removes the
 * rebuild-and-reload cycle from every UI change.
 */
export type StorageAdapter = {
  read(key: string): Promise<unknown>;
  write(key: string, value: unknown): Promise<void>;
  /** Fires when another tab writes the same key. Returns an unsubscribe fn. */
  subscribe(key: string, onChange: (value: unknown) => void): () => void;
};

export const isExtensionRuntime = (): boolean =>
  typeof chrome !== 'undefined' && chrome.storage?.local !== undefined;

/** Exported for its own test; use `storage` below in app code. */
export function chromeAdapter(): StorageAdapter {
  /**
   * Payloads this context has written and not yet seen echoed back.
   *
   * `chrome.storage.onChanged` fires in *every* extension context including
   * the one that performed the write — unlike the DOM `storage` event, which
   * skips the originating document. Left unguarded, each save echoes back as
   * an external change, the store swaps in a freshly-migrated object, the save
   * effect sees a new identity and writes again: a permanent write loop at the
   * debounce interval, with every keystroke typed between write and echo
   * discarded. It only reproduces in the packed extension, which is why the
   * dev page never showed it.
   *
   * A queue rather than a single "last written": two writes can be in flight
   * at once — a local edit committing right behind the write-back another
   * window's change provoked — and remembering only the second made the first
   * echo look foreign. The store would then adopt its own older payload and
   * write it back, undoing whatever was typed in between.
   */
  const unechoed: string[] = [];
  /** Enough for any realistic burst; the cap is what stops a slow leak if an
   *  echo never arrives (a write coalesced away, a listener added late). */
  const MAX_UNECHOED = 8;

  return {
    async read(key) {
      const bag = await chrome.storage.local.get(key);
      return bag[key];
    },
    async write(key, value) {
      unechoed.push(JSON.stringify(value));
      if (unechoed.length > MAX_UNECHOED) unechoed.shift();
      await chrome.storage.local.set({ [key]: value });
    },
    subscribe(key, onChange) {
      const listener = (
        changes: Record<string, chrome.storage.StorageChange>,
        area: string,
      ) => {
        if (area !== 'local') return;
        const change = changes[key];
        if (!change) return;
        // Claimed once: a second event carrying the same bytes is somebody
        // else's write, and applying it costs nothing since there is no
        // difference to apply.
        const index = unechoed.indexOf(JSON.stringify(change.newValue));
        if (index !== -1) {
          unechoed.splice(index, 1);
          return;
        }
        onChange(change.newValue);
      };
      chrome.storage.onChanged.addListener(listener);
      return () => chrome.storage.onChanged.removeListener(listener);
    },
  };
}

function localStorageAdapter(): StorageAdapter {
  return {
    async read(key) {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return undefined;
      try {
        return JSON.parse(raw);
      } catch {
        // A corrupt dev store should look like a first run, not a crash.
        return undefined;
      }
    },
    async write(key, value) {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    subscribe(key, onChange) {
      const listener = (event: StorageEvent) => {
        if (event.key !== key) return;
        try {
          onChange(event.newValue === null ? undefined : JSON.parse(event.newValue));
        } catch {
          // Same policy as read(): a corrupt store looks like a first run
          // rather than throwing out of an event listener.
          onChange(undefined);
        }
      };
      window.addEventListener('storage', listener);
      return () => window.removeEventListener('storage', listener);
    },
  };
}

export const storage: StorageAdapter = isExtensionRuntime()
  ? chromeAdapter()
  : localStorageAdapter();
