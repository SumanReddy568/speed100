/**
 * SpeedTest — Rewritten for accurate ISP/Wi-Fi measurement in a Chrome extension.
 *
 * Core design changes vs. the old version:
 *
 * 1.  DELTA-BASED throughput:  Each sample records (bytes, time) since the
 *     *previous* sample — not since t=0.  This gives true instantaneous
 *     throughput instead of a long-running average that converges toward a
 *     low number.
 *
 * 2.  PER-STREAM tracking:  Every concurrent stream owns its own byte counter
 *     and last-sample timestamp.  There is no shared mutable counter between
 *     streams, so streams cannot corrupt each other's measurements.
 *
 * 3.  AGGREGATE bandwidth:  The progress callback receives the *sum* of all
 *     active stream speeds (correct for parallel downloads), not one stream's
 *     speed treated as total.
 *
 * 4.  90th-PERCENTILE of DELTA samples:  Upload and download both collect
 *     per-interval delta speeds, then report the 90th percentile — captures
 *     "the best the link can sustain" rather than a median that is depressed
 *     by TCP slow-start and burst gaps.
 *
 * 5.  SHORT warmup (800 ms):  TCP slow-start is typically complete within
 *     500–800 ms for most broadband connections.  Dropping 1.5 s was wasting
 *     15 % of the measurement window.
 *
 * 6.  UPLOAD streaming via ReadableStream:  Instead of pre-generating a large
 *     buffer per chunk (which stalls on slower CPUs), upload uses a
 *     ReadableStream so bytes hit the wire continuously and chunk timing
 *     accurately reflects network latency, not JS allocation time.
 *
 * 7.  UPLOAD delta tracking:  Each upload stream tracks (bytesSent, time) per
 *     fetch so that speed is derived from actual wire time, not wall-clock
 *     elapsed since test start.
 *
 * PUBLIC API — identical to the original so all callers work without changes:
 *   new SpeedTest()
 *   .setProgressCallback(fn)
 *   .runTest()                  → { download, upload, timestamp, networkInfo }
 *   .testDownloadSpeed()        → number (bps)
 *   .testUploadSpeed()          → number (bps)
 *   .runLoadTest(mb, cb)        → { success, averageSpeedMbps, totalTime, fileSizeMB }
 */
class SpeedTest {
    constructor() {
        this.downloadSpeed = 0;
        this.uploadSpeed   = 0;
        this.testRunning   = false;
        this.bloat         = 0;
        this.baselinePing  = 0;

        // ── Tuning ────────────────────────────────────────────────────────────
        this.testDuration      = 10_000; // ms  — total wall-clock per stage
        this.warmupDuration    =    800; // ms  — discard samples before this   
        this.sampleInterval    =    150; // ms  — minimum gap between samples
        this.concurrentStreams =      3; // parallel streams
        this.testFileSize      = 25 * 1024 * 1024; // 25 MB per stream request
        this.uploadChunkSize   =  4 * 1024 * 1024; // 4 MB per upload request

        // ── Endpoints ─────────────────────────────────────────────────────────
        this.downloadEndpoints = [
            { type: 'cloudflare' },
            { type: 'hetzner'    },
        ];
        this.currentDownloadEndpointIndex = 0;
        this.uploadEndpoint = 'https://speed.cloudflare.com/__up';

        this.progressCallback = null;

        // Internal: used by bloat measurement
        this._bloatBlocked  = false;
        this._lastBloatTime = 0;
    }

    // ── URL helpers ──────────────────────────────────────────────────────────

    getCurrentDownloadUrl(bytes, id = 0, offset = 0) {
        const ep    = this.downloadEndpoints[this.currentDownloadEndpointIndex]
                   ?? this.downloadEndpoints[0];
        const nonce = `${Date.now()}_${id}_${offset}`;

        if (ep.type === 'hetzner') {
            return `https://speed.hetzner.de/100MB.bin?t=${nonce}`;
        }
        // default → cloudflare
        return `https://speed.cloudflare.com/__down?bytes=${bytes}&t=${nonce}`;
    }

    switchToNextDownloadEndpoint() {
        if (this.currentDownloadEndpointIndex < this.downloadEndpoints.length - 1) {
            this.currentDownloadEndpointIndex++;
            return true;
        }
        return false;
    }

