importScripts('utils/endpoints.js', 'utils/analytics.js', 'speed-test.js', 'services/network-diagnostics.js', 'services/ai-analysis.js');

const speedTest = new self.SpeedTest();
const aiAnalysis = new self.NetworkAIAnalysis();

let lastTestResult = {
    downloadSpeed: 0,
    uploadSpeed: 0,
    networkInfo: {},
    timestamp: null
};

// Function to update the badge with current download speed
function updateBadge(speedMbps) {
    if (speedMbps === null) {
        chrome.action.setBadgeText({ text: '' });
        return;
    }

    let displaySpeed = Math.min(999, Math.round(speedMbps)).toString();

    chrome.action.setBadgeText({
        text: displaySpeed
    });

    chrome.action.setBadgeBackgroundColor({
        color: speedMbps > 100 ? '#4CAF50' : speedMbps > 50 ? '#FFC107' : '#F44336'
    });
}

// ── Desktop notifications ────────────────────────────────────────────────────

// Show a basic notification. Re-uses a fixed id per category so a newer alert
// of the same kind replaces the previous one instead of stacking.
function notify(id, title, message) {
    if (!chrome.notifications) return;
    chrome.notifications.create(id, {
        type    : 'basic',
        iconUrl : chrome.runtime.getURL('icons/icon128.png'),
        title,
        message,
        priority: 1,
    });
}

// Fire a low-speed alert when a completed test is below the user's threshold.
//
//   - Manual tests ALWAYS notify when below — the user explicitly asked for a
//     result, so they get one every run (and a recovery note if it climbed back
//     above after previously being below).
//   - Automated tests notify only on the OK→below transition (and recovery on
//     the way back up), so a persistently slow link doesn't notify every cycle.
async function maybeSpeedAlert(downloadMbps, isAutomated = false) {
    const threshold = await new Promise((resolve) => {
        chrome.storage.sync.get(['speedAlertThresholdMbps'], (r) => {
            resolve(parseFloat(r.speedAlertThresholdMbps) || 0);
        });
    });
    if (!threshold) return; // 0 / unset → alerts off

    const below = downloadMbps < threshold;
    const prevBelow = await new Promise((resolve) => {
        chrome.storage.local.get(['speedAlertBelow'], (r) => resolve(r.speedAlertBelow === true));
    });

    // Manual: alert on every below-threshold result. Automated: only on the
    // healthy→slow transition.
    const alertBelow = below && (!isAutomated || !prevBelow);
    // Recovery note fires (for both kinds) only when we were previously below.
    const alertRecovered = !below && prevBelow;

    if (alertBelow) {
        notify('speed-alert', 'Slow connection',
            `Download is ${downloadMbps.toFixed(1)} Mbps — below your ${threshold} Mbps alert threshold.`);
    } else if (alertRecovered) {
        notify('speed-alert', 'Connection recovered',
            `Download is back up to ${downloadMbps.toFixed(1)} Mbps.`);
    }

    await chrome.storage.local.set({ speedAlertBelow: below });
}

// ── Metered-connection guard + data budget ──────────────────────────────────

// True when the OS/browser signals the connection should conserve data:
// Data Saver / Lite mode is on, or the active connection is cellular.
// (conn.type is not exposed on all desktop platforms, so saveData is the
// primary, reliable signal.)
function isMeteredConnection() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!conn) return false;
    if (conn.saveData === true) return true;
    if (conn.type === 'cellular') return true;
    return false;
}

// Current calendar month as "YYYY-MM" (local time).
function currentMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Read this month's cumulative test data usage, auto-resetting on month rollover.
async function getDataUsage() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['dataUsage'], (r) => {
            const month = currentMonth();
            let usage = r.dataUsage;
            if (!usage || usage.month !== month) usage = { month, bytes: 0 };
            resolve(usage);
        });
    });
}

// Add bytes to this month's usage total and persist it. Fires a one-time
// notification the first time usage crosses the monthly cap (capNotified lives
// inside the usage object, so it resets automatically on month rollover).
async function addDataUsage(bytes) {
    const usage = await getDataUsage();
    usage.bytes += bytes;

    const { monthlyDataCapMB } = await getGuardSettings();
    if (monthlyDataCapMB > 0 && !usage.capNotified
        && usage.bytes >= monthlyDataCapMB * 1024 * 1024) {
        usage.capNotified = true;
        notify('data-cap', 'Data cap reached',
            `Speed-test data usage hit your ${monthlyDataCapMB} MB monthly cap. `
            + `Automatic tests are paused until next month.`);
    }

    await chrome.storage.local.set({ dataUsage: usage });
    return usage;
}

// Read the guard settings (sync storage, with sensible defaults).
async function getGuardSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['pauseOnMetered', 'monthlyDataCapMB'], (r) => {
            resolve({
                // Default ON — background tests can pull >1 GB/hour on fast links.
                pauseOnMetered: r.pauseOnMetered !== false,
                // 0 = unlimited.
                monthlyDataCapMB: parseInt(r.monthlyDataCapMB, 10) || 0,
            });
        });
    });
}

