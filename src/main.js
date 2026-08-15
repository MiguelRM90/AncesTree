/**
 * Entry point: checks requirements, registers the service worker and mounts
 * the application.
 */

import './ui/styles/tokens.css';
import './ui/components/app-root.js';
import { isSupported, missingCapabilities, isFileProtocol } from './storage/capabilities.js';

const appRoot = document.querySelector('app-root');

// The app REQUIRES File System Access. Without it we do not start: a family
// archive app that sometimes loses the data is worse than one that refuses to
// open.
if (isFileProtocol() || !isSupported()) {
  appRoot.unsupported = {
    missing: missingCapabilities(),
    fileProtocol: isFileProtocol(),
  };
} else {
  registerServiceWorker();
}

function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .catch((error) => console.warn('Service worker registration failed', error));
}