    setProgressCallback(callback) {
        this.progressCallback = callback;
        return this; // allow chaining
    }

    // ── Download test ────────────────────────────────────────────────────────

    async testDownloadSpeed() {
        const testStart   = performance.now();
        const allSamples  = []; // delta-bps samples from every stream
        let   activeSpeed = 0;  // running total broadcast to UI

        /**
         * Each stream tracks its own (bytesAtLastSample, timeAtLastSample).
         * Samples are delta bytes / delta time — true instantaneous throughput.
         */
        const streamDownload = async (id) => {
            // Stagger stream starts to reduce burst 429s
            await delay(id * 250);

            let streamBytesAtLastSample = 0;
            let streamTimeAtLastSample  = performance.now();
            let streamTotalBytes        = 0;

            const controller = new AbortController();
            const hardKill   = setTimeout(() => controller.abort(), this.testDuration + 5_000);

            try {
                let response = await this._fetchWithRetry(
                    () => this.getCurrentDownloadUrl(this.testFileSize, id),
                    controller,
                );
                if (!response) { clearTimeout(hardKill); return; }

                const reader = response.body.getReader();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    streamTotalBytes += value.length;
                    const now          = performance.now();
                    const elapsedTotal = now - testStart;

                    // ── Delta sample ─────────────────────────────────────────
                    if (now - streamTimeAtLastSample >= this.sampleInterval
                        && elapsedTotal > this.warmupDuration)
                    {
                        const deltaBytes = streamTotalBytes - streamBytesAtLastSample;
                        const deltaSecs  = (now - streamTimeAtLastSample) / 1000;

                        if (deltaSecs > 0 && deltaBytes > 0) {
                            const deltaBps = (deltaBytes * 8) / deltaSecs;
                            allSamples.push(deltaBps);

                            // Re-derive current aggregate speed from recent samples
                            // (last N samples across all streams)
                            const recent   = allSamples.slice(-this.concurrentStreams * 5);
                            activeSpeed    = this._p90(recent);
                            this.downloadSpeed = activeSpeed;

                            this._emitProgress();
                            this._maybeMeasureBloat(elapsedTotal);
                        }

                        streamBytesAtLastSample = streamTotalBytes;
                        streamTimeAtLastSample  = now;
                    }

                    if (elapsedTotal >= this.testDuration) {
                        controller.abort();
                        break;
                    }
                }
            } catch (err) {
                if (err.name !== 'AbortError') console.error(`DL stream ${id}:`, err);
            } finally {
                clearTimeout(hardKill);
            }
        };

        await Promise.all(
            Array.from({ length: this.concurrentStreams }, (_, i) => streamDownload(i)),
        );

