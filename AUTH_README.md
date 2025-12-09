# Speed Tester Authentication System

A complete authentication system integrated with Cloudflare Auth Worker for the Speed Tester application.

## 📁 Files Created

- **`signup.html`** - User registration page
- **`login.html`** - User login page
- **`logout.html`** - Logout confirmation page
- **`index.html`** - Welcome/landing page
- **`auth.css`** - Authentication pages styling
- **`auth.js`** - Authentication logic and API integration

## 🚀 Features

### ✨ User Experience
- **Modern UI Design** - Premium gradient backgrounds with glassmorphism effects
- **Smooth Animations** - Micro-animations for enhanced user engagement
- **Responsive Design** - Works perfectly on all screen sizes
- **Password Visibility Toggle** - Easy password viewing with eye icon
- **Real-time Validation** - Instant feedback on form inputs
- **Auto-login After Signup** - Seamless user experience

### 🔒 Security
- **SHA-256 Hashing** - Client-side password hashing before transmission
- **Session-based Authentication** - Secure token management
- **24-hour Session Expiry** - Automatic session timeout
- **No Plain-text Passwords** - Passwords are hashed before sending to server

### 🛠️ Technical Features
- **Multi-tenant Support** - Uses `source` parameter for project isolation
- **Session Validation** - Background session checks
- **Local Storage Management** - Secure token and user data storage
- **Error Handling** - Comprehensive error messages and recovery
- **API Integration** - Full integration with Cloudflare Auth Worker

## 🔧 How It Works

### Authentication Flow

#### 1. **Signup Process**
```
User enters email & password
    ↓
SHA-256 hash generated (email:password)
    ↓
POST /signup with {source, hash}
    ↓
Account created in Cloudflare KV
    ↓
Auto-login initiated
    ↓
Redirect to main app
```

#### 2. **Login Process**
```
User enters credentials
    ↓
SHA-256 hash generated
    ↓
POST /login with {source, hash}
    ↓
Session token received
    ↓
Token stored in localStorage
    ↓
Redirect to main app
```

#### 3. **Logout Process**
```
User clicks logout
    ↓
POST /logout with {source, token}
    ↓
Session deleted from server
    ↓
Local data cleared
    ↓
Redirect to login page
```

#### 4. **Session Validation**
```
Page loads
    ↓
Check for stored token
    ↓
GET /me with Bearer token
    ↓
Validate session status
    ↓
Redirect if invalid
```

## 📝 API Endpoints Used

### Base URL
```
https://auth-worker.sumanreddy568.workers.dev
```

### Endpoints

#### Signup
```http
POST /signup
Content-Type: application/json

{
  "source": "speed-tester-app",
  "hash": "user-unique-identifier-hash"
}
```

**Response (200 OK):**
```json
{
  "created": true,
  "source": "speed-tester-app"
}
```

#### Login
```http
POST /login
Content-Type: application/json

{
  "source": "speed-tester-app",
  "hash": "user-unique-identifier-hash"
}
```

**Response (200 OK):**
```json
{
  "token": "session-token-guid",
  "source": "speed-tester-app"
}
```

#### Logout
```http
POST /logout
Content-Type: application/json

{
  "source": "speed-tester-app",
  "token": "session-token"
}
```

**Response (200 OK):**
```json
{
  "ok": true
}
```

#### Validate Session
```http
GET /me?source=speed-tester-app
Authorization: Bearer session-token
```

**Response (200 OK):**
```json
{
  "valid": true,
  "source": "speed-tester-app"
}
```

## 💾 Local Storage

The authentication system stores the following data in `localStorage`:

| Key | Description |
|-----|-------------|
| `auth_token` | Session token from login |
| `user_email` | User's email address |
| `user_hash` | SHA-256 hash of credentials |

## 🎨 UI Components

### Pages

#### **index.html** - Welcome Page
- Feature showcase
- Call-to-action buttons
- Auto-redirect for authenticated users

#### **signup.html** - Registration
- Email input
- Password input with strength requirement (min 8 chars)
- Password confirmation
- Password visibility toggles
- Auto-login after successful signup