// Decide whether an automated test should be skipped. Returns a reason string
// to skip, or null to proceed. Manual tests bypass this entirely.
async function shouldSkipAutomatedTest() {
    const settings = await getGuardSettings();

    if (settings.pauseOnMetered && isMeteredConnection()) {
        return 'Skipped automatic test: on a metered/data-saver connection.';
    }

    if (settings.monthlyDataCapMB > 0) {
        const usage = await getDataUsage();
        const capBytes = settings.monthlyDataCapMB * 1024 * 1024;
        if (usage.bytes >= capBytes) {
            return `Skipped automatic test: monthly data cap of ${settings.monthlyDataCapMB} MB reached.`;
        }
    }

    return null;
}

// Function to check if user is authenticated (background version)
async function checkAuth() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['user_id'], function (result) {
            resolve(!!result.user_id);
        });
    });
}

// Function to send progress updates
function sendProgress(message, speeds, networkInfo = null) {
    // Check if online before proceeding
    if (!navigator.onLine) {
        chrome.runtime.sendMessage({
            type: 'speedUpdate',
            downloadSpeed: 0,
            uploadSpeed: 0,
            error: 'No internet connection'
        }).catch(() => {
            // Silent catch for when popup is closed
        });
        return;
    }

    // Send normal progress if online
    chrome.runtime.sendMessage({
        type: 'testProgress',
        message: message,
        downloadSpeed: speeds?.downloadSpeed || 0,
        uploadSpeed: speeds?.uploadSpeed || 0,
        bloat: speeds?.bloat || 0,
        networkInfo: networkInfo
    }).catch(() => {
        // Silent catch for when popup is closed
    });
}

// Function to run speed test and update results
async function runSpeedTest(isAutomated = false) {
    // Check authentication before running
    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) {
        if (!isAutomated) {
            console.warn('Manual speed test requested but user is not logged in.');
        }
        updateBadge(null); // Clear badge if not authenticated
        return null;
    }

    // Metered-connection / data-cap guard — automated tests only. A manual test
    // is an explicit user action, so it always runs (and still counts usage).
    if (isAutomated) {
        const skipReason = await shouldSkipAutomatedTest();
        if (skipReason) {
            console.log(skipReason);
            chrome.storage.local.set({ lastSkipReason: { message: skipReason, timestamp: Date.now() } });
            chrome.runtime.sendMessage({ type: 'testSkipped', reason: skipReason }).catch(() => { });
            return null;
        }
    }

    // Helper for conditional logging
    const log = (level, msg, data) => {
        if (!isAutomated) {
            // Remote logging (calls pushLog)
            if (logger && logger[level]) {
                logger[level](msg, data);
            }
        } else {
            // Local logging only for automated tests
            const consoleMethod = level === 'error' ? console.error : console.log;
            consoleMethod(`[${level.toUpperCase()}] ${msg}`, data);
        }
    };

    try {
        log('info', 'Starting speed test run');
        sendProgress('Preparing test...', { downloadSpeed: 0, uploadSpeed: 0 });

        // Set up progress callback
        speedTest.setProgressCallback((speeds) => {
            const downloadMbps = speeds.downloadSpeed / 1000000;
            const uploadMbps = speeds.uploadSpeed / 1000000;
            updateBadge(downloadMbps);
            sendProgress('Testing in progress...', {
                downloadSpeed: speeds.downloadSpeed,
                uploadSpeed: speeds.uploadSpeed,
                bloat: speeds.bloat
            });
        });

        // Get network info before running tests
        sendProgress('Gathering network info...', { downloadSpeed: 0, uploadSpeed: 0 });
        const networkInfo = await speedTest.getNetworkInfo();
        log('info', 'Network information fetched', {
            ip: networkInfo.ipAddress,
            isp: networkInfo.isp,
            location: networkInfo.location?.city + ', ' + networkInfo.location?.country
        });

        sendProgress('Starting download test...', { downloadSpeed: 0, uploadSpeed: 0 }, networkInfo);
        log('info', 'Download test started');
        await speedTest.testDownloadSpeed();
        log('info', 'Download test finished', { speed: speedTest.downloadSpeed / 1000000 });

        sendProgress('Starting upload test...',
            { downloadSpeed: speedTest.downloadSpeed, uploadSpeed: 0 }, networkInfo);
        log('info', 'Upload test started');
        await speedTest.testUploadSpeed();
        log('info', 'Upload test finished', { speed: speedTest.uploadSpeed / 1000000 });

        // Tally the data this test consumed against the monthly budget.
        const bytesUsed = (speedTest.bytesDownloaded || 0) + (speedTest.bytesUploaded || 0);
        const usage = await addDataUsage(bytesUsed);
        log('info', 'Data usage updated', {
            testMB: Math.round(bytesUsed / (1024 * 1024)),
            monthMB: Math.round(usage.bytes / (1024 * 1024)),
        });

        // Low-speed threshold alert (no-op unless the user set a threshold).
        await maybeSpeedAlert(speedTest.downloadSpeed / 1000000, isAutomated);

        // Update network info with measured bloat
        networkInfo.bloat = speedTest.bloat;

        lastTestResult = {
            downloadSpeed: speedTest.downloadSpeed,
            uploadSpeed: speedTest.uploadSpeed,
            bloat: speedTest.bloat,
            networkInfo: networkInfo,
            timestamp: Date.now()
        };

        log('info', 'Speed test completed', {
            download: lastTestResult.downloadSpeed / 1000000,
            upload: lastTestResult.uploadSpeed / 1000000,
            ping: networkInfo.latency
        });

        // Update badge with final download speed
        updateBadge(speedTest.downloadSpeed / 1000000);

        // Add AI analysis
        sendProgress('Generating AI insights...', {
            downloadSpeed: speedTest.downloadSpeed,
            uploadSpeed: speedTest.uploadSpeed
        });

        log('info', 'AI analysis lifecycle started');
        let analysis = null;
        try {
            analysis = await aiAnalysis.analyzeSpeedTest(lastTestResult);
            log('info', 'AI analysis lifecycle completed', {
                source: analysis.meta.summarySource,
                llmUsed: analysis.meta.llmUsed,
                model: analysis.meta.llmModel
            });
        } catch (error) {
            log('error', 'AI analysis lifecycle failed', { error: error.message });
            console.error('AI analysis failed:', error);
        }
        lastTestResult.aiAnalysis = analysis;

        // Send final update with network info and AI analysis
        chrome.runtime.sendMessage({
            type: 'speedUpdate',
            ...lastTestResult,
            aiAnalysis: analysis
        }).catch(() => {
            // Silent catch for when popup is closed
        });

        const historyItem = {
            downloadSpeed: speedTest.downloadSpeed,
            uploadSpeed: speedTest.uploadSpeed,
            timestamp: Date.now()
        };

        chrome.storage.local.get(['speedTestHistory'], function (result) {
            const history = result.speedTestHistory || [];
            history.unshift(historyItem);
            // Keep only last 10 items in storage (we'll display last 3)
            const trimmedHistory = history.slice(0, 10);
            chrome.storage.local.set({ speedTestHistory: trimmedHistory });
        });

        return lastTestResult;
    } catch (error) {
        log('error', 'Speed test failed', { error: error.message, stack: error.stack });
        console.error('Speed test failed:', error);
        sendProgress('Test failed: ' + error.message,
            { downloadSpeed: speedTest.downloadSpeed, uploadSpeed: speedTest.uploadSpeed });

        // Send error with whatever info we have
        chrome.runtime.sendMessage({
            type: 'speedUpdate',
            downloadSpeed: speedTest.downloadSpeed || 0,
            uploadSpeed: speedTest.uploadSpeed || 0,
            networkInfo: {
                status: 'error',
                error: error.message
            },
            timestamp: Date.now()
        }).catch(() => { });

        return null;
    }
}

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
    const isAuthenticated = await checkAuth();
    if (isAuthenticated) {
        chrome.action.setBadgeText({ text: '0' });
    } else {
        chrome.action.setBadgeText({ text: '' });
    }

    chrome.storage.sync.get(['testInterval'], function (result) {
        const interval = result.testInterval || '30';
        if (interval !== '0') {
            chrome.alarms.create('initialSpeedTest', { delayInMinutes: 0.1 });
            chrome.alarms.create('nextSpeedTest', { periodInMinutes: parseInt(interval) });
        }
    });
});

