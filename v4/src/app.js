/**
 * Main application orchestrator
 * Initializes all modules and wires up the application
 */

// Config
import { CONFIG } from './config.js';

// State
import { store } from './state/store.js';

// Events
import { events, EVENT_TYPES } from './utils/events.js';

// Services
import { connect, disconnect, toggleConnection, isSerialSupported } from './services/serial.js';
import { initModem, toggleLogging, setupLineProcessor } from './services/modem.js';
import { setupLocationInputs } from './services/geolocation.js';

// Processing
import { initCoverageGrid } from './processing/coverage.js';

// Visualization
import { initCharts, updateAllCharts } from './visualization/charts.js';
import { initSkyCanvas, redrawSkyPlot, resizeSkyCanvas } from './visualization/skyplot.js';
import { initGrid, renderCoverageGrid } from './visualization/grid.js';
import { initUI, updateStats, showToast, clearTerminal } from './visualization/ui.js';

// Data
import { saveSession, loadSession, clearSession, setupSessionFileInput } from './data/session.js';
import { exportCSV, exportJSON, exportReport } from './data/export.js';

// TLE
import { fetchTLEs, loadTLEs, clearTLEs } from './tle/parser.js';
import { startPredictionUpdates, stopPredictionUpdates, getVisibleSatellites } from './tle/predictor.js';

/**
 * Initialize the application
 */
export function initApp() {
    console.log('Initializing RockBLOCK Site Survey Tool v4...');

    // Check Web Serial support
    if (!isSerialSupported()) {
        showToast('Web Serial API not supported. Use Chrome/Edge/Opera.', 'error');
        const connectBtn = document.getElementById('connectBtn');
        if (connectBtn) connectBtn.disabled = true;
    }

    // Initialize modules
    initCoverageGrid();
    initCharts();
    initSkyCanvas();
    initGrid();
    initUI();

    // Set up event processors
    setupLineProcessor();
    setupSessionFileInput();
    setupLocationInputs();

    // Set up button handlers
    setupButtonHandlers();

    // Set up modal handlers
    setupModalHandlers();

    // Subscribe to events for cross-module updates
    setupEventSubscriptions();

    // Initialize LITE/Advanced mode toggle
    initAdvancedToggle();

    console.log('Application initialized');
}

/**
 * Initialize the Advanced mode toggle
 * Defaults to LITE mode, shows disclaimer once per browser session
 */
function initAdvancedToggle() {
    const toggle = document.getElementById('advancedToggle');
    const disclaimerModal = document.getElementById('advancedDisclaimerModal');
    const acceptBtn = document.getElementById('advancedDisclaimerAccept');
    const cancelBtn = document.getElementById('advancedDisclaimerCancel');
    const modalClose = disclaimerModal?.querySelector('.modal-close');

    // Track disclaimer acceptance per browser session only
    let hasAcceptedDisclaimer = sessionStorage.getItem('advancedDisclaimerAccepted') === 'true';

    // Trigger redraw of visualizations after layout change
    function triggerLayoutRedraw() {
        // Small delay to allow CSS transitions to complete
        setTimeout(() => {
            resizeSkyCanvas();
            renderCoverageGrid();
        }, 100);
    }

    // Enable advanced mode after accepting disclaimer
    function enableAdvancedMode() {
        document.body.classList.add('advanced-mode');
        toggle?.classList.add('active');
        sessionStorage.setItem('advancedDisclaimerAccepted', 'true');
        hasAcceptedDisclaimer = true;
        disclaimerModal?.classList.remove('active');
        triggerLayoutRedraw();
    }

    // Close modal without enabling
    function closeDisclaimer() {
        disclaimerModal?.classList.remove('active');
    }

    // Toggle handler
    toggle?.addEventListener('click', () => {
        const currentlyAdvanced = document.body.classList.contains('advanced-mode');

        if (currentlyAdvanced) {
            // Turning off advanced mode - no confirmation needed
            document.body.classList.remove('advanced-mode');
            toggle.classList.remove('active');
            triggerLayoutRedraw();
        } else {
            // Turning on advanced mode
            if (hasAcceptedDisclaimer) {
                // Already accepted this session - enable directly
                document.body.classList.add('advanced-mode');
                toggle?.classList.add('active');
                triggerLayoutRedraw();
            } else {
                // Show disclaimer modal
                disclaimerModal?.classList.add('active');
            }
        }
    });

    // Disclaimer modal handlers
    acceptBtn?.addEventListener('click', enableAdvancedMode);
    cancelBtn?.addEventListener('click', closeDisclaimer);
    modalClose?.addEventListener('click', closeDisclaimer);
    disclaimerModal?.addEventListener('click', (e) => {
        if (e.target === disclaimerModal) closeDisclaimer();
    });
}

