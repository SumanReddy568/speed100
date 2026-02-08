/**
 * AI Insights Rendering
 * Handles AI analysis results and recommendations display
 */

window.PopupAI = {
    updateInsights(analysis) {
        const { elements } = window.PopupApp;
        if (!analysis || !elements.aiPerformance) {
            console.warn("AI analysis data is missing or AI elements are not initialized.");
            return;
        }

        const escapeHtml = (text) => {
            if (typeof text !== 'string') return '';
            return text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        };

        const overallScore = typeof analysis?.performance?.rating?.overall === 'number'
            ? analysis.performance.rating.overall
            : null;
        const issues = Array.isArray(analysis?.performance?.issues) ? analysis.performance.issues : [];
        const strengths = Array.isArray(analysis?.performance?.strengths) ? analysis.performance.strengths : [];
        const summaryText = typeof analysis?.performance?.summary === 'string'
            ? analysis.performance.summary
            : (typeof analysis?.llmSummary === 'string' ? analysis.llmSummary : '');

        let performanceHTML = `<div class="ai-performance-rating">
            <span class="rating-score">${overallScore !== null ? overallScore.toFixed(1) : '–'}</span>
            <span>Overall Rating</span>
        </div>`;

        if (summaryText) {
            const lines = summaryText.split('\n').map(line => line.trim()).filter(Boolean);
            const bulletLines = [];
            const proseLines = [];

            lines.forEach(line => {
                if (line.startsWith('-')) {
                    bulletLines.push(line.replace(/^-+/, '').trim());
                } else {
                    proseLines.push(line);
                }
            });

            proseLines.forEach(line => {
                performanceHTML += `<p class="ai-summary-text">${escapeHtml(line)}</p>`;
            });

            if (bulletLines.length > 0) {
                performanceHTML += `<ul class="ai-summary-list">${bulletLines.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
            }
        }

        if (issues.length > 0) {
            issues.forEach(issue => {
                performanceHTML += `<p><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(issue.message)}</p>`;
            });
        }

        if (strengths.length > 0) {
            strengths.forEach(strength => {
                performanceHTML += `<p><i class="fas fa-check-circle"></i> ${escapeHtml(strength.message)}</p>`;
            });
        }

        if (analysis.meta?.llmUsed) {
            const modelName = analysis.meta.llmModel ? escapeHtml(analysis.meta.llmModel) : 'OpenRouter';
            const message = analysis.meta?.summarySource === 'openrouter'
                ? `AI summary generated with ${modelName}.`
                : `AI-assisted insights generated with ${modelName}.`;
            performanceHTML += `<p class="ai-meta">${escapeHtml(message)}</p>`;
        }

        if (analysis.meta?.llmError) {
            performanceHTML += `<p class="ai-meta ai-meta-warning">${escapeHtml(analysis.meta.llmError)}</p>`;
        }

        elements.aiPerformance.innerHTML = performanceHTML;

        // Recommendations
        let recommendationsHTML = '';
        if (Array.isArray(analysis.recommendations) && analysis.recommendations.length > 0) {
            analysis.recommendations.forEach(rec => {
                recommendationsHTML += `
                    <div class="ai-recommendation">
                        <h5>
                            <i class="fas fa-lightbulb"></i>
                            ${escapeHtml(rec.title)}
                        </h5>
                        <ul>
                            ${Array.isArray(rec.steps) ? rec.steps.map(step => `<li>${escapeHtml(step)}</li>`).join('') : ''}
                        </ul>
                    </div>`;
            });
        } else {
            recommendationsHTML = '<p>No recommendations available at this time.</p>';
        }
        elements.aiRecommendations.innerHTML = recommendationsHTML;

        // Predictions
        let predictionsHTML = '';
        if (analysis.prediction) {
            const hasDownload = typeof analysis.prediction.downloadSpeed === 'number';
            const hasUpload = typeof analysis.prediction.uploadSpeed === 'number';
            const hasNotes = typeof analysis.prediction.notes === 'string' && analysis.prediction.notes.trim().length > 0;

            if (hasDownload || hasUpload) {
                const predictionLines = [];
                if (hasDownload) {
                    predictionLines.push(`<p>Predicted Download: ${(analysis.prediction.downloadSpeed / 1000000).toFixed(1)} Mbps</p>`);
                }
                if (hasUpload) {
                    predictionLines.push(`<p>Predicted Upload: ${(analysis.prediction.uploadSpeed / 1000000).toFixed(1)} Mbps</p>`);
                }

                const confidenceValue = typeof analysis.prediction.confidence === 'string'
                    ? analysis.prediction.confidence.toLowerCase()
                    : '';
                const allowedConfidence = ['low', 'medium', 'high'];
                const confidenceClass = allowedConfidence.includes(confidenceValue) ? confidenceValue : 'medium';
                if (confidenceValue) {
                    const confidenceLabel = confidenceValue.charAt(0).toUpperCase() + confidenceValue.slice(1);
                    predictionLines.push(`
                        <span class="prediction-confidence confidence-${confidenceClass}">
                            ${escapeHtml(confidenceLabel)} confidence
                        </span>`);
                }

                if (hasNotes) {
                    predictionLines.push(`<p class="prediction-note">${escapeHtml(analysis.prediction.notes)}</p>`);
                }

                predictionsHTML = predictionLines.join('\n');
            } else if (hasNotes) {
                predictionsHTML = `<p class="prediction-note">${escapeHtml(analysis.prediction.notes)}</p>`;
            }
        }

        if (!predictionsHTML) {
            predictionsHTML = '<p>Not enough data for predictions</p>';
        }
        elements.aiPredictions.innerHTML = predictionsHTML;
    },

    showLoader() {
        const { elements } = window.PopupApp;
        const loaderHTML = `
            <div class="ai-loader">
                <div class="ai-spinner"></div>
            </div>
        `;
        if (elements.aiPerformance) elements.aiPerformance.innerHTML = loaderHTML;
        if (elements.aiRecommendations) elements.aiRecommendations.innerHTML = loaderHTML;
        if (elements.aiPredictions) elements.aiPredictions.innerHTML = loaderHTML;
    },

    showError(message) {
        const { elements } = window.PopupApp;
        const errorHTML = `<div class="ai-error-message"><i class="fas fa-exclamation-circle"></i> ${message}</div>`;
        if (elements.aiPerformance) elements.aiPerformance.innerHTML = errorHTML;
        if (elements.aiRecommendations) elements.aiRecommendations.innerHTML = errorHTML;
        if (elements.aiPredictions) elements.aiPredictions.innerHTML = errorHTML;
    },

    updateContent() {
        if (window.Analytics?.trackAIInsights) {
            window.Analytics.trackAIInsights();
        }

        this.showLoader();

        chrome.runtime.sendMessage({ type: 'getSpeed' }, (response) => {
            if (chrome.runtime.lastError) {
                this.showError('Connection failed: ' + chrome.runtime.lastError.message);
                return;
            }
            if (response && response.aiAnalysis) {
                this.updateInsights(response.aiAnalysis);
            } else if (response && (!response.timestamp || response.downloadSpeed === 0)) {
                this.showError('Please run a speed test first to see AI insights');
            } else {
                this.showError('AI analysis is not available for this test result');
            }
        });
    }
};
