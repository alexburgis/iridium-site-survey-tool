/**
 * Modem control and CIEV data parsing
 * Handles AT commands, modem initialization, and CIEV message parsing
 */

import { store } from '../state/store.js';
import { events, EVENT_TYPES } from '../utils/events.js';
import { sendCommand } from './serial.js';
import { delay } from '../utils/helpers.js';
import { ecefToElevAz, getCellKey, isInFunctionalRange } from '../processing/coordinates.js';

/**
 * Initialize the modem with basic AT commands
 * @returns {Promise<void>}
 */
export async function initModem() {
    events.emit(EVENT_TYPES.TERMINAL_LOG, { message: 'Initializing modem...', type: 'info' });

    await sendCommand('AT');
    await delay(500);
    await sendCommand('AT+CIER=0');
    await delay(300);
    await sendCommand('AT+CGMM');  // Model
    await delay(300);
    await sendCommand('AT+CGSN');  // Serial number
    await delay(300);
    await sendCommand('AT-MSSTM'); // System time
    await delay(300);

    events.emit(EVENT_TYPES.MODEM_READY);
    events.emit(EVENT_TYPES.TERMINAL_LOG, { message: 'Ready. Click Start to begin survey.', type: 'info' });
}

/**
 * Start CIER (Indicator Event Reporting)
 * Enables all four indicator types
 * @returns {Promise<void>}
 */
export async function startCIER() {
    await sendCommand('AT+CIER=1,1,1,1,1');
    await delay(300);

    store.set('isLogging', true);
    store.set('startTime', Date.now());

    events.emit(EVENT_TYPES.MODEM_CIER_STARTED);
    events.emit(EVENT_TYPES.LOGGING_STARTED);
    events.emit(EVENT_TYPES.TERMINAL_LOG, { message: 'CIER enabled - collecting data', type: 'info' });
}

/**
 * Stop CIER (Indicator Event Reporting)
 * @returns {Promise<void>}
 */
export async function stopCIER() {
    await sendCommand('AT+CIER=0');

    store.set('isLogging', false);

    events.emit(EVENT_TYPES.MODEM_CIER_STOPPED);
    events.emit(EVENT_TYPES.LOGGING_STOPPED);
    events.emit(EVENT_TYPES.TERMINAL_LOG, { message: 'CIER disabled', type: 'info' });
}

/**
 * Toggle logging state
 * @returns {Promise<void>}
 */
export async function toggleLogging() {
    if (store.get('isLogging')) {
        await stopCIER();
    } else {
        await startCIER();
    }
}

/**
 * Process a line received from the serial port
 * @param {string} line - Raw line from modem
 */
export function processLine(line) {
    const timestamp = Date.now();

    // Log to terminal
    events.emit(EVENT_TYPES.TERMINAL_LOG, { message: line, type: 'rx' });

    // Store raw line
    store.update('rawLines', lines => [...lines, { timestamp, line }]);

    // Parse CIEV messages
    if (line.startsWith('+CIEV:')) {
        parseCIEV(line, timestamp);
    }
}

/**
 * Parse a +CIEV unsolicited response
 * @param {string} line - CIEV line
 * @param {number} timestamp - Timestamp when received
 */
function parseCIEV(line, timestamp) {
    const match = line.match(/\+CIEV:(\d+),(.+)/);
    if (!match) return;

    const indicator = parseInt(match[1]);
    const values = match[2].split(',');

    switch (indicator) {
        case 0:
            parseRSSI(values, timestamp);
            break;
        case 1:
            parseServiceAvailability(values, timestamp);
            break;
        case 2:
            parseAntennaFault(values, timestamp);
            break;
        case 3:
            parseSvBeam(values, timestamp);
            break;
    }
}

/**
 * Parse RSSI (signal strength) indicator
 * @param {string[]} values - Parsed values
 * @param {number} timestamp - Timestamp
 */
function parseRSSI(values, timestamp) {
    const rssi = parseInt(values[0]);
    const report = { timestamp, rssi };

    store.update('rssiReports', reports => [...reports, report]);
    events.emit(EVENT_TYPES.DATA_RSSI, report);
}

/**
 * Parse service availability indicator
 * @param {string[]} values - Parsed values
 * @param {number} timestamp - Timestamp
 */
function parseServiceAvailability(values, timestamp) {
    const available = parseInt(values[0]) === 1;
    const event = { timestamp, available };

    store.update('serviceEvents', events => [...events, event]);
    store.set('serviceState', { available, lastChange: timestamp });
    events.emit(EVENT_TYPES.DATA_SERVICE, event);
}

/**
 * Parse antenna fault indicator
 * @param {string[]} values - Parsed values
 * @param {number} timestamp - Timestamp
 */
function parseAntennaFault(values, timestamp) {
    const fault = parseInt(values[0]) === 1;

    if (fault) {
        console.warn('Antenna fault detected!');
        events.emit(EVENT_TYPES.DATA_ANTENNA_FAULT, { timestamp, fault });
        events.emit(EVENT_TYPES.TOAST, { message: 'Antenna fault detected!', type: 'error' });
    }
}

/**
 * Parse SV/Beam position indicator
 * @param {string[]} values - Parsed values
 * @param {number} timestamp - Timestamp
 */
function parseSvBeam(values, timestamp) {
    if (values.length < 6) return;

    const svId = parseInt(values[0]);
    const beamId = parseInt(values[1]);
    const svBm = parseInt(values[2]);
    const x = parseInt(values[3]);
    const y = parseInt(values[4]);
    const z = parseInt(values[5]);

    // Only process SV positions (not beam landings)
    if (svBm !== 1) return;

    const observer = store.get('observer');
    const { elevation, azimuth } = ecefToElevAz(x, y, z, observer);

    const report = { timestamp, svId, beamId, x, y, z, elevation, azimuth };

    // Add to reports
    store.update('svBeamReports', reports => [...reports, report]);

    // Update coverage grid for functional elevation
    if (isInFunctionalRange(elevation)) {
        const cellKey = getCellKey(azimuth, elevation);
        if (cellKey) {
            store.update('coverageGrid', grid => {
                const cell = grid[cellKey];
                const newSatellites = new Set(cell.satellites);
                newSatellites.add(svId);
                return {
                    ...grid,
                    [cellKey]: {
                        count: cell.count + 1,
                        satellites: newSatellites
                    }
                };
            });
        }
    }

    // Update satellite tracking
    store.update('satellites', satellites => {
        const newSatellites = new Map(satellites);
        if (!newSatellites.has(svId)) {
            newSatellites.set(svId, {
                reports: [],
                beams: new Set()
            });
        }
        const sat = newSatellites.get(svId);
        sat.reports.push({ timestamp, elevation, azimuth, beamId });
        sat.beams.add(beamId);
        return newSatellites;
    });

    // Set latest ping for flash effect
    store.set('latestPing', { elevation, azimuth, timestamp: Date.now() });

    // Emit event for UI updates
    events.emit(EVENT_TYPES.DATA_SV_BEAM, report);
}

/**
 * Set up event listener for serial lines
 */
export function setupLineProcessor() {
    events.on(EVENT_TYPES.SERIAL_LINE, ({ line }) => {
        processLine(line);
    });
}
