/**
 * Sky plot canvas visualization
 * Polar projection showing satellite positions
 */

import { CONFIG } from '../config.js';
import { store } from '../state/store.js';
import { events, EVENT_TYPES } from '../utils/events.js';
import { skyToCanvas } from '../processing/coordinates.js';
import { getSvColor } from '../utils/helpers.js';

// Canvas state
let skyCanvas = null;
let skyCtx = null;

/**
 * Initialize sky plot canvas
 */
export function initSkyCanvas() {
    skyCanvas = document.getElementById('skyCanvas');
    if (!skyCanvas) return;

    skyCtx = skyCanvas.getContext('2d');
    resizeSkyCanvas();

    // Handle window resize
    window.addEventListener('resize', resizeSkyCanvas);

    // Subscribe to data events
    events.on(EVENT_TYPES.DATA_SV_BEAM, handleNewSvBeam);
}

/**
 * Resize canvas to container
 */
export function resizeSkyCanvas() {
    if (!skyCanvas) return;

    const container = skyCanvas.parentElement;
    const size = Math.min(container.clientWidth, container.clientHeight);

    skyCanvas.width = size;
    skyCanvas.height = size;
    skyCanvas.style.width = size + 'px';
    skyCanvas.style.height = size + 'px';

    redrawSkyPlot();
}

/**
 * Handle new SV/Beam report - plot with flash
 * @param {Object} report - SV beam report
 */
function handleNewSvBeam(report) {
    plotSkyPoint(report.elevation, report.azimuth, report.svId, true);

    // Clear flash after delay by redrawing
    setTimeout(() => redrawSkyPlot(), 150);
}

/**
 * Redraw the entire sky plot from stored data
 */
export function redrawSkyPlot() {
    if (!skyCtx || !skyCanvas) return;

    const size = skyCanvas.width;

    // Clear canvas
    skyCtx.clearRect(0, 0, size, size);

    // Draw grid
    drawSkyGrid();

    // Plot all stored points
    const svBeamReports = store.get('svBeamReports');
    svBeamReports.forEach(report => {
        plotSkyPoint(report.elevation, report.azimuth, report.svId, false);
    });

    // Draw TLE predictions if available
    drawPredictedSatellites();
}

/**
 * Draw the sky grid (circles and direction labels) - matching v3 exactly
 */
function drawSkyGrid() {
    if (!skyCtx || !skyCanvas) return;

    const size = skyCanvas.width;
    const center = size / 2;
    const maxRadius = center - 25;

    // Fill background
    skyCtx.fillStyle = '#111820';
    skyCtx.fillRect(0, 0, size, size);

    // Elevation circles at 30° and 60° only (matching v3)
    skyCtx.strokeStyle = 'rgba(255,255,255,0.1)';
    skyCtx.lineWidth = 1;
    [30, 60].forEach(el => {
        const r = maxRadius * (90 - el) / 90;
        skyCtx.beginPath();
        skyCtx.arc(center, center, r, 0, Math.PI * 2);
        skyCtx.stroke();
    });

    // Outer circle (0° horizon)
    skyCtx.strokeStyle = 'rgba(255,255,255,0.2)';
    skyCtx.beginPath();
    skyCtx.arc(center, center, maxRadius, 0, Math.PI * 2);
    skyCtx.stroke();

    // 8° minimum functional elevation line (dashed)
    const minElRadius = maxRadius * (90 - CONFIG.minFunctionalElevation) / 90;
    skyCtx.strokeStyle = 'rgba(248, 81, 73, 0.4)';
    skyCtx.setLineDash([4, 4]);
    skyCtx.beginPath();
    skyCtx.arc(center, center, minElRadius, 0, Math.PI * 2);
    skyCtx.stroke();
    skyCtx.setLineDash([]);

    // Azimuth lines
    skyCtx.strokeStyle = 'rgba(255,255,255,0.1)';
    for (let az = 0; az < 360; az += 45) {
        const rad = az * Math.PI / 180;
        skyCtx.beginPath();
        skyCtx.moveTo(center, center);
        skyCtx.lineTo(center + maxRadius * Math.sin(rad), center - maxRadius * Math.cos(rad));
        skyCtx.stroke();
    }

    // Direction labels - N, E, S, W only (matching v3)
    skyCtx.fillStyle = '#6e7681';
    skyCtx.font = '10px Outfit';
    skyCtx.textAlign = 'center';

    ['N', 'E', 'S', 'W'].forEach((label, i) => {
        const az = i * 90;
        const rad = az * Math.PI / 180;
        const r = maxRadius + 15;
        skyCtx.fillText(label, center + r * Math.sin(rad), center - r * Math.cos(rad) + 3);
    });

    // Elevation labels
    skyCtx.fillStyle = 'rgba(255,255,255,0.3)';
    skyCtx.font = '8px JetBrains Mono';
    skyCtx.textAlign = 'left';
    [30, 60].forEach(el => {
        const r = maxRadius * (90 - el) / 90;
        skyCtx.fillText(el + '°', center + 3, center - r + 10);
    });

    // 8° label
    skyCtx.fillStyle = 'rgba(248, 81, 73, 0.6)';
    skyCtx.fillText('8°', center + 3, center - minElRadius + 10);
}

