/**
 * Simple pub/sub event bus for cross-module communication
 */

class EventBus {
    constructor() {
        this._handlers = new Map();
    }

    /**
     * Subscribe to an event
     * @param {string} event - Event name
     * @param {Function} handler - Callback function
     * @returns {Function} Unsubscribe function
     */
    on(event, handler) {
        if (!this._handlers.has(event)) {
            this._handlers.set(event, new Set());
        }
        this._handlers.get(event).add(handler);

        // Return unsubscribe function
        return () => this._handlers.get(event).delete(handler);
    }

    /**
     * Subscribe to an event once
     * @param {string} event - Event name
     * @param {Function} handler - Callback function
     */
    once(event, handler) {
        const unsubscribe = this.on(event, (data) => {
            unsubscribe();
            handler(data);
        });
    }

    /**
     * Emit an event
     * @param {string} event - Event name
     * @param {*} data - Data to pass to handlers
     */
    emit(event, data) {
        this._handlers.get(event)?.forEach(handler => {
            try {
                handler(data);
            } catch (error) {
                console.error(`Error in event handler for "${event}":`, error);
            }
        });
    }

    /**
     * Remove all handlers for an event (or all events if no event specified)
     * @param {string} [event] - Event name
     */
    off(event) {
        if (event) {
            this._handlers.delete(event);
        } else {
            this._handlers.clear();
        }
    }
}

// Singleton instance
export const events = new EventBus();

// Event type constants for documentation and autocomplete
export const EVENT_TYPES = Object.freeze({
    // Serial connection events
    SERIAL_CONNECTED: 'serial:connected',
    SERIAL_DISCONNECTED: 'serial:disconnected',
    SERIAL_ERROR: 'serial:error',
    SERIAL_LINE: 'serial:line',

    // Modem events
    MODEM_READY: 'modem:ready',
    MODEM_CIER_STARTED: 'modem:cier_started',
    MODEM_CIER_STOPPED: 'modem:cier_stopped',

    // Data events (parsed CIEV indicators)
    DATA_RSSI: 'data:rssi',
    DATA_SERVICE: 'data:service',
    DATA_ANTENNA_FAULT: 'data:antenna_fault',
    DATA_SV_BEAM: 'data:sv_beam',

    // Coverage events
    COVERAGE_UPDATED: 'coverage:updated',
    SATELLITE_UPDATED: 'satellite:updated',

    // Assessment events
    ASSESSMENT_UPDATED: 'assessment:updated',

    // Session events
    SESSION_LOADED: 'session:loaded',
    SESSION_SAVED: 'session:saved',
    SESSION_CLEARED: 'session:cleared',

    // TLE events
    TLE_LOADED: 'tle:loaded',
    TLE_CLEARED: 'tle:cleared',
    TLE_PREDICTIONS_UPDATED: 'tle:predictions_updated',

    // Logging events
    LOGGING_STARTED: 'logging:started',
    LOGGING_STOPPED: 'logging:stopped',

    // Location events
    LOCATION_UPDATED: 'location:updated',

    // UI notification events
    TOAST: 'ui:toast',
    TERMINAL_LOG: 'ui:terminal_log'
});
