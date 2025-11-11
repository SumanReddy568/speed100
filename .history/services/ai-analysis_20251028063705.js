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
                recommendation: 'Run more speed tests to get detailed insights'
            };
        }

        const insights = {
            trends: this.analyzeTrends(),
            patterns: this.analyzeTimePatterns(),
            consistency: this.analyzeConsistency(),
            averages: this.calculateAverages(),
            recommendations: []
        };

        return insights;
    }

    analyzeTrends() {
        const recent = this.getRecentTests(5);
        if (recent.length < 3) return null;

        const downloadTrend = this.calculateTrendDirection(recent, 'downloadSpeed');
        const uploadTrend = this.calculateTrendDirection(recent, 'uploadSpeed');

        return {
            download: downloadTrend,
            upload: uploadTrend,
            overall: downloadTrend.direction === uploadTrend.direction ? downloadTrend.direction : 'mixed'
        };
    }

    calculateTrendDirection(data, field) {
        const values = data.map(d => d[field] / 1000000);
        const first = values[0];
        const last = values[values.length - 1];
        const change = ((last - first) / first) * 100;

        let direction = 'stable';
        if (Math.abs(change) > 10) {
            direction = change > 0 ? 'improving' : 'declining';
        }

        return {
            direction,
            percentage: Math.abs(change),
            description: this.getTrendDescription(direction, Math.abs(change))
        };
    }

    getTrendDescription(direction, percentage) {
        if (direction === 'improving') {
            return `Speeds have improved by ${percentage.toFixed(1)}% recently`;
        } else if (direction === 'declining') {
            return `Speeds have declined by ${percentage.toFixed(1)}% recently`;
        }
        return 'Speeds have been stable';
    }

    analyzeTimePatterns() {
        const hourlyData = {};
        
        this.historicalData.forEach(test => {
            const hour = new Date(test.timestamp).getHours();
            if (!hourlyData[hour]) {
                hourlyData[hour] = [];
            }
            hourlyData[hour].push(test);
        });

        let bestHour = null;
        let bestSpeed = 0;
        let worstHour = null;
        let worstSpeed = Infinity;

        Object.entries(hourlyData).forEach(([hour, tests]) => {
            const avgSpeed = this.calculateAverage(tests, 'downloadSpeed') / 1000000;
            if (avgSpeed > bestSpeed) {
                bestSpeed = avgSpeed;
                bestHour = hour;
            }
            if (avgSpeed < worstSpeed) {
                worstSpeed = avgSpeed;
                worstHour = hour;
            }
        });

        return {
            bestHour: bestHour ? `${bestHour}:00` : null,
            worstHour: worstHour ? `${worstHour}:00` : null,
            variation: bestSpeed - worstSpeed
        };
    }

    analyzeConsistency() {
        const downloadSpeeds = this.historicalData.map(d => d.downloadSpeed / 1000000);
        const variance = this.calculateVariance(this.historicalData, 'downloadSpeed');
        
        let consistency;
        if (variance < 20) consistency = 'Very Stable';
        else if (variance < 50) consistency = 'Stable';
        else if (variance < 100) consistency = 'Moderate';
        else consistency = 'Unstable';

        return {
            level: consistency,
            variance: variance.toFixed(1),
            description: this.getConsistencyDescription(consistency)
        };
    }

    getConsistencyDescription(level) {
        switch (level) {
            case 'Very Stable': return 'Your connection is very reliable';
            case 'Stable': return 'Your connection is generally reliable';
            case 'Moderate': return 'Your connection has some fluctuations';
            case 'Unstable': return 'Your connection varies significantly';
            default: return 'Connection stability unknown';
        }
    }

    calculateAverages() {
        const downloadAvg = this.calculateAverage(this.historicalData, 'downloadSpeed') / 1000000;
        const uploadAvg = this.calculateAverage(this.historicalData, 'uploadSpeed') / 1000000;

        return {
            download: downloadAvg.toFixed(1),
            upload: uploadAvg.toFixed(1),
            ratio: (uploadAvg / downloadAvg).toFixed(2)
        };
    }

    generateRecommendations(result) {
        const recommendations = [];
        const performance = this.analyzePerformance(result);
        const historical = this.analyzeHistoricalData();

        // Performance-based recommendations
        performance.issues.forEach(issue => {
            recommendations.push(this.getRecommendationForIssue(issue));
        });

        // Historical pattern recommendations
        if (historical && historical.patterns) {
            if (historical.patterns.bestHour) {
                recommendations.push({
                    title: 'Optimize Usage Timing',
                    steps: [
                        `Best speeds typically around ${historical.patterns.bestHour}`,
                        'Schedule important downloads during peak hours',
                        'Consider time-of-day for video calls'
                    ],
                    priority: 'medium'
                });
            }
        }

        // Speed category recommendations
        const category = performance.speedCategory;
        if (category === 'Limited' || category === 'Basic') {
            recommendations.push({
                title: 'Consider Plan Upgrade',
                steps: [
                    `Current speeds are in the "${category}" category`,
                    'Contact your ISP about faster plans',
                    'Compare speeds with neighbors'
                ],
                priority: 'high'
            });
        }

        // Default recommendations if none generated
        if (recommendations.length === 0) {
            recommendations.push({
                title: 'Maintain Current Performance',
                steps: [
                    'Your connection is performing well',
                    'Continue monitoring with regular tests',
                    'Keep your router firmware updated'
                ],
                priority: 'low'
            });
        }

        return recommendations.slice(0, 4); // Limit to 4 recommendations
    }

    getRecommendationForIssue(issue) {
        const recommendations = {
            low_download: {
                title: 'Improve Download Speed',
                steps: [
                    'Check for background downloads',
                    'Move closer to WiFi router',
                    'Consider upgrading internet plan',
                    'Use ethernet cable if possible'
                ],
                priority: 'high'
            },
            low_upload: {
                title: 'Improve Upload Speed',
                steps: [
                    'Reduce connected devices',
                    'Check for cloud backup activities',
                    'Use wired connection for uploads',
                    'Contact ISP about upload speeds'
                ],
                priority: 'medium'
            },
            high_latency: {
                title: 'Reduce Network Latency',
                steps: [
                    'Use wired connection',
                    'Check for network interference',
                    'Restart router/modem',
                    'Consider gaming router for low latency'
                ],
                priority: 'medium'
            },
            inconsistent_speeds: {
                title: 'Stabilize Connection',
                steps: [
                    'Check router placement and ventilation',
                    'Update router firmware',
                    'Monitor for interference',
                    'Contact ISP if issues persist'
                ],
                priority: 'medium'
            }
        };

        return recommendations[issue.type] || {
            title: 'General Network Optimization',
            steps: ['Restart your router', 'Check for interference', 'Contact ISP support'],
            priority: 'low'
        };
    }

    // Helper methods
    getRecentTests(count) {
        return this.historicalData.slice(-count);
    }

    calculateAverage(data, key) {
        if (!data.length) return 0;
        return data.reduce((sum, item) => sum + item[key], 0) / data.length;
    }

    calculateVariance(data, key) {
        if (data.length < 2) return 0;
        const values = data.map(d => d[key] / 1000000);
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
