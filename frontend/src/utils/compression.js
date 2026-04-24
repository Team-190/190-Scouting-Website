/**
 * Compression utilities for reducing IndexedDB storage size.
 * Uses gzip compression (pako) for maximum compression ratio.
 * Fallback to base64 encoding for uncompressed data.
 */

import pako from 'pako';

const COMPRESSION_PROTOCOL =
    typeof __RUNTIME_COMPRESSION__ === 'object' && __RUNTIME_COMPRESSION__
        ? __RUNTIME_COMPRESSION__
        : { envelopeFlag: '__compressed', version: 2 };

const ENVELOPE_FLAG = COMPRESSION_PROTOCOL.envelopeFlag || '__compressed';
const ENVELOPE_VERSION = Number(COMPRESSION_PROTOCOL.version || 2);

function toBase64Url(base64) {
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(base64Url) {
    const normalized = String(base64Url || '').replace(/-/g, '+').replace(/_/g, '/');
    const padLength = (4 - (normalized.length % 4)) % 4;
    return normalized + '='.repeat(padLength);
}

export function getCompressionProtocol() {
    return {
        envelopeFlag: ENVELOPE_FLAG,
        version: ENVELOPE_VERSION,
    };
}

export function isCompressedEnvelope(value) {
    if (!value || typeof value !== 'object') return false;
    return value[ENVELOPE_FLAG] === true || value.__compressed === true || value.compressed === true;
}

/**
 * Compress a JSON object using gzip compression for much better ratios
 * @param {any} obj - The object to compress
 * @returns {any} Compressed object with __compressed flag and version
 */
export function compressData(obj) {
    try {
        const json = JSON.stringify(obj);
        
        // Use gzip compression via pako
        const encoded = new TextEncoder().encode(json);
        const compressed = pako.gzip(encoded);
        
        // Convert to base64 for storage in IndexedDB
        let binaryString = '';
        for (let i = 0; i < compressed.length; i++) {
            binaryString += String.fromCharCode(compressed[i]);
        }
        const base64 = btoa(binaryString);
        const base64Url = toBase64Url(base64);
        
        // Mark as compressed with version for future algorithm changes
        return {
            [ENVELOPE_FLAG]: true,
            __version: ENVELOPE_VERSION,
            data: base64Url
        };
    } catch (error) {
        console.warn("Compression failed, storing uncompressed:", error);
        return obj;
    }
}

/**
 * Decompress data back to original JSON object
 * Supports multiple compression versions for backward compatibility
 * @param {any} value - The potentially compressed value
 * @returns {any} Decompressed object or original value if not compressed
 */
export function decompressData(value) {
    try {
        // Check if it's actually compressed
        if (!isCompressedEnvelope(value)) {
            return value;
        }
        
        // Decode from base64
        const binaryString = atob(fromBase64Url(value.data));
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Handle different compression versions
        const version = Number(value.__version || 1);
        
        if (version === 2) {
            // Gzip decompression (current version)
            const decompressed = pako.ungzip(bytes);
            const json = new TextDecoder().decode(decompressed);
            return JSON.parse(json);
        } else {
            // Version 1: Simple base64 (legacy fallback)
            const json = new TextDecoder().decode(bytes);
            return JSON.parse(json);
        }
    } catch (error) {
        console.warn("Decompression failed:", error);
        return value;
    }
}

/**
 * Get compression statistics for a data object
 * Useful for monitoring compression effectiveness
 * @param {any} obj - The object to analyze
 * @returns {Object|null} Statistics object with original and compressed sizes
 */
export function getCompressionStats(obj) {
    try {
        const originalJson = JSON.stringify(obj);
        const originalSize = new Blob([originalJson]).size;
        
        const compressed = compressData(obj);
        const compressedJson = JSON.stringify(compressed);
        const compressedSize = new Blob([compressedJson]).size;
        
        const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);
        
        return {
            originalSize,
            compressedSize,
            ratio: `${ratio}%`,
            saved: originalSize - compressedSize
        };
    } catch (error) {
        console.warn("Failed to calculate compression stats:", error);
        return /** @type {any} */ (null);
    }
}

