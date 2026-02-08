/**
 * History Charts and Lists
 * Handles speed history and load test history visualization
 */

window.PopupCharts = {
    updateHistoryGraph() {
        const { state } = window.PopupApp;
        const canvas = document.querySelector('.graph-canvas');
        const container = document.querySelector('.graph-container');
        const timeLabels = document.querySelector('.graph-time-labels');
        const emptyState = document.getElementById('speed-history-empty-state');
        const graphContent = document.querySelector('.graph-content-data');

        if (!state.speedTestHistory || state.speedTestHistory.length === 0) {
            if (emptyState) emptyState.style.display = 'flex';
            if (graphContent) graphContent.style.display = 'none';
            return;
        }

        if (emptyState) emptyState.style.display = 'none';
        if (graphContent) graphContent.style.display = 'block';

        if (!canvas || !container) return;

        timeLabels.innerHTML = '';
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const recentTests = state.speedTestHistory.slice(0, 3).reverse();
        const padding = { top: 30, right: 20, bottom: 30, left: 40 };
        const graphWidth = rect.width - padding.left - padding.right;
        const graphHeight = rect.height - padding.top - padding.bottom;

        const maxSpeed = Math.max(
            ...recentTests.map(test =>
                Math.max((test.downloadSpeed || 0) / 1000000, (test.uploadSpeed || 0) / 1000000)
            ),
            1
        );

        const barWidth = graphWidth / (recentTests.length * 3);
        const barGap = barWidth / 2;

        recentTests.forEach((test, i) => {
            const x = padding.left + (i * barWidth * 3);
            const downloadHeight = (test.downloadSpeed / 1000000 / maxSpeed) * graphHeight;
            const uploadHeight = (test.uploadSpeed / 1000000 / maxSpeed) * graphHeight;

            ctx.fillStyle = '#4caf50';
            ctx.fillRect(x, rect.height - padding.bottom - downloadHeight, barWidth, downloadHeight);

            ctx.fillStyle = '#2196f3';
            ctx.fillRect(x + barWidth + barGap, rect.height - padding.bottom - uploadHeight, barWidth, uploadHeight);

            ctx.fillStyle = '#fff';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';

            ctx.fillText(`${(test.downloadSpeed / 1000000).toFixed(1)}`, x + barWidth / 2, rect.height - padding.bottom - downloadHeight - 5);
            ctx.fillText(`${(test.uploadSpeed / 1000000).toFixed(1)}`, x + barWidth * 1.5 + barGap, rect.height - padding.bottom - uploadHeight - 5);

            const date = new Date(test.timestamp);
            const timeLabel = document.createElement('div');
            timeLabel.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            timeLabels.appendChild(timeLabel);
        });

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 5; i++) {
            const y = rect.height - padding.bottom - (i * graphHeight / 5);
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(rect.width - padding.right, y);
            ctx.stroke();

            ctx.fillStyle = '#666';
            ctx.textAlign = 'right';
            ctx.fillText(`${(maxSpeed * i / 5).toFixed(0)}`, padding.left - 5, y + 4);
        }
    },

    updateLoadHistory() {
        const { state, elements } = window.PopupApp;
        if (!elements.loadHistoryList) return;

        elements.loadHistoryList.innerHTML = '';

        if (!state.loadTestHistory || state.loadTestHistory.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = '<span class="no-data-message">No test history available</span>';
            elements.loadHistoryList.appendChild(emptyState);
            return;
        }

        state.loadTestHistory.slice(0, 3).forEach(test => {
            const item = document.createElement('div');
            item.className = 'load-history-item';
            const date = new Date(test.timestamp);
            item.innerHTML = `
                <span class="info-label">File Size:</span>
                <span class="info-value">${test.fileSizeMB} MB</span>
                <span class="info-label">Average Speed:</span>
                <span class="info-value">${test.averageSpeedMbps.toFixed(2)} Mbps</span>
                <span class="info-label">Duration:</span>
                <span class="info-value">${test.totalTime.toFixed(1)}s</span>
                <div class="load-history-time">${date.toLocaleString()}</div>
            `;
            elements.loadHistoryList.appendChild(item);
        });
    },

    initializeGraphObserver() {
        const graphContainer = document.querySelector('.graph-container');
        if (!graphContainer) return;

        const resizeObserver = new ResizeObserver(() => {
            const graph = document.querySelector('.speed-history-graph');
            if (graph && !graph.classList.contains('collapsed')) {
                this.updateHistoryGraph();
            }
        });

        resizeObserver.observe(graphContainer);
    }
};
