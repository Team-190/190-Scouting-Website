/**
 * Decompression utilities for handling compressed data from the frontend
 * Matches the compression protocol used in frontend/src/utils/compression.js
 */

const pako = require('pako');

const ENVELOPE_FLAG = '__compressed';
const ENVELOPE_VERSION = 2;

/**
 * Check if a value is a compressed envelope
 * @param {any} value - The value to check
 * @returns {boolean} Whether the value is a compressed envelope
 */
function isCompressedEnvelope(value) {
    if (!value || typeof value !== 'object') return false;
    return value[ENVELOPE_FLAG] === true || value.__compressed === true;
}

/**
 * Decompress data from the frontend's compression format
 * @param {any} value - The potentially compressed value
 * @returns {any} Decompressed object or original value if not compressed
 */
function decompressData(value) {
    try {
        // Check if it's actually compressed
        if (!isCompressedEnvelope(value)) {
            return value;
        }

        if (!value.data) {
            console.warn('Compressed envelope missing data field');
            return value;
        }

        // Decode from base64
        const binaryString = Buffer.from(value.data, 'base64').toString('binary');
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Handle different compression versions
        const version = Number(value.__version || 1);

        if (version === 2) {
            // Gzip decompression (current version)
            const decompressed = pako.ungzip(bytes);
            const json = Buffer.from(decompressed).toString('utf-8');
            return JSON.parse(json);
        } else {
            // Version 1: Simple base64 (legacy fallback)
            const json = Buffer.from(bytes).toString('utf-8');
            return JSON.parse(json);
        }
    } catch (error) {
        console.warn('Decompression failed:', error);
        return value;
    }
}

module.exports = {
    isCompressedEnvelope,
    decompressData,
};
