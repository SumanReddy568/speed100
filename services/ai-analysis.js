class NetworkAIAnalysis {
    constructor() {
        this.historicalData = [];
        this.patterns = {};
        this.anomalies = [];
        this.openRouterApiKey = undefined;
        this.openRouterTimeoutMs = 12000;
        this.llmModel = undefined;
        this.lastLLMError = null;

        // Listen for changes to API key and LLM model in Chrome storage
        if (typeof chrome !== 'undefined' &&
            chrome.storage &&
            chrome.storage.onChanged &&
            typeof chrome.storage.onChanged.addListener === 'function') {
            chrome.storage.onChanged.addListener((changes, areaName) => {
                if (areaName === 'local') {
                    if (changes.openRouterApiKey) {
                        this.openRouterApiKey = changes.openRouterApiKey.newValue || null;
                    }
                    if (changes.llmModel) {
                        this.llmModel = changes.llmModel.newValue || null;
                    }
                }
                if (areaName === 'sync' && changes.llmModel) {
                    this.llmModel = changes.llmModel.newValue || null;
                }
            });
        }

        // Load initial llmModel from storage
        this.loadLLMModelFromStorage();
    }

    async loadLLMModelFromStorage() {
        // Try local first, then sync
        if (typeof chrome !== 'undefined' && chrome.storage) {
            try {
                const local = await new Promise((resolve) => {
                    chrome.storage.local.get(['llmModel'], resolve);
                });
                if (local && local.llmModel) {
                    this.llmModel = local.llmModel;
                    return;
                }
                const sync = await new Promise((resolve) => {
                    chrome.storage.sync.get(['llmModel'], resolve);
                });
                if (sync && sync.llmModel) {
                    this.llmModel = sync.llmModel;
                    return;
                }
            } catch (e) {
                // fallback
                this.llmModel = undefined;
            }
        }
        // Default fallback if nothing set
        if (!this.llmModel) {
            this.llmModel = 'kwaipilot/kat-coder-pro:free';
        }
    }

    async analyzeSpeedTest(result) {
        const performance = this.analyzePerformance(result);
        const prediction = this.predictNextTest(result);
        const historicalInsights = this.analyzeHistoricalData();
        const anomalies = this.detectAnomalies(result); // Detect anomalies in the current test

        const recommendations = this.generateRecommendations(result, {
            issues: performance.issues,
            insights: historicalInsights,
            anomalies
        });

        // Get user info from storage
        const userInfo = await this.getUserInfo();

        const analysis = {
            performance,
            recommendations,
            prediction,
            historicalInsights,
            anomalies,
            meta: {
                summarySource: 'heuristic',
                llmUsed: false,
                llmModel: null,
                llmError: null,
                generatedAt: new Date().toISOString(),
                userId: userInfo.userId,
                email: userInfo.email,
                aiOverrides: {
                    summary: false,
                    recommendations: false,
                    prediction: false,
                    issues: false,
                    strengths: false
                }
            }
        };

        analysis.performance.summary = this.generateHeuristicSummary(result, analysis);

        const llmResult = await this.generateLLMInsights(result, analysis);

        if (llmResult?.summary) {
            analysis.performance.summary = llmResult.summary;
            analysis.llmSummary = llmResult.summary;
            analysis.meta.summarySource = 'openrouter';
            analysis.meta.llmUsed = true;
            analysis.meta.llmModel = llmResult.model || this.llmModel;
            analysis.meta.aiOverrides.summary = true;
        }

        if (llmResult?.structured) {
            analysis.meta.llmUsed = true;
            analysis.meta.llmModel = llmResult.model || this.llmModel;
            if (analysis.meta.summarySource === 'heuristic') {
                analysis.meta.summarySource = 'hybrid';
            }

            const structured = llmResult.structured;

            if (Array.isArray(structured.recommendations) && structured.recommendations.length > 0) {
                analysis.recommendations = structured.recommendations;
                analysis.meta.aiOverrides.recommendations = true;
            }

            if (structured.prediction) {
                const updatedPrediction = { ...analysis.prediction };
                if (typeof structured.prediction.downloadSpeed === 'number') {
                    updatedPrediction.downloadSpeed = structured.prediction.downloadSpeed;
                }
                if (typeof structured.prediction.uploadSpeed === 'number') {
                    updatedPrediction.uploadSpeed = structured.prediction.uploadSpeed;
                }
                if (structured.prediction.confidence) {
                    updatedPrediction.confidence = structured.prediction.confidence;
                }
                if (structured.prediction.notes) {
                    updatedPrediction.notes = structured.prediction.notes;
                }
                analysis.prediction = updatedPrediction;
                analysis.meta.aiOverrides.prediction = true;
            }

            if (Array.isArray(structured.issues) && structured.issues.length > 0) {
                analysis.performance.issues = structured.issues;
                analysis.meta.aiOverrides.issues = true;
            }

            if (Array.isArray(structured.strengths) && structured.strengths.length > 0) {
                analysis.performance.strengths = structured.strengths;
                analysis.meta.aiOverrides.strengths = true;
            }
        }

        if (llmResult?.error) {
            analysis.meta.llmError = llmResult.error;
            this.lastLLMError = llmResult.error;
        }

        if (llmResult?.reason === 'missing_api_key') {
            analysis.meta.llmError = 'Add your OpenRouter API key in settings to enable AI summaries or check https://openrouter.ai/docs/overview/models to get started.';
        }

        this.updateHistoricalData(result); // Update historical data
        this.updatePatterns(result);
        return analysis;
    }

    async getUserInfo() {
        if (typeof chrome === 'undefined' ||
            !chrome.storage ||
            !chrome.storage.local ||
            typeof chrome.storage.local.get !== 'function') {
            return { userId: null, email: null };
        }

        try {
            const result = await new Promise((resolve) => {
                chrome.storage.local.get(['user_id', 'user_email'], resolve);
            });
            return {
                userId: result.user_id || null,
                email: result.user_email || null
            };
        } catch (error) {
            console.warn('User info lookup failed:', error);
            return { userId: null, email: null };
        }
    }

    analyzePerformance(result) {
        const downloadMbps = result.downloadSpeed / 1000000;
        const uploadMbps = result.uploadSpeed / 1000000;

        return {
            rating: this.calculateRating(downloadMbps, uploadMbps),
            issues: this.identifyIssues(result),
            strengths: this.identifyStrengths(result)
        };
    }

    calculateRating(downloadMbps, uploadMbps) {
        const ratings = {
            download: this.getRating(downloadMbps, [10, 25, 50, 100]),
            upload: this.getRating(uploadMbps, [5, 10, 20, 40]),
            overall: 0
        };

        ratings.overall = (ratings.download + ratings.upload) / 2;
        return ratings;
    }

    getRating(speed, thresholds) {
        if (speed >= thresholds[3]) return 5; // Excellent
        if (speed >= thresholds[2]) return 4; // Good
        if (speed >= thresholds[1]) return 3; // Average
        if (speed >= thresholds[0]) return 2; // Poor
        return 1; // Very Poor
    }

    identifyIssues(result) {
        const issues = [];
        const downloadMbps = result.downloadSpeed / 1000000;
        const uploadMbps = result.uploadSpeed / 1000000;

        if (downloadMbps < 10) issues.push({
            type: 'low_download',
            message: 'Low download speed may affect streaming and downloads',
            severity: 'high'
        });

        if (uploadMbps < 5) issues.push({
            type: 'low_upload',
            message: 'Low upload speed may affect video calls and file sharing',
            severity: 'medium'
        });

        if (result.networkInfo?.latency > 100) issues.push({
            type: 'high_latency',
            message: 'High latency may cause delays in online gaming and real-time applications',
            severity: 'medium'
        });

        return issues;
    }

    identifyStrengths(result) {
        const strengths = [];
        const downloadMbps = result.downloadSpeed / 1000000;
        const uploadMbps = result.uploadSpeed / 1000000;

        if (downloadMbps > 50) strengths.push({
            type: 'high_download',
            message: 'High download speed is great for streaming and large downloads',
            severity: 'low'
        });

        if (uploadMbps > 20) strengths.push({
            type: 'high_upload',
            message: 'High upload speed is excellent for video conferencing and file sharing',
            severity: 'low'
        });

        if (result.networkInfo?.latency < 50) strengths.push({
            type: 'low_latency',
            message: 'Low latency ensures smooth online gaming and real-time interactions',
            severity: 'low'
        });

        return strengths;
    }

    // Enhanced historical data analysis with seasonality
    analyzeHistoricalData() {
        const insights = {
            trends: [],
            averages: {
                daily: { download: 0, upload: 0 },
                weekly: { download: 0, upload: 0 }
            },
            peakHours: [],
            consistency: 'stable',
            timeOfDayPatterns: {},
            seasonalPatterns: {} // New: Seasonal patterns
        };

        if (this.historicalData.length === 0) {
            return null;
        }

        // Calculate daily averages
        const last24Hours = this.historicalData.filter(d =>
            Date.now() - d.timestamp < 24 * 60 * 60 * 1000
        );

        if (last24Hours.length > 0) {
            insights.averages.daily = {
                download: this.calculateAverage(last24Hours, 'downloadSpeed') / 1000000,
                upload: this.calculateAverage(last24Hours, 'uploadSpeed') / 1000000
            };
        }

        // Analyze peak hours
        const hourlyGroups = {};
        this.historicalData.forEach(data => {
            const hour = new Date(data.timestamp).getHours();
            if (!hourlyGroups[hour]) {
                hourlyGroups[hour] = [];
            }
            hourlyGroups[hour].push(data);
        });

        // Find peak performance hours
        Object.entries(hourlyGroups).forEach(([hour, tests]) => {
            const avgDownload = this.calculateAverage(tests, 'downloadSpeed') / 1000000;
            const avgUpload = this.calculateAverage(tests, 'uploadSpeed') / 1000000;

            if (avgDownload > insights.averages.daily.download * 1.2) {
                insights.peakHours.push({
                    hour: parseInt(hour),
                    performance: 'peak',
                    speed: avgDownload
                });
            }
        });

        // Analyze trends
        const recentTests = this.historicalData.slice(-5);
        if (recentTests.length >= 3) {
            const trend = this.calculateTrend(recentTests);
            insights.trends.push({
                period: 'recent',
                direction: trend.direction,
                percentage: trend.percentage
            });
        }

        // Analyze time of day patterns
        for (let hour = 0; hour < 24; hour++) {
            const hourlyData = this.historicalData.filter(d => new Date(d.timestamp).getHours() === hour);
            if (hourlyData.length > 0) {
                insights.timeOfDayPatterns[hour] = {
                    avgDownload: this.calculateAverage(hourlyData, 'downloadSpeed') / 1000000,
                    avgUpload: this.calculateAverage(hourlyData, 'uploadSpeed') / 1000000
                };
            }
        }

        // Analyze seasonal patterns (e.g., day of week)
        const dayOfWeekGroups = {};
        this.historicalData.forEach(data => {
            const day = new Date(data.timestamp).getDay(); // 0 (Sunday) - 6 (Saturday)
            if (!dayOfWeekGroups[day]) {
                dayOfWeekGroups[day] = [];
            }
            dayOfWeekGroups[day].push(data);
        });

        for (let day = 0; day < 7; day++) {
            if (dayOfWeekGroups[day]) {
                insights.seasonalPatterns[day] = {
                    avgDownload: this.calculateAverage(dayOfWeekGroups[day], 'downloadSpeed') / 1000000,
                    avgUpload: this.calculateAverage(dayOfWeekGroups[day], 'uploadSpeed') / 1000000
                };
            }
        }

        return insights;
    }

    calculateTrend(tests) {
        const first = tests[0].downloadSpeed / 1000000;
        const last = tests[tests.length - 1].downloadSpeed / 1000000;
        const percentChange = ((last - first) / first) * 100;

        return {
            direction: percentChange > 0 ? 'improving' : percentChange < 0 ? 'declining' : 'stable',
            percentage: Math.abs(percentChange)
        };
    }

    // Anomaly detection
    detectAnomalies(result) {
        const anomalies = [];
        const downloadMbps = result.downloadSpeed / 1000000;
        const uploadMbps = result.uploadSpeed / 1000000;

        // Compare against historical averages
        const dailyAverage = this.analyzeHistoricalData()?.averages?.daily;

        if (dailyAverage) {
            const downloadDiff = downloadMbps - dailyAverage.download;
            const uploadDiff = uploadMbps - dailyAverage.upload;

            const downloadThreshold = dailyAverage.download * 0.5; // 50% deviation
            const uploadThreshold = dailyAverage.upload * 0.5; // 50% deviation

            if (Math.abs(downloadDiff) > downloadThreshold) {
                anomalies.push({
                    type: 'download_speed_anomaly',
                    message: `Unusual download speed detected (deviation: ${downloadDiff.toFixed(2)} Mbps)`,
                    severity: 'high',
                    deviation: downloadDiff
                });
            }

            if (Math.abs(uploadDiff) > uploadThreshold) {
                anomalies.push({
                    type: 'upload_speed_anomaly',
                    message: `Unusual upload speed detected (deviation: ${uploadDiff.toFixed(2)} Mbps)`,
                    severity: 'high',
                    deviation: uploadDiff
                });
            }
        }

        this.anomalies.push(...anomalies); // Store detected anomalies
        return anomalies;
    }

    generateRecommendations(result, context = {}) {
        const recommendations = [];
        const issues = context.issues || this.identifyIssues(result);
        const insights = context.insights !== undefined ? context.insights : this.analyzeHistoricalData();
        const anomalies = context.anomalies || this.detectAnomalies(result);

        // Add basic recommendations based on issues
        issues.forEach(issue => {
            switch (issue.type) {
                case 'low_download':
                    recommendations.push({
                        title: 'Improve Download Speed',
                        steps: [
                            'Check for background downloads or updates',
                            'Move closer to your WiFi router',
                            'Consider upgrading your internet plan'
                        ],
                        priority: 'high'
                    });
                    break;
                case 'low_upload':
                    recommendations.push({
                        title: 'Improve Upload Speed',
                        steps: [
                            'Reduce the number of connected devices',
                            'Use a wired connection for important uploads',
                            'Contact your ISP about symmetrical speed options'
                        ],
                        priority: 'medium'
                    });
                    break;
                case 'high_latency':
                    recommendations.push({
                        title: 'Reduce Latency',
                        steps: [
                            'Use a wired connection when possible',
                            'Check for interference from other devices',
                            'Consider a gaming-focused router'
                        ],
                        priority: 'medium'
                    });
                    break;
            }
        });

        // Add historical data-based recommendations
        if (insights && insights.peakHours.length > 0) {
            const bestHour = insights.peakHours.reduce((a, b) =>
                a.speed > b.speed ? a : b
            );

            recommendations.push({
                title: 'Optimize Usage Time',
                steps: [
                    `Best performance observed at ${bestHour.hour}:00`,
                    'Schedule large downloads during peak performance hours',
                    'Consider off-peak hours for better speeds'
                ],
                priority: 'medium'
            });
        }

        if (insights && insights.trends.length > 0) {
            const latestTrend = insights.trends[0];
            if (latestTrend.direction === 'declining' && latestTrend.percentage > 10) {
                recommendations.push({
                    title: 'Address Speed Decline',
                    steps: [
                        'Your speeds have dropped by ' + latestTrend.percentage.toFixed(1) + '%',
                        'Check for new devices on network',
                        'Contact ISP to check for service issues'
                    ],
                    priority: 'high'
                });
            }
        }

        // Add recommendations based on time of day patterns
        if (insights && insights.timeOfDayPatterns) {
            let bestTime = null;
            let bestSpeed = 0;

            for (const hour in insights.timeOfDayPatterns) {
                if (insights.timeOfDayPatterns[hour].avgDownload > bestSpeed) {
                    bestSpeed = insights.timeOfDayPatterns[hour].avgDownload;
                    bestTime = hour;
                }
            }

            if (bestTime) {
                recommendations.push({
                    title: 'Optimize Time of Day',
                    steps: [
                        `Speeds are typically best around ${bestTime}:00`,
                        'Schedule important tasks during optimal hours',
                        'Avoid peak congestion times'
                    ],
                    priority: 'low'
                });
            }
        }

        // Add recommendations based on seasonal patterns
        if (insights && insights.seasonalPatterns) {
            let bestDay = null;
            let bestSpeed = 0;

            for (const day in insights.seasonalPatterns) {
                if (insights.seasonalPatterns[day].avgDownload > bestSpeed) {
                    bestSpeed = insights.seasonalPatterns[day].avgDownload;
                    bestDay = day;
                }
            }

            if (bestDay) {
                const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                recommendations.push({
                    title: 'Optimize Day of Week',
                    steps: [
                        `Speeds are typically best on ${dayNames[bestDay]}`,
                        'Schedule important tasks on optimal days',
                        'Avoid days with known congestion'
                    ],
                    priority: 'low'
                });
            }
        }

        // Add recommendations based on detected anomalies
        anomalies.forEach(anomaly => {
            switch (anomaly.type) {
                case 'download_speed_anomaly':
                    recommendations.push({
                        title: 'Investigate Download Speed Anomaly',
                        steps: [
                            `A significant deviation in download speed was detected (${anomaly.deviation.toFixed(2)} Mbps)`,
                            'Check for network congestion or interference',
                            'Restart your modem and router'
                        ],
                        priority: 'high'
                    });
                    break;
                case 'upload_speed_anomaly':
                    recommendations.push({
                        title: 'Investigate Upload Speed Anomaly',
                        steps: [
                            `A significant deviation in upload speed was detected (${anomaly.deviation.toFixed(2)} Mbps)`,
                            'Check for applications consuming upload bandwidth',
                            'Ensure your device is not infected with malware'
                        ],
                        priority: 'high'
                    });
                    break;
            }
        });

        return recommendations;
    }

    predictNextTest(result) {
        const hour = new Date().getHours();
        this.historicalData.push({
            ...result,
            hour,
            timestamp: Date.now()
        });

        // Keep last 24 hours of data
        this.historicalData = this.historicalData.filter(d =>
            Date.now() - d.timestamp < 24 * 60 * 60 * 1000
        );

        // Calculate average speeds for this hour
        const hourlyData = this.historicalData.filter(d => d.hour === hour);
        const prediction = {
            downloadSpeed: this.calculateAverage(hourlyData, 'downloadSpeed'),
            uploadSpeed: this.calculateAverage(hourlyData, 'uploadSpeed'),
            confidence: this.calculateConfidence(hourlyData)
        };

        return prediction;
    }

    calculateAverage(data, key) {
        if (!data.length) return null;
        return data.reduce((sum, item) => sum + item[key], 0) / data.length;
    }

    calculateConfidence(data) {
        if (data.length < 3) return 'low';
        if (data.length < 10) return 'medium';
        return 'high';
    }

    updatePatterns(result) {
        const hour = new Date().getHours();
        const day = new Date().getDay();
        const key = `${day}-${hour}`;

        if (!this.patterns[key]) {
            this.patterns[key] = {
                downloadSpeeds: [],
                uploadSpeeds: []
            };
        }

        this.patterns[key].downloadSpeeds.push(result.downloadSpeed);
        this.patterns[key].uploadSpeeds.push(result.uploadSpeed);

        // Keep only the last 10 samples
        if (this.patterns[key].downloadSpeeds.length > 10) {
            this.patterns[key].downloadSpeeds.shift();
        }
        if (this.patterns[key].uploadSpeeds.length > 10) {
            this.patterns[key].uploadSpeeds.shift();
        }
    }

    // Method to update historical data
    updateHistoricalData(result) {
        const hour = new Date().getHours();
        this.historicalData.push({
            ...result,
            hour,
            timestamp: Date.now()
        });

        // Keep only the last 7 days of data
        this.historicalData = this.historicalData.filter(d =>
            Date.now() - d.timestamp < 7 * 24 * 60 * 60 * 1000
        );
    }

    getRatingLabel(score) {
        const labels = ['Very Poor', 'Poor', 'Average', 'Good', 'Excellent'];
        if (typeof score !== 'number' || Number.isNaN(score)) {
            return 'Unknown';
        }
        const index = Math.min(Math.max(Math.round(score) - 1, 0), labels.length - 1);
        return labels[index];
    }

    generateHeuristicSummary(result, analysis) {
        const downloadMbps = (result?.downloadSpeed || 0) / 1000000;
        const uploadMbps = (result?.uploadSpeed || 0) / 1000000;
        const latency = result?.networkInfo?.latency;

        const overallLabel = this.getRatingLabel(analysis?.performance?.rating?.overall);
        const issues = analysis?.performance?.issues || [];
        const strengths = analysis?.performance?.strengths || [];
        const anomalies = analysis?.anomalies || [];
        const recommendations = analysis?.recommendations || [];

        const summaryParts = [];

        if (overallLabel !== 'Unknown') {
            summaryParts.push(`Overall network performance is ${overallLabel.toLowerCase()}.`);
        } else {
            summaryParts.push('Overall network performance rating is unavailable.');
        }

        summaryParts.push(`Measured download at ${downloadMbps.toFixed(1)} Mbps and upload at ${uploadMbps.toFixed(1)} Mbps.`);

        if (typeof latency === 'number') {
            summaryParts.push(`Latency is ${latency} ms.`);
        }

        if (issues.length > 0) {
            summaryParts.push(`Top concern: ${issues[0].message}.`);
        } else {
            summaryParts.push('No critical issues detected.');
        }

        if (anomalies.length > 0) {
            summaryParts.push(`Recent anomaly: ${anomalies[0].message}.`);
        } else if (strengths.length > 0) {
            summaryParts.push(`Notable strength: ${strengths[0].message}.`);
        }

        if (recommendations.length > 0) {
            summaryParts.push(`Suggested next step: ${recommendations[0].title}.`);
        }

        return summaryParts.join(' ').replace(/\s+/g, ' ').trim();
    }

    async getOpenRouterApiKey() {
        if (this.openRouterApiKey !== undefined) {
            return this.openRouterApiKey;
        }

        if (typeof chrome === 'undefined' ||
            !chrome.storage ||
            !chrome.storage.local ||
            typeof chrome.storage.local.get !== 'function') {
            this.openRouterApiKey = null;
            return null;
        }

        try {
            const result = await new Promise((resolve, reject) => {
                try {
                    chrome.storage.local.get(['openRouterApiKey'], (res) => {
                        if (chrome.runtime && chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                            return;
                        }
                        resolve(res);
                    });
                } catch (error) {
                    reject(error);
                }
            });

            this.openRouterApiKey = result?.openRouterApiKey || null;
        } catch (error) {
            console.warn('OpenRouter API key lookup failed:', error);
            this.openRouterApiKey = null;
        }

        return this.openRouterApiKey;
    }

    buildLLMPrompt(result, analysis) {
        const downloadMbps = (result?.downloadSpeed || 0) / 1000000;
        const uploadMbps = (result?.uploadSpeed || 0) / 1000000;
        const latency = result?.networkInfo?.latency;
        const ratingLabel = this.getRatingLabel(analysis?.performance?.rating?.overall);

        const issuesList = (analysis?.performance?.issues || []);
        const strengthsList = (analysis?.performance?.strengths || []);
        const anomaliesList = (analysis?.anomalies || []);
        const recommendationsList = (analysis?.recommendations || []).slice(0, 3);

        const issues = issuesList.length
            ? issuesList.map(issue => ({
                message: issue.message,
                severity: issue.severity || 'medium'
            }))
            : [];

        const strengths = strengthsList.length
            ? strengthsList.map(strength => ({
                message: strength.message,
                severity: strength.severity || 'low'
            }))
            : [];

        const anomalies = anomaliesList.length
            ? anomaliesList.map(anomaly => ({
                message: anomaly.message,
                severity: anomaly.severity || 'medium'
            }))
            : [];

        const recommendations = recommendationsList.length
            ? recommendationsList.map(rec => ({
                title: rec.title,
                steps: rec.steps || [],
                priority: rec.priority || 'medium'
            }))
            : [];

        let historicalNote = 'Limited historical data.';
        const insights = analysis?.historicalInsights;
        if (insights) {
            const recentTrend = insights.trends && insights.trends[0];
            if (recentTrend && typeof recentTrend.percentage === 'number') {
                historicalNote = `Recent trend: ${recentTrend.direction} (${recentTrend.percentage.toFixed(1)}%).`;
            } else if (insights.averages?.daily?.download) {
                historicalNote = `Daily average download ${insights.averages.daily.download.toFixed(1)} Mbps.`;
            }
        }

        let predictionNote = 'Prediction unavailable.';
        if (analysis?.prediction?.downloadSpeed) {
            const predictedDownload = (analysis.prediction.downloadSpeed || 0) / 1000000;
            const predictedUpload = (analysis.prediction.uploadSpeed || 0) / 1000000;
            predictionNote = `Next test prediction: ${predictedDownload.toFixed(1)} Mbps down / ${predictedUpload.toFixed(1)} Mbps up with ${analysis.prediction.confidence} confidence.`;
        }

        return [
            'You are a seasoned network performance analyst. Return a single JSON object (no extra text) that matches this schema:',
            '{',
            '  "summary": "One to two sentences summarizing current network health.",',
            '  "action_items": ["Concise action-oriented bullet items."],',
            '  "recommendations": [',
            '    {',
            '      "title": "Short headline",',
            '      "steps": ["Specific step users can follow"],',
            '      "priority": "low|medium|high"',
            '    }',
            '  ],',
            '  "prediction": {',
            '    "download_mbps": number or null,',
            '    "upload_mbps": number or null,',
            '    "confidence": "low|medium|high",',
            '    "notes": "Optional short note."',
            '  },',
            '  "issues": [{ "message": "Issue description", "severity": "low|medium|high" }],',
            '  "strengths": [{ "message": "Strength description", "severity": "low|medium|high" }]',
            '}',
            'Use empty arrays when there is nothing to report. Keep values concise and user-friendly.',
            'Context:',
            `download_mbps: ${downloadMbps.toFixed(2)}`,
            `upload_mbps: ${uploadMbps.toFixed(2)}`,
            `latency_ms: ${typeof latency === 'number' ? latency : 'unknown'}`,
            `overall_rating: ${ratingLabel}`,
            `historical_note: ${historicalNote}`,
            `prediction_note: ${predictionNote}`,
            `baseline_issues: ${JSON.stringify(issues).replace(/"/g, '\\"')}`,
            `baseline_strengths: ${JSON.stringify(strengths).replace(/"/g, '\\"')}`,
            `baseline_anomalies: ${JSON.stringify(anomalies).replace(/"/g, '\\"')}`,
            `baseline_recommendations: ${JSON.stringify(recommendations).replace(/"/g, '\\"')}`,
            'Make sure the JSON is valid and contains all required keys.'
        ].join('\n');
    }

    async generateLLMInsights(result, analysis) {
        const apiKey = await this.getOpenRouterApiKey();
        // Always get latest model from storage before using
        await this.loadLLMModelFromStorage();
        const modelToUse = this.llmModel || 'kwaipilot/kat-coder-pro:free';

        if (!apiKey) {
            return { summary: null, reason: 'missing_api_key' };
        }

        if (typeof fetch !== 'function') {
            return { summary: null, error: 'fetch API is unavailable in this context.' };
        }

        const body = {
            model: modelToUse,
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful network performance analyst who writes clear, friendly, and actionable summaries.'
                },
                {
                    role: 'user',
                    content: this.buildLLMPrompt(result, analysis)
                }
            ],
            max_tokens: 600,
            temperature: 0.2,
            top_p: 0.9
        };

        let controller = null;
        let timeoutId = null;

        if (typeof AbortController === 'function') {
            controller = new AbortController();
            timeoutId = setTimeout(() => {
                controller.abort();
            }, this.openRouterTimeoutMs);
        }

        try {
            logger.info('LLM completion requested', { model: modelToUse });
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                    'X-Title': 'Speed Tester Extension'
                },
                body: JSON.stringify(body),
                signal: controller ? controller.signal : undefined
            });

            if (timeoutId) {
                clearTimeout(timeoutId);
            }

            if (!response.ok) {
                const errorText = await response.text().catch(() => response.statusText);
                throw new Error(`OpenRouter request failed (${response.status}): ${errorText}`);
            }

            const data = await response.json();
            const rawContent = data?.choices?.[0]?.message?.content?.trim();
            logger.info('LLM completion received', { model: data?.model || modelToUse });

            if (!rawContent) {
                throw new Error('OpenRouter response did not include content.');
            }

            const parsedJson = this.extractJSONFromText(rawContent);
            const structured = this.normalizeLLMStructuredData(parsedJson);
            const combinedSummary = structured
                ? this.composeLLMSummary(structured.summary, structured.actionItems)
                : this.cleanLLMPlainText(rawContent);

            return {
                summary: combinedSummary || null,
                structured,
                model: data?.model || this.llmModel
            };
        } catch (error) {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            if (error && error.name === 'AbortError') {
                logger.error('LLM completion timed out');
                return { summary: null, error: 'OpenRouter request timed out.' };
            }
            logger.error('LLM completion failed', { error: error?.message });
            return { summary: null, error: error?.message || 'Unknown OpenRouter error.' };
        }
    }

    cleanLLMPlainText(content) {
        if (typeof content !== 'string') {
            return null;
        }
        let text = content.trim();
        if (!text) return null;

        // Remove fenced code blocks
        text = text.replace(/```(?:json)?([\s\S]*?)```/gi, '$1');
        // Collapse whitespace
        text = text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
        return text || null;
    }

    extractJSONFromText(content) {
        if (!content || typeof content !== 'string') {
            return null;
        }

        const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
        let jsonText = codeBlockMatch ? codeBlockMatch[1] : content;

        const firstBrace = jsonText.indexOf('{');
        const lastBrace = jsonText.lastIndexOf('}');

        if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
            return null;
        }

        jsonText = jsonText.slice(firstBrace, lastBrace + 1).trim();

        try {
            return JSON.parse(jsonText);
        } catch (error) {
            console.warn('Failed to parse OpenRouter JSON payload:', error);
            return null;
        }
    }

    normalizeLLMStructuredData(raw) {
        if (!raw || typeof raw !== 'object') {
            return null;
        }

        const summary = typeof raw.summary === 'string' ? raw.summary.trim() : '';
        const actionItems = this.collectStrings(
            raw.action_items ?? raw.actionItems ?? raw.actions ?? raw.highlights ?? []
        );

        const recommendations = this.normalizeLLMRecommendations(raw.recommendations ?? raw.suggestions);
        const issues = this.normalizeLLMFindings(raw.issues ?? raw.concerns, 'medium');
        const strengths = this.normalizeLLMFindings(raw.strengths ?? raw.positives, 'low');

        const predictionData = raw.prediction ?? raw.forecast ?? null;
        const prediction = this.normalizeLLMPrediction(predictionData);

        return {
            summary,
            actionItems,
            recommendations,
            issues,
            strengths,
            prediction
        };
    }

    collectStrings(value) {
        if (!value) return [];
        if (Array.isArray(value)) {
            return value
                .map(item => {
                    if (typeof item === 'string') return item.trim();
                    if (item && typeof item === 'object' && 'text' in item && typeof item.text === 'string') {
                        return item.text.trim();
                    }
                    return null;
                })
                .filter(Boolean);
        }
        if (typeof value === 'string') {
            return value.split(/\n|;/).map(item => item.trim()).filter(Boolean);
        }
        return [];
    }

    normalizeLLMRecommendations(rawRecommendations) {
        if (!Array.isArray(rawRecommendations)) {
            return [];
        }

        const allowedPriorities = new Set(['low', 'medium', 'high']);

        return rawRecommendations
            .map((item, index) => {
                if (!item || typeof item !== 'object') {
                    return null;
                }

                const titleSources = [
                    item.title,
                    item.name,
                    item.headline,
                    item.summary
                ];
                const title = titleSources.find(val => typeof val === 'string' && val.trim().length > 0)
                    || `AI Recommendation ${index + 1}`;

                let steps = this.collectStrings(
                    item.steps ?? item.actions ?? item.action_items ?? item.instructions ?? item.details
                );

                if (steps.length === 0 && typeof item.description === 'string') {
                    steps = [item.description.trim()];
                }

                const priorityRaw = typeof item.priority === 'string'
                    ? item.priority.toLowerCase().trim()
                    : null;

                const priority = priorityRaw && allowedPriorities.has(priorityRaw)
                    ? priorityRaw
                    : 'medium';

                return {
                    title,
                    steps,
                    priority
                };
            })
            .filter(rec => rec && (rec.title || (rec.steps && rec.steps.length > 0)));
    }

    normalizeLLMFindings(rawFindings, defaultSeverity = 'medium') {
        if (!Array.isArray(rawFindings)) {
            return [];
        }

        const allowedSeverities = new Set(['low', 'medium', 'high']);

        return rawFindings
            .map(item => {
                if (!item) return null;
                if (typeof item === 'string') {
                    return {
                        message: item.trim(),
                        severity: defaultSeverity
                    };
                }
                if (typeof item === 'object') {
                    const messageSources = [
                        item.message,
                        item.text,
                        item.detail,
                        item.description
                    ];
                    const message = messageSources.find(val => typeof val === 'string' && val.trim().length > 0);
                    if (!message) {
                        return null;
                    }

                    const severityRaw = typeof item.severity === 'string'
                        ? item.severity.toLowerCase().trim()
                        : null;
                    const severity = severityRaw && allowedSeverities.has(severityRaw)
                        ? severityRaw
                        : defaultSeverity;

                    return {
                        message: message.trim(),
                        severity
                    };
                }
                return null;
            })
            .filter(Boolean);
    }

    parseNumeric(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string') {
            const cleaned = value.replace(/[^0-9.+-]/g, '');
            const parsed = parseFloat(cleaned);
            return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
    }

    normalizeLLMPrediction(rawPrediction) {
        if (!rawPrediction || typeof rawPrediction !== 'object') {
            return null;
        }

        const downloadMbps = this.parseNumeric(
            rawPrediction.download_mbps ?? rawPrediction.downloadMbps ?? rawPrediction.download
        );
        const uploadMbps = this.parseNumeric(
            rawPrediction.upload_mbps ?? rawPrediction.uploadMbps ?? rawPrediction.upload
        );

        let confidenceRaw = rawPrediction.confidence;
        if (typeof confidenceRaw === 'string') {
            confidenceRaw = confidenceRaw.toLowerCase().trim();
        }
        const allowedConfidence = new Set(['low', 'medium', 'high']);
        const confidence = allowedConfidence.has(confidenceRaw) ? confidenceRaw : undefined;

        const notesSource = rawPrediction.notes ?? rawPrediction.note ?? rawPrediction.summary;
        const notes = typeof notesSource === 'string' ? notesSource.trim() : undefined;

        const prediction = {};

        if (downloadMbps !== null) {
            prediction.downloadSpeed = downloadMbps * 1000000;
        }
        if (uploadMbps !== null) {
            prediction.uploadSpeed = uploadMbps * 1000000;
        }
        if (confidence) {
            prediction.confidence = confidence;
        }
        if (notes) {
            prediction.notes = notes;
        }

        return Object.keys(prediction).length > 0 ? prediction : null;
    }

    composeLLMSummary(summaryText, actionItems) {
        const pieces = [];

        if (typeof summaryText === 'string' && summaryText.trim().length > 0) {
            pieces.push(summaryText.trim());
        }

        if (Array.isArray(actionItems) && actionItems.length > 0) {
            const bulletLines = actionItems
                .map(item => {
                    if (typeof item !== 'string') return null;
                    const trimmed = item.trim();
                    return trimmed.length > 0 ? `- ${trimmed}` : null;
                })
                .filter(Boolean);

            if (bulletLines.length > 0) {
                pieces.push(bulletLines.join('\n'));
            }
        }

        if (pieces.length === 0) {
            return null;
        }

        return pieces.join('\n').trim();
    }
}

self.NetworkAIAnalysis = NetworkAIAnalysis;
