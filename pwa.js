/* pwa.js — "Install" button and offline support (service worker). Nothing here needs the internet. */
let installEvt = null;
async function installApp() {
  if (installEvt) { installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; return; }
  alert('To install: open this page in Chrome, tap the menu (\u22EE), then choose "Install app" or "Add to Home screen".');
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; const b = document.getElementById('installApp'); if (b) b.style.display = 'block'; });
window.addEventListener('appinstalled', () => { installEvt = null; const b = document.getElementById('installApp'); if (b) b.style.display = 'none'; });
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    const had = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Offline support could not be enabled:', err));
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && typeof toast === 'function') toast('App updated — close and reopen it to use the new version'); });
  });
}
