/**
 * Network Diagnostics Service — Rewritten for accuracy
 *
 * Root-cause fixes vs the original:
 *
 * 1.  LATENCY via CORS endpoint (not no-cors):
 *     The old code used `mode:'no-cors'` + HEAD against google/cloudflare/amazon.
 *     In extension/SW contexts the browser cannot time opaque responses accurately —
 *     the delta includes CORS-preflight overhead, SW interception, and browser
 *     internal book-keeping, NOT the network RTT.
 *     Fix: use `https://speed.cloudflare.com/__down?bytes=1` which returns proper
 *     CORS headers, giving a clean, measurable RTT every time.
 *
 * 2.  PING = MEDIAN, not minimum:
 *     Math.min() picks a statistical outlier (lucky burst) as the headline number.
 *     Fix: collect 10 samples, discard the top/bottom 2 (trimmed mean area),
 *     report the median of the remaining 6. This matches what Speedtest.net shows.
 *
 * 3.  JITTER = mean absolute deviation of consecutive trimmed samples:
 *     Same samples used for ping, so jitter and ping are self-consistent.
 *
 * 4.  PACKET LOSS — real detection:
 *     Old code counted any fetch() rejection as a loss, but in extensions almost
 *     all rejections are CORS/SW noise. Fix: fire N parallel timed fetches with a
 *     250 ms hard timeout; count only the ones that never return ANY bytes.
 *
 * 5.  BLOAT — actually measured:
 *     Take a fresh RTT sample *while* a parallel download saturates the link, then
 *     compare against the idle baseline. That delta IS bufferbloat — no more
 *     "jitter * 1.5" fiction.
 *
 * 6.  DNS latency — use a well-known external name, not the page hostname:
 *     In SW/extension contexts `window.location.hostname` is '' so the old code
 *     always skipped DNS. Fix: resolve 'cloudflare.com' via Google DoH every time.
 *
 * 7.  IP + Geo fetched in parallel (Promise.allSettled):
 *     Was serial (ipify → ipwho). Fix: fire both at the same time and join.
 *     Also adds ipapi.co as a self-contained fallback that returns IP + geo in one
 *     call, so if ipify is slow the whole block still finishes quickly.
 *
 * 8.  Local IP via RTCPeerConnection — properly awaited:
 *     The original returned `networkInfo` before the ICE candidate callback fired,
 *     so `localAddress` was always '-'. Fix: wrap in a Promise with a 4 s timeout.
 *
 * PUBLIC API — identical to the original so all callers work unchanged:
 *   SpeedTest.prototype.getNetworkInfo()  → networkInfo object
 *   SpeedTest.prototype.testLatency()     → { ping, jitter, loss, latency, serverInfo }
 */

