/**
 * Satellite position prediction
 * Real-time position calculation using TLE data
 */

import { store } from '../state/store.js';
import { events, EVENT_TYPES } from '../utils/events.js';

// Prediction update interval handle
let predictionInterval = null;
const UPDATE_INTERVAL_MS = 5000; // 5 seconds

/**
 * Start periodic prediction updates
 */
export function startPredictionUpdates() {
    stopPredictionUpdates(); // Clear any existing

    // Initial update
    updatePredictions();

    // Schedule periodic updates
    predictionInterval = setInterval(updatePredictions, UPDATE_INTERVAL_MS);
}

/**
 * Stop prediction updates
 */
export function stopPredictionUpdates() {
    if (predictionInterval) {
        clearInterval(predictionInterval);
        predictionInterval = null;
    }
}

/**
 * Update satellite predictions and emit event
 */
function updatePredictions() {
    const tleData = store.get('tleData');
    if (!tleData || tleData.length === 0) return;

    const observer = store.get('observer');
    const now = new Date();

    const visibleSatellites = [];

    tleData.forEach(sat => {
        try {
            const position = calculateSatellitePosition(sat.satrec, now, observer);
            if (position && position.elevation > 0) {
                visibleSatellites.push({
                    name: sat.name,
                    ...position
                });
            }
        } catch (e) {
            // Skip satellites with propagation errors
        }
    });

    events.emit(EVENT_TYPES.TLE_PREDICTIONS_UPDATED, { satellites: visibleSatellites });
}

/**
 * Calculate satellite position at a given time
 * @param {Object} satrec - Satellite record from TLE parsing
 * @param {Date} date - Time for calculation
 * @param {{lat: number, lon: number}} observer - Observer position
 * @returns {{elevation: number, azimuth: number, range: number}|null} Position or null
 */
export function calculateSatellitePosition(satrec, date, observer) {
    // Requires satellite.js to be loaded globally
    if (typeof satellite === 'undefined') return null;

    try {
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
            azimuth: satellite.radiansToDegrees(lookAngles.azimuth),
            range: lookAngles.rangeSat // km
        };
    } catch (e) {
        return null;
    }
}

/**
 * Get currently visible satellites
 * @returns {Array} Array of visible satellite positions
 */
export function getVisibleSatellites() {
    const tleData = store.get('tleData');
    if (!tleData || tleData.length === 0) return [];

    const observer = store.get('observer');
    const now = new Date();

    const visible = [];

    tleData.forEach(sat => {
        try {
            const position = calculateSatellitePosition(sat.satrec, now, observer);
            if (position && position.elevation > 0) {
                visible.push({
                    name: sat.name,
                    ...position
                });
            }
        } catch (e) {
            // Skip
        }
    });

    // Sort by elevation (highest first)
    visible.sort((a, b) => b.elevation - a.elevation);

    return visible;
}

/**
 * Check if predictions are active
 * @returns {boolean} True if prediction updates are running
 */
export function isPredictionsActive() {
    return predictionInterval !== null;
}
