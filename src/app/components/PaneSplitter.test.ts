import { describe, expect, it } from 'vitest';
import { clampEditorHeight } from './PaneSplitter';
import { MIN_EDITOR_HEIGHT, MIN_RESPONSE_HEIGHT } from '../../lib/types';

const AVAILABLE = 600;

describe('clampEditorHeight', () => {
  it('leaves a comfortable height alone', () => {
    expect(clampEditorHeight(300, AVAILABLE)).toBe(300);
  });

  it('never lets the editor collapse below its minimum', () => {
    expect(clampEditorHeight(0, AVAILABLE)).toBe(MIN_EDITOR_HEIGHT);
    expect(clampEditorHeight(-200, AVAILABLE)).toBe(MIN_EDITOR_HEIGHT);
  });

  it('always leaves room for the response', () => {
    expect(clampEditorHeight(AVAILABLE, AVAILABLE)).toBe(AVAILABLE - MIN_RESPONSE_HEIGHT);
  });

  it('keeps the editor usable when the window is too short for both minimums', () => {
    // Rather than returning a negative height and collapsing the pane.
    expect(clampEditorHeight(300, 100)).toBe(MIN_EDITOR_HEIGHT);
  });

  it('is idempotent', () => {
    const once = clampEditorHeight(9999, AVAILABLE);
    expect(clampEditorHeight(once, AVAILABLE)).toBe(once);
  });
});
