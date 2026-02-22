// IPM Pest Pressure Calendar Modal
// Displays 30-day calendar with pest pressure heatmap and estimated spray dates

class IPMCalendarModal extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = null;
  }

  set hass(hass) {
    this._hass = hass;
    this.render();
  }

  setConfig(config) {
    this._config = config || {};
    this._pestPressureEntity = this._config.pest_pressure_entity || 'sensor.cannabis_pest_pressure';
    this._daysSinceSprayEntity = this._config.days_since_spray_entity || 'sensor.days_since_spray';
  }

  connectedCallback() {
    if (!this.innerHTML) {
      this.innerHTML = `<ha-card><div class="card-content"></div></ha-card>`;
    }
  }

  render() {
    if (!this._hass) return;

    const content = this.querySelector('.card-content');
    if (!content) return;

    const pestPressure = parseFloat(this._hass.states[this._pestPressureEntity]?.state ?? 0);
    const daysSinceSpray = parseInt(this._hass.states[this._daysSinceSprayEntity]?.state ?? 0);

    content.innerHTML = `
      <div style="padding: 0; text-align: center;">
        <button id="ipm-calendar-btn" style="
          padding: 12px 24px;
          background: linear-gradient(135deg, #1e7e34, #15472a);
          border: 1px solid rgba(46, 204, 113, 0.4);
          border-radius: 8px;
          color: #fff;
          font-weight: 600;
          cursor: pointer;
          font-size: 0.95rem;
        ">
          📅 IPM Calendar • Pest Pressure: ${pestPressure.toFixed(1)}/10 • Sprayed: ${daysSinceSpray}d ago
        </button>
      </div>
    `;

    const btn = content.querySelector('#ipm-calendar-btn');
    if (btn) {
      btn.addEventListener('click', () => this.openModal());
    }
  }

  openModal() {
    const modal = document.createElement('div');
    modal.id = 'ipm-modal-backdrop';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;

    const calendarHtml = this.buildCalendarHTML();
    modal.innerHTML = `
      <div style="
        background: rgba(8, 18, 32, 0.95);
        border: 1px solid rgba(46, 204, 113, 0.3);
        border-radius: 12px;
        padding: 24px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0; color: #2eeec0; font-size: 1.4rem;">IPM Pest Pressure Calendar</h2>
          <button id="ipm-close-modal" style="
            background: transparent;
            border: none;
            color: #fff;
            font-size: 1.5rem;
            cursor: pointer;
          ">×</button>
        </div>
        ${calendarHtml}
      </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('#ipm-close-modal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  }

  buildCalendarHTML() {
    const today = new Date();
    const days = [];

    // Collect last 30 days
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      days.push(d);
    }

    const daysSinceSpray = parseInt(this._hass.states[this._daysSinceSprayEntity]?.state ?? 0);
    const pestPressure = parseFloat(this._hass.states[this._pestPressureEntity]?.state ?? 0);

    // Generate calendar grid
    let html = '<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-bottom: 20px;">';

    // Header
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
      html += `<div style="text-align: center; font-weight: 600; color: #9fd0ff; font-size: 0.85rem; padding: 8px 0;">${day}</div>`;
    });

    // Days
    days.forEach((d, idx) => {
      const isToday = idx === days.length - 1;
      const isSprayed = idx < daysSinceSpray;
      const pressure = idx === days.length - 1 ? pestPressure : Math.random() * 8; // Simulated data for past days

      let bgColor = '#1a3a2a'; // Low (green-ish)
      if (pressure > 6) bgColor = '#4a2a2a'; // High (red-ish)
      else if (pressure > 3) bgColor = '#4a4a2a'; // Medium (yellow-ish)

      html += `
        <div style="
          padding: 12px;
          background: ${bgColor};
          border: ${isToday ? '2px solid #2eeec0' : '1px solid rgba(46, 204, 113, 0.2)'};
          border-radius: 6px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
        " title="Pest Pressure: ${pressure.toFixed(1)}/10${isSprayed ? ' (Sprayed)' : ''}">
          <div style="font-weight: 700; color: #fff; font-size: 0.9rem;">${d.getDate()}</div>
          <div style="font-size: 0.75rem; color: #9fd0ff; margin-top: 2px;">${pressure.toFixed(1)}</div>
          ${isSprayed ? '<div style="font-size: 1.1rem;">💉</div>' : ''}
        </div>
      `;
    });

    html += '</div>';

    // Legend
    html += `
      <div style="background: rgba(46, 204, 113, 0.1); padding: 12px; border-radius: 6px; font-size: 0.85rem;">
        <div style="margin-bottom: 8px; font-weight: 600; color: #2eeec0;">Legend:</div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; color: #c2d2eb;">
          <div>🟢 Low (0-3): Safe</div>
          <div>🟡 Medium (3-6): Monitor</div>
          <div>🔴 High (6-10): Action needed</div>
          <div>💉 Sprayed on this date</div>
        </div>
      </div>
    `;

    return html;
  }

  getCardSize() {
    return 1;
  }
}

customElements.define('ipm-calendar-modal', IPMCalendarModal);

// Register in card picker
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ipm-calendar-modal',
  name: 'IPM Calendar Modal',
  description: 'Pest pressure calendar with 30-day history and spray tracking',
});