/**
 * Set up button click handlers
 */
function setupButtonHandlers() {
    // Connection
    document.getElementById('connectBtn')?.addEventListener('click', async () => {
        await toggleConnection();
        if (store.get('isConnected')) {
            await initModem();
        }
    });

    // Logging
    document.getElementById('startBtn')?.addEventListener('click', toggleLogging);

    // Session management
    document.getElementById('saveBtn')?.addEventListener('click', saveSession);
    document.getElementById('loadBtn')?.addEventListener('click', () => {
        document.getElementById('sessionFileInput')?.click();
    });
    document.getElementById('clearBtn')?.addEventListener('click', () => {
        if (confirm('Clear all data? This cannot be undone.')) {
            clearSession();
            redrawSkyPlot();
            renderCoverageGrid();
            updateAllCharts();
            updateStats();
        }
    });

    // Export
    document.getElementById('exportCSVBtn')?.addEventListener('click', exportCSV);
    document.getElementById('exportJSONBtn')?.addEventListener('click', exportJSON);
    document.getElementById('exportReportBtn')?.addEventListener('click', exportReport);

    // TLE
    document.getElementById('tleBtn')?.addEventListener('click', () => {
        document.getElementById('tleModal')?.classList.add('active');
    });

    // Help
    document.getElementById('helpBtn')?.addEventListener('click', () => {
        document.getElementById('helpModal')?.classList.add('active');
    });

    // Clear terminal
    document.getElementById('clearTerminalBtn')?.addEventListener('click', clearTerminal);
}