/**
 * Plot a single point on the sky plot
 * @param {number} elevation - Elevation in degrees
 * @param {number} azimuth - Azimuth in degrees
 * @param {number} svId - Satellite vehicle ID
 * @param {boolean} flash - Whether to draw with flash effect
 */
export function plotSkyPoint(elevation, azimuth, svId, flash = false) {
    if (!skyCtx || !skyCanvas) return;
    if (elevation < 0 || elevation > 90) return;

    const size = skyCanvas.width;
    const { x, y } = skyToCanvas(elevation, azimuth, size);

    // Reduce opacity for sub-8° data
    const isInFunctionalRange = elevation >= CONFIG.minFunctionalElevation;
    const baseAlpha = isInFunctionalRange ? 0.6 : 0.3;
    const dotColor = isInFunctionalRange ? getSvColor(svId) : '#6e7681';

    if (flash) {
        // Draw white flash
        skyCtx.beginPath();
        skyCtx.arc(x, y, 6, 0, Math.PI * 2);
        skyCtx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        skyCtx.fill();
    } else {
        skyCtx.beginPath();
        skyCtx.arc(x, y, 2, 0, Math.PI * 2);
        skyCtx.fillStyle = dotColor;
        skyCtx.globalAlpha = baseAlpha;
        skyCtx.fill();
        skyCtx.globalAlpha = 1;
    }
}

/**
 * Draw predicted satellite positions from TLE data
 */
export function drawPredictedSatellites() {
    if (!skyCtx || !skyCanvas) return;

    const tleData = store.get('tleData');
    if (!tleData || tleData.length === 0) return;

    const observer = store.get('observer');
    const now = new Date();
    const size = skyCanvas.width;

    tleData.forEach(sat => {
        try {
            const position = calculateSatellitePosition(sat.satrec, now, observer);
            if (position && position.elevation > 0) {
                const { x, y } = skyToCanvas(position.elevation, position.azimuth, size);

                // Draw as cyan circle
                skyCtx.beginPath();
                skyCtx.arc(x, y, 4, 0, Math.PI * 2);
                skyCtx.strokeStyle = '#39c5cf';
                skyCtx.lineWidth = 1.5;
                skyCtx.stroke();
            }
        } catch (e) {
            // Skip satellites with propagation errors
        }
    });
}

/**
 * Calculate satellite position using satellite.js
 * @param {Object} satrec - Satellite record from TLE parsing
 * @param {Date} date - Time for calculation
 * @param {{lat: number, lon: number}} observer - Observer position
 * @returns {{elevation: number, azimuth: number}|null} Position or null if not visible
 */
function calculateSatellitePosition(satrec, date, observer) {
    // This requires satellite.js to be loaded globally
    if (typeof satellite === 'undefined') return null;

    const positionAndVelocity = satellite.propagate(satrec, date);
    if (!positionAndVelocity.position) return null;

    const gmst = satellite.gstime(date);
    const positionEcf = satellite.eciToEcf(positionAndVelocity.position, gmst);

    const observerGd = {
        longitude: satellite.degreesToRadians(observer.lon),
        latitude: satellite.degreesToRadians(observer.lat),
        height: 0
    };

    const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);

    return {
        elevation: satellite.radiansToDegrees(lookAngles.elevation),
        azimuth: satellite.radiansToDegrees(lookAngles.azimuth)
    };
}

/**
 * Get canvas context (for external use if needed)
 * @returns {CanvasRenderingContext2D|null}
 */
export function getContext() {
    return skyCtx;
}
