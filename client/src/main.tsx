import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import './art.css';

try {
  if (localStorage.getItem('rubezh.reduceMotion') === '1') document.documentElement.classList.add('reduce-motion');
  if (localStorage.getItem('rubezh.largeText') === '1') document.documentElement.classList.add('large-text');
} catch {
  /* хранилище недоступно */
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
