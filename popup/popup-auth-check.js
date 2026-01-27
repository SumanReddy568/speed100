// Check authentication immediately
document.addEventListener('DOMContentLoaded', async () => {
    // Check if user is authenticated
    if (!window.AuthModule || !window.AuthModule.isAuthenticated()) {
        console.warn('Auth check failed: Missing required fields or token. Forcing logout.');
        if (window.AuthModule) {
            window.AuthModule.forceLogout();
        } else {
            window.location.href = 'index.html';
        }
        return;
    }

    // User IS logged in, show the UI
    document.body.style.opacity = '1';

    // Show user info
    const userEmail = window.AuthModule.getStoredEmail();
    const userInfoDiv = document.getElementById('user-info');
    const userEmailDisplay = document.getElementById('user-email-display');

    if (userEmail && userInfoDiv && userEmailDisplay) {
        userEmailDisplay.textContent = userEmail;
        userInfoDiv.style.display = 'flex';
    }

    // Validate session in background
    try {
        const isValid = await window.AuthModule.checkSession();
        if (!isValid) {
            // Session is invalid, redirect to login
            window.location.href = 'login.html';
        }
    } catch (error) {
        console.error('Session validation failed:', error);
        window.location.href = 'login.html';
    }
});
