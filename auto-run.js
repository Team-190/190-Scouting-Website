// THIS IS A SCRIPT FOR THE SERVER TO AUTOMATICALLY PULL FROM GITHUB AND RESTART


const { exec, spawn } = require('child_process');

// Configuration
const BRANCH = 'predev'; // Change this to 'main' or your specific branch
const POLL_INTERVAL_MS = 30000; // Check every 30 seconds

let currentProcess = null;

function startDevServer() {
    console.log('============================STARTING SERVER...============================');
    // We use spawn with shell: true to properly execute the .bat file
    currentProcess = spawn('run-dev.bat', [], { shell: true, cwd: __dirname });

    currentProcess.stdout.on('data', (data) => process.stdout.write(data));
    currentProcess.stderr.on('data', (data) => process.stderr.write(data));

    currentProcess.on('close', (code) => {
        console.log(`❌ run-dev.bat exited with code ${code}`);
    });
}

function restartServer() {
    console.log('============================STOPPING SERVER TO APPLY UPDATES...============================');
    // On Windows, run-dev.bat spawns separate command windows named "Backend" and "Frontend"
    // We kill them by window title so we don't end up with hundreds of orphaned windows
    exec(`taskkill /FI "WINDOWTITLE eq Backend*" /T /F`, () => {
        exec(`taskkill /FI "WINDOWTITLE eq Frontend*" /T /F`, () => {
            startDevServer();
        });
    });
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