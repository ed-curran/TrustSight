import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import '@/assets/styles/tailwind.css';
import Popup from './Popup';
import { ThemeProvider } from '@/components/themeProvider';

function init() {
  const rootContainer = document.querySelector('#__root');
  if (!rootContainer) throw new Error("Can't find Popup root element");
  const root = createRoot(rootContainer);
  root.render(
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <Popup />
    </ThemeProvider>,
  );
}

init();
