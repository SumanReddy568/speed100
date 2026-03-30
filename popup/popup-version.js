/**
 * Version Management Service
 * Handles version checking and update notifications
 */

window.VersionService = {
  API_URL: "https://multi-product-analytics.sumanreddy568.workers.dev/api/latest-version?source=speed100",
  currentVersion: null,
  latestVersion: null,

  initialize() {
    this.currentVersion = chrome.runtime.getManifest().version;
    this.setupHandlers();
    this.checkVersion();
  },

  setupHandlers() {
    const { elements } = window.PopupApp;

    if (elements.updateClose) {
      elements.updateClose.addEventListener("click", () => {
        elements.updateModal.style.display = "none";
      });
    }

    if (elements.remindLaterBtn) {
      elements.remindLaterBtn.addEventListener("click", () => {
        elements.updateModal.style.display = "none";
        // Optionally store a timestamp to skip checking for a while
        chrome.storage.local.set({ lastUpdateReminder: Date.now() });

        // Track remind later click
        if (window.Analytics?.trackUpdateRemindLater) {
          window.Analytics.trackUpdateRemindLater(this.currentVersion, this.latestVersion);
        }
      });
    }

    if (elements.updateNowBtn) {
      elements.updateNowBtn.addEventListener("click", (e) => {
        e.preventDefault();
        elements.updateModal.style.display = "none";

        // Track update now click
        if (window.Analytics?.trackUpdateNowClick) {
          window.Analytics.trackUpdateNowClick(this.currentVersion, this.latestVersion);
        }

        chrome.tabs.create({ 
            url: "https://chromewebstore.google.com/detail/speed-tester/ikgbkmpmehkhjmhbfpoocemgkdhgjcln" 
        });
      });
    }

    // Close modal when clicking outside
    window.addEventListener("click", (event) => {
      if (event.target === elements.updateModal) {
        elements.updateModal.style.display = "none";
      }
    });
  },

  async checkVersion() {
    try {
      const response = await fetch(this.API_URL);
      if (!response.ok) {
        console.warn("Failed to check for updates:", response.statusText);
        return;
      }

      const data = await response.json();
      this.latestVersion = data.version;

      console.log(`Version check: Current=${this.currentVersion}, Latest=${this.latestVersion}`);

      if (this.isNewerVersion(this.currentVersion, this.latestVersion)) {
        this.showUpdateModal(this.currentVersion, this.latestVersion);
        
        // Track modal show
        if (window.Analytics?.trackUpdateModalShow) {
          window.Analytics.trackUpdateModalShow(this.currentVersion, this.latestVersion);
        }
      }
    } catch (error) {
      console.error("Error checking version:", error);
    }
  },

  isNewerVersion(current, latest) {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);

    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
      const v1 = currentParts[i] || 0;
      const v2 = latestParts[i] || 0;
      if (v2 > v1) return true;
      if (v1 > v2) return false;
    }
    return false;
  },

  showUpdateModal(current, latest) {
    const { elements } = window.PopupApp;

    if (elements.currentVersionNumber) {
      elements.currentVersionNumber.textContent = current;
    }

    if (elements.latestVersionNumber) {
      elements.latestVersionNumber.textContent = latest;
    }

    if (elements.updateModal) {
      elements.updateModal.style.display = "block";
    }
  }
};

// Initialize the version service when the script loads
// This will be called after popup-ui.js elements are initialized
document.addEventListener("DOMContentLoaded", () => {
  // We wait a tiny bit to ensure everything in popup.js is done or just call it from there
  // Actually, calling it from here is fine as long as PopupApp.elements is ready.
});
