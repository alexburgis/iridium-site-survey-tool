/**
 * Geolocation service
 * Handles browser GPS and manual location updates
 */

import { CONFIG } from '../config.js';
import { store } from '../state/store.js';
import { events, EVENT_TYPES } from '../utils/events.js';

/**
 * Update observer location from input values
 * @param {number} lat - Latitude in degrees
 * @param {number} lon - Longitude in degrees
 */
export function updateLocation(lat, lon) {
    // Validate
    if (isNaN(lat) || isNaN(lon)) {
        events.emit(EVENT_TYPES.TOAST, { message: 'Invalid coordinates', type: 'error' });
        return;
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        events.emit(EVENT_TYPES.TOAST, { message: 'Coordinates out of range', type: 'error' });
        return;
    }

    store.set('observer', { lat, lon });
    events.emit(EVENT_TYPES.LOCATION_UPDATED, { lat, lon });
    events.emit(EVENT_TYPES.TOAST, { message: 'Location updated', type: 'success' });
}

/**
 * Get location from browser GPS
 * @returns {Promise<{lat: number, lon: number}>}
 */
export function useGPSLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            events.emit(EVENT_TYPES.TOAST, { message: 'Geolocation not supported', type: 'error' });
            reject(new Error('Geolocation not supported'));
            return;
        }

        events.emit(EVENT_TYPES.TOAST, { message: 'Getting GPS location...', type: 'info' });

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;

                store.set('observer', { lat, lon });

                // Update input fields
                updateLocationInputs(lat, lon);

                events.emit(EVENT_TYPES.LOCATION_UPDATED, { lat, lon });
                events.emit(EVENT_TYPES.TOAST, { message: 'GPS location set', type: 'success' });

                resolve({ lat, lon });
            },
            (error) => {
                let message = 'Failed to get location';
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        message = 'Location permission denied';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        message = 'Location unavailable';
                        break;
                    case error.TIMEOUT:
                        message = 'Location request timed out';
                        break;
                }

                events.emit(EVENT_TYPES.TOAST, { message, type: 'error' });
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}

/**
 * Update location input fields in the DOM
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 */
function updateLocationInputs(lat, lon) {
    const latInput = document.getElementById('inputLat');
    const lonInput = document.getElementById('inputLon');

    if (latInput) latInput.value = lat.toFixed(6);
    if (lonInput) lonInput.value = lon.toFixed(6);
}

/**
 * Get current observer location
 * @returns {{lat: number, lon: number}} Current location
 */
export function getLocation() {
    return store.get('observer');
}

/**
 * Reset to default location
 */
export function resetToDefaultLocation() {
    store.set('observer', { ...CONFIG.defaultLocation });
    updateLocationInputs(CONFIG.defaultLocation.lat, CONFIG.defaultLocation.lon);
    events.emit(EVENT_TYPES.LOCATION_UPDATED, CONFIG.defaultLocation);
}

/**
 * Set up location input handlers
 */
export function setupLocationInputs() {
    const latInput = document.getElementById('inputLat');
    const lonInput = document.getElementById('inputLon');
    const setLocationBtn = document.getElementById('setLocationBtn');
    const gpsBtn = document.getElementById('gpsBtn');

    // Initialize with current observer location
    const observer = store.get('observer');
    if (latInput) latInput.value = observer.lat;
    if (lonInput) lonInput.value = observer.lon;

    // Location set button handler
    const handleLocationChange = () => {
        const lat = parseFloat(latInput?.value);
        const lon = parseFloat(lonInput?.value);
        if (!isNaN(lat) && !isNaN(lon)) {
            updateLocation(lat, lon);
        }
    };

    // Set button click
    setLocationBtn?.addEventListener('click', handleLocationChange);

    // Also update on input change (pressing Enter or blur)
    latInput?.addEventListener('change', handleLocationChange);
    lonInput?.addEventListener('change', handleLocationChange);

    // GPS button handler
    gpsBtn?.addEventListener('click', () => {
        useGPSLocation();
    });
}
