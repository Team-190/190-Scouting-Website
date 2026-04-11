const RUNTIME_CONSTANTS = Object.freeze({
    ports: Object.freeze({
        frontend: 5173,
        backend: 8000,
    }),
    server: Object.freeze({
        host: "localhost",
        gitPollIntervalSeconds: 10,
    }),
});

module.exports = RUNTIME_CONSTANTS;