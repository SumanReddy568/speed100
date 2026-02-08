/**
 * Network Diagnostics Service
 * Handles IP detection, Geo-location, and Latency testing
 */

SpeedTest.prototype.getNetworkInfo = async function () {
    const networkInfo = {
        ipAddress: '-',
        localAddress: '-',
        dns: '-',
        signalStrength: '-',
        connectionType: '-',
        latency: '-',
        ping: '-',
        jitter: '-',
        packetLoss: '-',
        networkName: '-',
        location: {
            country: '-',
            city: '-',
            region: '-',
            timezone: '-',
        },
        isp: '-',
        serverInfo: {
            name: '-',
            organization: '-',
        },
        status: '-',
    };

    try {
        const hasNetworkInformationApi =
            typeof navigator !== 'undefined' &&
            navigator.connection &&
            typeof navigator.connection === 'object';

        if (hasNetworkInformationApi) {
            const connection = navigator.connection;
            networkInfo.connectionType = connection.effectiveType || connection.type || 'Unknown';
            networkInfo.networkName = connection.type || connection.effectiveType || 'Unknown';

            if (connection.downlink !== undefined) {
                networkInfo.signalStrength = `${connection.downlink} Mbps`;
            }

            if (connection.rtt) {
                networkInfo.latency = `${connection.rtt} ms`;
            }
        } else {
            console.warn('Network Information API is not available in this context.');
        }

        try {
            const ipResponse = await Promise.race([
                fetch('https://api.ipify.org?format=json', { mode: 'cors' }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
            ]);

            if (ipResponse.ok) {
                const data = await ipResponse.json();
                networkInfo.ipAddress = data.ip || 'Unavailable';

                try {
                    const geoResponse = await fetch(`https://ipwho.is/${data.ip}`, { mode: 'cors' });
                    if (geoResponse.ok) {
                        const geoData = await geoResponse.json();
                        if (geoData && geoData.success !== false) {
                            networkInfo.location.country = geoData.country || 'Unavailable';
                            networkInfo.location.city = geoData.city || 'Unavailable';
                            networkInfo.location.region = geoData.region || 'Unavailable';
                            networkInfo.location.timezone = geoData.timezone?.id || geoData.timezone || 'Unavailable';
                            networkInfo.isp = geoData.connection?.isp || geoData.connection?.org || geoData.isp || 'Unavailable';
                        } else {
                            console.warn('Geo IP lookup did not return success:', geoData?.message || 'Unknown error');
                        }
                    }
                } catch (geoError) {
                    console.warn('Geo IP lookup failed:', geoError.message);
                }
            }
        } catch (ipError) {
            console.warn('Public IP detection failed:', ipError.message);
        }

        const latencyResult = await this.testLatency();
        if (latencyResult.latency !== 'Unavailable') {
            networkInfo.latency = latencyResult.latency;
            networkInfo.ping = latencyResult.ping;
            networkInfo.jitter = latencyResult.jitter;
            networkInfo.packetLoss = latencyResult.loss;
            networkInfo.serverInfo = latencyResult.serverInfo;
        }

        try {
            const hostname =
                (typeof window !== 'undefined' && window.location && window.location.hostname) ||
                (typeof self !== 'undefined' && self.location && self.location.hostname) ||
                '';

            if (hostname) {
                const dnsResponse = await fetch('https://dns.google/resolve?name=' + hostname);
                if (dnsResponse.ok) {
                    networkInfo.dns = 'Google DNS';
                }
            } else {
                console.warn('DNS detection skipped: hostname is unavailable in this context.');
            }
        } catch (dnsError) {
            console.warn("DNS detection failed:", dnsError.message);
        }

        if (typeof RTCPeerConnection !== 'undefined') {
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
                        const localIP = event.candidate.address || event.candidate.ip;
                        if (localIP) {
                            networkInfo.localAddress = localIP;
                        }
                    }
                };

                setTimeout(() => rtcPeerConnection.close(), 5000);
            } catch (rtcError) {
                console.warn("Local network detection failed:", rtcError.message);
            }
        } else {
            console.warn('Local network detection skipped: RTCPeerConnection is not available.');
        }

        networkInfo.status = 'completed';
        return networkInfo;

    } catch (error) {
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
    let packetLossCount = 0;
    const samplesPerEndpoint = 4; // 12 samples total

    for (const endpoint of testEndpoints) {
        for (let i = 0; i < samplesPerEndpoint; i++) {
            try {
                const startTime = performance.now();
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 2000);

                await fetch(endpoint.url, {
                    method: 'HEAD',
                    mode: 'no-cors',
                    cache: 'no-store',
                    signal: controller.signal
                });

                clearTimeout(timeout);
                const endTime = performance.now();
                const latency = endTime - startTime;

                latencies.push(latency);

                if (latency < bestLatency) {
                    bestLatency = latency;
                    bestServer = endpoint;
                }
            } catch (error) {
                packetLossCount++;
            }
        }
    }

    const totalAttempts = testEndpoints.length * samplesPerEndpoint;
    const lossPercentage = (packetLossCount / totalAttempts) * 100;

    if (latencies.length > 0) {
        const pingValue = Math.min(...latencies);
        let jitterSum = 0;
        for (let i = 1; i < latencies.length; i++) {
            jitterSum += Math.abs(latencies[i] - latencies[i - 1]);
        }
        const jitterValue = latencies.length > 1 ? jitterSum / (latencies.length - 1) : 0;

        return {
            ping: Math.round(pingValue),
            jitter: Math.round(jitterValue * 10) / 10,
            loss: Math.round(lossPercentage * 10) / 10,
            latency: `${Math.round(pingValue)} ms`,
            serverInfo: {
                name: bestServer.name,
                organization: bestServer.organization
            }
        };
    }

    return {
        ping: 0,
        jitter: 0,
        loss: 100,
        latency: 'Unavailable',
        serverInfo: {
            name: 'Unavailable',
            organization: 'Unavailable'
        }
    };
};
