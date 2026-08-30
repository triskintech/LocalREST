import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import {
  HighlightStyle,
  codeFolding,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, placeholder } from '@codemirror/view';
import { indentationMarkers } from '@replit/codemirror-indentation-markers';
import { tags } from '@lezer/highlight';
import { useEffect, useRef } from 'react';
import { plural } from '../../lib/json/outline';

/**
 * Maps JSON tokens onto the app's own tokens rather than a canned theme —
 * the rest of the app deliberately uses one accent hue plus the neutral
 * ramp (see modernist.css), and a default rainbow highlight style would be
 * the one place that broke that. Because these are CSS custom properties,
 * this needs no separate dark-mode variant: it inverts along with
 * everything else painted with `var(--color-*)`.
 */
const jsonHighlight = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--color-text)', fontWeight: 600 },
  { tag: tags.string, color: 'var(--color-accent-600)' },
  { tag: tags.number, color: 'var(--color-accent-2-600)' },
  { tag: [tags.bool, tags.null], color: 'var(--color-neutral-700)' },
  { tag: [tags.brace, tags.squareBracket, tags.separator], color: 'var(--color-neutral-500)' },
]);

/**
 * Counts the top-level comma-separated items in a folded range's text, and
 * whether it opened with `[` or `{` — everything the placeholder needs to
 * say "N keys present" the way the Response viewer's outline.ts already
 * does for the same shape of data.
 */
export function preparePlaceholder(
  state: EditorState,
  range: { from: number; to: number },
): { count: number; isArray: boolean } {
  const text = state.doc.sliceString(range.from, range.to);
  const isArray = state.doc.sliceString(Math.max(0, range.from - 1), range.from) === '[';

  if (text.trim() === '') return { count: 0, isArray };

  let depth = 0;
  let inString = false;
  let escaped = false;
  let count = 1;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) count++;
  }
  return { count, isArray };
}

/** Same control the Response viewer's folded rows use (CodeBlock.tsx), so a
 * collapsed object or array reads identically in both panes. */
function placeholderDOM(
  _view: EditorView,
  onclick: (event: Event) => void,
  prepared: { count: number; isArray: boolean },
): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'code-summary';
  el.textContent = prepared.isArray
    ? plural(prepared.count, 'element', 'elements')
    : plural(prepared.count, 'key', 'keys');
  el.addEventListener('click', onclick);
  return el;
}

/**
 * Strips CodeMirror's own chrome so the host element's existing `.input
 * mono body-textarea` classes are what actually draw the border, focus
 * ring, and fill behaviour — this should look like the plain textarea it
 * replaces, not like a new control. The gutters (line numbers, fold
 * triangles) get the same muted treatment as the Response viewer's.
 */
const chromeTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '14px', backgroundColor: 'transparent' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', overflow: 'auto' },
  '.cm-content': { padding: 0, caretColor: 'var(--color-accent)' },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'color-mix(in srgb, var(--color-text) 40%, transparent)',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 8px 0 4px' },
  '.cm-foldGutter .cm-gutterElement': { padding: '0 2px', cursor: 'pointer' },
  '.cm-foldGutter .cm-gutterElement:hover': { color: 'var(--color-accent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
});

const foldingExtensions = [
  codeFolding({ placeholderDOM, preparePlaceholder }),
  foldGutter({ openText: '▾', closedText: '▸' }),
];

const indentGuides = indentationMarkers({
  thickness: 1,
  colors: {
    light: 'var(--color-divider)',
    dark: 'var(--color-divider)',
    activeLight: 'var(--color-accent)',
    activeDark: 'var(--color-accent)',
  },
});

export function JsonBodyEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (raw: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Read from a ref inside the update listener so the extension array (and
  // therefore the view) doesn't need to be rebuilt every time onChange
  // itself is a new function identity.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          json(),
          history(),
          indentOnInput(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
          syntaxHighlighting(jsonHighlight),
          ...foldingExtensions,
          lineNumbers(),
          indentGuides,
          chromeTheme,
          placeholder('{ "key": "value" }'),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
      parent: host,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mounted once; external changes to `value` are reconciled below rather
    // than tearing down and rebuilding the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Controlled-component reconciliation: only push `value` into the editor
  // when it changed for a reason other than the user's own typing (e.g.
  // switching tabs/requests), or the cursor would jump on every keystroke.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return <div className="input mono body-textarea" aria-label="Request body" ref={hostRef} />;
}
