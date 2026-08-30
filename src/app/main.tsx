// Latin subset only. The full imports also pull latin-ext and vietnamese —
// twelve extra font files this UI never renders.
import '@fontsource/archivo/latin-400.css';
import '@fontsource/archivo/latin-600.css';
import '@fontsource/archivo/latin-800.css';
// Italic 800 is loaded for exactly one string: the `Local` of the wordmark.
// Without it the browser synthesises a slant, which shears the real italic's
// single-storey `a` back into a two-storey roman one — the wrong letterform,
// not just a lighter one.
import '@fontsource/archivo/latin-800-italic.css';
import '../styles/modernist.css';
import '../styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root — app.html did not load as expected.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
