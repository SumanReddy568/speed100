class SpeedTest {
    constructor() {
        this.downloadSpeed = 0;
        this.uploadSpeed = 0;
        this.testRunning = false;
        this.testFileSize = 50 * 1024 * 1024; // Increased to 50MB per stream
        this.testFileUrl = 'https://speed.cloudflare.com/__down?bytes=';
        this.uploadEndpoint = 'https://speed.cloudflare.com/__up';
        this.progressCallback = null;
        this.lastUpdateTime = 0;
        this.testDuration = 10000; // 10 seconds per test stage
        this.sampleInterval = 200; // Update every 200ms
        this.uploadChunkSize = 4 * 1024 * 1024; // 4MB chunks for parallel upload
        this.minTestDuration = 3000;
        this.concurrentStreams = 4; // Use 4 parallel streams to saturate pipe
        this.warmupDuration = 1500; // Ignore first 1.5s for TCP slow start
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
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), this.testDuration + 3000);

                const response = await fetch(`${this.testFileUrl}${this.testFileSize}&t=${Date.now()}_${id}`, {
                    signal: controller.signal,
                    mode: 'cors'
                });

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
                                    uploadSpeed: this.uploadSpeed
                                });
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
                                    uploadSpeed: this.uploadSpeed
                                });
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

                const response = await fetch(`${this.testFileUrl}${currentChunkSize}&t=${Date.now()}_${bytesReceivedTotal}`, {
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

                // Add a unique timestamp and chunk offset to bypass caching and potentially WAF rules
                const url = `${this.testFileUrl}${currentRequestSize}&t=${Date.now()}_${bytesReceivedTotal}`;

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