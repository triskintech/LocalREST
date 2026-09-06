import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { Compartment, EditorState, Prec, type Extension, type Range } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  hoverTooltip,
  keymap,
  placeholder as cmPlaceholder,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { findVariables } from '../../lib/variables/tokens';

/**
 * The URL bar, with `{{variables}}` coloured and explained on hover.
 *
 * A plain <input> cannot colour part of its own text, and the usual trick — a
 * styled mirror element behind a transparent input — cannot answer the other
 * half of this: the mirror must be `pointer-events: none` for clicks to reach
 * the field, which leaves nothing to hover. CodeMirror was already carrying
 * the JSON body editor, so styled ranges and hover tooltips come with the
 * caret, selection, undo and IME handling already correct.
 */

const brace = Decoration.mark({ class: 'cm-var-brace' });
const known = Decoration.mark({ class: 'cm-var-name' });
const unknown = Decoration.mark({ class: 'cm-var-name cm-var-unset' });

const isSet = (vars: Record<string, string>, name: string) =>
  Object.prototype.hasOwnProperty.call(vars, name);

function decorate(text: string, vars: Record<string, string>): DecorationSet {
  const marks: Range<Decoration>[] = [];
  for (const token of findVariables(text)) {
    marks.push(brace.range(token.from, token.nameFrom));
    marks.push((isSet(vars, token.name) ? known : unknown).range(token.nameFrom, token.nameTo));
    marks.push(brace.range(token.nameTo, token.to));
  }
  return Decoration.set(marks);
}

function highlighter(vars: Record<string, string>): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = decorate(view.state.doc.toString(), vars);
      }
      update(update: ViewUpdate) {
        if (update.docChanged) this.decorations = decorate(update.state.doc.toString(), vars);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

/**
 * What a variable is worth right now, or why it is worth nothing.
 *
 * The unset case is the one that earns this feature: an undefined name is sent
 * literally as `{{name}}` and the request fails somewhere downstream, so the
 * message names the environment that is missing it rather than saying the
 * value is unknown.
 */
function tooltip(vars: Record<string, string>, environmentName: string | null): Extension {
  return hoverTooltip((view, pos) => {
    const text = view.state.doc.toString();
    const token = findVariables(text).find((each) => pos >= each.from && pos <= each.to);
    if (!token) return null;

    return {
      pos: token.from,
      end: token.to,
      above: true,
      create: () => {
        const dom = document.createElement('div');
        dom.className = 'var-tip';

        const label = document.createElement('span');
        label.className = 'var-tip-name mono';
        label.textContent = token.name;

        const value = document.createElement('span');
        value.className = 'var-tip-value mono';
        if (!isSet(vars, token.name)) {
          value.classList.add('var-tip-unset');
          value.textContent = environmentName
            ? `Not set in ${environmentName}`
            : 'No environment selected';
        } else if (vars[token.name] === '') {
          value.classList.add('var-tip-unset');
          value.textContent = 'Empty';
        } else {
          value.textContent = vars[token.name] as string;
        }

        dom.append(label, value);
        return { dom };
      },
    };
  });
}

export function UrlField({
  value,
  vars,
  environmentName,
  placeholder,
  onChange,
  onBlur,
  onSubmit,
  onPaste,
}: {
  value: string;
  vars: Record<string, string>;
  environmentName: string | null;
  placeholder: string;
  onChange: (url: string) => void;
  onBlur: () => void;
  onSubmit: () => void;
  /** Returns true when it has consumed the text — a pasted curl command. */
  onPaste: (text: string) => boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const varsRoom = useRef(new Compartment());

  // Held in refs so a re-render never has to tear the editor down and rebuild
  // it, which would drop the caret mid-keystroke.
  const handlers = useRef({ onChange, onBlur, onSubmit, onPaste });
  handlers.current = { onChange, onBlur, onSubmit, onPaste };

  useEffect(() => {
    const parent = host.current;
    if (!parent) return;

    const editor = new EditorView({
      parent,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          // Above everything else: Enter sends the request, and returning true
          // is also what stops a newline landing in a single-line field.
          Prec.highest(
            keymap.of([
              {
                key: 'Enter',
                run: () => {
                  handlers.current.onSubmit();
                  return true;
                },
              },
            ]),
          ),
          // A plain <input> gives select-all, word jumps and delete-to-line-start
          // for free; an editor has to be told. Below the Enter binding above,
          // so defaultKeymap's own Enter — insert a newline — never runs.
          keymap.of([...historyKeymap, ...defaultKeymap]),
          cmPlaceholder(placeholder),
          varsRoom.current.of([]),
          EditorView.contentAttributes.of({
            'aria-label': 'URL',
            spellcheck: 'false',
            autocapitalize: 'off',
            autocorrect: 'off',
          }),
          EditorView.domEventHandlers({
            blur: () => {
              handlers.current.onBlur();
              return false;
            },
            paste: (event, target) => {
              const text = event.clipboardData?.getData('text') ?? '';
              if (handlers.current.onPaste(text)) {
                event.preventDefault();
                return true;
              }
              if (!text.includes('\n')) return false;
              // A URL is one line. Collapsing beats rejecting: a wrapped URL
              // copied out of a terminal is a normal thing to paste.
              event.preventDefault();
              target.dispatch(target.state.replaceSelection(text.replace(/\s*\n\s*/g, '').trim()));
              return true;
            },
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) handlers.current.onChange(update.state.doc.toString());
          }),
        ],
      }),
    });

    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
    // Built once. Everything that changes afterwards arrives through the
    // compartment below or the refs above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The environment can change under a request that is already on screen, and
  // the same name flips between coloured and flagged when it does.
  useEffect(() => {
    view.current?.dispatch({
      effects: varsRoom.current.reconfigure([highlighter(vars), tooltip(vars, environmentName)]),
    });
  }, [vars, environmentName]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    const current = editor.state.doc.toString();
    if (current === value) return;
    editor.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return <div className="input mono url-field" ref={host} />;
}
