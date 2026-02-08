/**
 * Speedometer Visualization
 * Handles speedometer updates, animations and SVG gradients
 */

window.PopupSpeedometer = {
    update(type, speedMbps) {
        const { elements, config } = window.PopupApp;
        const isDownload = type === 'download';
        const maxSpeed = isDownload ? config.downloadMaxSpeed : config.uploadMaxSpeed;
        const needle = isDownload ? elements.downloadNeedle : elements.uploadNeedle;
        const meter = isDownload ? elements.downloadMeter : elements.uploadMeter;
        const display = isDownload ? elements.downloadSpeed : elements.uploadSpeedDisplay;

        const clampedSpeed = Math.min(speedMbps, maxSpeed);
        display.textContent = clampedSpeed.toFixed(1);

        const rotation = config.minRotation + (clampedSpeed / maxSpeed * (config.maxRotation - config.minRotation));
        needle.setAttribute('transform', `rotate(${rotation} 100 100)`);

        const arcFill = (clampedSpeed / maxSpeed) * 251;
        meter.style.strokeDasharray = `${arcFill} ${251 - arcFill}`;
    },

    animate(type, targetSpeed) {
        const { elements } = window.PopupApp;
        const isDownload = type === 'download';
        const currentSpeed = isDownload ?
            parseFloat(elements.downloadSpeed.textContent) :
            parseFloat(elements.uploadSpeedDisplay.textContent);

        const duration = 1000;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const current = currentSpeed + (targetSpeed - currentSpeed) * progress;

            this.update(type, current);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        requestAnimationFrame(animate);
    },

    addGradientDefs() {
        const downloadSVG = document.getElementById('download-speedometer');
        const uploadSVG = document.getElementById('upload-speedometer');

        if (downloadSVG) {
            const defsDownload = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            defsDownload.innerHTML = `
                <linearGradient id="download-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#f44336" />
                    <stop offset="50%" stop-color="#ff9800" />
                    <stop offset="100%" stop-color="#4caf50" />
                </linearGradient>
            `;
            downloadSVG.insertBefore(defsDownload, downloadSVG.firstChild);
        }

        if (uploadSVG) {
            const defsUpload = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            defsUpload.innerHTML = `
                <linearGradient id="upload-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#2196f3" />
                    <stop offset="50%" stop-color="#03a9f4" />
                    <stop offset="100%" stop-color="#00bcd4" />
                </linearGradient>
            `;
            uploadSVG.insertBefore(defsUpload, uploadSVG.firstChild);
        }
    }
};
