import { describe, expect, it } from 'vitest';
import { clampSidebarWidth } from './SidebarSplitter';
import { MAX_SIDEBAR_WIDTH, MIN_BUILDER_WIDTH, MIN_SIDEBAR_WIDTH } from '../../lib/types';

const AVAILABLE = 1200;

describe('clampSidebarWidth', () => {
  it('leaves a comfortable width alone', () => {
    expect(clampSidebarWidth(300, AVAILABLE)).toBe(300);
  });

  it('never lets the sidebar collapse below its minimum', () => {
    expect(clampSidebarWidth(0, AVAILABLE)).toBe(MIN_SIDEBAR_WIDTH);
    expect(clampSidebarWidth(-200, AVAILABLE)).toBe(MIN_SIDEBAR_WIDTH);
  });

  it('never lets the sidebar grow past its maximum', () => {
    expect(clampSidebarWidth(9999, AVAILABLE)).toBe(MAX_SIDEBAR_WIDTH);
  });

  it('leaves room for the request builder once the window is narrow enough to matter', () => {
    const tight = MAX_SIDEBAR_WIDTH + MIN_BUILDER_WIDTH - 100;
    expect(clampSidebarWidth(tight, tight)).toBe(tight - MIN_BUILDER_WIDTH);
  });

  it('keeps the sidebar usable when the window is too narrow for both minimums', () => {
    // Rather than returning a width that overruns the builder pane.
    expect(clampSidebarWidth(300, 400)).toBe(MIN_SIDEBAR_WIDTH);
  });

  it('is idempotent', () => {
    const once = clampSidebarWidth(9999, AVAILABLE);
    expect(clampSidebarWidth(once, AVAILABLE)).toBe(once);
  });
});
