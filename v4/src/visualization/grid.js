/**
 * Coverage grid DOM rendering
 * Displays the 8x7 coverage grid with observation counts
 */

import { CONFIG } from '../config.js';
import { store } from '../state/store.js';
import { events, EVENT_TYPES } from '../utils/events.js';
import { getCellData, getCellClass, getMaxCellCount } from '../processing/coverage.js';

// Tooltip element reference
let tooltipEl = null;

/**
 * Initialize grid rendering
 */
export function initGrid() {
    tooltipEl = document.getElementById('tooltip');

    // Subscribe to data events for updates
    events.on(EVENT_TYPES.DATA_SV_BEAM, renderCoverageGrid);

    // Initial render
    renderCoverageGrid();
}

/**
 * Render the coverage grid to DOM
 * Grid is rendered directly into #coverageGrid which has CSS grid styling
 * Legend is static in HTML, not generated here
 */
export function renderCoverageGrid() {
    const gridEl = document.getElementById('coverageGrid');
    if (!gridEl) return;

    // Find max count for relative scaling (matching v3)
    const maxCount = getMaxCellCount();

    let html = '';

    // Header row with azimuth directions
    html += '<div class="coverage-grid-header"></div>'; // Empty corner
    CONFIG.azimuthSectors.forEach(dir => {
        html += `<div class="coverage-grid-header">${dir}</div>`;
    });

    // Body rows (elevation bands, highest first)
    for (let elIdx = CONFIG.elevationBands.length - 1; elIdx >= 0; elIdx--) {
        const band = CONFIG.elevationBands[elIdx];
        html += `<div class="coverage-grid-label">${band.label}</div>`;

        CONFIG.azimuthSectors.forEach((_, azIdx) => {
            const cell = getCellData(azIdx, elIdx);
            const cellClass = getCellClass(cell.count, maxCount);
            const displayValue = cell.count > 0 ? cell.count : '';

            html += `<div class="coverage-grid-cell ${cellClass}"
                data-az="${azIdx}" data-el="${elIdx}"
                onmouseenter="window.showCellTooltip(event, ${azIdx}, ${elIdx})"
                onmouseleave="window.hideCellTooltip()">
                ${displayValue}
            </div>`;
        });
    }

    gridEl.innerHTML = html;
}

/**
 * Show tooltip for a grid cell
 * @param {MouseEvent} event - Mouse event
 * @param {number} azIdx - Azimuth index
 * @param {number} elIdx - Elevation index
 */
export function showCellTooltip(event, azIdx, elIdx) {
    if (!tooltipEl) return;

    const cell = getCellData(azIdx, elIdx);
    const band = CONFIG.elevationBands[elIdx];
    const dir = CONFIG.azimuthSectors[azIdx];

    let html = `<strong>${dir} @ ${band.label}</strong><br>`;

    if (cell.count === 0) {
        html += '<span style="color: var(--text-muted);">No observations</span>';
    } else {
        html += `Observations: ${cell.count}<br>`;
        html += `Satellites seen: ${cell.satellites.size}<br>`;

        if (cell.satellites.size > 0) {
            const svList = Array.from(cell.satellites).slice(0, 5).join(', ');
            const more = cell.satellites.size > 5 ? ` +${cell.satellites.size - 5} more` : '';
            html += `<span style="color: var(--text-muted);">SVs: ${svList}${more}</span>`;
        }
    }

    tooltipEl.innerHTML = html;
    tooltipEl.style.left = event.pageX + 10 + 'px';
    tooltipEl.style.top = event.pageY + 10 + 'px';
    tooltipEl.style.display = 'block';
}

/**
 * Hide the tooltip
 */
export function hideCellTooltip() {
    if (tooltipEl) {
        tooltipEl.style.display = 'none';
    }
}

// Expose tooltip functions globally for inline event handlers
if (typeof window !== 'undefined') {
    window.showCellTooltip = showCellTooltip;
    window.hideCellTooltip = hideCellTooltip;
}
