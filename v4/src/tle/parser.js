/**
 * TLE (Two-Line Element) parsing
 * Uses satellite.js for orbital calculations
 */

import { store } from '../state/store.js';
import { events, EVENT_TYPES } from '../utils/events.js';

// CelesTrak URL for Iridium NEXT TLEs
const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=iridium-NEXT&FORMAT=tle';

/**
 * Fetch TLEs from CelesTrak
 * @returns {Promise<string>} TLE text data
 */
export async function fetchTLEs() {
    try {
        const response = await fetch(TLE_URL);
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        const text = await response.text();
        events.emit(EVENT_TYPES.TOAST, { message: 'TLEs fetched', type: 'success' });
        return text;
    } catch (error) {
        console.error('Failed to fetch TLEs:', error);
        events.emit(EVENT_TYPES.TOAST, { message: `Failed to fetch TLEs: ${error.message}`, type: 'error' });
        throw error;
    }
}

/**
 * Parse TLE text data into satellite records
 * @param {string} tleText - Raw TLE text (3-line format)
 * @returns {Array} Array of {name, satrec} objects
 */
export function parseTLEs(tleText) {
    // Requires satellite.js to be loaded globally
    if (typeof satellite === 'undefined') {
        console.error('satellite.js not loaded');
        events.emit(EVENT_TYPES.TOAST, { message: 'satellite.js not available', type: 'error' });
        return [];
    }

    const lines = tleText.split('\n').map(l => l.trim()).filter(l => l);
    const satellites = [];

    for (let i = 0; i < lines.length - 2; i++) {
        // Look for TLE format: name line, then lines starting with '1 ' and '2 '
        if (lines[i + 1].startsWith('1 ') && lines[i + 2].startsWith('2 ')) {
            try {
                const name = lines[i];
                const line1 = lines[i + 1];
                const line2 = lines[i + 2];

                const satrec = satellite.twoline2satrec(line1, line2);

                if (satrec) {
                    satellites.push({ name, satrec });
                }

                i += 2; // Skip to next set
            } catch (e) {
                console.warn('Failed to parse TLE:', e);
            }
        }
    }

    return satellites;
}

/**
 * Load and parse TLEs, store in state
 * @param {string} tleText - Raw TLE text
 */
export function loadTLEs(tleText) {
    const satellites = parseTLEs(tleText);

    if (satellites.length === 0) {
        events.emit(EVENT_TYPES.TOAST, { message: 'No valid TLEs found', type: 'error' });
        return;
    }

    store.set('tleData', satellites);
    events.emit(EVENT_TYPES.TLE_LOADED, { count: satellites.length });
    events.emit(EVENT_TYPES.TOAST, { message: `Loaded ${satellites.length} satellite TLEs`, type: 'success' });
    events.emit(EVENT_TYPES.TERMINAL_LOG, {
        message: `Loaded TLEs for ${satellites.length} Iridium satellites`,
        type: 'info'
    });
}

/**
 * Clear loaded TLEs
 */
export function clearTLEs() {
    store.set('tleData', []);
    events.emit(EVENT_TYPES.TLE_CLEARED);
    events.emit(EVENT_TYPES.TOAST, { message: 'TLEs cleared', type: 'info' });
}

/**
 * Get count of loaded TLEs
 * @returns {number} Number of loaded satellite TLEs
 */
export function getTLECount() {
    const tleData = store.get('tleData');
    return tleData ? tleData.length : 0;
}