// Listener for storage changes to handle logout immediately
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.user_id) {
        if (!changes.user_id.newValue) {
            // User logged out (user_id removed)
            updateBadge(null);

            // Clear last test result
            lastTestResult = {
                downloadSpeed: 0,
                uploadSpeed: 0,
                networkInfo: {},
                timestamp: null
            };

            console.log('User logged out, cleared badge and results');
        }
    }
});

// Handle alarms for periodic testing
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'initialSpeedTest' || alarm.name === 'nextSpeedTest') {
        runSpeedTest(true); // Pass true for automated tests
    }
});

// Update message handler to send AI analysis
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'getSpeed') {
        chrome.storage.local.get(['speedTestHistory'], function (result) {
            sendResponse({
                ...lastTestResult,
                history: result.speedTestHistory || [],
                aiAnalysis: lastTestResult.aiAnalysis // Send AI analysis
            });
        });
        return true;
    } else if (request.type === 'runTest') {
        // Start the test and send immediate response
        sendResponse({ status: 'started' });
        // Then run the test
        runSpeedTest();
        return true; // Required for async response
    } else if (request.type === 'getDataUsage') {
        Promise.all([getDataUsage(), getGuardSettings()]).then(([usage, settings]) => {
            sendResponse({
                bytes: usage.bytes,
                month: usage.month,
                monthlyDataCapMB: settings.monthlyDataCapMB,
                pauseOnMetered: settings.pauseOnMetered,
                isMetered: isMeteredConnection(),
            });
        });
        return true; // async response
    } else if (request.type === 'updateInterval') {
        chrome.alarms.clear('nextSpeedTest');
        if (request.interval > 0) {
            chrome.alarms.create('nextSpeedTest', { periodInMinutes: parseInt(request.interval) });
        }
        sendResponse({ status: 'updated' });
        return true;
    }
});