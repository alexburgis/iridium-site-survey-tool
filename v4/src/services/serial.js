/**
 * Web Serial API connection management
 * Handles port connection, reading, and writing
 */

import { CONFIG } from '../config.js';
import { store } from '../state/store.js';
import { events, EVENT_TYPES } from '../utils/events.js';

let readLoopActive = false;

/**
 * Request and open a serial port connection
 * @returns {Promise<boolean>} True if connection successful
 */
export async function connect() {
    try {
        const port = await navigator.serial.requestPort();
        await port.open({ baudRate: CONFIG.serial.baudRate });

        const writer = port.writable.getWriter();
        const reader = port.readable.getReader();

        store.set('port', port);
        store.set('writer', writer);
        store.set('reader', reader);
        store.set('isConnected', true);

        events.emit(EVENT_TYPES.SERIAL_CONNECTED);
        events.emit(EVENT_TYPES.TERMINAL_LOG, { message: 'Connected to serial port', type: 'info' });
        events.emit(EVENT_TYPES.TOAST, { message: 'Connected', type: 'success' });

        // Start reading loop
        startReadLoop();

        return true;
    } catch (error) {
        events.emit(EVENT_TYPES.SERIAL_ERROR, { error });
        events.emit(EVENT_TYPES.TERMINAL_LOG, { message: `Connection error: ${error.message}`, type: 'error' });
        events.emit(EVENT_TYPES.TOAST, { message: 'Connection failed', type: 'error' });
        return false;
    }
}

/**
 * Close the serial port connection
 * @returns {Promise<void>}
 */
export async function disconnect() {
    const writer = store.get('writer');
    const reader = store.get('reader');
    const port = store.get('port');
    const isLogging = store.get('isLogging');

    // Stop CIER if logging
    if (isLogging) {
        try {
            await sendCommand('AT+CIER=0');
        } catch (e) {
            // Ignore errors when stopping
        }
    }

    store.set('isLogging', false);
    readLoopActive = false;

    // Clean up serial resources
    try {
        if (reader) {
            await reader.cancel();
            reader.releaseLock();
        }
        if (writer) {
            writer.releaseLock();
        }
        if (port) {
            await port.close();
        }
    } catch (e) {
        // Ignore cleanup errors
    }

    store.set('port', null);
    store.set('reader', null);
    store.set('writer', null);
    store.set('isConnected', false);

    events.emit(EVENT_TYPES.SERIAL_DISCONNECTED);
    events.emit(EVENT_TYPES.TERMINAL_LOG, { message: 'Disconnected', type: 'info' });
}

/**
 * Toggle connection state
 * @returns {Promise<void>}
 */
export async function toggleConnection() {
    if (store.get('isConnected')) {
        await disconnect();
    } else {
        await connect();
    }
}

/**
 * Send a command to the modem
 * @param {string} command - AT command to send
 * @returns {Promise<void>}
 */
export async function sendCommand(command) {
    const writer = store.get('writer');
    if (!writer) return;

    await writer.write(new TextEncoder().encode(command + '\r'));
    events.emit(EVENT_TYPES.TERMINAL_LOG, { message: `> ${command}`, type: 'tx' });
}

/**
 * Start the serial read loop
 * Emits SERIAL_LINE events for each complete line received
 */
async function startReadLoop() {
    readLoopActive = true;
    let buffer = '';

    while (readLoopActive && store.get('isConnected')) {
        const reader = store.get('reader');
        if (!reader) break;

        try {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += new TextDecoder().decode(value);
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep incomplete line in buffer

            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed) {
                    events.emit(EVENT_TYPES.SERIAL_LINE, { line: trimmed });
                }
            }
        } catch (error) {
            if (error.name !== 'NetworkError') {
                console.error('Read error:', error);
            }
            break;
        }
    }
}

/**
 * Check if Web Serial API is supported
 * @returns {boolean} True if supported
 */
export function isSerialSupported() {
    return 'serial' in navigator;
}
