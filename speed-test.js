class SpeedTest {
    constructor() {
        this.downloadSpeed = 0;
        this.uploadSpeed = 0;
        this.testRunning = false;
        this.testFileSize = 20 * 1024 * 1024; // 20MB per stream to reduce 429s

        // Primary: Cloudflare speed test endpoint (supports ?bytes=)
        // Fallback: Hetzner 100MB file for when Cloudflare is rate-limited/unreachable
        this.downloadEndpoints = [
            { type: 'cloudflare' },
            { type: 'hetzner' }
        ];
        this.currentDownloadEndpointIndex = 0;

        this.uploadEndpoint = 'https://speed.cloudflare.com/__up';
        this.progressCallback = null;
        this.lastUpdateTime = 0;
        this.testDuration = 10000; // 10 seconds per test stage
        this.sampleInterval = 200; // Update every 200ms
        this.uploadChunkSize = 4 * 1024 * 1024; // 4MB chunks for parallel upload
        this.minTestDuration = 3000;
        this.concurrentStreams = 2; // Further reduced to avoid 429 on strict networks
        this.warmupDuration = 1500; // Ignore first 1.5s for TCP slow start
        this.bloat = 0;
        this.baselinePing = 0;
    }

    // Build a download URL for the current endpoint.
    // For Cloudflare, we request a specific byte size; for Hetzner we use a fixed file.
    getCurrentDownloadUrl(bytes, id = 0, offset = 0) {
        const endpoint = this.downloadEndpoints[this.currentDownloadEndpointIndex] || this.downloadEndpoints[0];
        const nonce = `${Date.now()}_${id}_${offset}`;

        if (endpoint.type === 'cloudflare') {
            return `https://speed.cloudflare.com/__down?bytes=${bytes}&t=${nonce}`;
        }

        if (endpoint.type === 'hetzner') {
            // Fixed-size file; ignore `bytes`, just bust cache
            return `https://speed.hetzner.de/100MB.bin?t=${nonce}`;
        }

        // Fallback (shouldn't normally be hit)
        return `https://speed.cloudflare.com/__down?bytes=${bytes}&t=${nonce}`;
    }

    switchToNextDownloadEndpoint() {
        if (this.currentDownloadEndpointIndex < this.downloadEndpoints.length - 1) {
            this.currentDownloadEndpointIndex += 1;
            return true;
        }
        return false;
    }

    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    async testDownloadSpeed() {
        const startTime = performance.now();
        let totalBytesEverReceived = 0;
        let speedSamples = [];
        this.lastUpdateTime = startTime;

        const streamDownload = async (id) => {
            // Stagger starts to avoid burst 429s
            await new Promise(r => setTimeout(r, id * 300));
            
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), this.testDuration + 3000);

                let response = await fetch(this.getCurrentDownloadUrl(this.testFileSize, id), {
                    signal: controller.signal,
                    mode: 'cors'
                });

                // Improved 429 handling: retries + optional fallback endpoint
                let retryCount = 0;
                const maxRetries = 5;
                while (response.status === 429 && retryCount < maxRetries) {
                    retryCount++;
                    const waitTime = retryCount * 2000;
                    console.warn(`Stream ${id} rate limited (429) on endpoint index ${this.currentDownloadEndpointIndex}, retry ${retryCount}/${maxRetries} in ${waitTime}ms...`);
                    await new Promise(r => setTimeout(r, waitTime));

                    // Stop if test was aborted while waiting
                    if (controller.signal.aborted) {
                        clearTimeout(timeout);
                        return;
                    }

                    response = await fetch(this.getCurrentDownloadUrl(this.testFileSize, id), {
                        signal: controller.signal,
                        mode: 'cors'
                    });
                }

                // If still rate-limited after retries, try switching to a fallback endpoint once
                if (response.status === 429) {
                    const switched = this.switchToNextDownloadEndpoint();
                    if (switched) {
                        console.warn(`Stream ${id} still rate limited (429); switching to fallback endpoint index ${this.currentDownloadEndpointIndex}...`);
                        response = await fetch(this.getCurrentDownloadUrl(this.testFileSize, id), {
                            signal: controller.signal,
                            mode: 'cors'
                        });
                    }

                    // If we are still rate-limited (or no fallback), skip this stream instead of failing the whole test
                    if (response.status === 429) {
                        console.warn(`Stream ${id} permanently rate limited (429) after retries${switched ? ' and fallback endpoint' : ''}, skipping stream.`);
                        clearTimeout(timeout);
                        return;
                    }
                }

                if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

                const reader = response.body.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    totalBytesEverReceived += value.length;
                    const currentTime = performance.now();
                    const elapsedSinceStart = currentTime - startTime;

                    if (currentTime - this.lastUpdateTime >= this.sampleInterval) {
                        this.lastUpdateTime = currentTime;

                        if (elapsedSinceStart > this.warmupDuration) {
                            const effectiveElapsedSeconds = (elapsedSinceStart - this.warmupDuration) / 1000;
                            // Calculate current speed based on total bytes since start (smoothed)
                            const currentSpeed = (totalBytesEverReceived * 8) / (elapsedSinceStart / 1000);
                            speedSamples.push(currentSpeed);

                            this.downloadSpeed = this.calculateMedian(speedSamples.slice(-10));
                            if (this.progressCallback) {
                                this.progressCallback({
                                    downloadSpeed: this.downloadSpeed,
                                    uploadSpeed: this.uploadSpeed,
                                    bloat: this.bloat
                                });
                            }

                            // Periodically measure bloat during test window (deterministic every ~2s)
                            if (elapsedSinceStart > 2000 && elapsedSinceStart < 8500) {
                                if (!this._lastBloatTime || currentTime - this._lastBloatTime > 3000) {
                                    this._lastBloatTime = currentTime;
                                    this.measureBloat();
                                }
                            }
                        }

                        if (elapsedSinceStart >= this.testDuration) {
                            controller.abort();
                            break;
                        }
                    }
                }
                clearTimeout(timeout);
            } catch (err) {
                if (err.name !== 'AbortError') console.error(`Download Stream ${id} failed:`, err);
            }
        };

        const streams = Array.from({ length: this.concurrentStreams }, (_, i) => streamDownload(i));
        await Promise.all(streams);

        if (speedSamples.length > 0) {
            speedSamples.sort((a, b) => a - b);
            const index = Math.floor(speedSamples.length * 0.9);
            this.downloadSpeed = speedSamples[index];
        }

        return this.downloadSpeed;
    }

    async testUploadSpeed() {
        const startTime = performance.now();
        let totalBytesSent = 0;
        let speedSamples = [];
        this.lastUpdateTime = startTime;

        const streamUpload = async (id) => {
            // Stagger starts
            await new Promise(r => setTimeout(r, id * 300));
            while (performance.now() - startTime < this.testDuration) {
                try {
                    const testData = this.generateTestData(this.uploadChunkSize);
                    const blob = new Blob([testData]);
                    const chunkStart = performance.now();

                    const controller = new AbortController();
                    const timeout = setTimeout(() => controller.abort(), 5000);

                    await fetch(this.uploadEndpoint, {
                        method: 'POST',
                        body: blob,
                        signal: controller.signal,
                        mode: 'no-cors'
                    });

                    clearTimeout(timeout);
                    const chunkEnd = performance.now();
                    const chunkDuration = (chunkEnd - chunkStart) / 1000;

                    if (chunkDuration > 0.05) { // Ignore near-instantaneous (cached/error)
                        const chunkSpeed = (testData.length * 8) / chunkDuration;
                        totalBytesSent += testData.length;

                        const elapsedSinceStart = chunkEnd - startTime;

                        if (elapsedSinceStart > this.warmupDuration) {
                            speedSamples.push(chunkSpeed);

                            // Estimate current overall speed
                            this.uploadSpeed = this.calculateMedian(speedSamples.slice(-10));

                            if (this.progressCallback) {
                                this.progressCallback({
                                    downloadSpeed: this.downloadSpeed,
                                    uploadSpeed: this.uploadSpeed,
                                    bloat: this.bloat
                                });
                            }

                            // Periodically measure bloat during test window
                            const now = performance.now();
                            if (elapsedSinceStart > 2000 && elapsedSinceStart < 8500) {
                                if (!this._lastBloatTime || now - this._lastBloatTime > 3000) {
                                    this._lastBloatTime = now;
                                    this.measureBloat();
                                }
                            }
                        }
                    }
                } catch (err) {
                    if (err.name !== 'AbortError') console.error(`Upload Stream ${id} failed:`, err);
                    await new Promise(r => setTimeout(r, 100)); // Cool down on error
                }
            }
        };

        const streams = Array.from({ length: this.concurrentStreams }, (_, i) => streamUpload(i));
        await Promise.all(streams);

        if (speedSamples.length > 0) {
            speedSamples.sort((a, b) => a - b);
            const index = Math.floor(speedSamples.length * 0.9);
            this.uploadSpeed = speedSamples[index];
        }

        return this.uploadSpeed;
    }

    async testLoadSpeed(fileSizeMB) {
        const totalBytes = fileSizeMB * 1024 * 1024;
        const startTime = performance.now();
        let bytesReceivedTotal = 0;
        const chunkSize = 25 * 1024 * 1024; // 25MB chunks

        try {
            while (bytesReceivedTotal < totalBytes) {
                const currentChunkSize = Math.min(chunkSize, totalBytes - bytesReceivedTotal);
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout per chunk

                const response = await fetch(this.getCurrentDownloadUrl(currentChunkSize, 0, bytesReceivedTotal), {
                    signal: controller.signal,
                    mode: 'cors'
                });

                if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

                const reader = response.body.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    bytesReceivedTotal += value.length;
                }
                clearTimeout(timeout);
            }

            const elapsed = (performance.now() - startTime) / 1000;
            const speedMbps = (totalBytes * 8) / (elapsed * 1024 * 1024);

            return {
                fileSizeMB,
                speedMbps,
                elapsed
            };
        } catch (error) {
            console.error('Load test failed:', error);
            return {
                fileSizeMB,
                speedMbps: 0,
                elapsed: 0,
                error: error.message
            };
        }
    }

    async runLoadTest(fileSizeMB, progressCallback) {
        if (this.testRunning) return null;

        this.testRunning = true;
        const startTime = performance.now();
        let bytesReceivedTotal = 0;
        const totalBytes = fileSizeMB * 1024 * 1024;
        const chunkSize = 25 * 1024 * 1024; // Use 25MB chunks to avoid 403 and server limits

        try {
            while (bytesReceivedTotal < totalBytes) {
                const currentRequestSize = Math.min(chunkSize, totalBytes - bytesReceivedTotal);
                const controller = new AbortController();

                // Use same URL builder as core download test, keyed by current endpoint
                const url = this.getCurrentDownloadUrl(currentRequestSize, 0, bytesReceivedTotal);

                const response = await fetch(url, {
                    signal: controller.signal,
                    mode: 'cors',
                    cache: 'no-store'
                });

                if (!response.ok) {
                    if (response.status === 403) {
                        throw new Error(`Cloudflare rejected the request (403). The test size may be too large or requests too frequent.`);
                    }
                    throw new Error(`HTTP error: ${response.status}`);
                }

                const reader = response.body.getReader();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    bytesReceivedTotal += value.length;
                    const progressValue = bytesReceivedTotal / totalBytes;
                    const currentTime = performance.now();
                    const elapsedSeconds = (currentTime - startTime) / 1000;
                    const speedMbps = (bytesReceivedTotal * 8) / (elapsedSeconds * 1000000);

                    if (progressCallback) {
                        progressCallback({
                            progress: progressValue,
                            speedMbps: speedMbps,
                            bytesReceived: bytesReceivedTotal,
                            totalBytes: totalBytes,
                            elapsedSeconds: elapsedSeconds
                        });
                    }
                }
            }

            const totalTime = (performance.now() - startTime) / 1000;
            const averageSpeedMbps = (totalBytes * 8) / (totalTime * 1000000);

            return {
                success: true,
                averageSpeedMbps,
                totalTime,
                fileSizeMB
            };

        } catch (error) {
            console.error('Load test failed:', error);
            return {
                success: false,
                error: error.message
            };
        } finally {
            this.testRunning = false;
        }
    }

    generateTestData(size) {
        const chunkSize = 65536; // 64KB chunks
        const data = new Uint8Array(size);

        for (let offset = 0; offset < size; offset += chunkSize) {
            const chunk = new Uint8Array(Math.min(chunkSize, size - offset));
            for (let i = 0; i < chunk.length; i++) {
                chunk[i] = Math.floor(Math.random() * 256);
            }
            data.set(chunk, offset);
        }

        return data;
    }

    async measureBloat() {
        if (!this.baselinePing || this._bloatBlocked) return;
        
        try {
            const start = performance.now();
            const response = await fetch('https://speed.cloudflare.com/cdn-cgi/trace', { 
                mode: 'cors', 
                cache: 'no-store' 
            });

            if (response.status === 429) {
                this._bloatBlocked = true;
                return;
            }
            const end = performance.now();
            const currentPing = end - start;
            const currentBloat = Math.max(0, currentPing - this.baselinePing);
            
            // Smoothed bloat calculation
            this.bloat = Math.round((this.bloat * 0.7) + (currentBloat * 0.3));
        } catch (e) {
            // Ignore bloat measurement errors
        }
    }

    calculateMedian(values) {
        if (values.length === 0) return 0;

        values.sort((a, b) => a - b);
        const half = Math.floor(values.length / 2);

        if (values.length % 2) {
            return values[half];
        }
        return (values[half - 1] + values[half]) / 2;
    }

    async runTest() {
        if (this.testRunning) {
            return {
                download: this.downloadSpeed,
                upload: this.uploadSpeed,
                timestamp: Date.now()
            };
        }

        // Reset speeds at start
        this.downloadSpeed = 0;
        this.uploadSpeed = 0;

        this.testRunning = true;
        this._bloatBlocked = false;

        try {
            // First check connectivity
            const isOnline = await this.checkConnectivity();
            if (!isOnline) {
                return {
                    download: 0,
                    upload: 0,
                    timestamp: Date.now(),
                    error: 'No internet connection',
                    networkInfo: {
                        status: 'offline',
                        connectionType: 'Offline'
                    }
                };
            }

            // Get network info without verbose logging
            const networkInfo = await this.getNetworkInfo();

            // Run speed tests
            this.baselinePing = networkInfo.ping || 0;
            this.bloat = 0;
            
            await this.testDownloadSpeed();

            if (this.downloadSpeed > 0) {
                await this.testUploadSpeed();
            }

            return {
                download: this.downloadSpeed,
                upload: this.uploadSpeed,
                timestamp: Date.now(),
                networkInfo: networkInfo
            };
        } catch (error) {
            console.error('Speed test failed:', error);
            return {
                download: 0,
                upload: 0,
                timestamp: Date.now(),
                error: error.message,
                networkInfo: {
                    status: 'error',
                    error: error.message
                }
            };
        } finally {
            this.testRunning = false;
        }
    }

    async checkConnectivity() {
        try {
            const response = await fetch('https://www.google.com', {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-store'
            });
            return true;
        } catch (error) {
            return false;
        }
    }
}

self.SpeedTest = SpeedTest;