import { beforeEach, describe, expect, it, vi } from 'vitest';
import { chromeAdapter } from './storage-adapter';

type Listener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;

/** Just enough chrome.storage to exercise the echo, including its own echo. */
function fakeChrome() {
  const listeners: Listener[] = [];
  const store: Record<string, unknown> = {};
  return {
    listeners,
    api: {
      storage: {
        local: {
          get: async (key: string) => ({ [key]: store[key] }),
          set: async (bag: Record<string, unknown>) => {
            Object.assign(store, bag);
            // The behaviour under test: chrome fires onChanged in EVERY
            // context, including the one that just wrote.
            for (const [key, newValue] of Object.entries(bag)) {
              for (const listener of [...listeners]) listener({ [key]: { newValue } }, 'local');
            }
          },
        },
        onChanged: {
          addListener: (fn: Listener) => listeners.push(fn),
          removeListener: (fn: Listener) => {
            const i = listeners.indexOf(fn);
            if (i !== -1) listeners.splice(i, 1);
          },
        },
      },
    },
  };
}

describe('chromeAdapter — self-echo', () => {
  let chrome: ReturnType<typeof fakeChrome>;

  beforeEach(() => {
    chrome = fakeChrome();
    vi.stubGlobal('chrome', chrome.api);
  });

  it('ignores the change event caused by its own write', async () => {
    // Left unguarded this is a permanent write loop in the packed extension:
    // save → echo → new object identity → save effect refires → save. Every
    // keystroke typed between the write and the echo is discarded with it.
    const adapter = chromeAdapter();
    const onChange = vi.fn();
    adapter.subscribe('k', onChange);

    await adapter.write('k', { a: 1 });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('still reports a write that came from somewhere else', async () => {
    const adapter = chromeAdapter();
    const onChange = vi.fn();
    adapter.subscribe('k', onChange);
    await adapter.write('k', { a: 1 });

    // Another tab writes something different.
    for (const listener of chrome.listeners) listener({ k: { newValue: { a: 2 } } }, 'local');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ a: 2 });
  });

  it('reports a later external write even after our own echo was skipped', async () => {
    const adapter = chromeAdapter();
    const onChange = vi.fn();
    adapter.subscribe('k', onChange);

    await adapter.write('k', { a: 1 });
    for (const listener of chrome.listeners) listener({ k: { newValue: { a: 9 } } }, 'local');
    await adapter.write('k', { a: 2 });

    expect(onChange.mock.calls).toEqual([[{ a: 9 }]]);
  });

  it('ignores changes to other keys and other areas', async () => {
    const adapter = chromeAdapter();
    const onChange = vi.fn();
    adapter.subscribe('k', onChange);

    for (const listener of chrome.listeners) {
      listener({ other: { newValue: 1 } }, 'local');
      listener({ k: { newValue: 1 } }, 'sync');
    }

    expect(onChange).not.toHaveBeenCalled();
  });

  it('stops listening after unsubscribe', async () => {
    const adapter = chromeAdapter();
    const onChange = vi.fn();
    adapter.subscribe('k', onChange)();

    for (const listener of chrome.listeners) listener({ k: { newValue: { a: 3 } } }, 'local');

    expect(onChange).not.toHaveBeenCalled();
  });
});

// Two writes can be in flight at once — a debounced local save committing just
// behind the write-back that another window's change provoked. Remembering
// only the most recent payload made the first echo look foreign, and the store
// would adopt its own older data and write it back over what was typed.
describe('chromeAdapter — overlapping writes', () => {
  let chrome: ReturnType<typeof fakeChrome>;

  beforeEach(() => {
    chrome = fakeChrome();
    vi.stubGlobal('chrome', chrome.api);
  });

  /** Writes whose echoes arrive only after both have been issued. */
  const deferEchoes = () => {
    const queued: Array<() => void> = [];
    chrome.api.storage.local.set = async (bag: Record<string, unknown>) => {
      queued.push(() => {
        for (const [key, newValue] of Object.entries(bag)) {
          for (const listener of [...chrome.listeners]) listener({ [key]: { newValue } }, 'local');
        }
      });
    };
    return () => {
      for (const fire of queued.splice(0)) fire();
    };
  };

  it('ignores both echoes when two of its own writes overlap', async () => {
    const adapter = chromeAdapter();
    const onChange = vi.fn();
    adapter.subscribe('k', onChange);

    const flushEchoes = deferEchoes();
    await adapter.write('k', { a: 1 });
    await adapter.write('k', { a: 2 });
    flushEchoes();

    expect(onChange).not.toHaveBeenCalled();
  });

  it('still hears the external write that arrives between its own echoes', async () => {
    const adapter = chromeAdapter();
    const onChange = vi.fn();
    adapter.subscribe('k', onChange);

    const flushEchoes = deferEchoes();
    await adapter.write('k', { a: 1 });
    await adapter.write('k', { a: 2 });
    for (const listener of [...chrome.listeners]) {
      listener({ k: { newValue: { fromAnotherWindow: true } } }, 'local');
    }
    flushEchoes();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ fromAnotherWindow: true });
  });

  it('reports a foreign write that happens to repeat what we wrote earlier', async () => {
    const adapter = chromeAdapter();
    const onChange = vi.fn();
    adapter.subscribe('k', onChange);

    await adapter.write('k', { a: 1 });
    // Our echo has been claimed, so the same bytes arriving again are somebody
    // else's save and must not be swallowed.
    for (const listener of [...chrome.listeners]) {
      listener({ k: { newValue: { a: 1 } } }, 'local');
    }

    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
