import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import 'katex/dist/katex.min.css';
import './styles.css';
import './workbench.css';
import '@fontsource-variable/noto-sans-kr';
import { loadExamFonts } from './localFonts';
void loadExamFonts().then(() =>
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  ),
);

import './library.css';
import './glass.css';
