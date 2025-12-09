# Troubleshooting - Application Not Loading

## Issue
Application stuck, only 129 bytes transferred, particles not showing.

## Root Cause
This is likely a **module loading issue** with ES6 imports. The browser needs a proper HTTP server to load ES6 modules.

## Solution: Use Live Server

### Option 1: VS Code Live Server (Recommended)
1. Install "Live Server" extension in VS Code
2. Right-click `index.html`
3. Select "Open with Live Server"
4. Should open at `http://127.0.0.1:5500`

### Option 2: Python HTTP Server
```bash
# Python 3
python -m http.server 8000

# Then open: http://localhost:8000
```

### Option 3: Node.js HTTP Server
```bash
npx http-server -p 8000

# Then open: http://localhost:8000
```

## Important: Don't Open File Directly

❌ **Don't do this:**
- Opening `file:///C:/Users/.../index.html` directly
- This causes CORS issues with ES6 modules

✅ **Do this:**
- Use a local HTTP server
- Access via `http://localhost:...`

## Check Console for Errors

Open browser DevTools (F12) and check for:
- CORS errors
- Module loading errors
- JavaScript errors

Share any error messages you see!
