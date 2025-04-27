class NetworkAIAnalysis {
    constructor() {
        this.historicalData = [];
        this.patterns = {};
    }

    analyzeSpeedTest(result) {
        const analysis = {
            performance: this.analyzePerformance(result),
            recommendations: this.generateRecommendations(result),
            prediction: this.predictNextTest(result),
            historicalInsights: this.analyzeHistoricalData()
        };
        
        this.updatePatterns(result);
        return analysis;
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

    // Add new method for historical analysis
    analyzeHistoricalData() {
        const insights = {
            trends: [],
            averages: {
                daily: { download: 0, upload: 0 },
                weekly: { download: 0, upload: 0 }
            },
            peakHours: [],
            consistency: 'stable',
            timeOfDayPatterns: {} // New: Patterns by time of day
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

    generateRecommendations(result) {
        const recommendations = [];
        const issues = this.identifyIssues(result);
        const insights = this.analyzeHistoricalData();

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

        return recommendations;
    }

    predictNextTest(result) {
        // Simple prediction based on time of day and historical patterns
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
}

self.NetworkAIAnalysis = NetworkAIAnalysis;
