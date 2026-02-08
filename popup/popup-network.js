/**
 * Network Information Service
 * Handles network info updates, initial data fetching and outage monitoring
 */

window.PopupNetwork = {
    initializeInfo() {
        const networkInfoIds = [
            'ip-address', 'local-address', 'dns', 'signal-strength',
            'connection-type', 'network-name', 'latency', 'isp',
            'location-country', 'location-city', 'location-region',
            'location-timezone', 'server-name', 'server-organization',
            'detection-status', 'ping-value', 'jitter-value', 'loss-value'
        ];

        networkInfoIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.textContent = '-';
        });
    },

    updateInfo(info) {
        const { state, elements } = window.PopupApp;

        const emptyValues = {
            ipAddress: '-',
            localAddress: '-',
            dns: '-',
            signalStrength: '-',
            connectionType: '-',
            networkName: '-',
            latency: '-',
            ping: '-',
            jitter: '-',
            packetLoss: '-',
            isp: '-',
            location: { country: '-', city: '-', region: '-', timezone: '-' },
            serverInfo: { name: '-', organization: '-' },
            status: 'waiting'
        };

        if (!info) {
            info = { ...emptyValues };
        } else {
            info = {
                ...emptyValues,
                ...state.networkInfoCache,
                ...info,
                networkName: info.networkName || state.networkInfoCache.networkName || '-',
                localAddress: info.localAddress || state.networkInfoCache.localAddress || '-',
                ping: (info.ping !== undefined && info.ping !== null) ? info.ping : (info.latency ? info.latency.replace(' ms', '') : '-'),
                jitter: (info.jitter !== undefined && info.jitter !== null) ? info.jitter : '-',
                packetLoss: (info.packetLoss !== undefined && info.packetLoss !== null) ? info.packetLoss : '-',
                lastUpdate: Date.now()
            };
        }

        state.networkInfoCache = info;

        // UI Updates
        elements.ipAddress.textContent = info.ipAddress || '-';
        elements.localAddress.textContent = info.localAddress || '-';
        elements.dns.textContent = info.dns || '-';
        elements.signalStrength.textContent = info.signalStrength || '-';
        elements.connectionType.textContent = info.connectionType || '-';
        elements.networkName.textContent = info.networkName || '-';
        elements.latency.textContent = info.latency || '-';
        elements.isp.textContent = info.isp || '-';

        if (elements.pingValue) elements.pingValue.textContent = (info.ping !== undefined && info.ping !== null && info.ping !== '-') ? info.ping : '-';
        if (elements.jitterValue) elements.jitterValue.textContent = (info.jitter !== undefined && info.jitter !== null && info.jitter !== '-') ? info.jitter : '-';
        if (elements.lossValue) elements.lossValue.textContent = (info.packetLoss !== undefined && info.packetLoss !== null && info.packetLoss !== '-') ? info.packetLoss : '-';

        if (info.location) {
            elements.locationCountry.textContent = info.location.country || '-';
            elements.locationCity.textContent = info.location.city || '-';
            elements.locationRegion.textContent = info.location.region || '-';
            elements.locationTimezone.textContent = info.location.timezone || '-';
        }

        if (info.serverInfo) {
            elements.serverName.textContent = info.serverInfo.name || '-';
            elements.serverOrganization.textContent = info.serverInfo.organization || '-';
        }

        if (elements.detectionStatus) {
            elements.detectionStatus.textContent = info.status || 'detecting';
        }

        window.PopupApp.updateTimestamp();

        // Error handling
        if (elements.networkInfoContainer && elements.networkInfoContainer.style) {
            if (info.status === 'error') {
                if (elements.errorContainer) {
                    elements.errorMessage.textContent = info.error || 'Unknown error';
                    elements.errorContainer.style.display = 'block';
                }
                elements.networkInfoContainer.classList.add('error-state');
            } else {
                if (elements.errorContainer) elements.errorContainer.style.display = 'none';
                elements.networkInfoContainer.classList.remove('error-state');
                elements.networkInfoContainer.style.display =
                    (info.ipAddress !== '-' || info.connectionType !== '-') ? 'block' : 'none';
            }
        }
    },

    getInitialData() {
        const { state } = window.PopupApp;
        chrome.runtime.sendMessage({ type: 'getSpeed' }, (response) => {
            if (response) {
                const downloadSpeedMbps = (response.downloadSpeed || 0) / 1000000;
                const uploadSpeedMbps = (response.uploadSpeed || 0) / 1000000;

                window.PopupSpeedometer.update('download', downloadSpeedMbps);
                window.PopupSpeedometer.update('upload', uploadSpeedMbps);
                this.updateInfo(response.networkInfo || state.networkInfoCache);

                window.PopupApp.elements.testStatus.textContent = response.timestamp ?
                    'Last test: ' + new Date(response.timestamp).toLocaleTimeString() :
                    'No test data available';
            }
        });
    },

    checkOutages() {
        const { elements } = window.PopupApp;
        if (!elements.serviceStatusList) return;

        elements.serviceStatusList.innerHTML = `
            <div style="padding: 5px 0; text-align: center;">
                <p style="font-size: 11px; color: #888; margin-bottom: 12px; margin-top: 0;">Detect and track service outages in real-time</p>
                <a href="https://downdetector.in/" target="_blank" class="status-badge" 
                   style="background: rgba(66, 133, 244, 0.1); color: #4285f4; border: 1px solid rgba(66, 133, 244, 0.2); text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; padding: 12px 20px; font-size: 14px; border-radius: 12px; transition: all 0.3s ease; width: 100%; justify-content: center; box-sizing: border-box; font-weight: 500;">
                   <i class="fas fa-search-location"></i> Check On Downdetector
                </a>
            </div>
        `;

        const link = elements.serviceStatusList.querySelector('.status-badge');
        if (link) {
            link.addEventListener('click', () => {
                if (window.Analytics?.trackDowndetectorClick) window.Analytics.trackDowndetectorClick();
            });
            link.addEventListener('mouseenter', () => {
                link.style.background = 'rgba(66, 133, 244, 0.2)';
                link.style.transform = 'translateY(-1px)';
            });
            link.addEventListener('mouseleave', () => {
                link.style.background = 'rgba(66, 133, 244, 0.1)';
                link.style.transform = 'translateY(0)';
            });
        }
    }
};
