import { STORAGE_KEY, migrate } from '../../lib/storage/schema';
import type { AppData } from '../../lib/types';
import { storage } from './storage-adapter';

const SAVE_DEBOUNCE_MS = 300;

export async function loadData(): Promise<AppData> {
  return migrate(await storage.read(STORAGE_KEY));
}

/**
 * Writes are debounced because every keystroke in the URL bar mutates state.
 * The pending payload is replaced rather than queued, so a burst of edits
 * costs exactly one write.
 */
export function createSaver(): {
  save(data: AppData): void;
  flush(): Promise<void>;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: AppData | undefined;
  let inFlight: Promise<void> = Promise.resolve();

  const commit = () => {
    timer = undefined;
    if (!pending) return;
    const payload = pending;
    pending = undefined;
    inFlight = storage.write(STORAGE_KEY, payload);
  };

  return {
    save(data) {
      pending = data;
      if (timer) clearTimeout(timer);
      timer = setTimeout(commit, SAVE_DEBOUNCE_MS);
    },
    async flush() {
      if (timer) {
        clearTimeout(timer);
        commit();
      }
      await inFlight;
    },
  };
}

/** Notifies when another tab writes the store, so open tabs stay in step. */
export function subscribeToExternalWrites(onChange: (data: AppData) => void): () => void {
  return storage.subscribe(STORAGE_KEY, (value) => onChange(migrate(value)));
}
