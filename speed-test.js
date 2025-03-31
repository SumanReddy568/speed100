class SpeedTest {
    constructor() {
        this.downloadSpeed = 0;
        this.uploadSpeed = 0;
        this.testRunning = false;
        this.testFileSize = 10 * 1024 * 1024; // 10MB test file
        this.testFileUrl = 'https://speed.cloudflare.com/__down?bytes=';
        this.uploadEndpoint = 'https://speed.cloudflare.com/__up';
        this.progressCallback = null;
        this.lastUpdateTime = 0;
        this.testDuration = 30000; // 30 seconds per test
        this.sampleInterval = 250; // Update every 250ms
        this.uploadChunkSize = 2 * 1024 * 1024; // 2MB chunks for upload
        this.minTestDuration = 3000; // Minimum 3 seconds for meaningful results
    }

    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    async testDownloadSpeed() {
        const startTime = performance.now();
        let bytesReceived = 0;
        this.lastUpdateTime = startTime;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.testDuration + 2000);

            const response = await fetch(`${this.testFileUrl}${this.testFileSize}&t=${Date.now()}`, {
                signal: controller.signal,
                mode: 'cors'
            });

            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

            const reader = response.body.getReader();
            let speedSamples = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                bytesReceived += value.length;
                const currentTime = performance.now();
                const elapsed = (currentTime - startTime) / 1000;

                // Calculate current speed in bits per second
                const currentSpeed = (bytesReceived * 8) / elapsed;
                speedSamples.push(currentSpeed);

                // Update at regular intervals
                if (currentTime - this.lastUpdateTime >= this.sampleInterval) {
                    // Use median of recent samples to smooth fluctuations
                    const medianSpeed = this.calculateMedian(speedSamples.slice(-5));
                    this.downloadSpeed = medianSpeed;

                    if (this.progressCallback) {
                        this.progressCallback({
                            downloadSpeed: this.downloadSpeed,
                            uploadSpeed: this.uploadSpeed
                        });
                    }

                    this.lastUpdateTime = currentTime;

                    // Stop if we've reached the test duration
                    if (currentTime - startTime >= this.testDuration) {
                        controller.abort();
                        break;
                    }
                }
            }

            clearTimeout(timeout);

            // Final calculation using all samples
            if (speedSamples.length > 0) {
                this.downloadSpeed = this.calculateMedian(speedSamples);
            }

            return this.downloadSpeed;
        } catch (error) {
            console.error('Download test failed:', error);
            this.downloadSpeed = 0;
            return this.downloadSpeed || 0;
        }
    }

    async testUploadSpeed() {
        const startTime = performance.now();
        let bytesSent = 0;
        this.lastUpdateTime = startTime;

        try {
            // Generate random test data
            const testData = this.generateTestData(this.uploadChunkSize);
            const blob = new Blob([testData]);

            let speedSamples = [];
            let lastSampleTime = startTime;
            let lastBytesSent = 0;

            // We'll use fetch with timing measurements since we can't track progress in service workers
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.testDuration);

            // Start timing the upload
            const uploadStart = performance.now();
            const response = await fetch(this.uploadEndpoint, {
                method: 'POST',
                body: blob,
                signal: controller.signal,
                mode: 'no-cors',
                headers: {
                    'Content-Type': 'application/octet-stream'
                }
            });

            // Even though we can't read the response, we can measure the time it took
            const uploadEnd = performance.now();
            const uploadTime = (uploadEnd - uploadStart) / 1000; // in seconds

            // Calculate speed (total bytes * 8 bits/byte / time in seconds)
            bytesSent = testData.length;
            const speed = (bytesSent * 8) / uploadTime;
            speedSamples.push(speed);

            // To get more samples, we'll do multiple smaller uploads
            const chunkCount = Math.min(5, Math.floor(this.testDuration / 2000)); // Aim for ~2s per chunk
            const chunkSize = Math.floor(this.uploadChunkSize / 2); // Smaller chunks for more samples

            if (chunkCount > 1) {
                for (let i = 0; i < chunkCount; i++) {
                    if (performance.now() - startTime >= this.testDuration) break;

                    const chunkData = this.generateTestData(chunkSize);
                    const chunkBlob = new Blob([chunkData]);

                    const chunkStart = performance.now();
                    await fetch(this.uploadEndpoint, {
                        method: 'POST',
                        body: chunkBlob,
                        mode: 'no-cors',
                        headers: {
                            'Content-Type': 'application/octet-stream'
                        }
                    });
                    const chunkEnd = performance.now();
                    const chunkTime = (chunkEnd - chunkStart) / 1000;

                    if (chunkTime > 0.1) { // Ignore very fast measurements
                        const chunkSpeed = (chunkData.length * 8) / chunkTime;
                        speedSamples.push(chunkSpeed);
                        bytesSent += chunkData.length;
                    }
                }
            }

            clearTimeout(timeout);

            // Calculate final speed (use 90th percentile to avoid outliers)
            if (speedSamples.length > 0) {
                speedSamples.sort((a, b) => a - b);
                const percentile90 = Math.floor(speedSamples.length * 0.9);
                this.uploadSpeed = speedSamples[percentile90];
            } else {
                // Fallback to total bytes / total time
                const totalTime = (performance.now() - startTime) / 1000;
                this.uploadSpeed = totalTime > 0 ? (bytesSent * 8) / totalTime : 0;
            }

            if (this.progressCallback) {
                this.progressCallback({
                    downloadSpeed: this.downloadSpeed,
                    uploadSpeed: this.uploadSpeed
                });
            }

            return this.uploadSpeed;
        } catch (error) {
            console.error('Upload test failed:', error);
            this.uploadSpeed = 0;
            return this.uploadSpeed || 0;
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
    
            // Get network info first
            const networkInfo = await this.getNetworkInfo();
            
            // Run speed tests
            await this.testDownloadSpeed();
            
            // Only proceed with upload test if we got a reasonable download speed
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

SpeedTest.prototype.getNetworkInfo = async function () {
    const networkInfo = {
        ipAddress: 'Unavailable',
        dns: 'Unavailable',
        signalStrength: 'Unavailable',
        connectionType: 'Unavailable',
        latency: 'Unavailable',
        // Added new metadata fields
        networkName: 'Unavailable',
        location: {
            country: 'Unavailable',
            city: 'Unavailable',
            region: 'Unavailable',
            timezone: 'Unavailable'
        },
        isp: 'Unavailable',
        serverInfo: {
            name: 'Unavailable',
            organization: 'Unavailable'
        },
        status: 'detecting'
    };

    try {
        console.log("Starting network detection...");

        // 1. Check Network Information API
        if (navigator.connection) {
            networkInfo.connectionType = navigator.connection.effectiveType || 'Unknown';
            networkInfo.networkName = navigator.connection.type || 'Unknown';

            if (navigator.connection.downlink !== undefined) {
                networkInfo.signalStrength = `${navigator.connection.downlink} Mbps`;
            }

            if (navigator.connection.rtt) {
                networkInfo.latency = `${navigator.connection.rtt} ms`;
            }
        }

        // 2. Get IP Address and Extended Network Information
        try {
            console.log("Fetching IP and network details...");
            const ipResponse = await Promise.race([
                fetch('https://ipapi.co/json/', { mode: 'cors' }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
            ]);

            if (ipResponse.ok) {
                const data = await ipResponse.json();
                networkInfo.ipAddress = data.ip || 'Unavailable';
                networkInfo.location.country = data.country_name || 'Unavailable';
                networkInfo.location.city = data.city || 'Unavailable';
                networkInfo.location.region = data.region || 'Unavailable';
                networkInfo.location.timezone = data.timezone || 'Unavailable';
                networkInfo.isp = data.org || 'Unavailable';
                console.log("Network details fetched successfully");
            }
        } catch (ipError) {
            console.warn("Primary network detection failed:", ipError.message);
            // Fallback to ipify for basic IP
            try {
                const fallbackResponse = await fetch('https://api.ipify.org?format=json', { mode: 'cors' });
                if (fallbackResponse.ok) {
                    const data = await fallbackResponse.json();
                    networkInfo.ipAddress = data.ip || 'Unavailable';
                    console.log("Fallback IP fetched:", networkInfo.ipAddress);
                }
            } catch (fallbackError) {
                console.warn("Fallback IP detection failed:", fallbackError.message);
            }
        }

        // 3. Enhanced Latency Test with Server Information
        console.log("Performing enhanced latency test...");
        const latencyResult = await this.testLatency();
        if (latencyResult.latency !== 'Unavailable') {
            networkInfo.latency = latencyResult.latency;
            networkInfo.serverInfo = latencyResult.serverInfo;
        }

        // 4. DNS Detection
        try {
            const dnsResponse = await fetch('https://dns.google/resolve?name=' + window.location.hostname);
            if (dnsResponse.ok) {
                networkInfo.dns = 'Google DNS';
            }
        } catch (dnsError) {
            console.warn("DNS detection failed:", dnsError.message);
        }

        // 5. Get Local Network Info
        try {
            const rtcPeerConnection = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            
            rtcPeerConnection.createDataChannel("");
            rtcPeerConnection.createOffer()
                .then(offer => rtcPeerConnection.setLocalDescription(offer))
                .catch(err => console.warn("RTC local detection failed:", err));

            rtcPeerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    const localIP = event.candidate.address;
                    if (localIP) {
                        networkInfo.localAddress = localIP;
                    }
                }
            };
        } catch (rtcError) {
            console.warn("Local network detection failed:", rtcError.message);
        }

        networkInfo.status = 'completed';
        console.log("Network detection completed:", networkInfo);
        return networkInfo;

    } catch (error) {
        console.error("Error getting network info:", error);
        networkInfo.status = 'error';
        networkInfo.error = error.message || 'Unknown error occurred';
        return networkInfo;
    }
};

