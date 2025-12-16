/**
 * Session save/load functionality
 * Handles persisting survey data to files
 */

import { CONFIG } from '../config.js';
import { store, createEmptyCoverageGrid, createInitialState } from '../state/store.js';
import { events, EVENT_TYPES } from '../utils/events.js';
import { downloadFile } from '../utils/helpers.js';
import { calculateServiceUptime } from '../processing/assessment.js';

/**
 * Save current session to a JSON file
 */
export function saveSession() {
    const state = store.get();

    // Calculate total duration
    const sessionElapsed = state.startTime ? Date.now() - state.startTime : 0;
    const totalDuration = sessionElapsed + state.loadedDuration;

    // Calculate current service uptime to save
    const serviceStats = calculateServiceUptime();

    // Serialize data
    const session = {
        version: CONFIG.sessionVersion,
        timestamp: Date.now(),
        duration: totalDuration,
        uptime: serviceStats?.uptimeMs || 0,
        outageCount: serviceStats?.outageCount || 0,
        location: state.observer,
        rssiReports: state.rssiReports,
        svBeamReports: state.svBeamReports,
        serviceEvents: state.serviceEvents,
        coverageGrid: serializeCoverageGrid(state.coverageGrid),
        satellites: serializeSatellites(state.satellites)
    };

    const json = JSON.stringify(session, null, 2);
    const date = new Date().toISOString().split('T')[0];
    const filename = `site_survey_${date}.json`;

    downloadFile(json, filename, 'application/json');

    events.emit(EVENT_TYPES.SESSION_SAVED);
    events.emit(EVENT_TYPES.TOAST, { message: 'Session saved', type: 'success' });
}

/**
 * Load a session from file input
 * @param {File} file - File to load
 * @returns {Promise<void>}
 */
export async function loadSession(file) {
    try {
        const text = await file.text();
        const session = JSON.parse(text);

        // Validate session format
        if (session.version !== CONFIG.sessionVersion) {
            throw new Error(`Unsupported session version: ${session.version}. Expected version ${CONFIG.sessionVersion}.`);
        }

        // Restore state
        store.set('loadedDuration', session.duration || 0);
        store.set('loadedUptime', session.uptime || 0);
        store.set('loadedOutageCount', session.outageCount || 0);
        store.set('observer', session.location || CONFIG.defaultLocation);
        store.set('rssiReports', session.rssiReports || []);
        store.set('svBeamReports', session.svBeamReports || []);
        // Don't load old service events - they have timestamps from the old session
        // which would mess up uptime calculations. The uptime from the old session
        // is preserved in loadedUptime instead.
        store.set('serviceEvents', []);

        // Deserialize coverage grid
        if (session.coverageGrid) {
            store.set('coverageGrid', deserializeCoverageGrid(session.coverageGrid));
        }

        // Deserialize satellites
        if (session.satellites) {
            store.set('satellites', deserializeSatellites(session.satellites));
        }

        // Update location inputs
        updateLocationInputs(session.location);

        events.emit(EVENT_TYPES.SESSION_LOADED);
        events.emit(EVENT_TYPES.TOAST, { message: 'Session loaded', type: 'success' });
        events.emit(EVENT_TYPES.TERMINAL_LOG, {
            message: `Loaded session with ${session.svBeamReports?.length || 0} SV reports`,
            type: 'info'
        });

    } catch (error) {
        console.error('Failed to load session:', error);
        events.emit(EVENT_TYPES.TOAST, { message: `Failed to load: ${error.message}`, type: 'error' });
    }
}

/**
 * Clear the current session
 */
export function clearSession() {
    const initialState = createInitialState();

    // Reset all data state
    store.set('rssiReports', []);
    store.set('svBeamReports', []);
    store.set('satellites', new Map());
    store.set('coverageGrid', createEmptyCoverageGrid());
    store.set('rawLines', []);
    store.set('serviceEvents', []);
    store.set('serviceState', { available: null, lastChange: null });
    store.set('startTime', null);
    store.set('loadedDuration', 0);
    store.set('loadedUptime', 0);
    store.set('loadedOutageCount', 0);
    store.set('tleData', []);
    store.set('latestPing', null);

    events.emit(EVENT_TYPES.SESSION_CLEARED);
    events.emit(EVENT_TYPES.TOAST, { message: 'Session cleared', type: 'info' });
}

/**
 * Serialize coverage grid (convert Sets to Arrays)
 * @param {Object} grid - Coverage grid
 * @returns {Object} Serializable grid
 */
function serializeCoverageGrid(grid) {
    const serialized = {};
    for (const [key, cell] of Object.entries(grid)) {
        serialized[key] = {
            count: cell.count,
            satellites: Array.from(cell.satellites)
        };
    }
    return serialized;
}

/**
 * Deserialize coverage grid (convert Arrays back to Sets)
 * @param {Object} serialized - Serialized grid
 * @returns {Object} Coverage grid with Sets
 */
function deserializeCoverageGrid(serialized) {
    const grid = createEmptyCoverageGrid();
    for (const [key, cell] of Object.entries(serialized)) {
        if (grid[key]) {
            grid[key] = {
                count: cell.count || 0,
                satellites: new Set(cell.satellites || [])
            };
        }
    }
    return grid;
}

/**
 * Serialize satellites Map
 * @param {Map} satellites - Satellites map
 * @returns {Array} Serializable array
 */
function serializeSatellites(satellites) {
    const serialized = [];
    satellites.forEach((sat, svId) => {
        serialized.push({
            svId,
            reports: sat.reports,
            beams: Array.from(sat.beams)
        });
    });
    return serialized;
}

/**
 * Deserialize satellites to Map
 * @param {Array} serialized - Serialized satellites (can be array of [svId, data] pairs or objects)
 * @returns {Map} Satellites map
 */
function deserializeSatellites(serialized) {
    const satellites = new Map();
    for (const sat of serialized) {
        // Handle both formats: [svId, data] array pairs (from Map serialization) or {svId, ...} objects
        if (Array.isArray(sat)) {
            // Format: [svId, {reports, beams}]
            const [svId, data] = sat;
            satellites.set(svId, {
                reports: data.reports || [],
                beams: new Set(data.beams || [])
            });
        } else {
            // Format: {svId, reports, beams}
            satellites.set(sat.svId, {
                reports: sat.reports || [],
                beams: new Set(sat.beams || [])
            });
        }
    }
    return satellites;
}

/**
 * Update location input fields
 * @param {Object} location - Location with lat/lon
 */
function updateLocationInputs(location) {
    if (!location) return;

    const latInput = document.getElementById('latInput');
    const lonInput = document.getElementById('lonInput');

    if (latInput) latInput.value = location.lat;
    if (lonInput) lonInput.value = location.lon;
}

/**
 * Set up file input handler for loading sessions
 */
export function setupSessionFileInput() {
    const fileInput = document.getElementById('sessionFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                loadSession(file);
                e.target.value = ''; // Reset for re-selection
            }
        });
    }
}
