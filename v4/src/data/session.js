/**
 * Session save/load functionality
 * Handles persisting survey data to files
 */

import { CONFIG } from '../config.js';
import { store, createEmptyCoverageGrid, createInitialState } from '../state/store.js';
import { events, EVENT_TYPES } from '../utils/events.js';
import { downloadFile } from '../utils/helpers.js';
import { calculateServiceUptime } from '../processing/assessment.js';
import { ecefToElevAz } from '../processing/coordinates.js';

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

/**
 * Import a CIER log file from external logger
 * Format: [YYYY-MM-DD HH:MM:SS.mmm] +CIEV:<data>
 * @param {File} file - Log file to import
 * @returns {Promise<void>}
 */
export async function importLogFile(file) {
    try {
        const text = await file.text();
        const lines = text.split('\n');

        const observer = store.get('observer');
        let svBeamReports = store.get('svBeamReports');
        let rssiReports = store.get('rssiReports');
        let serviceEvents = store.get('serviceEvents');
        let satellites = store.get('satellites');
        let coverageGrid = store.get('coverageGrid');

        let importedSvReports = 0;
        let importedRssi = 0;
        let importedService = 0;
        let firstTimestamp = null;
        let lastTimestamp = null;

        for (const line of lines) {
            // Skip comments and empty lines
            if (!line.trim() || line.startsWith('#')) continue;

            // Parse timestamp and CIEV data
            // Format: [2025-12-17 09:26:36.663] +CIEV:0,3
            const match = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\]\s*\+CIEV:(.+)$/);
            if (!match) continue;

            const [, timestampStr, cievData] = match;
            const timestamp = new Date(timestampStr.replace(' ', 'T') + 'Z').getTime();

            if (!firstTimestamp) firstTimestamp = timestamp;
            lastTimestamp = timestamp;

            const parts = cievData.split(',');
            const indicator = parseInt(parts[0], 10);

            switch (indicator) {
                case 0: // Signal strength (RSSI)
                    const rssi = parseInt(parts[1], 10);
                    if (!isNaN(rssi)) {
                        rssiReports.push({ timestamp, rssi });
                        importedRssi++;
                    }
                    break;

                case 1: // Service availability
                    const available = parts[1] === '1';
                    serviceEvents.push({ timestamp, available });
                    importedService++;
                    break;

                case 2: // Antenna fault - ignore for now
                    break;

                case 3: // Satellite position data
                    // Format: +CIEV:3,<svId>,<beamId>,<svBm>,<x>,<y>,<z>
                    // svBm=1 means satellite position, svBm=0 means beam landing
                    if (parts.length >= 7) {
                        const svId = parseInt(parts[1], 10);
                        const beamId = parseInt(parts[2], 10);
                        const svBm = parseInt(parts[3], 10);
                        const x = parseInt(parts[4], 10);
                        const y = parseInt(parts[5], 10);
                        const z = parseInt(parts[6], 10);

                        // Only process satellite positions (svBm=1), not beam landings
                        if (svBm !== 1) continue;

                        // Convert ECEF to Az/El
                        const { azimuth, elevation } = ecefToElevAz(x, y, z, observer);

                        // Skip below-horizon observations
                        if (elevation < 0) continue;

                        const report = {
                            timestamp,
                            svId,
                            beamId,
                            x, y, z,
                            azimuth,
                            elevation
                        };

                        svBeamReports.push(report);
                        importedSvReports++;

                        // Update satellites map
                        if (!satellites.has(svId)) {
                            satellites.set(svId, { reports: [], beams: new Set() });
                        }
                        const sat = satellites.get(svId);
                        sat.reports.push(report);
                        sat.beams.add(beamId);

                        // Update coverage grid
                        const azIdx = Math.floor(((azimuth + 22.5) % 360) / 45);
                        const elIdx = CONFIG.elevationBands.findIndex(b => elevation >= b.min && elevation < b.max);
                        if (elIdx >= 0) {
                            const key = `${azIdx}_${elIdx}`;
                            if (coverageGrid[key]) {
                                coverageGrid[key].count++;
                                coverageGrid[key].satellites.add(svId);
                            }
                        }
                    }
                    break;
            }
        }

        // Update store
        store.set('svBeamReports', svBeamReports);
        store.set('rssiReports', rssiReports);
        store.set('serviceEvents', serviceEvents);
        store.set('satellites', satellites);
        store.set('coverageGrid', coverageGrid);

        // Set duration from log timestamps
        if (firstTimestamp && lastTimestamp) {
            const logDuration = lastTimestamp - firstTimestamp;
            const existingDuration = store.get('loadedDuration') || 0;
            store.set('loadedDuration', existingDuration + logDuration);
        }

        events.emit(EVENT_TYPES.SESSION_LOADED);
        events.emit(EVENT_TYPES.TOAST, {
            message: `Imported ${importedSvReports} observations, ${importedRssi} RSSI, ${importedService} service events`,
            type: 'success'
        });
        events.emit(EVENT_TYPES.TERMINAL_LOG, {
            message: `Log import complete: ${importedSvReports} SV reports from ${file.name}`,
            type: 'info'
        });

    } catch (error) {
        console.error('Failed to import log file:', error);
        events.emit(EVENT_TYPES.TOAST, { message: `Import failed: ${error.message}`, type: 'error' });
    }
}

/**
 * Set up file input handler for importing log files
 */
export function setupLogFileInput() {
    const fileInput = document.getElementById('logFileInput');
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                importLogFile(file);
                e.target.value = ''; // Reset for re-selection
            }
        });
    }
}
