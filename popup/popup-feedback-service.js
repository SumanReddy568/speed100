/**
 * Feedback Service
 * Handles all feedback-related logic: checking feedback status,
 * submitting feedback, and managing the feedback modal UI.
 */

window.FeedbackService = {
  /** Base URL for the feedback collector worker */
  API_BASE: "https://feedback-collector.sumanreddy568.workers.dev",

  /**
   * Fetches user identity fields from chrome.storage.local.
   * @returns {Promise<{userId: string, email: string|null, userHash: string|null}>}
   */
  async getUserInfo() {
    const result = await new Promise((resolve) =>
      chrome.storage.local.get(
        ["user_id", "user_email", "user_hash"],
        resolve,
      ),
    );
    return {
      userId: result.user_id || result.user_email || "anonymous",
      email: result.user_email || null,
      userHash: result.user_hash || null,
    };
  },

  /**
   * Checks via the API whether the given userId has already submitted feedback.
   * Falls back to `fallback` if the request fails.
   * @param {string} userId
   * @param {boolean} fallback - value to return on API failure
   * @returns {Promise<boolean>}
   */
  async checkFeedbackViaApi(userId, fallback = true) {
    try {
      const response = await fetch(
        `${this.API_BASE}/check-feedback?userId=${encodeURIComponent(userId)}`,
        {
          method: "GET",
          mode: "cors",
          cache: "no-cache",
          credentials: "omit",
          headers: { Accept: "application/json" },
        },
      );
      if (response.ok) {
        const data = await response.json();
        return data.hasSubmittedFeedback || false;
      }
      console.warn("FeedbackService: check-feedback API returned non-OK, using fallback");
      return fallback;
    } catch (err) {
      console.warn("FeedbackService: check-feedback API error, using fallback:", err);
      return fallback;
    }
  },

  /**
   * Shows or hides the feedback rating container based on whether
   * the current user has already submitted feedback.
   */
  async checkFeedbackStatus() {
    const { elements } = window.PopupApp;
    if (!elements.feedbackRatingContainer) return;

    try {
      const { userId } = await this.getUserInfo();

      if (userId === "anonymous") {
        elements.feedbackRatingContainer.style.display = "block";
        return;
      }

      const hasSubmitted = await this.checkFeedbackViaApi(userId, /* fallback show */ false);
      elements.feedbackRatingContainer.style.display = hasSubmitted ? "none" : "block";
    } catch (error) {
      console.warn("FeedbackService: Failed to check feedback status:", error);
      elements.feedbackRatingContainer.style.display = "block";
    }
  },

  /**
   * Determines whether the user is allowed to run another speed test.
   * First test is always allowed; subsequent tests require feedback.
   * @returns {Promise<boolean>}
   */
  async checkCanRunTest() {
    try {
      const result = await new Promise((resolve) =>
        chrome.storage.local.get(
          ["user_id", "user_email", "user_hash", "hasRunFirstTest", "feedbackSubmitted"],
          resolve,
        ),
      );

      const userId = result.user_id || result.user_email || "anonymous";
      const hasRunFirstTest = result.hasRunFirstTest || false;

      console.log("FeedbackService.checkCanRunTest:", {
        hasRunFirstTest,
        userId,
        localFeedbackSubmitted: result.feedbackSubmitted,
      });

      // Always allow the very first test
      if (!hasRunFirstTest) {
        console.log("FeedbackService: Allowing first test");
        return true;
      }

      console.log("FeedbackService: Must check feedback before allowing test");

      // Anonymous users rely on local storage only
      if (userId === "anonymous") {
        const canRun = result.feedbackSubmitted || false;
        console.log("FeedbackService: Anonymous user, can run:", canRun);
        return canRun;
      }

      // Registered users: verify against API, fall back to local state
      const hasSubmitted = await this.checkFeedbackViaApi(userId, result.feedbackSubmitted || false);
      console.log("FeedbackService: API says hasSubmittedFeedback:", hasSubmitted);
      return hasSubmitted;
    } catch (error) {
      console.warn("FeedbackService: Failed to check if can run test:", error);
      return false;
    }
  },

  /**
   * Opens the feedback modal and sets the prompt text.
   * @param {string} rating  - "positive" | "negative"
   * @param {string} promptText
   */
  handleRatingClick(rating, promptText) {
    const { elements, state } = window.PopupApp;
    state.selectedRating = rating;
    elements.feedbackPrompt.textContent = promptText;
    elements.feedbackModal.style.display = "block";
    elements.feedbackText.focus();
    elements.feedbackStatus.textContent = "";
    elements.feedbackText.value = "";
  },

  /**
   * Submits feedback to the API.
   * Called by the submit button listener in setupFeedbackHandlers.
   */
  async submitFeedback() {
    const { elements, state } = window.PopupApp;
    const feedback = elements.feedbackText.value.trim();

    if (!feedback) {
      elements.feedbackStatus.textContent = "Please enter a message before submitting.";
      elements.feedbackStatus.style.color = "#dc3545";
      return; 
    }

    elements.submitFeedback.disabled = true;
    elements.feedbackStatus.textContent = "Sending...";
    elements.feedbackStatus.style.color = "#666";

    let userInfo = { userId: "anonymous", email: null, userHash: null };
    try {
      userInfo = await this.getUserInfo();
    } catch (e) {
      console.warn("FeedbackService: Failed to fetch user info for feedback:", e);
    }

    const info = state.networkInfoCache || {};
    const payload = {
      source: "speed100-extension",
      userId: userInfo.userId,
      userEmail: userInfo.email,
      userHash: userInfo.userHash,
      feedback,
      rating: state.selectedRating,
      downloadSpeed: document.getElementById("download-speed")?.textContent || null,
      uploadSpeed: document.getElementById("upload-speed-display")?.textContent || null,
      ping: info.ping || null,
      jitter: info.jitter || null,
      packetLoss: info.packetLoss || null,
      ipAddress: info.ipAddress || null,
      isp: info.isp || null,
      location: info.location || null,
      server: info.serverInfo || null,
      timestamp: new Date().toISOString(),
    };

    try {
      const res = await fetch(`${this.API_BASE}/feedback/`, {
        method: "POST",
        mode: "cors",
        cache: "no-cache",
        credentials: "omit",
        headers: {
          "Content-Type": "application/json",
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br, zstd",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        state.feedbackSubmitted = true;
        chrome.storage.local.set({ feedbackSubmitted: true });
        console.log("FeedbackService: Feedback submitted successfully");

        elements.feedbackStatus.textContent = "Thank you for your feedback!";
        elements.feedbackStatus.style.color = "#28a745";
        elements.feedbackRatingContainer.style.display = "none";

        setTimeout(() => {
          elements.feedbackModal.style.display = "none";
        }, 1500);
      } else {
        elements.feedbackStatus.textContent = "Failed to send feedback. Please try again.";
        elements.feedbackStatus.style.color = "#dc3545";
      }
    } catch (e) {
      elements.feedbackStatus.textContent = "Error sending feedback. Check your connection.";
      elements.feedbackStatus.style.color = "#dc3545";
    }

    elements.submitFeedback.disabled = false;
  },

  /**
   * Registers all DOM event listeners related to the feedback UI.
   * Should be called once during popup initialisation.
   */
  setupFeedbackHandlers() {
    const { elements } = window.PopupApp;
    if (!elements.thumbsUp || !elements.thumbsDown || !elements.feedbackModal) return;

    elements.thumbsUp.addEventListener("click", () => {
      this.handleRatingClick("positive", "What did you like about your speed test?");
    });

    elements.thumbsDown.addEventListener("click", () => {
      this.handleRatingClick("negative", "What issues did you experience with your speed test?");
    });

    elements.feedbackClose.addEventListener("click", () => {
      elements.feedbackModal.style.display = "none";
    });

    window.addEventListener("click", (event) => {
      if (event.target === elements.feedbackModal) {
        elements.feedbackModal.style.display = "none";
      }
    });

    elements.submitFeedback.addEventListener("click", () => this.submitFeedback());
  },
};
