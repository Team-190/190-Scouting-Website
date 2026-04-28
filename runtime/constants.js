const RUNTIME_CONSTANTS = Object.freeze({
    ports: Object.freeze({
        frontend: 5173,
        backend: 8000,
    }),
    server: Object.freeze({
        host: "localhost",
    }),
    compression: Object.freeze({
        envelopeFlag: "__compressed",
        version: 2,
    }),
});

module.exports = RUNTIME_CONSTANTS;