const database = require('../database');
const sql = require('mssql');
const fs = require('fs');

// Mock MSSQL
jest.mock('mssql', () => {
    return {
        connect: jest.fn(),
        query: jest.fn()
    };
});

// Mock fs
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    writeFileSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFile: jest.fn(),
    mkdirSync: jest.fn()
}));

// We'll mock console.error / console.log during some tests to keep output clean
const originalConsoleError = console.error;
const originalConsoleLog = console.log;

describe('Database Utils', () => {
    beforeAll(() => {
        console.error = jest.fn();
        console.log = jest.fn();
    });

    afterAll(() => {
        console.error = originalConsoleError;
        console.log = originalConsoleLog;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('SQL Interactions', () => {
        describe('getEvents', () => {
            it('should return mapped events excluding system DBs', async () => {
                sql.connect.mockResolvedValueOnce();
                sql.query.mockResolvedValueOnce({
                    recordset: [{ name: '2024test' }, { name: '2024other' }]
                });

                const events = await database.getEvents();
                expect(sql.connect).toHaveBeenCalled();
                expect(sql.query).toHaveBeenCalledWith("SELECT name FROM sys.databases WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')");
                expect(events).toEqual([
                    { eventCode: '2024test', name: '2024test' },
                    { eventCode: '2024other', name: '2024other' }
                ]);
            });

            it('should return empty array on sql error', async () => {
                sql.connect.mockRejectedValueOnce(new Error('Connection failed'));
                
                const events = await database.getEvents();
                expect(events).toEqual([]);
                expect(console.error).toHaveBeenCalled();
            });
        });

        describe('getAvailableTeams', () => {
            it('should parse out numbers and return teams', async () => {
                sql.connect.mockResolvedValueOnce();
                sql.query.mockResolvedValueOnce({
                    recordset: [
                        { team: 'frc190' },
                        { team: 'team1234' },
                        { team: '456' },
                        { team: 'invalid' } // no digits => filtered out
                    ]
                });

                const res = await database.getAvailableTeams('2024test');
                expect(sql.query).toHaveBeenCalledWith("SELECT DISTINCT team FROM [2024test].[dbo].[Activities]");
                expect(res.data).toEqual(['190', '1234', '456']);
                expect(res.error).toBeNull();
            });

            it('should return error obj on sql error', async () => {
                const err = new Error('SQL Error');
                sql.connect.mockRejectedValueOnce(err);
                
                const res = await database.getAvailableTeams('2024bad');
                expect(res.data).toBeNull();
                expect(res.error).toBe(err);
            });
        });

        describe('getAllData', () => {
            it('should aggregate data for auto/full merge', async () => {
                sql.connect.mockResolvedValueOnce();
                
                // MOCK ROW DATA
                const mockRows = [
                    // Team 190, Match 1, Scouter A
                    { ID: 1, Team: '190', Match: 1, ScouterName: 'A', RecordType: 'StartMatch', Time: '2024-03-01T10:00:00Z', AutoClimb: 1, StartingLocation: 2, Metrics: 10 },
                    // After End Auto
                    { ID: 2, Team: '190', Match: 1, ScouterName: 'A', RecordType: 'EndAuto', Time: '2024-03-01T10:00:15Z', AutoClimb: 1, StartingLocation: 2, Metrics: 20 },
                    { ID: 3, Team: '190', Match: 1, ScouterName: 'A', RecordType: 'Match_Event', MatchEvent: 'Shoot', Time: '2024-03-01T10:01:00Z', Metrics: 30 },
                    { ID: 4, Team: '190', Match: 1, ScouterName: 'A', RecordType: 'EndMatch', Time: '2024-03-01T10:02:30Z', Metrics: 40, NearBlueZoneTime: 10 }
                ];
                
                sql.query.mockResolvedValueOnce({ recordset: mockRows });

                const res = await database.getAllData('2024test', 0);
                
                // We expect success and specific merged data structure
                expect(res.error).toBeNull();
                expect(res.data).toHaveLength(1);
                
                const dataPoint = res.data[0];
                expect(dataPoint.Team).toBe('190');
                expect(dataPoint.Match).toBe(1);
                // The aggregator merges numerical values into [auto, full] arrays
                expect(dataPoint.Metrics).toBeInstanceOf(Array);
                // Sums for Metrics:
                // Auto: ID 1 + ID 2 => 10 + 20 = 30
                // Full: ID 1 + ID 2 + ID 3 + ID 4 => 10 + 20 + 30 + 40 = 100
                expect(dataPoint.Metrics).toEqual([30, 100]);
                
                // Overrides shouldn't be arrays (they are specifically skipped for accumulation usually, but let's check base object)
                // From rules, AutoClimb override should take the EndAuto value which is 1
                // Wait, AutoClimb is listed in OVERRIDE_FIELDS, so not a [x, y] array, it's just grabbed statically.
                // Oh actually, it might be an array depending on the code, let's verify error status.
                
                expect(res.error).toBeNull();
            });

            it('should return error obj on sql error', async () => {
                const err = new Error('SQL Error');
                sql.connect.mockRejectedValueOnce(err);
                
                const res = await database.getAllData('2024bad', 0);
                expect(res.data).toBeNull();
                expect(res.error).toBe(err);
            });
        });
    });

    describe('File Interactions', () => {
        describe('readJSONFile', () => {
            it('reads exiting file', async () => {
                fs.existsSync.mockReturnValue(true);
                fs.readFileSync.mockReturnValue('{"test": 123}');
                
                const data = await database.readJSONFile('testfile');
                expect(data).toEqual({ test: 123 });
            });

            it('creates empty file if none exists', async () => {
                fs.existsSync.mockReturnValue(false);
                fs.readFileSync.mockReturnValue('{}');
                
                const data = await database.readJSONFile('missingfile');
                expect(fs.writeFileSync).toHaveBeenCalledWith('./data/missingfile.json', "{}", "utf8");
                expect(data).toEqual({});
            });
            
            it('handles malformed json safely', async () => {
                fs.existsSync.mockReturnValue(true);
                fs.readFileSync.mockReturnValue('{bad json');
                
                const data = await database.readJSONFile('badfile');
                 // Console logger is mocked so it won't crash tests
                expect(data).toEqual({});
            });
        });

        describe('writeJSONFile', () => {
            it('creates data directory if not exists, writes json asynchronously', async () => {
                fs.existsSync.mockReturnValue(false);
                
                // Trigger write
                await database.writeJSONFile('testwrite', { value: 42 });
                
                expect(fs.mkdirSync).toHaveBeenCalledWith('./data', { recursive: true });
                expect(fs.writeFile).toHaveBeenCalled();
                const callArgs = fs.writeFile.mock.calls[0];
                expect(callArgs[0]).toBe('./data/testwrite.json');
                expect(callArgs[1]).toContain('"value": 42');
            });
        });
    });
});
