/**
 * SpeedTest — Rewritten for accurate ISP/Wi-Fi measurement in a Chrome extension.
 *
 * Core design:
 *
 * 1.  TIME-BINNED AGGREGATE throughput:  Wall-clock is divided into fixed bins
 *     (binMs).  Every byte delivered by *any* stream is credited to the bin it
 *     arrived in.  A bin's throughput is therefore the SUM of all concurrent
 *     streams active during that bin — the true aggregate link bandwidth, which
 *     is the entire point of running multiple parallel streams.  (The old code
 *     pushed each stream's individual speed into one array and reported the
 *     p90 of *per-stream* speeds, under-reporting an N-stream link by ~Nx.)
 *
 * 2.  SHARED bin map, not per-stream counters:  Streams contribute to a single
 *     bins map keyed by time index.  Concurrency sums naturally; streams that
 *     start late or finish early simply contribute to whichever bins they were
 *     active in.
 *
 * 3.  REFETCH loop keeps the link saturated:  Each stream re-issues fetches
 *     until the full duration elapses.  A single fixed-size fetch would drain
 *     in a fraction of a second on a fast link, leaving the rest of the window
 *     idle and measuring only TCP slow-start.  Looping keeps bytes flowing for
 *     the whole window.
 *
 * 4.  90th-PERCENTILE of per-bin aggregates:  The final figure is the p90 of
 *     completed post-warmup bin throughputs — "the best the link can sustain"
 *     rather than a median depressed by slow-start and burst gaps.
 *
 * 5.  SHORT warmup (800 ms):  Bins whose window falls inside the warmup are
 *     discarded.  TCP slow-start is typically complete within 500–800 ms for
 *     most broadband connections.
 *
 * 6.  UPLOAD reuses ONE random buffer:  The buffer is generated once and the
 *     same immutable Blob is POSTed each request, so no per-request
 *     crypto.getRandomValues stall pollutes the timing.  Each request's bytes
 *     are spread across the bins its wire-time covered, so concurrent upload
 *     streams aggregate exactly like download.
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

        // Bytes consumed by the most recent download / upload stage. Read by the
        // background worker to track data usage against a metered/cap budget.
        this.bytesDownloaded = 0;
        this.bytesUploaded   = 0;

        // ── Tuning ────────────────────────────────────────────────────────────
        this.testDuration      = 10_000; // ms  — total wall-clock per stage
        this.warmupDuration    =    800; // ms  — discard samples before this
        this.sampleInterval    =    150; // ms  — minimum gap between progress emits
        this.binMs             =    200; // ms  — aggregation bin width
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
        const testStart  = performance.now();
        const binMs      = this.binMs;
        const bins       = new Map(); // binIndex -> total bytes across ALL streams
        let   lastEmit   = 0;         // throttle progress emits (shared across streams)
        this.bytesDownloaded = 0;     // reset per-stage data-usage counter

        const binIndexAt = (now) => Math.floor((now - testStart) / binMs);

        /**
         * Every stream credits the bytes it reads to the current time bin, so a
         * bin's total is the SUM of all concurrent streams.  Each stream keeps
         * refetching until the duration elapses, so the link stays saturated for
         * the whole window instead of draining one fixed-size file and idling.
         */
        const streamDownload = async (id) => {
            // Stagger stream starts to reduce burst 429s
            await delay(id * 250);

            const controller = new AbortController();
            const hardKill   = setTimeout(() => controller.abort(), this.testDuration + 5_000);

            try {
                while (performance.now() - testStart < this.testDuration) {
                    const response = await this._fetchWithRetry(
                        () => this.getCurrentDownloadUrl(this.testFileSize, id),
                        controller,
                    );
                    if (!response) break; // permanently rate-limited → drop this stream

                    const reader = response.body.getReader();
                    let   stop   = false;

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break; // file finished → outer loop refetches

                        const now = performance.now();
                        const idx = binIndexAt(now);
                        bins.set(idx, (bins.get(idx) ?? 0) + value.length);
                        this.bytesDownloaded += value.length;

                        if (now - lastEmit >= this.sampleInterval) {
                            lastEmit = now;
                            const samples = this._binSamples(bins, binMs, this.warmupDuration, idx);
                            if (samples.length) {
                                this.downloadSpeed = this._p90(samples.slice(-15));
                                this._emitProgress();
                                this._maybeMeasureBloat(now - testStart);
                            }
                        }

                        if (now - testStart >= this.testDuration) {
                            controller.abort();
                            stop = true;
                            break;
                        }
                    }
                    if (stop) break;
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

        // Final answer: p90 of completed, post-warmup aggregate bin throughputs.
        const samples = this._binSamples(bins, binMs, this.warmupDuration, binIndexAt(performance.now()));
        if (samples.length > 0) {
            this.downloadSpeed = this._p90(samples);
        }
        return this.downloadSpeed;
    }

    // ── Upload test ──────────────────────────────────────────────────────────

    async testUploadSpeed() {
        const testStart = performance.now();
        const binMs     = this.binMs;
        const bins      = new Map(); // binIndex -> total bytes across ALL streams
        let   lastEmit  = 0;

        // Generate the random payload ONCE and reuse the same immutable Blob for
        // every request — re-running crypto.getRandomValues per request would
        // stall the event loop and pollute the timing on slower CPUs.
        const chunkSize = this.uploadChunkSize;
        const chunkBlob = new Blob([this._randomBytes(chunkSize)]);
        this.bytesUploaded = 0; // reset per-stage data-usage counter

        const binIndexAt = (now) => Math.floor((now - testStart) / binMs);

        /**
         * fetch() gives no incremental upload progress, so a request's bytes are
         * credited only on completion — but spread across the bins its wire-time
         * [start, end] covered, proportional to overlap.  Concurrent streams then
         * sum into a true aggregate per bin, exactly like download.
         */
        const creditSpread = (start, end, bytes) => {
            const dur = end - start;
            if (dur <= 0) return;
            const firstIdx = Math.floor((start - testStart) / binMs);
            const lastIdx  = Math.floor((end   - testStart) / binMs);
            for (let i = firstIdx; i <= lastIdx; i++) {
                const binStart = testStart + i * binMs;
                const overlap  = Math.min(end, binStart + binMs) - Math.max(start, binStart);
                if (overlap > 0) bins.set(i, (bins.get(i) ?? 0) + bytes * (overlap / dur));
            }
        };

        const streamUpload = async (id) => {
            await delay(id * 250);

            while (performance.now() - testStart < this.testDuration) {
                const controller = new AbortController();
                const hardKill   = setTimeout(() => controller.abort(), 8_000);

                const wireStart = performance.now();
                try {
                    await fetch(this.uploadEndpoint, {
                        method : 'POST',
                        body   : chunkBlob,
                        signal : controller.signal,
                        mode   : 'no-cors',
                    });
                    clearTimeout(hardKill);
                    this.bytesUploaded += chunkSize; // bytes went on the wire

                    const wireEnd  = performance.now();
                    const wireSecs = (wireEnd - wireStart) / 1000;

                    // Reject suspiciously fast responses (cached / no-cors swallowed)
                    if (wireSecs > 0.1) {
                        creditSpread(wireStart, wireEnd, chunkSize);

                        if (wireEnd - lastEmit >= this.sampleInterval) {
                            lastEmit = wireEnd;
                            const samples = this._binSamples(bins, binMs, this.warmupDuration, binIndexAt(wireEnd));
                            if (samples.length) {
                                this.uploadSpeed = this._p90(samples.slice(-15));
                                this._emitProgress();
                                this._maybeMeasureBloat(wireEnd - testStart);
                            }
                        }
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

        const samples = this._binSamples(bins, binMs, this.warmupDuration, binIndexAt(performance.now()));
        if (samples.length > 0) {
            this.uploadSpeed = this._p90(samples);
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

    /**
     * Convert a bins map (binIndex → bytes delivered across all streams) into an
     * array of aggregate bps samples, one per COMPLETED, post-warmup bin.
     *   - Bins whose window falls inside the warmup are dropped.
     *   - The still-filling current bin (index >= excludeFromIdx) is dropped so a
     *     partial bin never deflates the result.
     */
    _binSamples(bins, binMs, warmupMs, excludeFromIdx) {
        const binSecs    = binMs / 1000;
        const warmupBins = Math.ceil(warmupMs / binMs);
        const out = [];
        for (const [i, bytes] of bins) {
            if (i < warmupBins || i >= excludeFromIdx) continue;
            out.push((bytes * 8) / binSecs);
        }
        return out;
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