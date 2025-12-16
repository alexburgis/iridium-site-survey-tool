/**
 * UI updates and indicators
 * Stats bar, terminal, connection status, and toast notifications
 */

import { store } from '../state/store.js';
import { events, EVENT_TYPES } from '../utils/events.js';
import { formatDuration, getSvColor } from '../utils/helpers.js';
import { calculateAssessment, getScoreClass } from '../processing/assessment.js';

// Duration interval handle
let durationInterval = null;

/**
 * Initialize UI components and subscriptions
 */
export function initUI() {
    // Subscribe to events
    events.on(EVENT_TYPES.SERIAL_CONNECTED, () => updateConnectionUI(true));
    events.on(EVENT_TYPES.SERIAL_DISCONNECTED, () => updateConnectionUI(false));
    events.on(EVENT_TYPES.DATA_RSSI, updateCurrentSignal);
    events.on(EVENT_TYPES.DATA_SERVICE, ({ available }) => updateServiceIndicator(available));
    events.on(EVENT_TYPES.DATA_SV_BEAM, updateStats);
    events.on(EVENT_TYPES.TERMINAL_LOG, ({ message, type }) => logTerminal(message, type));
    events.on(EVENT_TYPES.TOAST, ({ message, type }) => showToast(message, type));
    events.on(EVENT_TYPES.LOGGING_STARTED, startDurationTimer);
    events.on(EVENT_TYPES.LOGGING_STOPPED, stopDurationTimer);

    // Initial UI state
    updateConnectionUI(false);
}

/**
 * Update connection status UI
 * @param {boolean} connected - Connection state
 */
export function updateConnectionUI(connected) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    const connectBtn = document.getElementById('connectBtn');
    const startBtn = document.getElementById('startBtn');

    if (statusDot) {
        statusDot.className = `status-dot ${connected ? 'connected' : ''}`;
    }

    if (statusText) {
        statusText.textContent = connected ? 'Connected' : 'Disconnected';
    }

    if (connectBtn) {
        connectBtn.innerHTML = connected ? '🔌 Disconnect' : '🔌 Connect';
        connectBtn.className = `btn ${connected ? 'btn-danger' : 'btn-primary'}`;
    }

    if (startBtn) {
        startBtn.disabled = !connected;
    }
}

/**
 * Update current signal strength display (matching v3)
 * @param {Object} report - RSSI report with rssi field
 */
function updateCurrentSignal(report) {
    const signalEl = document.getElementById('currentSignal');
    if (!signalEl) return;

    const rssi = report.rssi;
    signalEl.textContent = rssi + ' bars';
    signalEl.style.color = `var(--signal-${rssi})`;
}

/**
 * Update service availability indicator (matching v3)
 * @param {boolean} available - Service availability state
 */
function updateServiceIndicator(available) {
    const serviceEl = document.getElementById('serviceStatus');
    if (!serviceEl) return;

    if (available) {
        serviceEl.textContent = '● Online';
        serviceEl.style.color = 'var(--accent-green)';
    } else {
        serviceEl.textContent = '○ Offline';
        serviceEl.style.color = 'var(--signal-1)';
    }
}

/**
 * Start the duration timer
 */
function startDurationTimer() {
    stopDurationTimer(); // Clear any existing
    durationInterval = setInterval(updateDuration, 1000);
    updateDuration();
}

/**
 * Stop the duration timer
 */
function stopDurationTimer() {
    if (durationInterval) {
        clearInterval(durationInterval);
        durationInterval = null;
    }
}

/**
 * Update duration display
 */
function updateDuration() {
    const durationEl = document.getElementById('duration');
    if (!durationEl) return;

    const startTime = store.get('startTime');
    const loadedDuration = store.get('loadedDuration');

    const sessionElapsed = startTime ? Date.now() - startTime : 0;
    const totalElapsed = sessionElapsed + loadedDuration;

    durationEl.textContent = formatDuration(totalElapsed);
}

/**
 * Update stats display (reports, satellites, signal readings)
 */
