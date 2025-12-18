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

// Expose globally for non-module scripts (popup, etc.)
if (typeof window !== 'undefined') {
    window.Analytics = {
        track,
        trackSpeedTest,
        trackLoadTest,
        trackAIInsights
    };
}

// Expose for service worker context
if (typeof self !== 'undefined' && typeof window === 'undefined') {
    self.Analytics = {
        track,
        trackSpeedTest,
        trackLoadTest,
        trackAIInsights
    };
}
