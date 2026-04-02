import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    mean,
    median,
    sd,
    percentile,
    lerpColor,
    loadFromStorage,
    saveToStorage,
    getEventCode,
    getColorblindMode,
    METRIC_DISPLAY_NAMES,
    EXCLUDED_FIELDS,
    INVERTED_METRICS,
    BOOLEAN_METRICS,
    COLOR_MODES,
    ELIM_LEVEL_ORDER
} from '../pageUtils';

describe('Page Utils', () => {
    describe('Math Helpers', () => {
        it('mean: should calculate the average', () => {
            expect(mean([1, 2, 3, 4, 5])).toBe(3);
            expect(mean([-2, 2])).toBe(0);
        });

        it('median: should calculate the middle value correctly', () => {
            expect(median([1, 6, 3, 4, 10])).toBe(4); // sorted: 1, 3, 4, 6, 10
            expect(median([1, 2, 3, 4])).toBe(2.5);
            expect(median([5])).toBe(5);
        });

        it('sd: should calculate standard deviation correctly', () => {
            const arr = [2, 4, 4, 4, 5, 5, 7, 9];
            const mu = mean(arr);
            const stdDev = sd(arr, mu);
            expect(stdDev).toBeCloseTo(2); 
        });

        it('sd: zero variance', () => {
            expect(sd([5, 5, 5], 5)).toBe(0);
        });

        it('percentile: should calculate correctly', () => {
            const arr = [15, 20, 35, 40, 50];
            expect(percentile(arr, 50)).toBe(35); // 50th percentile (median)
            expect(percentile(arr, 0)).toBe(15);
            expect(percentile(arr, 100)).toBe(50);
            
            // interpolation
            // idx for 40th percentile = 0.4 * 4 = 1.6
            // lo = 1, hi = 2
            // sorted[1] = 20, sorted[2] = 35
            // 20 * (1 - 0.6) + 35 * 0.6 = 20 * 0.4 + 21 = 8 + 21 = 29
            expect(percentile(arr, 40)).toBeCloseTo(29);
        });

        it('percentile: empty array', () => {
            expect(percentile([], 50)).toBe(0);
        });

        it('lerpColor: should interpolate rgb correctly', () => {
            const c1 = [0, 0, 0];
            const c2 = [255, 255, 255];
            
            expect(lerpColor(c1, c2, 0)).toBe('rgb(0,0,0)');
            expect(lerpColor(c1, c2, 1)).toBe('rgb(255,255,255)');
            expect(lerpColor(c1, c2, 0.5)).toBe('rgb(128,128,128)');
        });
    });

    describe('Storage Helpers', () => {
        let mockStorage;

        beforeEach(() => {
            mockStorage = {};
            
            vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => {
                return key in mockStorage ? mockStorage[key] : null;
            });
            vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, val) => {
                mockStorage[key] = val;
            });
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('loadFromStorage: should return fallback if not found', () => {
            expect(loadFromStorage('missing_key', 'fallback_value')).toBe('fallback_value');
        });

        it('loadFromStorage: should parse and return JSON if found', () => {
            mockStorage['test_key'] = JSON.stringify({ a: 1 });
            expect(loadFromStorage('test_key', null)).toEqual({ a: 1 });
        });
        
        it('loadFromStorage: should return fallback on bad JSON', () => {
            mockStorage['bad_key'] = '{ bad json';
            // Suppress console.error for this test
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            
            expect(loadFromStorage('bad_key', 'fallback_val')).toBe('fallback_val');
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('saveToStorage: should save JSON to storage', () => {
            saveToStorage('saved_key', [1, 2, 3]);
            expect(mockStorage['saved_key']).toBe('[1,2,3]');
        });

        it('getEventCode: defaults to empty string', () => {
            expect(getEventCode()).toBe('');
        });
        
        it('getEventCode: reads from localStorage', () => {
            mockStorage['eventCode'] = 'txhou2024';
            expect(getEventCode()).toBe('txhou2024');
        });

        it('getColorblindMode: defaults to normal', () => {
            expect(getColorblindMode()).toBe('normal');
        });
    });

    describe('Constants', () => {
        it('should have valid METRIC_DISPLAY_NAMES', () => {
           expect(METRIC_DISPLAY_NAMES instanceof Map).toBe(true);
           expect(METRIC_DISPLAY_NAMES.get('Strategy')).toBe('Strategy');
        });

        it('should have valid EXCLUDED_FIELDS', () => {
           expect(EXCLUDED_FIELDS.has('Team')).toBe(true);
           expect(EXCLUDED_FIELDS.has('ScouterName')).toBe(true);
        });

        it('should have COLOR_MODES defined', () => {
           expect(COLOR_MODES.normal).toBeDefined();
           expect(COLOR_MODES.alex).toBeDefined();
           expect(COLOR_MODES.protanopia).toBeDefined();
        });
    });
});
