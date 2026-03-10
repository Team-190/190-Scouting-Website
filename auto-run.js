// THIS IS A SCRIPT FOR THE SERVER TO AUTOMATICALLY PULL FROM GITHUB AND RESTART

const { exec, spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const BRANCH = 'predev'; // Change this to 'main' or your specific branch
const POLL_INTERVAL_MS = 30000; // Check every 30 seconds

let backendProcess = null;
let frontendProcess = null;

function startDevServer() {
    console.log('============================STARTING SERVERS...============================');
    
    // Check and install dependencies automatically just like the batch file did
    if (!fs.existsSync(path.join(__dirname, 'backend', 'node_modules'))) {
        console.log('Installing backend dependencies...');
        execSync('npm install', { cwd: path.join(__dirname, 'backend'), stdio: 'inherit' });
    }
    if (!fs.existsSync(path.join(__dirname, 'frontend', 'node_modules'))) {
        console.log('Installing frontend dependencies...');
        execSync('npm install', { cwd: path.join(__dirname, 'frontend'), stdio: 'inherit' });
    }

    // Spawn them directly from Node instead of using the batch file.
    // This gives us complete control over their Process IDs so we can kill them easily!
    backendProcess = spawn(/^win/.test(process.platform) ? 'npm.cmd' : 'npm', ['run', 'start'], { cwd: path.join(__dirname, 'backend') });
    frontendProcess = spawn(/^win/.test(process.platform) ? 'npm.cmd' : 'npm', ['run', 'dev'], { cwd: path.join(__dirname, 'frontend') });

    backendProcess.stdout.on('data', (data) => process.stdout.write(`[BACKEND] ${data}`));
    backendProcess.stderr.on('data', (data) => process.stderr.write(`[BACKEND ERR] ${data}`));

    frontendProcess.stdout.on('data', (data) => process.stdout.write(`[FRONTEND] ${data}`));
    frontendProcess.stderr.on('data', (data) => process.stderr.write(`[FRONTEND ERR] ${data}`));
}

function restartServer() {
    console.log('============================STOPPING SERVERS TO APPLY UPDATES...============================');
    
    // Force kill the specific process trees we spawned
    if (backendProcess) {
        exec(`taskkill /pid ${backendProcess.pid} /T /F`, () => {});
    }
    if (frontendProcess) {
        exec(`taskkill /pid ${frontendProcess.pid} /T /F`, () => {});
    }
    
    // Wait 3 seconds to let ports (like localhost:5173 / backend port) fully close before restarting
    setTimeout(() => {
        startDevServer();
    }, 3000);
}

function checkForUpdates() {
    console.log('============================CHECKING FOR UPDATES...============================');
        
    // Ensure we are explicitly running in the folder where the script exists
    const repoPath = __dirname;
    
    // Fetch the latest details from the remote
    exec(`cd /d "${repoPath}" && git fetch origin ${BRANCH}`, (fetchErr) => {
        if (fetchErr) {
            console.error('⚠️ Error fetching from git:', fetchErr.message);
            return;
        }

        // Compare local HEAD to the remote branch
        exec(`cd /d "${repoPath}" && git rev-parse HEAD && git rev-parse origin/${BRANCH}`, (parseErr, stdout) => {
            if (parseErr) {
                console.error('⚠️ Error parsing git hashes:', parseErr.message);
                return;
            }

            const hashes = stdout.trim().split('\n');
            const localHash = hashes[0];
            const remoteHash = hashes[1];

            if (localHash !== remoteHash) {
                console.log('============================NEW COMMIT FOUND...============================');
                exec(`cd /d "${repoPath}" && git pull origin ${BRANCH}`, (pullErr, pullStdout) => {
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