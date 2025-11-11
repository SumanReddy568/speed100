class NetworkAIAnalysis {
    constructor() {
        this.historicalData = [];
        this.patterns = {};
        this.anomalies = [];
        this.benchmarkData = {
            // Industry standard benchmarks
            excellent: { download: 100, upload: 50 },
            good: { download: 50, upload: 25 },
            average: { download: 25, upload: 10 },
            poor: { download: 10, upload: 5 }
        };
    }

    analyzeSpeedTest(result) {
        // Ensure we have valid data
        if (!result || !result.downloadSpeed || !result.uploadSpeed) {
            return this.getDefaultAnalysis();
        }

        this.updateHistoricalData(result);

        const analysis = {
            performance: this.analyzePerformance(result),
            recommendations: this.generateRecommendations(result),
            prediction: this.predictNextTest(result),
            historicalInsights: this.analyzeHistoricalData(),
            anomalies: this.detectAnomalies(result),
            qualityScore: this.calculateQualityScore(result)
        };

        this.updatePatterns(result);
        return analysis;
    }

    getDefaultAnalysis() {
        return {
            performance: {
                rating: { overall: 0, download: 0, upload: 0 },
                issues: [],
                strengths: []
            },
            recommendations: [{
                title: 'Run a Speed Test',
                steps: ['Click "Run Speed Test" to get personalized insights', 'Test at different times for better analysis'],
                priority: 'high'
            }],
            prediction: null,
            historicalInsights: null,
            anomalies: [],
            qualityScore: 0
        };
    }

    analyzePerformance(result) {
        const downloadMbps = result.downloadSpeed / 1000000;
        const uploadMbps = result.uploadSpeed / 1000000;
        const latency = result.networkInfo?.latency || 0;

        const performance = {
            rating: this.calculateRating(downloadMbps, uploadMbps, latency),
            issues: this.identifyIssues(result),
            strengths: this.identifyStrengths(result),
            speedCategory: this.categorizeSpeed(downloadMbps, uploadMbps),
            useCases: this.getUseCases(downloadMbps, uploadMbps)
        };

        return performance;
    }

    calculateRating(downloadMbps, uploadMbps, latency) {
        const downloadRating = this.getSpeedRating(downloadMbps, 'download');
        const uploadRating = this.getSpeedRating(uploadMbps, 'upload');
        const latencyRating = this.getLatencyRating(latency);

        const overall = (downloadRating * 0.5 + uploadRating * 0.3 + latencyRating * 0.2);

        return {
            download: downloadRating,
            upload: uploadRating,
            latency: latencyRating,
            overall: Math.round(overall * 10) / 10
        };
    }

    getSpeedRating(speed, type) {
        const thresholds = type === 'download'
            ? [10, 25, 50, 100, 200]
            : [5, 10, 20, 40, 80];

        if (speed >= thresholds[4]) return 5.0; // Exceptional
        if (speed >= thresholds[3]) return 4.5; // Excellent
        if (speed >= thresholds[2]) return 3.5; // Good
        if (speed >= thresholds[1]) return 2.5; // Average
        if (speed >= thresholds[0]) return 1.5; // Poor
        return 1.0; // Very Poor
    }

    getLatencyRating(latency) {
        if (latency === 0) return 3.0; // Unknown
        if (latency <= 20) return 5.0; // Excellent
        if (latency <= 50) return 4.0; // Good
        if (latency <= 100) return 3.0; // Average
        if (latency <= 200) return 2.0; // Poor
        return 1.0; // Very Poor
    }

    categorizeSpeed(downloadMbps, uploadMbps) {
        if (downloadMbps >= 100 && uploadMbps >= 50) return 'Premium';
        if (downloadMbps >= 50 && uploadMbps >= 25) return 'High-Speed';
        if (downloadMbps >= 25 && uploadMbps >= 10) return 'Standard';
        if (downloadMbps >= 10 && uploadMbps >= 5) return 'Basic';
        return 'Limited';
    }

    getUseCases(downloadMbps, uploadMbps) {
        const useCases = [];

        if (downloadMbps >= 100) {
            useCases.push('4K/8K streaming', 'Large file downloads', 'Multiple device usage');
        } else if (downloadMbps >= 50) {
            useCases.push('4K streaming', 'Online gaming', 'Video conferencing');
        } else if (downloadMbps >= 25) {
            useCases.push('HD streaming', 'Web browsing', 'Social media');
        } else if (downloadMbps >= 10) {
            useCases.push('SD streaming', 'Email', 'Light web browsing');
        } else {
            useCases.push('Basic web browsing', 'Email only');
        }

        return useCases;
    }

    identifyIssues(result) {
        const issues = [];
        const downloadMbps = result.downloadSpeed / 1000000;
        const uploadMbps = result.uploadSpeed / 1000000;
        const latency = result.networkInfo?.latency || 0;
        const ratio = uploadMbps / downloadMbps;

        if (downloadMbps < 10) {
            issues.push({
                type: 'low_download',
                message: `Download speed (${downloadMbps.toFixed(1)} Mbps) is below recommended minimums`,
                severity: 'high',
                impact: 'Streaming and downloads will be slow'
            });
        }

        if (uploadMbps < 5) {
            issues.push({
                type: 'low_upload',
                message: `Upload speed (${uploadMbps.toFixed(1)} Mbps) may cause issues with video calls`,
                severity: 'medium',
                impact: 'Video calls and file sharing affected'
            });
        }

        if (latency > 100) {
            issues.push({
                type: 'high_latency',
                message: `High latency (${latency}ms) detected`,
                severity: 'medium',
                impact: 'Gaming and real-time apps affected'
            });
        }

        if (ratio < 0.05) {
            issues.push({
                type: 'poor_ratio',
                message: 'Upload speed is significantly lower than download speed',
                severity: 'low',
                impact: 'May indicate throttling or poor connection'
            });
        }

        // Check for consistency issues
        const recent = this.getRecentTests(3);
        if (recent.length >= 3) {
            const variance = this.calculateVariance(recent, 'downloadSpeed');
            if (variance > 50) {
                issues.push({
                    type: 'inconsistent_speeds',
                    message: 'Speed varies significantly between tests',
                    severity: 'medium',
                    impact: 'Unstable connection quality'
                });
            }
        }

        return issues;
    }

    identifyStrengths(result) {
        const strengths = [];
        const downloadMbps = result.downloadSpeed / 1000000;
        const uploadMbps = result.uploadSpeed / 1000000;
        const latency = result.networkInfo?.latency || 0;

        if (downloadMbps > 100) {
            strengths.push({
                type: 'excellent_download',
                message: `Excellent download speed (${downloadMbps.toFixed(1)} Mbps) - perfect for 4K streaming`,
                benefit: 'Premium internet experience'
            });
        } else if (downloadMbps > 50) {
            strengths.push({
                type: 'good_download',
                message: `Good download speed (${downloadMbps.toFixed(1)} Mbps) - suitable for HD streaming`,
                benefit: 'Smooth streaming and browsing'
            });
        }

        if (uploadMbps > 25) {
            strengths.push({
                type: 'excellent_upload',
                message: `Excellent upload speed (${uploadMbps.toFixed(1)} Mbps) - great for content creation`,
                benefit: 'Perfect for video calls and file sharing'
            });
        } else if (uploadMbps > 10) {
            strengths.push({
                type: 'good_upload',
                message: `Good upload speed (${uploadMbps.toFixed(1)} Mbps) - reliable for video calls`,
                benefit: 'Good for remote work'
            });
        }

        if (latency > 0 && latency < 30) {
            strengths.push({
                type: 'low_latency',
                message: `Low latency (${latency}ms) - excellent for gaming`,
                benefit: 'Optimal for real-time applications'
            });
        }

        // Check for consistency
        const recent = this.getRecentTests(3);
        if (recent.length >= 3) {
            const variance = this.calculateVariance(recent, 'downloadSpeed');
            if (variance < 20) {
                strengths.push({
                    type: 'consistent_speeds',
                    message: 'Consistent speed performance across tests',
                    benefit: 'Reliable connection quality'
                });
            }
        }

        return strengths;
    }

    analyzeHistoricalData() {
        if (this.historicalData.length < 2) {
            return {
                message: 'More tests needed for historical analysis',
                recommendation: 'Run more speed tests to get detailed insights',
                dataPoints: this.historicalData.length,
                daysTracked: 0
            };
        }

        const now = Date.now();
        const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
        const last7Days = this.historicalData.filter(d => d.timestamp >= sevenDaysAgo);

        const insights = {
            summary: this.generateSummaryInsights(last7Days),
            trends: this.analyzeTrends(),
            patterns: this.analyzeDetailedTimePatterns(last7Days),
            consistency: this.analyzeConsistency(),
            averages: this.calculateDetailedAverages(last7Days),
            performance: this.analyzePerformanceChanges(last7Days),
            recommendations: this.generateHistoricalRecommendations(last7Days),
            dataPoints: this.historicalData.length,
            daysTracked: this.calculateDaysTracked()
        };

        return insights;
    }

    generateSummaryInsights(last7Days) {
        if (last7Days.length === 0) {
            return {
                message: 'No data available for the last 7 days',
                testsCompleted: 0,
                averagePerformance: 'No data'
            };
        }

        const avgDownload = this.calculateAverage(last7Days, 'downloadSpeed') / 1000000;
        const avgUpload = this.calculateAverage(last7Days, 'uploadSpeed') / 1000000;
        const bestDownload = Math.max(...last7Days.map(d => d.downloadSpeed)) / 1000000;
        const worstDownload = Math.min(...last7Days.map(d => d.downloadSpeed)) / 1000000;

        let performanceLevel = 'Poor';
        if (avgDownload >= 50) performanceLevel = 'Excellent';
        else if (avgDownload >= 25) performanceLevel = 'Good';
        else if (avgDownload >= 10) performanceLevel = 'Average';

        return {
            testsCompleted: last7Days.length,
            averageDownload: avgDownload.toFixed(1),
            averageUpload: avgUpload.toFixed(1),
            bestSpeed: bestDownload.toFixed(1),
            worstSpeed: worstDownload.toFixed(1),
            speedRange: (bestDownload - worstDownload).toFixed(1),
            performanceLevel,
            message: `Over the last 7 days, you've completed ${last7Days.length} speed tests with ${performanceLevel.toLowerCase()} performance`
        };
    }

    analyzeDetailedTimePatterns(last7Days) {
        const patterns = {
            hourly: {},
            daily: {},
            peakPerformance: null,
            lowPerformance: null,
            recommendations: []
        };

        // Analyze hourly patterns
        last7Days.forEach(test => {
            const hour = new Date(test.timestamp).getHours();
            const day = new Date(test.timestamp).getDay();

            if (!patterns.hourly[hour]) {
                patterns.hourly[hour] = [];
            }
            if (!patterns.daily[day]) {
                patterns.daily[day] = [];
            }

            patterns.hourly[hour].push(test);
            patterns.daily[day].push(test);
        });

        // Find peak performance times
        let bestHourSpeed = 0;
        let bestHour = null;
        let worstHourSpeed = Infinity;
        let worstHour = null;

        Object.entries(patterns.hourly).forEach(([hour, tests]) => {
            const avgSpeed = this.calculateAverage(tests, 'downloadSpeed') / 1000000;
            if (avgSpeed > bestHourSpeed) {
                bestHourSpeed = avgSpeed;
                bestHour = hour;
            }
            if (avgSpeed < worstHourSpeed) {
                worstHourSpeed = avgSpeed;
                worstHour = hour;
            }
        });

        // Find best day performance
        let bestDaySpeed = 0;
        let bestDay = null;
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        Object.entries(patterns.daily).forEach(([day, tests]) => {
            const avgSpeed = this.calculateAverage(tests, 'downloadSpeed') / 1000000;
            if (avgSpeed > bestDaySpeed) {
                bestDaySpeed = avgSpeed;
                bestDay = day;
            }
        });

        patterns.peakPerformance = {
            hour: bestHour ? `${bestHour}:00` : null,
            speed: bestHourSpeed.toFixed(1),
            day: bestDay ? dayNames[bestDay] : null,
            daySpeed: bestDaySpeed.toFixed(1)
        };

        patterns.lowPerformance = {
            hour: worstHour ? `${worstHour}:00` : null,
            speed: worstHourSpeed.toFixed(1)
        };

        return patterns;
    }

    calculateDetailedAverages(last7Days) {
        if (last7Days.length === 0) {
            return {
                download: '0',
                upload: '0',
                ratio: '0',
                comparison: 'No data available'
            };
        }

        const downloadAvg = this.calculateAverage(last7Days, 'downloadSpeed') / 1000000;
        const uploadAvg = this.calculateAverage(last7Days, 'uploadSpeed') / 1000000;

        // Compare with previous period
        const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const previousWeek = this.historicalData.filter(d =>
            d.timestamp >= fourteenDaysAgo && d.timestamp < sevenDaysAgo
        );

        let comparison = 'No previous data for comparison';
        if (previousWeek.length > 0) {
            const prevDownloadAvg = this.calculateAverage(previousWeek, 'downloadSpeed') / 1000000;
            const change = ((downloadAvg - prevDownloadAvg) / prevDownloadAvg) * 100;

            if (Math.abs(change) < 5) {
                comparison = 'Similar to previous week';
            } else if (change > 0) {
                comparison = `${change.toFixed(1)}% faster than previous week`;
            } else {
                comparison = `${Math.abs(change).toFixed(1)}% slower than previous week`;
            }
        }

        return {
            download: downloadAvg.toFixed(1),
            upload: uploadAvg.toFixed(1),
            ratio: (uploadAvg / downloadAvg).toFixed(2),
            comparison,
            weeklyTrend: this.calculateWeeklyTrend(last7Days)
        };
    }

    calculateWeeklyTrend(last7Days) {
        if (last7Days.length < 3) return 'Insufficient data';

        // Group by days and calculate daily averages
        const dailyAverages = {};
        last7Days.forEach(test => {
            const day = new Date(test.timestamp).toDateString();
            if (!dailyAverages[day]) {
                dailyAverages[day] = [];
            }
            dailyAverages[day].push(test.downloadSpeed / 1000000);
        });

        const dailyAvgs = Object.values(dailyAverages).map(speeds =>
            speeds.reduce((a, b) => a + b, 0) / speeds.length
        );

        if (dailyAvgs.length < 2) return 'Need more days of data';

        const firstHalf = dailyAvgs.slice(0, Math.ceil(dailyAvgs.length / 2));
        const secondHalf = dailyAvgs.slice(Math.ceil(dailyAvgs.length / 2));

        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

        const change = ((secondAvg - firstAvg) / firstAvg) * 100;

        if (Math.abs(change) < 5) return 'Stable throughout the week';
        if (change > 10) return 'Significantly improving';
        if (change > 0) return 'Gradually improving';
        if (change < -10) return 'Significantly declining';
        return 'Gradually declining';
    }

    analyzePerformanceChanges(last7Days) {
        if (last7Days.length < 5) {
            return {
                message: 'Need more test data to analyze performance changes',
                stability: 'Unknown',
                issues: []
            };
        }

        const speeds = last7Days.map(d => d.downloadSpeed / 1000000);
        const variance = this.calculateVarianceFromArray(speeds);
        const latencies = last7Days.map(d => d.networkInfo?.latency || 0).filter(l => l > 0);

        let stability = 'Stable';
        if (variance > 50) stability = 'Highly Variable';
        else if (variance > 25) stability = 'Moderately Variable';
        else if (variance > 10) stability = 'Slightly Variable';

        const issues = [];
        const recentTests = last7Days.slice(-3);
        const earlierTests = last7Days.slice(0, 3);

        // Check for degradation
        if (recentTests.length >= 3 && earlierTests.length >= 3) {
            const recentAvg = this.calculateAverage(recentTests, 'downloadSpeed') / 1000000;
            const earlierAvg = this.calculateAverage(earlierTests, 'downloadSpeed') / 1000000;

            if (recentAvg < earlierAvg * 0.8) {
                issues.push('Significant speed degradation detected in recent tests');
            }
        }

        // Check for latency issues
        if (latencies.length > 0) {
            const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
            if (avgLatency > 100) {
                issues.push('Consistently high latency detected');
            }
        }

        // Check for off-peak performance
        const offPeakTests = last7Days.filter(test => {
            const hour = new Date(test.timestamp).getHours();
            return hour >= 1 && hour <= 6; // 1 AM to 6 AM
        });

        if (offPeakTests.length > 0) {
            const offPeakAvg = this.calculateAverage(offPeakTests, 'downloadSpeed') / 1000000;
            const allAvg = this.calculateAverage(last7Days, 'downloadSpeed') / 1000000;

            if (offPeakAvg > allAvg * 1.3) {
                issues.push('Significantly better performance during off-peak hours');
            }
        }

        return {
            stability,
            variance: variance.toFixed(1),
            issues,
            message: `Network performance has been ${stability.toLowerCase()} over the past week`
        };
    }

    generateHistoricalRecommendations(last7Days) {
        const recommendations = [];
        const patterns = this.analyzeDetailedTimePatterns(last7Days);
        const performance = this.analyzePerformanceChanges(last7Days);

        // Time-based recommendations
        if (patterns.peakPerformance.hour) {
            recommendations.push({
                title: 'Optimize Your Schedule',
                insights: [
                    `Peak performance: ${patterns.peakPerformance.hour} (${patterns.peakPerformance.speed} Mbps)`,
                    `Best day: ${patterns.peakPerformance.day} (${patterns.peakPerformance.daySpeed} Mbps)`,
                    'Schedule important downloads during these times'
                ],
                priority: 'medium',
                category: 'timing'
            });
        }

        // Performance stability recommendations
        if (performance.stability === 'Highly Variable') {
            recommendations.push({
                title: 'Address Connection Instability',
                insights: [
                    'Your speeds vary significantly between tests',
                    'This may indicate network congestion or equipment issues',
                    'Consider contacting your ISP or checking your router'
                ],
                priority: 'high',
                category: 'stability'
            });
        }

        // Usage pattern recommendations
        const summary = this.generateSummaryInsights(last7Days);
        if (summary.testsCompleted < 7) {
            recommendations.push({
                title: 'Increase Monitoring Frequency',
                insights: [
                    `Only ${summary.testsCompleted} tests in the last 7 days`,
                    'More frequent testing provides better insights',
                    'Consider testing at different times and days'
                ],
                priority: 'low',
                category: 'monitoring'
            });
        }

        // Performance level recommendations
        if (summary.performanceLevel === 'Poor') {
            recommendations.push({
                title: 'Consider Service Upgrade',
                insights: [
                    `Average speed: ${summary.averageDownload} Mbps is below modern standards`,
                    'This may limit streaming and large downloads',
                    'Contact your ISP about faster plans'
                ],
                priority: 'high',
                category: 'upgrade'
            });
        }

        return recommendations;
    }

    calculateDaysTracked() {
        if (this.historicalData.length === 0) return 0;

        const oldest = Math.min(...this.historicalData.map(d => d.timestamp));
        const newest = Math.max(...this.historicalData.map(d => d.timestamp));

        return Math.ceil((newest - oldest) / (24 * 60 * 60 * 1000));
    }

    calculateVarianceFromArray(values) {
        if (values.length < 2) return 0;
        const mean = values.reduce((a, b) => a + b) / values.length;
        const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
    }

    updateHistoricalData(result) {
        this.historicalData.push({
            ...result,
            timestamp: Date.now()
        });

        // Keep last 50 tests or 7 days, whichever is more recent
        const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
        this.historicalData = this.historicalData
            .filter(d => Date.now() - d.timestamp < maxAge)
            .slice(-50); // Keep last 50 tests
    }

    // Simplified anomaly detection and other methods...
    detectAnomalies(result) {
        return []; // Simplified for now
    }

    predictNextTest(result) {
        if (this.historicalData.length < 3) {
            return {
                downloadSpeed: result.downloadSpeed,
                uploadSpeed: result.uploadSpeed,
                confidence: 'low'
            };
        }

        const recent = this.getRecentTests(5);
        const avgDownload = this.calculateAverage(recent, 'downloadSpeed');
        const avgUpload = this.calculateAverage(recent, 'uploadSpeed');

        return {
            downloadSpeed: avgDownload,
            uploadSpeed: avgUpload,
            confidence: recent.length >= 5 ? 'high' : 'medium'
        };
    }

    calculateQualityScore(result) {
        const rating = this.calculateRating(
            result.downloadSpeed / 1000000,
            result.uploadSpeed / 1000000,
            result.networkInfo?.latency || 0
        );
        return rating.overall;
    }

    updatePatterns(result) {
        // Simplified pattern tracking
        const hour = new Date().getHours();
        const key = `hour_${hour}`;

        if (!this.patterns[key]) {
            this.patterns[key] = [];
        }

        this.patterns[key].push({
            download: result.downloadSpeed,
            upload: result.uploadSpeed,
            timestamp: Date.now()
        });

        // Keep only recent patterns
        this.patterns[key] = this.patterns[key].slice(-10);
    }
}

self.NetworkAIAnalysis = NetworkAIAnalysis;
