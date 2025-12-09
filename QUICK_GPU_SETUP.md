# Quick GPU Setup Guide

## ⚡ Immediate Actions (Do These First!)

### 1. Enable Hardware Acceleration in Browser
**Chrome/Edge:**
1. Go to `chrome://settings/system` or `edge://settings/system`
2. Toggle ON: "Use hardware acceleration when available"
3. **Restart browser**

**Firefox:**
1. Go to `about:preferences`
2. Scroll to "Performance"
3. Uncheck "Use recommended performance settings"
4. Check "Use hardware acceleration when available"
5. **Restart browser**

### 2. Set Browser to High Performance GPU
**Windows 10/11:**
1. Settings → System → Display
2. Scroll down → Graphics Settings
3. Click "Browse" and add your browser executable:
   - Chrome: `C:\Program Files\Google\Chrome\Application\chrome.exe`
   - Edge: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
   - Firefox: `C:\Program Files\Mozilla Firefox\firefox.exe`
4. Click "Options" → Select "High Performance"
5. Save

### 3. NVIDIA Users (If you have NVIDIA GPU)
1. Right-click desktop → NVIDIA Control Panel
2. Manage 3D Settings → Program Settings
3. Add your browser
4. Find "Power management mode" → Set to "Prefer maximum performance"
5. Find "OpenGL rendering GPU" → Select your NVIDIA GPU
6. Apply

### 4. AMD Users (If you have AMD GPU)
1. Right-click desktop → AMD Radeon Settings
2. Gaming → Add → Browse for your browser
3. Click on browser → Graphics Profile
4. Set to "High Performance"
5. Save

## ✅ Verification Checklist

After making changes, open the app and check:

- [ ] Browser console shows: `🎮 Using WebGL2 with GPU acceleration`
- [ ] Browser console shows: `✅ GPU-accelerated renderer initialized`
- [ ] Stats display shows: `| GPU Active` at the end
- [ ] Task Manager shows GPU usage 60-85% (not 1%)
- [ ] CPU usage is below 30%
- [ ] Frame rate is smooth (30-60+ FPS)

## 🎯 Expected GPU Usage by Hardware

| GPU Tier | Expected GPU Usage | Expected FPS | Particle Count |
|----------|-------------------|--------------|----------------|
| Integrated (Intel UHD) | 70-90% | 30-60 FPS | 128k-256k |
| Entry (GTX 1650) | 60-80% | 60 FPS | 256k-360k |
| Mid (RTX 3060) | 50-70% | 60-120 FPS | 360k-589k |
| High (RTX 3080+) | 40-60% | 120-240 FPS | 589k-1M |

## 🚨 Troubleshooting

### GPU usage still at 1%?
1. **Restart browser** after enabling hardware acceleration
2. Check if GPU drivers are up to date
3. Try different browser (Chrome usually best for WebGL)
4. Disable browser extensions temporarily
5. Check if laptop is in "Power Saving" mode (switch to "Performance")

### CPU usage still high?
1. Close other tabs and applications
2. Disable browser extensions
3. Check console for errors (F12)
4. Try incognito/private mode

### Low FPS?
1. The app auto-adjusts particle count based on performance
2. Wait 5-10 seconds for optimization to stabilize
3. Check if other GPU-intensive apps are running
4. Verify GPU is not thermal throttling (check temperatures)

## 📞 Still Having Issues?

Check the full guide: `GPU_OPTIMIZATION_GUIDE.md`

Or check browser console (F12) for error messages.
