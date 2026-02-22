/**
 * browser_mod.js — Lightweight Browser Mod shim for FFT Demo Dash
 *
 * Provides navigation and toast notification services consumable from HA
 * automations via ha_call_service from FFT_nano IPC.
 *
 * Supported services (called via HA REST API):
 *   browser_mod.navigate   { path: "/lovelace-cannabis/nexus" }
 *   browser_mod.toast      { message: "...", duration: 4000 }
 *   browser_mod.popup      { title: "...", content: "..." }
 *
 * Implementation: polls input_text.browser_mod_command every 2s and acts.
 */

(function () {
  'use strict';

  const POLL_INTERVAL_MS = 2000;
  const COMMAND_ENTITY = 'input_text.browser_mod_command';

  let lastCommand = '';

  async function fetchHA(path) {
    const res = await fetch(`/api/states/${path}`, {
      headers: { Authorization: `Bearer ${window.__HA_TOKEN || ''}` },
    });
    if (!res.ok) return null;
    return res.json();
  }

  function navigate(path) {
    if (!path) return;
    history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    // HA Lovelace navigation
    const evt = new CustomEvent('location-changed', { bubbles: true, composed: true });
    document.querySelector('home-assistant')?.dispatchEvent(evt);
  }

  function toast(message, duration = 4000) {
    // Use HA's built-in notification snackbar if available
    const ha = document.querySelector('home-assistant');
    if (ha?.shadowRoot) {
      const notification = ha.shadowRoot.querySelector('ha-notification-drawer');
      if (notification) {
        const ev = new CustomEvent('hass-notification', {
          detail: { message },
          bubbles: true,
          composed: true,
        });
        ha.dispatchEvent(ev);
        return;
      }
    }
    // Fallback: simple banner
    const div = document.createElement('div');
    div.textContent = message;
    Object.assign(div.style, {
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(8,24,48,0.96)', color: '#2eeec0', padding: '12px 24px',
      borderRadius: '8px', border: '1px solid rgba(46,238,192,0.4)',
      fontFamily: 'monospace', fontSize: '14px', zIndex: '99999',
      transition: 'opacity 0.4s',
    });
    document.body.appendChild(div);
    setTimeout(() => {
      div.style.opacity = '0';
      setTimeout(() => div.remove(), 400);
    }, duration);
  }

  async function processCommand(state) {
    if (!state || state === lastCommand || state === '' || state === '{}') return;
    lastCommand = state;
    let cmd;
    try { cmd = JSON.parse(state); } catch { return; }

    if (cmd.service === 'navigate' && cmd.path) {
      navigate(cmd.path);
    } else if (cmd.service === 'toast' && cmd.message) {
      toast(cmd.message, cmd.duration ?? 4000);
    }
  }

  async function poll() {
    try {
      const entity = await fetchHA(COMMAND_ENTITY);
      if (entity?.state) await processCommand(entity.state);
    } catch {
      // silent — HA may not be ready yet
    }
  }

  // Start polling after HA loads
  if (document.readyState === 'complete') {
    setInterval(poll, POLL_INTERVAL_MS);
    poll();
  } else {
    window.addEventListener('load', () => {
      setInterval(poll, POLL_INTERVAL_MS);
      poll();
    });
  }

  // Expose navigate globally for direct JS calls
  window.browserMod = { navigate, toast };
  console.log('[browser_mod] FFT shim loaded');
})();
