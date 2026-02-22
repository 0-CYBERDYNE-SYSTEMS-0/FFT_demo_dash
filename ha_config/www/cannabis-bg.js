// Sets the html element background, with dynamic URL support via input_text.dashboard_background_url.
// If the entity is empty or unset, falls back to the default cannabis cultivation photo.

const DEFAULT_BG = 'https://images.unsplash.com/photo-1647893168444-9aae7d23810e?w=1920&q=60&auto=format&fit=crop';
const BG_ENTITY = 'input_text.dashboard_background_url';
const POLL_INTERVAL_MS = 5000;

const style = document.createElement('style');
style.id = 'cannabis-bg-style';
document.head.appendChild(style);

function applyBackground(url) {
  const src = url && url.trim() ? url.trim() : DEFAULT_BG;
  style.textContent = `
    html {
      background: #050b04 url('${src}') center / cover fixed !important;
      transition: background-image 1s ease;
    }
  `;
}

// Apply default immediately
applyBackground(DEFAULT_BG);

async function pollBackgroundEntity() {
  try {
    const res = await fetch(`/api/states/${BG_ENTITY}`);
    if (!res.ok) return;
    const data = await res.json();
    const url = data?.state ?? '';
    applyBackground(url);
  } catch {
    // HA not ready yet — keep current background
  }
}

// Start polling after load
window.addEventListener('load', () => {
  pollBackgroundEntity();
  setInterval(pollBackgroundEntity, POLL_INTERVAL_MS);
});