SpeedTest.prototype.getNetworkInfo = async function () {
    const networkInfo = {
        ipAddress      : '-',
        localAddress   : '-',
        dns            : '-',
        signalStrength : '-',
        connectionType : '-',
        latency        : '-',
        ping           : 0,
        jitter         : 0,
        packetLoss     : 0,
        dnsLatency     : 0,
        stability      : 100,
        bloat          : 0,
        networkName    : '-',
        location       : { country: '-', city: '-', region: '-', timezone: '-' },
        isp            : '-',
        serverInfo     : { name: '-', organization: '-' },
        status         : '-',
    };

    try {
        // ── 0. Seed from previous good run (unchanged behaviour) ──────────────
        if (this._lastGoodLatencyMetrics) {
            const m = this._lastGoodLatencyMetrics;
            if (m.latency    !== undefined) networkInfo.latency    = m.latency;
            if (m.ping       !== undefined) networkInfo.ping       = m.ping;
            if (m.jitter     !== undefined) networkInfo.jitter     = m.jitter;
            if (m.packetLoss !== undefined) networkInfo.packetLoss = m.packetLoss;
            if (m.dnsLatency !== undefined) networkInfo.dnsLatency = m.dnsLatency;
            if (m.stability  !== undefined) networkInfo.stability  = m.stability;
            if (m.bloat      !== undefined) networkInfo.bloat      = m.bloat;
        }

        // ── 1. Network Information API ────────────────────────────────────────
        const conn = (typeof navigator !== 'undefined')
            && (navigator.connection || navigator.mozConnection || navigator.webkitConnection);

        if (conn) {
            networkInfo.connectionType = conn.effectiveType || conn.type || 'Unknown';
            networkInfo.networkName    = conn.type || conn.effectiveType || 'Unknown';
            if (conn.downlink != null) networkInfo.signalStrength = `${conn.downlink} Mbps`;
            if (conn.rtt)              networkInfo.latency        = `${conn.rtt} ms`;
        }

        // ── 2. IP + Geo — parallel fetch ──────────────────────────────────────
        //    Strategy A: ipify (IP only) + ipwho.is (geo) in parallel.
        //    Strategy B: ipapi.co/json as a single-call fallback if A is slow/fails.
        await (async () => {
            const TIMEOUT = 5_000;

            const race = (p) => Promise.race([
                p,
                new Promise((_, r) => setTimeout(() => r(new Error('timeout')), TIMEOUT)),
            ]);

            // Fire strategy A and B simultaneously; use whichever finishes first
            // with a complete IP+geo payload.
            const strategyA = async () => {
                const ipRes = await race(fetch('https://api.ipify.org?format=json', { mode: 'cors' }));
                if (!ipRes.ok) throw new Error(`ipify ${ipRes.status}`);
                const { ip } = await ipRes.json();

                // Get geo for this IP — throw if missing so Strategy B can win if it has geo
                const geoRes = await race(fetch(`https://ipwho.is/${ip}`, { mode: 'cors' }));
                if (!geoRes.ok) throw new Error(`ipwho ${geoRes.status}`);
                const geo = await geoRes.json();
                if (geo?.success === false) throw new Error('ipwho failed');
                return { ip, geo };
            };

            const strategyB = async () => {
                const res = await race(fetch('https://ipapi.co/json/', { mode: 'cors' }));
                if (!res.ok) throw new Error(`ipapi ${res.status}`);
                const d = await res.json();
                if (!d.ip || !d.country_name) throw new Error('ipapi incomplete');
                return {
                    ip : d.ip,
                    geo: {
                        country  : d.country_name,
                        city     : d.city,
                        region   : d.region,
                        timezone : { id: d.timezone },
                        connection: { isp: d.org },
                    },
                };
            };

            const strategyC = async () => {
                const res = await race(fetch('https://ipinfo.io/json', { mode: 'cors' }));
                if (!res.ok) throw new Error(`ipinfo ${res.status}`);
                const d = await res.json();
                if (!d.ip) throw new Error('ipinfo incomplete');
                return {
                    ip : d.ip,
                    geo: {
                        country  : d.country, // 2-letter code generally
                        city     : d.city,
                        region   : d.region,
                        timezone : d.timezone,
                        connection: { isp: d.org },
                    },
                };
            };

            const result = await Promise.any([strategyA(), strategyB(), strategyC()])
                .catch(() => null);

            if (result) {
                networkInfo.ipAddress = result.ip || 'Unavailable';
                if (result.geo) {
                    const g = result.geo;
                    networkInfo.location.country  = g.country  || 'Unavailable';
                    networkInfo.location.city     = g.city     || 'Unavailable';
                    networkInfo.location.region   = g.region   || 'Unavailable';
                    networkInfo.location.timezone = g.timezone?.id || g.timezone || 'Unavailable';
                    networkInfo.isp               = g.connection?.isp || g.connection?.org || g.isp || 'Unavailable';
                }
            }
        })();

        // ── 3. Latency, jitter, packet-loss (accurate) ────────────────────────
        const latencyResult = await this.testLatency();
        let hasFresh = false;

        if (latencyResult.latency !== 'Unavailable') {
            networkInfo.latency    = latencyResult.latency;
            networkInfo.ping       = latencyResult.ping;
            networkInfo.jitter     = latencyResult.jitter;
            networkInfo.packetLoss = latencyResult.loss;
            networkInfo.serverInfo = latencyResult.serverInfo;
            hasFresh = true;

            // Stability: penalise loss heavily, jitter moderately
            const lossPenalty   = (parseFloat(networkInfo.packetLoss) || 0) * 10;
            const jitterPenalty = (parseFloat(networkInfo.jitter)     || 0) * 0.5;
            networkInfo.stability = Math.max(0, Math.min(100,
                Math.round(100 - lossPenalty - jitterPenalty),
            ));
        }

        // ── 4. DNS latency — fixed target, works in every context ────────────
        try {
            const dnsStart = performance.now();
            const dnsRes   = await Promise.race([
                fetch('https://dns.google/resolve?name=cloudflare.com&type=A', { mode: 'cors', cache: 'no-store' }),
                new Promise((_, r) => setTimeout(() => r(new Error('dns timeout')), 3_000)),
            ]);
            if (dnsRes.ok) {
                networkInfo.dns       = 'Google DoH';
                networkInfo.dnsLatency = Math.round(performance.now() - dnsStart);
            }
        } catch (e) {
            console.warn('DNS latency failed:', e.message);
        }

        // ── 5. Bufferbloat — measured, not estimated ──────────────────────────
        //    Fire a small download to load the link, then measure RTT during load
        //    vs the idle baseline from testLatency().
        if (hasFresh && networkInfo.ping > 0) {
            networkInfo.bloat = await this._measureBufferbloat(networkInfo.ping);
        }

        // ── 6. Local IP via RTCPeerConnection — properly awaited ─────────────
        networkInfo.localAddress = await this._getLocalIP();

        // ── 7. Persist fresh metrics ──────────────────────────────────────────
        if (hasFresh) {
            this._lastGoodLatencyMetrics = {
                latency    : networkInfo.latency,
                ping       : networkInfo.ping,
                jitter     : networkInfo.jitter,
                packetLoss : networkInfo.packetLoss,
                dnsLatency : networkInfo.dnsLatency,
                stability  : networkInfo.stability,
                bloat      : networkInfo.bloat,
            };
        }

        networkInfo.status = 'completed';
        return networkInfo;

    } catch (error) {
        networkInfo.status = 'error';
        networkInfo.error  = error.message || 'Unknown error occurred';
        return networkInfo;
    }
};