export function updateStats() {
    // Update report counts
    const reportsEl = document.getElementById('reportCount');
    const satsEl = document.getElementById('satCount');
    const avgSignalEl = document.getElementById('avgSignal');

    const svBeamReports = store.get('svBeamReports');
    const satellites = store.get('satellites');
    const rssiReports = store.get('rssiReports');

    if (reportsEl) {
        reportsEl.textContent = svBeamReports.length;
    }
    if (satsEl) {
        satsEl.textContent = satellites.size;
    }

    // Calculate average RSSI
    if (avgSignalEl) {
        if (rssiReports.length > 0) {
            const avg = rssiReports.reduce((sum, r) => sum + r.rssi, 0) / rssiReports.length;
            avgSignalEl.textContent = avg.toFixed(1);
        } else {
            avgSignalEl.textContent = '--';
        }
    }

    // Update duration
    updateDuration();

    // Update satellite table
    updateSatelliteTable();

    // Update assessment
    updateAssessmentDisplay();
}

/**
 * Update satellite tracking table
 */
function updateSatelliteTable() {
    const tbody = document.getElementById('satTableBody');
    if (!tbody) return;

    const satellites = store.get('satellites');

    if (satellites.size === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 30px;">No satellites tracked yet</td></tr>';
        return;
    }

    // Build satellite data
    const satData = [];
    satellites.forEach((sat, svId) => {
        if (sat.reports.length === 0) return;

        const azimuthSectors = new Set();
        let minEl = 90, maxEl = 0;

        sat.reports.forEach(r => {
            if (r.azimuth !== undefined) {
                const sectorIdx = Math.floor(((r.azimuth + 22.5) % 360) / 45);
                azimuthSectors.add(sectorIdx);
            }
            if (r.elevation !== undefined) {
                if (r.elevation < minEl) minEl = r.elevation;
                if (r.elevation > maxEl) maxEl = r.elevation;
            }
        });

        satData.push({
            svId,
            reports: sat.reports.length,
            beams: sat.beams.size,
            sectors: azimuthSectors.size,
            elRange: `${minEl.toFixed(0)}°-${maxEl.toFixed(0)}°`
        });
    });

    // Sort by observation count
    satData.sort((a, b) => b.reports - a.reports);

    tbody.innerHTML = satData.slice(0, 20).map(s => `
        <tr>
            <td><span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${getSvColor(s.svId)}; margin-right: 6px;"></span><strong>SV ${s.svId}</strong></td>
            <td>${s.reports}</td>
            <td>${s.sectors}/8</td>
            <td>${s.elRange}</td>
        </tr>
    `).join('');
}

/**
 * Update assessment display
 */
