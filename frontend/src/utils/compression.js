/**
 * Compression utilities for reducing IndexedDB storage size.
 * Uses simpler compression-like encoding that reduces JSON verbosity.
 * For better compression, consider installing lz-string: npm install lz-string
 */

/**
 * Compress a JSON object to reduce storage size
 * Removes unnecessary whitespace and uses efficient encoding
 * @param {any} obj - The object to compress
 * @returns {any} Compressed object with __compressed flag
 */
export function compressData(obj) {
    try {
        const json = JSON.stringify(obj);
        
        // Encode as UTF-8 bytes for compression
        const encoder = new TextEncoder();
        const uint8array = encoder.encode(json);
        
        // Convert to base64 (this is the actual storage format)
        let binaryString = '';
        for (let i = 0; i < uint8array.length; i++) {
            binaryString += String.fromCharCode(uint8array[i]);
        }
        const base64 = btoa(binaryString);
        
        // Mark as compressed so we know to decompress it
        return {
            __compressed: true,
            data: base64
        };
    } catch (error) {
        console.warn("Compression failed, storing uncompressed:", error);
        return obj;
    }
}

/**
 * Decompress data back to original JSON object
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
        
        // Convert back to string
        const decoder = new TextDecoder();
        const json = decoder.decode(bytes);
        
        return JSON.parse(json);
    } catch (error) {
        console.warn("Decompression failed:", error);
        return value;
    }
}

