// THIS IS A SCRIPT FOR THE SERVER TO AUTOMATICALLY PULL FROM GITHUB AND RESTART

const { exec, spawn } = require('child_process');

// Configuration
const BRANCH = 'main'; // Change this to 'main' or your specific branch
const POLL_INTERVAL_MS = 30000; // Check every 30 seconds

let currentProcess = null;

function startDevServer() {
    console.log('🚀 Starting run-dev.bat...');
    // We use spawn with shell: true to properly execute the .bat file
    currentProcess = spawn('run-dev.bat', [], { shell: true });

    currentProcess.stdout.on('data', (data) => process.stdout.write(data));
    currentProcess.stderr.on('data', (data) => process.stderr.write(data));

    currentProcess.on('close', (code) => {
        console.log(`❌ run-dev.bat exited with code ${code}`);
    });
}

function restartServer() {
    if (currentProcess) {
        console.log('🛑 Stopping current dev server...');
        // On Windows, killing a .bat file requires taskkill to kill the whole process tree (Svelte/Vite/Node)
        exec(`taskkill /pid ${currentProcess.pid} /T /F`, (err) => {
            if (err) {
                console.error("Failed to kill process:", err);
            }
            startDevServer();
        });
    } else {
        startDevServer();
    }
}

function checkForUpdates() {
    console.log(`\n⏳ Checking GitHub for updates on branch '${BRANCH}'...`);
    
    // Fetch the latest details from the remote
    exec(`git fetch origin ${BRANCH}`, (fetchErr) => {
        if (fetchErr) {
            console.error('⚠️ Error fetching from git:', fetchErr.message);
            return;
        }

        // Compare local HEAD to the remote branch
        exec(`git rev-parse HEAD && git rev-parse origin/${BRANCH}`, (parseErr, stdout) => {
            if (parseErr) {
                console.error('⚠️ Error parsing git hashes:', parseErr.message);
                return;
            }

            const hashes = stdout.trim().split('\n');
            const localHash = hashes[0];
            const remoteHash = hashes[1];

            if (localHash !== remoteHash) {
                console.log(`✨ New commit detected! Pulling changes...`);
                exec(`git pull origin ${BRANCH}`, (pullErr, pullStdout) => {
                    if (pullErr) {
                        console.error('⚠️ Error pulling changes:', pullErr.message);
                        return;
                    }
                    console.log(pullStdout);
                    
                    // Restart the server with the new code
                    restartServer();
                });
            } else {
                console.log('✅ Up to date.');
            }
        });
    });
}

// Initial start
startDevServer();

// Start polling
setInterval(checkForUpdates, POLL_INTERVAL_MS);