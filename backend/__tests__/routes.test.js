const request = require('supertest');
const express = require('express');
const cors = require('cors');

// Mock out the database and external API so we only test route logic
jest.mock('../database', () => ({
    getEvents: jest.fn(),
    getAvailableTeams: jest.fn(),
    getAllData: jest.fn(),
    readJSONFile: jest.fn(),
    writeJSONFile: jest.fn()
}));
jest.mock('../externalApi', () => ({
    populateEventData: jest.fn(),
    fetchMatchAlliances: jest.fn(),
    fetchTeams: jest.fn(),
    fetchEventDetails: jest.fn(),
    fetchTeamStatuses: jest.fn(),
    fetchOPR: jest.fn(),
    fetchAlliances: jest.fn(),
    fetchEventEpas: jest.fn()
}));

// Import what we mocked to set up return values
const database = require('../database');
const externalApi = require('../externalApi');

// We need to require the actual app. The easiest way to test index.js when it binds to a port
// is to export the `app` instance from index.js, but since it doesn't currently export it,
// we might have to mock `app.listen`. Alternatively, we can construct a test app here
// that mounts the same routes, but that would be duplicating the code.
// Let's mock `app.listen` so index.js doesn't hang.
const originalListen = express.application.listen;
express.application.listen = jest.fn();

// Require index.js. This will run the file and register routes on its internal `app`.
// Since we mocked app.listen it won't actually bind to a port.
// However, the module system doesn't easily expose the deeply buried `app` object.
// Wait, we can re-export app from index.js in a separate fix, but for now we can intercept express()
let appInstance;
jest.mock('express', () => {
    const actualExpress = jest.requireActual('express');
    const mockExpress = () => {
        const app = actualExpress();
        appInstance = app; // Capture the app instance created by index.js
        return app;
    };
    Object.assign(mockExpress, actualExpress);
    return mockExpress;
});

require('../index');

describe('API Routes', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/getEvents', () => {
        it('returns events from the database', async () => {
            database.getEvents.mockResolvedValueOnce([{ name: 'event1' }]);
            const res = await request(appInstance).get('/api/getEvents');
            expect(res.status).toBe(200);
            expect(res.body).toEqual([{ name: 'event1' }]);
        });
    });

    describe('GET /api/getAvailableTeams', () => {
        it('requires eventCode parameter', async () => {
            const res = await request(appInstance).get('/api/getAvailableTeams');
            expect(res.status).toBe(403);
        });

        it('returns teams from database', async () => {
            database.getAvailableTeams.mockResolvedValueOnce({ data: ['190', '123'], error: null });
            const res = await request(appInstance).get('/api/getAvailableTeams?eventCode=test');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ data: ['190', '123'], error: null });
        });
    });

    describe('GET /api/getTeams', () => {
        it('transforms fetched teams into API payload shape', async () => {
            database.readJSONFile.mockResolvedValue({
                test: [{ team_number: 190, nickname: 'Gompei' }]
            });

            const res = await request(appInstance).get('/api/getTeams?eventCode=test');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                _teams: { '190': 'Gompei' },
                _teamNumbers: [190]
            });
        });
        
        it('returns an empty payload when external API response is malformed', async () => {
            database.readJSONFile.mockResolvedValue({
                test: { not: 'an array' }
            });

            const res = await request(appInstance).get('/api/getTeams?eventCode=test');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                _teams: {},
                _teamNumbers: []
            });
        });
    });
    
    describe('POST /api/postPitScouting', () => {
        it('fails if missing fields', async () => {
            const res = await request(appInstance).post('/api/postPitScouting').send({
                event: 'test'
                // missing team
            });
            expect(res.status).toBe(400);
        });

        it('succeeds with correct fields', async () => {
            // we mock readJSONFile to pretend the event code doesn't exist yet
            database.readJSONFile.mockResolvedValueOnce({});
            
            const res = await request(appInstance).post('/api/postPitScouting').send({
                event: 'test',
                team: '190',
                formData: { drive: 'swerve' }
            });
            expect(res.status).toBe(200);
            expect(database.writeJSONFile).toHaveBeenCalled();
        });
    });

    describe('POST /api/postQualitativeScouting', () => {
        it('fails if formData is invalid', async () => {
            const res = await request(appInstance).post('/api/postQualitativeScouting').send({
                event: 'test',
                team: '190',
                match: '1',
                formData: 'bad'
            });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INVALID_PAYLOAD');
        });

        it('fails if formData is an array', async () => {
            const res = await request(appInstance).post('/api/postQualitativeScouting').send({
                event: 'test',
                team: '190',
                match: '1',
                formData: []
            });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('INVALID_PAYLOAD');
        });

        it('succeeds with correct fields', async () => {
            database.readJSONFile.mockResolvedValueOnce({});

            const res = await request(appInstance).post('/api/postQualitativeScouting').send({
                event: 'test',
                team: '190',
                match: '1',
                formData: { notes: 'ok' }
            });
            expect(res.status).toBe(200);
            expect(database.writeJSONFile).toHaveBeenCalled();
        });
    });

    describe('POST /api/postEventCode', () => {
        it('accepts an event code and starts cache population', async () => {
            externalApi.populateEventData.mockResolvedValueOnce();

            const res = await request(appInstance).post('/api/postEventCode').send({
                eventCode: '2026joh'
            });

            expect(res.status).toBe(200);
            expect(externalApi.populateEventData).toHaveBeenCalledWith('2026joh');
        });
    });
});