// Card help content (copied exactly from v3)
const CARD_HELP_CONTENT = {
    service: {
        title: '📡 Service Availability',
        body: `<p><strong>What it shows:</strong> The percentage of time the modem has network service available (can send/receive messages).</p>
               <p><strong>How it's calculated:</strong> Total time with service ÷ Total survey time × 100</p>
               <p><strong>Status indicator:</strong></p>
               <ul style="margin: 10px 0 10px 20px; color: var(--text-secondary);">
                 <li>● Online = Currently has service</li>
                 <li>○ Offline = No service right now</li>
               </ul>
               <p><strong>Why it matters:</strong> This is the most honest metric - actual measured connectivity. Unlike RSSI, this directly answers "can I communicate?"</p>
               <p><strong>Minimum survey time:</strong> Run for at least 48 hours for a confident verdict. Short surveys may not capture intermittent outages.</p>`
    },
    gridCoverage: {
        title: '📊 Grid Coverage',
        body: `<p><strong>What it shows:</strong> The percentage of sky cells with satellite observations.</p>
               <p><strong>How it's calculated:</strong> (Cells with ≥N observations) ÷ (Total cells) × 100</p>
               <p><strong>Observation threshold:</strong> Scales with survey duration (3 for <2hrs, 10 for 2-8hrs, 20 for 8-24hrs, 30 for 24hrs+).</p>
               <p><strong>Why it matters:</strong> Cells with no observations indicate either obstructions OR insufficient survey time. If a cell is empty after 48+ hours, it's likely blocked.</p>`
    },
    criticalBand: {
        title: '🌅 Horizon Visibility',
        body: `<p><strong>What it shows:</strong> How many compass directions have clear horizon visibility in the critical 8-14° elevation band.</p>
               <p><strong>Four-tier classification:</strong> Each direction's 8-14° observation count is compared to the best direction:</p>
               <ul style="margin: 10px 0 10px 20px; color: var(--text-secondary);">
                 <li><strong>Clear (≥70%):</strong> Full visibility, no significant obstruction</li>
                 <li><strong>Partial (40-70%):</strong> Some reduction in observations - possible minor obstruction (trees, mesh)</li>
                 <li><strong>Sparse (&lt;40%):</strong> Significant blocking - expect connectivity issues from this direction</li>
                 <li><strong>Blocked:</strong> Missing observations in one or both horizon bands (8-14° or 14-20°)</li>
               </ul>
               <p><strong>Weighted score:</strong> Clear=100%, Partial=70%, Sparse=30%, Blocked=0%</p>
               <p><strong>Why 8-14° matters:</strong> This is the critical elevation band for Iridium. Obstructions here cause the most connectivity issues.</p>`
    },
    coverageGrid: {
        title: '📊 Coverage Grid',
        body: `<p><strong>What it shows:</strong> Observation counts for each segment of sky, divided into 8 compass directions × 7 elevation bands.</p>
               <p><strong>How to read it:</strong></p>
               <ul style="margin: 10px 0 10px 20px; color: var(--text-secondary);">
                 <li>Columns = compass directions (N, NE, E, etc.)</li>
                 <li>Rows = elevation bands (8-14° at bottom, 80-90° at top)</li>
                 <li>Cell brightness = relative observation count</li>
                 <li>Cell value = number of observations</li>
               </ul>
               <p><strong>What to look for:</strong> Dark/empty cells in the lower rows (8-20°) suggest obstructions. Compare counts across directions - significantly lower counts may indicate partial blocking.</p>
               <p><strong>Note:</strong> The grid shows geometric visibility only. RSSI cannot be reliably attributed to specific sky positions.</p>`
    },
    skyPlot: {
        title: '🌐 Sky Plot',
        body: `<p><strong>What it shows:</strong> A polar view of the sky with satellite observations plotted by position.</p>
               <p><strong>How to read it:</strong></p>
               <ul style="margin: 10px 0 10px 20px; color: var(--text-secondary);">
                 <li>Center = directly overhead (90° elevation)</li>
                 <li>Edge = horizon (0° elevation)</li>
                 <li>Red dashed circle = 8° minimum functional elevation</li>
                 <li>Colored dots = satellite observations (color = satellite ID)</li>
                 <li>Cyan circles = predicted satellite positions (if TLEs loaded)</li>
               </ul>
               <p><strong>Color by satellite:</strong> Each satellite has a unique color so you can see orbital tracks. Over time, you'll see the characteristic Iridium polar orbit pattern emerge.</p>
               <p><strong>Why not RSSI colors?</strong> The modem's RSSI reading cannot be reliably attributed to a specific satellite position (see documentation for details).</p>`
    },
    siteAssessment: {
        title: '📋 Site Assessment',
        body: `<p><strong>Service Uptime:</strong> Actual measured connectivity - the most reliable metric.</p>
               <p><strong>Horizon Visibility:</strong> Four-tier classification (clear/partial/sparse/blocked) of the 8 compass directions based on 8-14° observations.</p>
               <p><strong>Grid Coverage:</strong> Percentage of sky cells with sufficient observations.</p>
               <p><strong>Verdict (requires 48+ hours):</strong></p>
               <ul style="margin: 10px 0 10px 20px; color: var(--text-secondary);">
                 <li>✓ EXCELLENT - 95%+ uptime, 7+ clear, no blocked/sparse</li>
                 <li>✓ GOOD - 90%+ uptime, 5+ clear, no blocked, ≤1 sparse</li>
                 <li>⚠ ADEQUATE - 80%+ uptime, 4+ clear, ≤1 blocked</li>
                 <li>⚠ MARGINAL - 60-80% uptime or multiple obstructions</li>
                 <li>✗ POOR - &lt;60% uptime or severe obstructions</li>
               </ul>
               <p><strong>Note:</strong> Verdicts before 48 hours are preliminary. Short surveys may miss intermittent issues.</p>`
    },
    satVisibility: {
        title: '🛰️ Satellites Observed',
        body: `<p><strong>What it shows:</strong> Which Iridium satellites have been received during the survey.</p>
               <p><strong>Columns:</strong></p>
               <ul style="margin: 10px 0 10px 20px; color: var(--text-secondary);">
                 <li><strong>Satellite:</strong> SV ID with color matching sky plot</li>
                 <li><strong>Obs:</strong> Number of position reports received</li>
                 <li><strong>Dirs:</strong> Compass directions seen (out of 8)</li>
                 <li><strong>El Range:</strong> Elevation range observed</li>
               </ul>
               <p><strong>Why no RSSI grades?</strong> RSSI cannot be reliably attributed to specific satellites. The modem may be locked to one satellite while reporting positions from others.</p>`
    }
};

/**
 * Show card help modal
 * @param {string} helpId - Help content ID
 */
function showCardHelp(helpId) {
    const content = CARD_HELP_CONTENT[helpId];
    if (!content) return;

    const modal = document.getElementById('cardHelpModal');
    const titleEl = document.getElementById('cardHelpTitle');
    const bodyEl = document.getElementById('cardHelpBody');

    if (titleEl) titleEl.innerHTML = content.title;
    if (bodyEl) bodyEl.innerHTML = content.body;
    modal?.classList.add('active');
}

/**
 * Set up modal dialog handlers
 */
