import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { RequestBuilder } from './components/RequestBuilder';
import { Sidebar } from './components/Sidebar';
import { SidebarSplitter, clampSidebarWidth } from './components/SidebarSplitter';
import { TopBar } from './components/TopBar';
import { FirstRunPanel } from './components/FirstRunPanel';
import { BackupDialog } from './components/dialogs/BackupDialog';
import { CurlSnippetDialog } from './components/dialogs/CurlSnippetDialog';
import { EnvironmentsDialog } from './components/dialogs/EnvironmentsDialog';
import { ImportCollectionDialog } from './components/dialogs/ImportCollectionDialog';
import { ImportCurlDialog } from './components/dialogs/ImportCurlDialog';
import { RenameDialog } from './components/dialogs/RenameDialog';
import { SaveRequestDialog } from './components/dialogs/SaveRequestDialog';
import { useSender } from './net/useSender';
import { StoreProvider, useStore } from './state/store';
import { applyTheme, watchSystemTheme } from './theme';

const TOAST_MS = 2600;

/**
 * Keeps <html data-theme> in step with the stored preference.
 *
 * Held back until the store is ready: before that `state.data` is the empty
 * default, and applying its 'system' would overrule whatever theme-boot.js
 * already stamped — turning a correct first paint into a visible flip.
 */
function useAppliedTheme() {
  const { state } = useStore();
  const { ready, data } = state;

  useEffect(() => {
    if (ready) applyTheme(data.theme);
  }, [ready, data.theme]);

  useEffect(() => {
    if (!ready || data.theme !== 'system') return;
    return watchSystemTheme(() => applyTheme('system'));
  }, [ready, data.theme]);
}

function Toast() {
  const { state, dispatch } = useStore();

  useEffect(() => {
    if (!state.toast) return;
    const timer = setTimeout(() => dispatch({ type: 'toast', message: null }), TOAST_MS);
    return () => clearTimeout(timer);
  }, [state.toast, dispatch]);

  if (!state.toast) return null;
  return (
    <div className="toast" role="status">
      {state.toast}
    </div>
  );
}

function Dialogs() {
  const { state } = useStore();
  switch (state.dialog?.kind) {
    case 'import-curl':
      return <ImportCurlDialog />;
    case 'import-collection':
      return <ImportCollectionDialog />;
    case 'save-request':
      return <SaveRequestDialog />;
    case 'environments':
      return <EnvironmentsDialog />;
    case 'backup':
      return <BackupDialog />;
    case 'rename':
      return <RenameDialog dialog={state.dialog} />;
    case 'curl-snippet':
      return <CurlSnippetDialog />;
    default:
      return null;
  }
}

function Shell() {
  const { state, dispatch } = useStore();
  // Files picked for form-data fields live only for this session; only the
  // filename is ever persisted.
  const files = useRef(new Map<string, File>()).current;
  const sender = useSender(files);
  useAppliedTheme();

  const mainRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const sidebarWidth = state.data.sidebarWidth;

  // Same reasoning as RequestBuilder's editor-height measurement: a width
  // saved on a wider window is clamped against the one it is being restored
  // into, and the splitter needs a live number to nudge from even while the
  // sidebar sits on its default (unset) width.
  const [layout, setLayout] = useState({ available: 0, sidebar: 0 });

  useLayoutEffect(() => {
    const main = mainRef.current;
    const sidebar = sidebarRef.current;
    if (!main || !sidebar) return;
    const measure = () => {
      const available = main.getBoundingClientRect().width;
      const width = sidebar.getBoundingClientRect().width;
      setLayout((current) =>
        current.available === available && current.sidebar === width
          ? current
          : { available, sidebar: width },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    observer.observe(sidebar);
    return () => observer.disconnect();
    // state.ready is a dependency, not just a read: this effect's first run is
    // always the loading branch, before mainRef/sidebarRef are attached to
    // anything (loadData() resolves through a promise, so ready is guaranteed
    // false on the first commit). Without re-running once ready flips true,
    // the observer is never attached and layout stays {0, 0} forever.
  }, [state.ready]);

  const appliedSidebarWidth =
    sidebarWidth === null
      ? null
      : layout.available > 0
        ? clampSidebarWidth(sidebarWidth, layout.available)
        : sidebarWidth;
  const measuredSidebarWidth = appliedSidebarWidth ?? layout.sidebar;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        if (!sender.sending) sender.send();
      }
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        dispatch({ type: 'openDialog', dialog: { kind: 'save-request' } });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sender, dispatch]);

  if (!state.ready) {
    return (
      <div className="app-shell">
        <div className="state-center">
          <p className="state-detail text-muted mono">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <TopBar />
      <div className="app-main" ref={mainRef}>
        <Sidebar sidebarRef={sidebarRef} width={appliedSidebarWidth} />
        <SidebarSplitter mainRef={mainRef} currentWidth={measuredSidebarWidth} />
        <RequestBuilder
          response={sender.response}
          sending={sender.sending}
          files={files}
          onSend={sender.send}
          onCancel={sender.cancel}
        />
      </div>
      <Dialogs />
      <FirstRunPanel />
      <Toast />
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