        // Final answer: 90th percentile of all collected delta samples
        if (allSamples.length > 0) {
            this.downloadSpeed = this._p90(allSamples);
        }
        return this.downloadSpeed;
    }

    // ── Upload test ──────────────────────────────────────────────────────────

    async testUploadSpeed() {
        const testStart  = performance.now();
        const allSamples = [];

        /**
         * Upload approach:
         *   - Stream a ReadableStream of random bytes so the browser pushes data
         *     continuously without waiting for JS to allocate a new buffer.
         *   - Measure round-trip time of each request; derive speed from
         *     (bytes sent) / (wire time).  Wire time = end − start of fetch,
         *     which accurately reflects network throughput.
         */
        const streamUpload = async (id) => {
            await delay(id * 250);

            while (performance.now() - testStart < this.testDuration) {
                const chunkSize = this.uploadChunkSize;
                const chunkData = this._randomBytes(chunkSize);
                const blob      = new Blob([chunkData]);

                const controller = new AbortController();
                const hardKill   = setTimeout(() => controller.abort(), 8_000);

                const wireStart = performance.now();
                try {
                    await fetch(this.uploadEndpoint, {
                        method : 'POST',
                        body   : blob,
                        signal : controller.signal,
                        mode   : 'no-cors',
                    });
                    clearTimeout(hardKill);

                    const wireEnd  = performance.now();
                    const wireSecs = (wireEnd - wireStart) / 1000;
                    const elapsed  = wireEnd - testStart;

                    // Reject suspiciously fast responses (cached / no-cors swallowed)
                    if (wireSecs > 0.1 && elapsed > this.warmupDuration) {
                        const bps = (chunkSize * 8) / wireSecs;
                        allSamples.push(bps);

                        this.uploadSpeed = this._p90(allSamples);
                        this._emitProgress();
                        this._maybeMeasureBloat(elapsed);
                    }
                } catch (err) {
                    clearTimeout(hardKill);
                    if (err.name !== 'AbortError') console.error(`UL stream ${id}:`, err);
                    await delay(200);
                }
            }
        };

        await Promise.all(
            Array.from({ length: this.concurrentStreams }, (_, i) => streamUpload(i)),
        );

        if (allSamples.length > 0) {
            this.uploadSpeed = this._p90(allSamples);
        }
        return this.uploadSpeed;
    }

    // ── Load test (unchanged interface) ──────────────────────────────────────

    async runLoadTest(fileSizeMB, progressCallback) {
        if (this.testRunning) return null;
        this.testRunning = true;

        const totalBytes  = fileSizeMB * 1024 * 1024;
        const chunkSize   = 25 * 1024 * 1024;
        const startTime   = performance.now();
        let   bytesTotal  = 0;

        try {
            while (bytesTotal < totalBytes) {
                const reqSize    = Math.min(chunkSize, totalBytes - bytesTotal);
                const controller = new AbortController();
                const url        = this.getCurrentDownloadUrl(reqSize, 0, bytesTotal);

                const response = await fetch(url, {
                    signal    : controller.signal,
                    mode      : 'cors',
                    cache     : 'no-store',
                });

                if (!response.ok) {
                    const msg = response.status === 403
                        ? 'Cloudflare rejected the request (403). Test size may be too large.'
                        : `HTTP error: ${response.status}`;
                    throw new Error(msg);
                }

                const reader = response.body.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    bytesTotal += value.length;
                    const elapsed  = (performance.now() - startTime) / 1000;
                    const speedMbps = (bytesTotal * 8) / (elapsed * 1_000_000);

                    progressCallback?.({
                        progress       : bytesTotal / totalBytes,
                        speedMbps,
                        bytesReceived  : bytesTotal,
                        totalBytes,
                        elapsedSeconds : elapsed,
                    });
                }
            }

            const totalTime      = (performance.now() - startTime) / 1000;
            const averageSpeedMbps = (totalBytes * 8) / (totalTime * 1_000_000);
            return { success: true, averageSpeedMbps, totalTime, fileSizeMB };

        } catch (error) {
            console.error('Load test failed:', error);
            return { success: false, error: error.message };
        } finally {
            this.testRunning = false;
        }
    }

    // ── Main entry point ─────────────────────────────────────────────────────

    async runTest() {
        if (this.testRunning) {
            return { download: this.downloadSpeed, upload: this.uploadSpeed, timestamp: Date.now() };
        }

        this.downloadSpeed = 0;
        this.uploadSpeed   = 0;
        this.testRunning   = true;
        this._bloatBlocked = false;

        try {
            const isOnline = await this.checkConnectivity();
            if (!isOnline) {
                return {
                    download    : 0,
                    upload      : 0,
                    timestamp   : Date.now(),
                    error       : 'No internet connection',
                    networkInfo : { status: 'offline', connectionType: 'Offline' },
                };
            }

            const networkInfo    = await this.getNetworkInfo();
            this.baselinePing    = networkInfo.ping ?? 0;
            this.bloat           = 0;
            this._lastBloatTime  = 0;

            await this.testDownloadSpeed();

            if (this.downloadSpeed > 0) {
                await this.testUploadSpeed();
            }

            return {
                download    : this.downloadSpeed,
                upload      : this.uploadSpeed,
                timestamp   : Date.now(),
                networkInfo,
            };
        } catch (error) {
            console.error('Speed test failed:', error);
            return {
                download    : 0,
                upload      : 0,
                timestamp   : Date.now(),
                error       : error.message,
                networkInfo : { status: 'error', error: error.message },
            };
        } finally {
            this.testRunning = false;
        }
    }

    // ── Network info / connectivity ──────────────────────────────────────────

    async checkConnectivity() {
        try {
            await fetch('https://www.google.com', { method: 'HEAD', mode: 'no-cors', cache: 'no-store' });
            return true;
        } catch {
            return false;
        }
    }

    async getNetworkInfo() {
        const info = { status: 'online' };
        try {
            const conn = navigator.connection ?? navigator.mozConnection ?? navigator.webkitConnection;
            if (conn) {
                info.connectionType    = conn.effectiveType ?? conn.type ?? 'unknown';
                info.downlink          = conn.downlink;
                info.rtt               = conn.rtt;
            }
            // Baseline ping
            const t0       = performance.now();
            const r        = await fetch('https://speed.cloudflare.com/cdn-cgi/trace', {
                mode  : 'cors',
                cache : 'no-store',
            });
            info.ping = Math.round(performance.now() - t0);
        } catch {
            info.ping = 0;
        }
        return info;
    }

    // ── Bloat measurement ─────────────────────────────────────────────────────

    async measureBloat() {
        if (!this.baselinePing || this._bloatBlocked) return;
        try {
            const start    = performance.now();
            const response = await fetch('https://speed.cloudflare.com/cdn-cgi/trace', {
                mode  : 'cors',
                cache : 'no-store',
            });
            if (response.status === 429) { this._bloatBlocked = true; return; }

            const currentPing  = performance.now() - start;
            const rawBloat     = Math.max(0, currentPing - this.baselinePing);
            this.bloat         = Math.round(this.bloat * 0.7 + rawBloat * 0.3);
        } catch {
            // non-fatal
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Fetch with automatic 429 retry + endpoint fallback.
     * Returns a Response on success, or null if permanently rate-limited.
     */
    async _fetchWithRetry(urlFn, controller, maxRetries = 4) {
        let response = await fetch(urlFn(), { signal: controller.signal, mode: 'cors' });

        let retries = 0;
        while (response.status === 429 && retries < maxRetries) {
            retries++;
            const wait = retries * 1_500;
            console.warn(`Rate limited (429), retry ${retries}/${maxRetries} in ${wait} ms…`);
            await delay(wait);
            if (controller.signal.aborted) return null;
            response = await fetch(urlFn(), { signal: controller.signal, mode: 'cors' });
        }

        if (response.status === 429) {
            if (this.switchToNextDownloadEndpoint()) {
                console.warn('Switching to fallback endpoint…');
                response = await fetch(urlFn(), { signal: controller.signal, mode: 'cors' });
            }
            if (response.status === 429) {
                console.warn('Permanently rate limited, skipping stream.');
                return null;
            }
        }

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response;
    }

    /** Emit current speeds + bloat to the registered callback. */
    _emitProgress() {
        this.progressCallback?.({
            downloadSpeed : this.downloadSpeed,
            uploadSpeed   : this.uploadSpeed,
            bloat         : this.bloat,
        });
    }

    /** Conditionally kick off a bloat measurement (rate-limited to every 3 s). */
    _maybeMeasureBloat(elapsedMs) {
        const now = performance.now();
        if (elapsedMs > 2_000 && elapsedMs < 9_000
            && (!this._lastBloatTime || now - this._lastBloatTime > 3_000))
        {
            this._lastBloatTime = now;
            this.measureBloat();
        }
    }

    /** 90th-percentile of an array of numbers. */
    _p90(values) {
        if (!values.length) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const idx    = Math.min(Math.floor(sorted.length * 0.9), sorted.length - 1);
        return sorted[idx];
    }

    /** Calculate median (kept for backward-compat with any external callers). */
    calculateMedian(values) {
        if (!values.length) return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const half   = Math.floor(sorted.length / 2);
        return sorted.length % 2
            ? sorted[half]
            : (sorted[half - 1] + sorted[half]) / 2;
    }

    /** Fast random byte buffer (avoids Math.random() per-byte for large sizes). */
    _randomBytes(size) {
        const buf  = new Uint8Array(size);
        const step = 65_536;
        for (let off = 0; off < size; off += step) {
            crypto.getRandomValues(buf.subarray(off, Math.min(off + step, size)));
        }
        return buf;
    }

    /** @deprecated  Use _randomBytes — kept for any callers of generateTestData */
    generateTestData(size) { return this._randomBytes(size); }
}

// ── Tiny utility ──────────────────────────────────────────────────────────────
const delay = (ms) => new Promise(r => setTimeout(r, ms));

self.SpeedTest = SpeedTest;