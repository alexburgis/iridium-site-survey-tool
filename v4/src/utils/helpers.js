/**
 * Utility helper functions
 */

/**
 * Promise-based delay
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Download a file to the user's computer
 * @param {string} content - File content
 * @param {string} filename - Suggested filename
 * @param {string} mimeType - MIME type (e.g., 'text/csv', 'application/json')
 */
export function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Format duration in milliseconds to HH:MM:SS string (matching v3)
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted string like "02:30:15"
 */
export function formatDuration(ms) {
    const totalMs = ms || 0;
    const h = Math.floor(totalMs / 3600000);
    const m = Math.floor((totalMs % 3600000) / 60000);
    const s = Math.floor((totalMs % 60000) / 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/**
 * Format a timestamp as ISO date string
 * @param {number} timestamp - Unix timestamp in milliseconds
 * @returns {string} ISO date string
 */
export function formatTimestamp(timestamp) {
    return new Date(timestamp).toISOString();
}

/**
 * Generate consistent HSL color for a satellite ID
 * Uses golden ratio to spread colors evenly across hue spectrum
 * @param {number} svId - Satellite vehicle ID
 * @returns {string} HSL color string
 */
export function getSvColor(svId) {
    const hue = (svId * 137.508) % 360;
    return `hsl(${hue}, 70%, 55%)`;
}

/**
 * Clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Deep freeze an object (recursive Object.freeze)
 * @param {Object} obj - Object to freeze
 * @returns {Object} Frozen object
 */
export function deepFreeze(obj) {
    Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
            deepFreeze(obj[key]);
        }
    });
    return Object.freeze(obj);
}

/**
 * Generate a simple unique ID
 * @returns {string} Unique ID string
 */
export function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}
