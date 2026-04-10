/**
 * Compression utilities for reducing IndexedDB storage size.
 * Uses gzip compression (pako) for maximum compression ratio.
 * Fallback to base64 encoding for uncompressed data.
 */

import pako from 'pako';

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
        
        // Mark as compressed with version for future algorithm changes
        return {
            __compressed: true,
            __version: 2, // Version 2 = gzip compression
            data: base64
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
        if (!value || typeof value !== 'object' || !value.__compressed) {
            return value;
        }
        
        // Decode from base64
        const binaryString = atob(value.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Handle different compression versions
        const version = value.__version || 1;
        
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

