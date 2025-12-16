/**
 * Coordinate conversion functions
 * Pure functions for converting between coordinate systems
 */

import { CONFIG } from '../config.js';

const EARTH_RADIUS_KM = 6378.137;

/**
 * Convert ECEF (Earth-Centered Earth-Fixed) coordinates to local elevation and azimuth
 * @param {number} x - ECEF X coordinate (km)
 * @param {number} y - ECEF Y coordinate (km)
 * @param {number} z - ECEF Z coordinate (km)
 * @param {{lat: number, lon: number}} observer - Observer position in degrees
 * @returns {{elevation: number, azimuth: number}} Local coordinates in degrees
 */
export function ecefToElevAz(x, y, z, observer) {
    const latRad = observer.lat * Math.PI / 180;
    const lonRad = observer.lon * Math.PI / 180;

    // Observer position in ECEF
    const obsX = EARTH_RADIUS_KM * Math.cos(latRad) * Math.cos(lonRad);
    const obsY = EARTH_RADIUS_KM * Math.cos(latRad) * Math.sin(lonRad);
    const obsZ = EARTH_RADIUS_KM * Math.sin(latRad);

    // Vector from observer to satellite
    const dx = x - obsX;
    const dy = y - obsY;
    const dz = z - obsZ;

    // Transform to local ENU (East-North-Up) coordinates
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const sinLon = Math.sin(lonRad);
    const cosLon = Math.cos(lonRad);

    const east = -sinLon * dx + cosLon * dy;
    const north = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
    const up = cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;

    // Calculate elevation and azimuth
    const horizontalDist = Math.sqrt(east * east + north * north);
    let elevation = Math.atan2(up, horizontalDist) * 180 / Math.PI;
    let azimuth = Math.atan2(east, north) * 180 / Math.PI;

    // Normalize azimuth to 0-360
    if (azimuth < 0) azimuth += 360;

    return {
        elevation: Math.max(0, elevation),
        azimuth
    };
}

/**
 * Get azimuth sector index (0-7) for compass direction
 * N: 337.5-22.5, NE: 22.5-67.5, E: 67.5-112.5, etc.
 * @param {number} azimuth - Azimuth in degrees (0-360)
 * @returns {number} Sector index (0=N, 1=NE, 2=E, ...)
 */
export function getAzimuthIndex(azimuth) {
    const normalized = (azimuth + 22.5) % 360;
    return Math.floor(normalized / 45);
}

/**
 * Get elevation band index for the elevation angle
 * @param {number} elevation - Elevation in degrees
 * @returns {number} Band index (0 = lowest band), or -1 if below minimum
 */
export function getElevationIndex(elevation) {
    for (let i = 0; i < CONFIG.elevationBands.length; i++) {
        const band = CONFIG.elevationBands[i];
        if (elevation >= band.min && elevation < band.max) {
            return i;
        }
    }
    // Handle edge case of exactly 90°
    if (elevation >= 90) {
        return CONFIG.elevationBands.length - 1;
    }
    return -1; // Below minimum elevation
}

/**
 * Get the grid cell key for a given azimuth and elevation
 * @param {number} azimuth - Azimuth in degrees
 * @param {number} elevation - Elevation in degrees
 * @returns {string|null} Cell key like "0_2", or null if invalid
 */
export function getCellKey(azimuth, elevation) {
    const azIdx = getAzimuthIndex(azimuth);
    const elIdx = getElevationIndex(elevation);

    if (elIdx < 0) return null;

    return `${azIdx}_${elIdx}`;
}

/**
 * Convert polar sky coordinates to canvas pixel coordinates
 * @param {number} elevation - Elevation in degrees (0-90)
 * @param {number} azimuth - Azimuth in degrees (0-360)
 * @param {number} canvasSize - Canvas width/height in pixels
 * @param {number} margin - Margin from edge in pixels
 * @returns {{x: number, y: number}} Canvas coordinates
 */
export function skyToCanvas(elevation, azimuth, canvasSize, margin = 25) {
    const center = canvasSize / 2;
    const maxRadius = center - margin;

    // Scale so 0° elevation = edge, 90° = center
    const r = maxRadius * (90 - elevation) / 90;

    // Convert azimuth to radians (0° = north = up)
    const azRad = azimuth * Math.PI / 180;

    return {
        x: center + r * Math.sin(azRad),
        y: center - r * Math.cos(azRad)
    };
}

/**
 * Check if an elevation is within Iridium's functional range
 * @param {number} elevation - Elevation in degrees
 * @returns {boolean} True if >= minimum functional elevation
 */
export function isInFunctionalRange(elevation) {
    return elevation >= CONFIG.minFunctionalElevation;
}
