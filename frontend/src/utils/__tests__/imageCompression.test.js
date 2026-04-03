import { describe, it, expect } from 'vitest';
import { getBase64Size, formatBytes } from '../imageCompression';

describe('Image Compression Utils', () => {
    describe('getBase64Size', () => {
        it('should calculate size as 0 for an empty string', () => {
            expect(getBase64Size('')).toBe(0);
        });

        it('should accurately calculate size for a short base64 string', () => {
            // "SGVsbG8=" is "Hello" in base64. 8 chars. (8 * 3) / 4 = 6
            expect(getBase64Size('SGVsbG8=')).toBe(6);
        });
        
        it('should calculate correctly for a string length not perfectly divisible', () => {
           expect(getBase64Size('abcde')).toBe(4); // ceil((5*3)/4) = ceil(3.75) = 4
        });
    });

    describe('formatBytes', () => {
        it('should return "0 Bytes" for 0', () => {
            expect(formatBytes(0)).toBe('0 Bytes');
        });

        it('should format bytes properly', () => {
             expect(formatBytes(500)).toBe('500 Bytes');
        });

        it('should format KB properly', () => {
             // 1024 bytes = 1 KB
             expect(formatBytes(1024)).toBe('1 KB');
             // 1500 bytes = ~1.46 KB
             expect(formatBytes(1500)).toBe('1.46 KB');
        });

        it('should format MB properly', () => {
             // 1024 * 1024 = 1048576 = 1 MB
             expect(formatBytes(1048576)).toBe('1 MB');
             // 2500000 = ~2.38 MB
             expect(formatBytes(2500000)).toBe('2.38 MB');
        });
    });
});