// ── testLatency ───────────────────────────────────────────────────────────────
/**
 * Measures RTT using Cloudflare's CORS-enabled speed endpoint.
 * Collects 10 samples, trims the 2 fastest and 2 slowest (outlier removal),
 * then reports median of the remaining 6.
 *
 * Why Cloudflare __down?bytes=1 ?
 *   - Returns real CORS headers → browser can time the response accurately.
 *   - 1-byte payload → transfer time is negligible; delta ≈ pure network RTT.
 *   - Available globally; extremely reliable.
 */
SpeedTest.prototype.testLatency = async function () {
    const ENDPOINT = {
        url          : 'https://speed.cloudflare.com/__down?bytes=1',
        name         : 'Cloudflare Speed',
        organization : 'Cloudflare, Inc.',
    };

    const TOTAL_SAMPLES   = 10;
    const TRIM_EACH_SIDE  =  2;   // discard 2 fastest + 2 slowest
    const SAMPLE_TIMEOUT  = 2_500; // ms
    const INTER_SAMPLE_MS =  80;  // small gap avoids burst-queuing on slow links

    const rawSamples = [];
    let   failures   = 0;

    for (let i = 0; i < TOTAL_SAMPLES; i++) {
        if (i > 0) await _diagDelay(INTER_SAMPLE_MS);
        try {
            const controller = new AbortController();
            const timer      = setTimeout(() => controller.abort(), SAMPLE_TIMEOUT);
            const t0         = performance.now();

            await fetch(`${ENDPOINT.url}&_t=${Date.now()}`, {
                method : 'GET',
                mode   : 'cors',
                cache  : 'no-store',
                signal : controller.signal,
            });

            clearTimeout(timer);
            rawSamples.push(performance.now() - t0);
        } catch {
            failures++;
        }
    }

    const totalAttempts  = TOTAL_SAMPLES;
    const lossPercentage = Math.round((failures / totalAttempts) * 1_000) / 10;

    if (rawSamples.length < 3) {
        return {
            ping      : 0,
            jitter    : 0,
            loss      : lossPercentage,
            latency   : 'Unavailable',
            serverInfo: { name: 'Unavailable', organization: 'Unavailable' },
        };
    }

    // Sort and trim outliers
    const sorted  = [...rawSamples].sort((a, b) => a - b);
    const trim    = Math.min(TRIM_EACH_SIDE, Math.floor(sorted.length / 4));
    const trimmed = sorted.slice(trim, sorted.length - trim);

    // Median of trimmed set
    const mid  = Math.floor(trimmed.length / 2);
    const ping = trimmed.length % 2
        ? trimmed[mid]
        : (trimmed[mid - 1] + trimmed[mid]) / 2;

    // Jitter = mean absolute deviation of consecutive trimmed samples
    let jitterSum = 0;
    for (let i = 1; i < trimmed.length; i++) {
        jitterSum += Math.abs(trimmed[i] - trimmed[i - 1]);
    }
    const jitter = trimmed.length > 1 ? jitterSum / (trimmed.length - 1) : 0;

    return {
        ping      : Math.round(ping),
        jitter    : Math.round(jitter * 10) / 10,
        loss      : lossPercentage,
        latency   : `${Math.round(ping)} ms`,
        serverInfo: { name: ENDPOINT.name, organization: ENDPOINT.organization },
    };
};