SpeedTest.prototype.testLatency = async function () {
    const testEndpoints = [
        {
            url: 'https://www.google.com',
            name: 'Google',
            organization: 'Google LLC'
        },
        {
            url: 'https://www.cloudflare.com',
            name: 'Cloudflare',
            organization: 'Cloudflare, Inc.'
        },
        {
            url: 'https://www.amazon.com',
            name: 'Amazon',
            organization: 'Amazon.com, Inc.'
        }
    ];

    let latencies = [];
    let bestServer = null;
    let bestLatency = Infinity;

    for (const endpoint of testEndpoints) {
        try {
            console.log(`Pinging ${endpoint.url}...`);
            const startTime = performance.now();
            await fetch(endpoint.url, {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-store'
            });
            const endTime = performance.now();
            const latency = endTime - startTime;
            latencies.push(latency);

            if (latency < bestLatency) {
                bestLatency = latency;
                bestServer = endpoint;
            }
        } catch (error) {
            console.warn(`Latency test to ${endpoint.url} failed:`, error.message);
        }
    }

    if (latencies.length > 0) {
        const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
        console.log("Latency calculated:", avgLatency);
        return {
            latency: `${avgLatency} ms`,
            serverInfo: {
                name: bestServer.name,
                organization: bestServer.organization
            }
        };
    }
    return {
        latency: 'Unavailable',
        serverInfo: {
            name: 'Unavailable',
            organization: 'Unavailable'
        }
    };
};

self.SpeedTest = SpeedTest;