function updateAssessmentDisplay() {
    const assessment = calculateAssessment();

    // Service uptime - both stat card and assessment panel
    const serviceUptimeStatEl = document.getElementById('serviceUptimeStat');
    const uptimeEl = document.getElementById('serviceUptime');
    const uptimeDetailEl = document.getElementById('serviceDetail');
    const serviceStatusEl = document.getElementById('serviceStatus');

    if (assessment.serviceStats && assessment.serviceStats.totalMs > 60000) {
        const uptimeStr = assessment.serviceStats.percentage.toFixed(0) + '%';
        const scoreClass = getScoreClass(assessment.serviceStats.percentage);

        if (serviceUptimeStatEl) {
            serviceUptimeStatEl.textContent = uptimeStr;
            serviceUptimeStatEl.style.color = `var(--${scoreClass === 'score-excellent' ? 'accent-green' : scoreClass === 'score-good' ? 'accent-blue' : scoreClass === 'score-moderate' ? 'accent-yellow' : 'accent-orange'})`;
        }
        if (uptimeEl) {
            uptimeEl.textContent = uptimeStr;
            uptimeEl.className = 'assessment-value ' + scoreClass;
        }
        if (uptimeDetailEl) {
            uptimeDetailEl.textContent = assessment.serviceStats.outageCount > 0
                ? `${assessment.serviceStats.outageCount} outages`
                : 'No outages';
        }
        // Note: serviceStatus is updated in real-time by updateServiceIndicator via DATA_SERVICE event
    } else {
        if (serviceUptimeStatEl) serviceUptimeStatEl.textContent = '--%';
        if (uptimeEl) {
            uptimeEl.textContent = '--%';
            uptimeEl.className = 'assessment-value';
        }
        if (uptimeDetailEl) uptimeDetailEl.textContent = 'Collecting data...';
    }

    // Grid coverage - both stat card and assessment panel
    const gridCoverageStatEl = document.getElementById('gridCoverage');
    const gridCoverageScoreEl = document.getElementById('gridCoverageScore');
    const gridDetailEl = document.getElementById('gridDetail');

    if (gridCoverageStatEl) {
        gridCoverageStatEl.textContent = assessment.gridCoverage.percentage + '%';
    }
    if (gridCoverageScoreEl) {
        gridCoverageScoreEl.textContent = assessment.gridCoverage.percentage + '%';
        gridCoverageScoreEl.className = 'assessment-value ' + getScoreClass(assessment.gridCoverage.percentage);
    }
    if (gridDetailEl) {
        gridDetailEl.textContent = `${assessment.gridCoverage.cellsWithObs}/${assessment.gridCoverage.totalCells} cells`;
    }

    // Horizon visibility - both stat card and assessment panel
    const criticalCoverageEl = document.getElementById('criticalCoverage');
    const horizonScoreEl = document.getElementById('horizonScore');
    const horizonDetailEl = document.getElementById('horizonDetail');

    const { dirsClear, dirsPartial, dirsSparse, dirsBlocked } = assessment.horizonAnalysis;
    const totalDirs = dirsClear + dirsPartial + dirsSparse + dirsBlocked;
    const horizonScoreClass = getScoreClass(assessment.horizonScore);

    // Stat card shows percentage
    if (criticalCoverageEl) {
        criticalCoverageEl.textContent = assessment.horizonScore + '%';
    }

    // Assessment panel shows X/8 format (matching v3)
    if (horizonScoreEl) {
        horizonScoreEl.textContent = `${dirsClear}/${totalDirs}`;
        horizonScoreEl.className = 'assessment-value ' + horizonScoreClass;
    }

    // Build detail string (matching v3 format)
    if (horizonDetailEl) {
        let horizonDetail = `${dirsClear} clear`;
        if (dirsPartial > 0) horizonDetail += `, ${dirsPartial} partial`;
        if (dirsSparse > 0) horizonDetail += `, ${dirsSparse} sparse`;
        if (dirsBlocked > 0) horizonDetail += `, ${dirsBlocked} blocked`;
        horizonDetailEl.textContent = horizonDetail;
    }

    // Verdict
    const recommendationEl = document.getElementById('recommendation');
    const recommendationDetailEl = document.getElementById('recommendationDetail');

    if (recommendationEl) {
        recommendationEl.textContent = assessment.verdict.short;
        recommendationEl.className = 'assessment-value ' + assessment.verdict.class;
    }
    if (recommendationDetailEl) {
        recommendationDetailEl.textContent = assessment.verdict.detail;
    }
}

/**
 * Log a message to the terminal
 * @param {string} message - Message to log
 * @param {string} type - Message type (rx, tx, info, error)
 */
export function logTerminal(message, type = 'info') {
    const terminal = document.getElementById('terminal');
    if (!terminal) return;

    const line = document.createElement('div');
    line.className = `terminal-line terminal-${type}`;

    const timestamp = new Date().toLocaleTimeString();
    line.innerHTML = `<span class="terminal-time">[${timestamp}]</span> ${escapeHtml(message)}`;

    terminal.appendChild(line);
    terminal.scrollTop = terminal.scrollHeight;

    // Limit terminal lines
    while (terminal.children.length > 300) {
        terminal.removeChild(terminal.firstChild);
    }
}

/**
 * Clear the terminal
 */
export function clearTerminal() {
    const terminal = document.getElementById('terminal');
    if (terminal) {
        terminal.innerHTML = '';
    }
}

/**
 * Show a toast notification
 * @param {string} message - Toast message
 * @param {string} type - Toast type (success, error, info)
 */
export function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toastIcon');
    const toastMessage = document.getElementById('toastMessage');

    if (!toast || !toastMessage) return;

    const icons = {
        success: '✓',
        error: '✗',
        info: 'ℹ'
    };

    if (toastIcon) {
        toastIcon.textContent = icons[type] || icons.info;
    }
    toastMessage.textContent = message;

    toast.className = `toast toast-${type} show`;

    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
