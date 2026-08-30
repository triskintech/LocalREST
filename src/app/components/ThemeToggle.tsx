import { THEMES, type Theme } from '../../lib/types';
import { useStore } from '../state/store';

const LABELS: Record<Theme, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

/**
 * Three states, not two: "follow the OS" is a real choice and the one most
 * people want, so it gets a segment rather than hiding behind a double-click
 * on a sun icon. Built from the system's own .seg, which the app had not used
 * anywhere else — a bespoke switch here would have been the only control in
 * the bar that belonged to nothing.
 */
export function ThemeToggle() {
  const { state, dispatch } = useStore();
  const theme = state.data.theme;

  return (
    <div className="seg seg-compact seg-fill" role="group" aria-label="Theme">
      {THEMES.map((option) => (
        <label key={option} className="seg-opt">
          <input
            type="radio"
            name="theme"
            value={option}
            checked={theme === option}
            onChange={() => dispatch({ type: 'setTheme', theme: option })}
          />
          {LABELS[option]}
        </label>
      ))}
    </div>
  );
}
