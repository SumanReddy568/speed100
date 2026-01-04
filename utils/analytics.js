const TRACK_URL = "https://multi-product-analytics.sumanreddy568.workers.dev/";

async function track(eventName, options = {}) {
    try {
        const systemInfo = typeof window !== 'undefined' ? {
            ua: navigator.userAgent,
            lang: navigator.language,
            platform: navigator.platform,
            screen: `${window.screen.width}x${window.screen.height}`,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        } : { ua: 'service-worker' };

        // Get user info from storage
        let userInfo = {};
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            try {
                const storageData = await new Promise((resolve) => {
                    chrome.storage.local.get(['user_id', 'user_email', 'user_hash'], resolve);
                });
                userInfo = {
                    userId: storageData.user_id || null,
                    email: storageData.user_email || null,
                    userHash: storageData.user_hash || null
                };
            } catch (e) {
                console.warn('Failed to fetch user info for analytics:', e);
            }
        }

        const response = await fetch(TRACK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                product: "speed_tester",
                event: eventName,
                extensionId: chrome?.runtime?.id || 'web_user',
                page: options.page || (typeof window !== 'undefined' ? window.location.href : 'background'),
                feature: options.feature || null,
                version: chrome?.runtime?.getManifest?.()?.version || '1.0.0',
                ...userInfo,
                metadata: {
                    system: systemInfo,
                    ...options.meta
                }
            })
        });
        return await response.json();
    } catch (err) {
        console.error("Analytics failed", err);
    }
}

// Track speed test event
function trackSpeedTest(meta = {}) {
    return track("speed_test", {
        feature: "speed_test",
        meta
    });
}

// Track load test event
function trackLoadTest(meta = {}) {
    return track("load_test", {
        feature: "load_test",
        meta
    });
}

// Track AI insights event
function trackAIInsights(meta = {}) {
    return track("ai_insights", {
        feature: "ai_insights",
        meta
    });
}

// Track section expansion
function trackSectionExpand(sectionId, meta = {}) {
    return track(`expand_${sectionId}`, {
        feature: sectionId,
        meta
    });
}

// Track Rate Us click
function trackRateUsClick(feature = "unknown", meta = {}) {
    return track("click_rate_us", {
        feature,
        meta
    });
}

// Track AI Agent Hub click
function trackAIAgentHubClick(feature = "unknown", meta = {}) {
    return track("click_ai_qa_agent_hub", {
        feature,
        meta
    });
}

// Track Downdetector click
function trackDowndetectorClick(meta = {}) {
    return track("click_downdetector", {
        feature: "outage_checker",
        meta
    });
}

// Track Multi Web Speed Test click
function trackMultiWebSpeedTestClick(feature = "unknown", meta = {}) {
    return track("click_multi_web_speed_test", {
        feature,
        meta
    });
}

// Expose globally for non-module scripts (popup, etc.)
if (typeof window !== 'undefined') {
    window.Analytics = {
        track,
        trackSpeedTest,
        trackLoadTest,
        trackAIInsights,
        trackSectionExpand,
        trackRateUsClick,
        trackAIAgentHubClick,
        trackDowndetectorClick,
        trackMultiWebSpeedTestClick
    };
}

// Expose for service worker context
if (typeof self !== 'undefined' && typeof window === 'undefined') {
    self.Analytics = {
        track,
        trackSpeedTest,
        trackLoadTest,
        trackAIInsights,
        trackSectionExpand,
        trackRateUsClick,
        trackAIAgentHubClick,
        trackDowndetectorClick,
        trackMultiWebSpeedTestClick
    };
}