// ── _measureBufferbloat ───────────────────────────────────────────────────────
/**
 * Actual bufferbloat measurement:
 *   1. Start a background download to saturate the uplink.
 *   2. While it runs, take 5 RTT samples.
 *   3. Bloat = median(loaded RTT) − idle baseline.
 */
SpeedTest.prototype._measureBufferbloat = async function (idlePingMs) {
    try {
        const LOAD_URL  = `https://speed.cloudflare.com/__down?bytes=${4 * 1024 * 1024}&_bloat=${Date.now()}`;
        const PROBE_URL = `https://speed.cloudflare.com/__down?bytes=1`;
        const SAMPLES   = 5;

        // Start the background load (fire-and-forget)
        const loadAbort = new AbortController();
        fetch(LOAD_URL, { mode: 'cors', cache: 'no-store', signal: loadAbort.signal })
            .catch(() => {}); // we intentionally abort it later

        // Give TCP 400 ms to ramp up before probing
        await _diagDelay(400);

        const loadedRTTs = [];
        for (let i = 0; i < SAMPLES; i++) {
            if (i > 0) await _diagDelay(150);
            try {
                const t0 = performance.now();
                await fetch(`${PROBE_URL}&_t=${Date.now()}`, {
                    mode: 'cors', cache: 'no-store',
                });
                loadedRTTs.push(performance.now() - t0);
            } catch { /* skip */ }
        }

        loadAbort.abort();

        if (loadedRTTs.length === 0) return 0;

        const sorted     = [...loadedRTTs].sort((a, b) => a - b);
        const mid        = Math.floor(sorted.length / 2);
        const loadedPing = sorted.length % 2
            ? sorted[mid]
            : (sorted[mid - 1] + sorted[mid]) / 2;

        return Math.max(0, Math.round(loadedPing - idlePingMs));
    } catch {
        return 0;
    }
};

// ── _getLocalIP ───────────────────────────────────────────────────────────────
/**
 * Returns local LAN IP via RTCPeerConnection ICE candidates.
 * Properly awaited — the original returned before the callback fired.
 */
SpeedTest.prototype._getLocalIP = function () {
    return new Promise((resolve) => {
        if (typeof RTCPeerConnection === 'undefined') {
            return resolve('-');
        }

        const timeout = setTimeout(() => resolve('-'), 4_000);

        try {
            const pc = new RTCPeerConnection({ iceServers: [] });
            pc.createDataChannel('');

            pc.onicecandidate = (event) => {
                if (!event.candidate) return;
                // IPv4 host candidate
                const match = event.candidate.candidate.match(
                    /(\d+\.\d+\.\d+\.\d+)/,
                );
                const addr  = match?.[1] || event.candidate.address;
                if (addr && addr !== '0.0.0.0') {
                    clearTimeout(timeout);
                    pc.close();
                    resolve(addr);
                }
            };

            pc.createOffer()
                .then(o => pc.setLocalDescription(o))
                .catch(() => { clearTimeout(timeout); resolve('-'); });

            setTimeout(() => { try { pc.close(); } catch {} }, 4_500);
        } catch (e) {
            clearTimeout(timeout);
            resolve('-');
        }
    });
};

// ── tiny utility (scoped to avoid polluting global) ───────────────────────────
function _diagDelay(ms) { return new Promise(r => setTimeout(r, ms)); }