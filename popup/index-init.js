// Redirect to popup if already logged in
document.addEventListener('DOMContentLoaded', () => {
    if (window.AuthModule && window.AuthModule.isAuthenticated()) {
        window.location.href = 'popup.html';
    }
});
