// @ts-nocheck
import { render } from '@testing-library/svelte';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mocks to prevent massive API or Charting Canvas crash loops
vi.mock('@mateothegreat/svelte5-router', () => ({
    goto: vi.fn(),
    navigate: vi.fn(),
    Router: vi.fn()
}));

// Mock echarts completely since canvas isn't supported purely in jsdom without extra pkgs
vi.mock('echarts', () => ({
    init: vi.fn().mockReturnValue({
        setOption: vi.fn(),
        resize: vi.fn(),
        dispose: vi.fn()
    })
}));

// Mock global API responses
vi.mock('../../utils/api.js', () => ({
    fetchEvents: vi.fn().mockResolvedValue({ ok: true, json: async () => ([]) }),
    fetchTeams: vi.fn().mockResolvedValue({ _teams: {}, _teamNumbers: [] }),
    readPitScoutingFromIDB: vi.fn().mockResolvedValue({}),
    fetchAvailableTeams: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }),
    fetchAllData: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }),
    fetchSingleMetric: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    fetchQualitativeScouting: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    fetchPitScouting: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    fetchGracePage: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    fetchAnanthPage: vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    fetchMatchAlliances: vi.fn().mockResolvedValue([]),
    fetchEventDetails: vi.fn().mockResolvedValue({}),
    fetchTeamStatuses: vi.fn().mockResolvedValue({}),
    fetchOPR: vi.fn().mockResolvedValue({ oprs: {}, dprs: {}, ccwms: {} }),
    fetchAlliances: vi.fn().mockResolvedValue({ alliances: [], available: false }),
    fetchEventEpas: vi.fn().mockResolvedValue({}),
    fetchElimsHaveStarted: vi.fn().mockResolvedValue(false),
    fetchRobotClimb: vi.fn().mockResolvedValue({ EndgameClimb: 'None', AutoClimb: 'None' }),
    startPeriodicQueueSync: vi.fn(() => vi.fn()),
}));

vi.mock('../../utils/pageUtils.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        loadFromStorage: vi.fn((key, def) => def),
    };
});

// Import All Pages
import App from '../../App.svelte';
import Home from '../Home.svelte';
import AnanthPage from '../datapages/ananthPage.svelte';
import GracePage from '../datapages/gracePage.svelte';
import MarchMadness from '../datapages/marchMadness.svelte';
import MatchPreview from '../datapages/matchPreview.svelte';
import PickLists from '../datapages/pickLists.svelte';
import PitScouting from '../datapages/pitScouting.svelte';
import QualPage from '../datapages/qualPage.svelte';
import SingleMetric from '../datapages/singleMetric.svelte';
import TeamView from '../datapages/teamView.svelte';

describe('Data Pages Smoke Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Storage.prototype.getItem = vi.fn(() => '2024test');
        // Ag-grid resize observer mock
        global.ResizeObserver = vi.fn().mockImplementation(() => ({
            observe: vi.fn(),
            unobserve: vi.fn(),
            disconnect: vi.fn(),
        }));
        
        // Mock indexedDB
        // @ts-ignore - Partial mock for indexedDB
        global.indexedDB = {
            open: vi.fn(() => ({
                onupgradeneeded: null,
                onsuccess: null,
                onerror: null,
                result: {
                    createObjectStore: vi.fn(),
                    transaction: vi.fn(() => ({
                        objectStore: vi.fn(() => ({
                            get: vi.fn(() => ({ onsuccess: null, onerror: null })),
                            put: vi.fn(() => ({ onsuccess: null, onerror: null })),
                        })),
                        oncomplete: null,
                        onerror: null
                    }))
                }
            }))
        };

        // Mock localStorage and sessionStorage
        const storageMock = {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            clear: vi.fn(),
            removeItem: vi.fn()
        };
        // @ts-ignore - Partial mock for Storage
        global.localStorage = storageMock;
        // @ts-ignore - Partial mock for Storage
        global.sessionStorage = storageMock;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // 1
    it('App mounts without crashing', () => {
        expect(() => render(App)).not.toThrow();
    });

    // 2
    it('Home page mounts without crashing', () => {
        expect(() => render(Home)).not.toThrow();
    });

    // 3
    it('AnanthPage mounts without crashing', () => {
        expect(() => render(AnanthPage)).not.toThrow();
    });

    // 4
    it('GracePage mounts without crashing', () => {
        expect(() => render(GracePage)).not.toThrow();
    });

    // 5
    it('MarchMadness mounts without crashing', () => {
        expect(() => render(MarchMadness)).not.toThrow();
    });

    // 6
    it('MatchPreview mounts without crashing', () => {
        expect(() => render(MatchPreview)).not.toThrow();
    });

    // 7
    it('PickLists mounts without crashing', () => {
        expect(() => render(PickLists)).not.toThrow();
    });

    // 8
    it('PitScouting mounts without crashing', () => {
        expect(() => render(PitScouting)).not.toThrow();
    });

    // 9
    it('QualPage mounts without crashing', () => {
        expect(() => render(QualPage)).not.toThrow();
    });

    // 10
    it('SingleMetric mounts without crashing', () => {
        expect(() => render(SingleMetric)).not.toThrow();
    });

    // 11
    it('TeamView mounts without crashing', () => {
        expect(() => render(TeamView)).not.toThrow();
    });
});
