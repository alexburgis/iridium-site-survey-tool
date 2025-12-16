/**
 * Centralized reactive state management
 * Simple observable store with subscription support
 */

import { CONFIG } from '../config.js';

/**
 * Create initial empty coverage grid
 * @returns {Object} Coverage grid with all cells initialized
 */
function createEmptyCoverageGrid() {
    const grid = {};
    CONFIG.azimuthSectors.forEach((_, azIdx) => {
        CONFIG.elevationBands.forEach((_, elIdx) => {
            const key = `${azIdx}_${elIdx}`;
            grid[key] = { count: 0, satellites: new Set() };
        });
    });
    return grid;
}

/**
 * Reactive Store class with subscription support
 */
class Store {
    constructor(initialState) {
        this._state = initialState;
        this._listeners = new Map();
    }

    /**
     * Get state value(s)
     * @param {string} [key] - Optional key to get specific value
     * @returns {*} State value or entire state object
     */
    get(key) {
        if (key) {
            return this._state[key];
        }
        return { ...this._state };
    }

    /**
     * Set a state value
     * @param {string} key - State key
     * @param {*} value - New value
     */
    set(key, value) {
        const oldValue = this._state[key];
        this._state[key] = value;
        this._notify(key, value, oldValue);
    }

    /**
     * Update a state value using an updater function
     * @param {string} key - State key
     * @param {Function} updater - Function that receives old value and returns new value
     */
    update(key, updater) {
        const oldValue = this._state[key];
        const newValue = updater(oldValue);
        this._state[key] = newValue;
        this._notify(key, newValue, oldValue);
    }

    /**
     * Subscribe to state changes
     * @param {string} key - State key to watch (use '*' for all changes)
     * @param {Function} callback - Called with (newValue, oldValue) or (key, newValue, oldValue) for '*'
     * @returns {Function} Unsubscribe function
     */
    subscribe(key, callback) {
        if (!this._listeners.has(key)) {
            this._listeners.set(key, new Set());
        }
        this._listeners.get(key).add(callback);

        // Return unsubscribe function
        return () => this._listeners.get(key).delete(callback);
    }

    /**
     * Notify listeners of a state change
     * @private
     */
    _notify(key, newValue, oldValue) {
        // Notify specific key listeners
        this._listeners.get(key)?.forEach(cb => {
            try {
                cb(newValue, oldValue);
            } catch (error) {
                console.error(`Error in store listener for "${key}":`, error);
            }
        });

        // Notify wildcard listeners
        this._listeners.get('*')?.forEach(cb => {
            try {
                cb(key, newValue, oldValue);
            } catch (error) {
                console.error('Error in store wildcard listener:', error);
            }
        });
    }

    /**
     * Reset to initial state
     * @param {Object} [newState] - Optional new initial state
     */
    reset(newState) {
        const keys = Object.keys(this._state);
        if (newState) {
            this._state = newState;
        } else {
            this._state = createInitialState();
        }

        // Notify all listeners
        keys.forEach(key => {
            this._notify(key, this._state[key], undefined);
        });
    }
}

/**
 * Create the initial application state
 * @returns {Object} Initial state
 */
function createInitialState() {
    return {
        // Connection state
        port: null,
        reader: null,
        writer: null,
        isConnected: false,
        isLogging: false,

        // Timing
        startTime: null,
        loadedDuration: 0,
        loadedUptime: 0,
        loadedOutageCount: 0,

        // Observer location
        observer: { ...CONFIG.defaultLocation },

        // Data collections
        rssiReports: [],
        svBeamReports: [],
        satellites: new Map(),
        coverageGrid: createEmptyCoverageGrid(),
        rawLines: [],
        serviceEvents: [],
        serviceState: { available: null, lastChange: null },

        // TLE data
        tleData: [],

        // Latest ping for flash effect
        latestPing: null
    };
}

// Create and export singleton store instance
export const store = new Store(createInitialState());

// Export helper to create fresh coverage grid
export { createEmptyCoverageGrid };

// Export helper to create initial state (useful for session loading)
export { createInitialState };