function setupModalHandlers() {
    // Help modal
    const helpModal = document.getElementById('helpModal');
    helpModal?.querySelector('.modal-close')?.addEventListener('click', () => {
        helpModal.classList.remove('active');
    });
    helpModal?.addEventListener('click', (e) => {
        if (e.target === helpModal) helpModal.classList.remove('active');
    });

    // TLE modal
    const tleModal = document.getElementById('tleModal');
    tleModal?.querySelector('.modal-close')?.addEventListener('click', () => {
        tleModal.classList.remove('active');
    });
    tleModal?.addEventListener('click', (e) => {
        if (e.target === tleModal) tleModal.classList.remove('active');
    });

    // Card Help modal
    const cardHelpModal = document.getElementById('cardHelpModal');
    cardHelpModal?.querySelector('.modal-close')?.addEventListener('click', () => {
        cardHelpModal.classList.remove('active');
    });
    cardHelpModal?.addEventListener('click', (e) => {
        if (e.target === cardHelpModal) cardHelpModal.classList.remove('active');
    });

    // Set up card help button handlers
    document.getElementById('serviceHelp')?.addEventListener('click', () => showCardHelp('service'));
    document.getElementById('gridCoverageHelp')?.addEventListener('click', () => showCardHelp('gridCoverage'));
    document.getElementById('gridCoverageHelp2')?.addEventListener('click', () => showCardHelp('gridCoverage'));
    document.getElementById('horizonHelp')?.addEventListener('click', () => showCardHelp('criticalBand'));
    document.getElementById('criticalBandHelp')?.addEventListener('click', () => showCardHelp('criticalBand'));
    document.getElementById('coverageGridHelp')?.addEventListener('click', () => showCardHelp('coverageGrid'));
    document.getElementById('skyPlotHelp')?.addEventListener('click', () => showCardHelp('skyPlot'));
    document.getElementById('siteAssessmentHelp')?.addEventListener('click', () => showCardHelp('siteAssessment'));
    document.getElementById('satVisibilityHelp')?.addEventListener('click', () => showCardHelp('satVisibility'));

    // TLE modal buttons
    document.getElementById('fetchTLEBtn')?.addEventListener('click', async () => {
        const textarea = document.getElementById('tleInput');
        try {
            const text = await fetchTLEs();
            if (textarea) textarea.value = text;
        } catch (e) {
            // Error already handled in fetchTLEs
        }
    });

    document.getElementById('loadTLEBtn')?.addEventListener('click', () => {
        const textarea = document.getElementById('tleInput');
        if (textarea?.value) {
            loadTLEs(textarea.value);
            startPredictionUpdates();
            redrawSkyPlot();
            updateTLEVisibilityUI();
            document.getElementById('tleModal')?.classList.remove('active');
        }
    });

    document.getElementById('clearTLEBtn')?.addEventListener('click', () => {
        clearTLEs();
        stopPredictionUpdates();
        redrawSkyPlot();
        updateTLEVisibilityUI();
        const textarea = document.getElementById('tleInput');
        if (textarea) textarea.value = '';
    });
}

/**
 * Set up event subscriptions for cross-module updates
 */
function setupEventSubscriptions() {
    // Update start button text based on logging state
    events.on(EVENT_TYPES.LOGGING_STARTED, () => {
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.textContent = '⏹ Stop';
            startBtn.classList.add('btn-danger');
            startBtn.classList.remove('btn-success');
        }
    });

    events.on(EVENT_TYPES.LOGGING_STOPPED, () => {
        const startBtn = document.getElementById('startBtn');
        if (startBtn) {
            startBtn.textContent = '▶️ Start';
            startBtn.classList.remove('btn-danger');
            startBtn.classList.add('btn-success');
        }
    });

    // Update visualizations on session load
    events.on(EVENT_TYPES.SESSION_LOADED, () => {
        redrawSkyPlot();
        renderCoverageGrid();
        updateAllCharts();
        updateStats();
    });

    // Update visualizations on session clear
    events.on(EVENT_TYPES.SESSION_CLEARED, () => {
        redrawSkyPlot();
        renderCoverageGrid();
        updateAllCharts();
        updateStats();
    });

    // Update TLE visibility list on predictions update
    events.on(EVENT_TYPES.TLE_PREDICTIONS_UPDATED, () => {
        updateTLEVisibilityUI();
        redrawSkyPlot();
    });

    // Redraw sky plot on location change
    events.on(EVENT_TYPES.LOCATION_UPDATED, () => {
        redrawSkyPlot();
    });
}

/**
 * Update TLE visibility list in UI
 */
function updateTLEVisibilityUI() {
    const listEl = document.getElementById('tleVisibilityList');
    if (!listEl) return;

    const visible = getVisibleSatellites();

    if (visible.length === 0) {
        listEl.innerHTML = '<div class="no-sats">No TLEs loaded or no satellites visible</div>';
        return;
    }

    listEl.innerHTML = visible.slice(0, 10).map(sat => `
        <div class="tle-sat-item">
            <span class="tle-sat-name">${sat.name}</span>
            <span class="tle-sat-pos">El: ${sat.elevation.toFixed(1)}° Az: ${sat.azimuth.toFixed(1)}°</span>
        </div>
    `).join('');
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}