#### **login.html** - Sign In
- Email input
- Password input
- Password visibility toggle
- Link to signup page

#### **logout.html** - Sign Out
- Confirmation dialog
- Logout and cancel buttons
- Session termination

### Styling Features
- Gradient backgrounds
- Glassmorphism effects
- Smooth transitions
- Hover animations
- Focus states for accessibility
- Responsive design

## 🔌 Integration with Main App

The authentication system is integrated into `popup.html`:

1. **Header Controls** - Shows user email and logout button when authenticated
2. **Session Check** - Validates session on page load
3. **Auto-redirect** - Redirects to login if session is invalid

### Usage in popup.html

```javascript
// Check if user is authenticated
if (window.AuthModule.isAuthenticated()) {
    // User is logged in
    const email = window.AuthModule.getStoredEmail();
    const token = window.AuthModule.getStoredToken();
}

// Validate session
await window.AuthModule.checkSession();

// Logout programmatically
await window.AuthModule.logout();
```

## 🚦 Getting Started

### For Users

1. **First Time Users:**
   - Open `index.html` or `signup.html`
   - Enter your email and create a password (min 8 characters)
   - Click "Create Account"
   - You'll be automatically logged in and redirected

2. **Returning Users:**
   - Open `login.html`
   - Enter your credentials
   - Click "Sign In"
   - Access the main application

3. **Logging Out:**
   - Click the logout icon in the header
   - Confirm logout
   - You'll be redirected to the login page

### For Developers

1. **Include Authentication Files:**
   ```html
   <link rel="stylesheet" href="auth.css">
   <script src="auth.js"></script>
   ```

2. **Use AuthModule:**
   ```javascript
   // Check authentication
   if (window.AuthModule.isAuthenticated()) {
       // Protected content
   }
   
   // Get user data
   const email = window.AuthModule.getStoredEmail();
   
   // Validate session
   const isValid = await window.AuthModule.checkSession();
   ```

3. **Protect Pages:**
   ```javascript
   // Require authentication
   window.AuthModule.requireAuth();
   ```

## 🎯 Configuration

Edit `auth.js` to customize:

```javascript
const AUTH_CONFIG = {
    API_BASE_URL: 'https://auth-worker.sumanreddy568.workers.dev',
    SOURCE: 'speed-tester-app', // Change for different projects
    STORAGE_KEYS: {
        TOKEN: 'auth_token',
        USER_EMAIL: 'user_email',
        USER_HASH: 'user_hash'
    }
};
```

## 🔐 Security Best Practices

1. **Password Hashing** - All passwords are hashed with SHA-256 before transmission
2. **No Plain-text Storage** - Passwords are never stored in plain text
3. **Session Expiry** - Sessions automatically expire after 24 hours
4. **Secure Transmission** - All API calls use HTTPS
5. **Token-based Auth** - Bearer tokens for session management

## 🐛 Error Handling

The system handles various error scenarios:

- **409 Conflict** - User already exists (signup)
- **401 Unauthorized** - Invalid credentials (login)
- **400 Bad Request** - Missing or invalid data
- **Network Errors** - Connection issues
- **Session Expiry** - Automatic redirect to login

## 📱 Browser Compatibility

- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Opera
- ✅ Mobile browsers

## 🎨 Customization

### Colors
Edit `auth.css` to change the color scheme:

```css
/* Primary gradient */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);

/* Accent colors */
--primary-color: #667eea;
--secondary-color: #764ba2;
```

### Branding
Update logos and text in HTML files to match your brand.

## 📄 License

This authentication system is part of the Speed Tester project.

## 🤝 Support

For issues or questions:
1. Check the error messages in the browser console
2. Verify API endpoint is accessible
3. Ensure localStorage is enabled
4. Check network connectivity

## 🎉 Features Showcase

- ✨ Modern, premium UI design
- 🔒 Secure authentication flow
- 📊 Session management
- 🎯 User-friendly error messages
- 🚀 Fast and responsive
- 📱 Mobile-friendly
- ♿ Accessible design
- 🎨 Smooth animations
- 🔄 Auto-login after signup
- 💾 Persistent sessions

---

**Built with ❤️ for Speed Tester**
