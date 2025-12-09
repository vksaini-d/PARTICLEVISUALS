import * as THREE from "three";
import { GPUComputationRenderer } from "./GPUComputationRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import {
  velocityFragmentShader,
  positionFragmentShader,
  renderVertexShader,
  renderFragmentShader,
} from "./shaders.js";

// ============================================================================
// ADAPTIVE PERFORMANCE SYSTEM - Enhanced ResolutionManager
// ============================================================================
class ResolutionManager {
  constructor() {
    // Resolution tiers: 128x128 (16k), 256x256 (65k), 512x512 (262k), 600x600 (360k), 768x768 (589k), 1024x1024 (1M)
    this.tiers = [128, 256, 512, 600, 768, 1024];
    
    // Detect hardware capabilities
    this.hardwareProfile = this.detectHardware();
    
    // Set initial tier based on hardware
    this.currentTierIndex = this.hardwareProfile.recommendedTierIndex;
    
    // Load saved GPU tier from localStorage (override if user has proven better performance)
    const savedTier = localStorage.getItem('gpu_tier');
    if (savedTier !== null) {
      const savedIndex = this.tiers.indexOf(parseInt(savedTier));
      if (savedIndex !== -1) {
        this.currentTierIndex = savedIndex;
        console.log(`🚀 Loaded saved GPU tier: ${this.tiers[this.currentTierIndex]}x${this.tiers[this.currentTierIndex]}`);
      }
    }
    
    // FPS monitoring
    this.fpsHistory = [];
    this.maxHistoryLength = 120; // 2 seconds at 60fps
    this.lastFrameTime = performance.now();
    this.stableHighFPSCount = 0;
    this.stableLowFPSCount = 0;
    
    // Dynamic FPS targets based on monitor refresh rate
    this.TARGET_FPS_HIGH = this.hardwareProfile.targetFPS * 0.95; // 95% of max refresh
    this.TARGET_FPS_LOW = Math.max(30, this.hardwareProfile.targetFPS * 0.5); // 50% of target, min 30
    
    // Tuning thresholds
    this.UPGRADE_THRESHOLD = 120; // 2 seconds of high FPS
    this.DOWNGRADE_THRESHOLD = 60; // 1 second of low FPS
    
    this.isStable = false;
    this.needsRegeneration = false;
    
    // Log hardware profile
    console.log(`🖥️ Hardware Profile:`, this.hardwareProfile);
  }
  
  detectHardware() {
    const profile = {
      gpuVendor: 'Unknown',
      gpuRenderer: 'Unknown',
      gpuMemoryGB: 2, // Default estimate
      cpuCores: navigator.hardwareConcurrency || 4,
      refreshRate: 60, // Default
      targetFPS: 60,
      recommendedTierIndex: 2, // Default to 512x512
      deviceTier: 'Medium'
    };
    
    // Detect GPU via WebGL (with fallback for deprecated extension)
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      
      if (gl) {
        // Try to get debug info, but handle deprecation gracefully
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          try {
            profile.gpuVendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'Unknown';
            profile.gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'Unknown';
          } catch (e) {
            // Extension exists but deprecated - use RENDERER as fallback
            profile.gpuRenderer = gl.getParameter(gl.RENDERER) || 'Unknown';
            profile.gpuVendor = gl.getParameter(gl.VENDOR) || 'Unknown';
          }
          
          // Estimate GPU memory from renderer string
          const renderer = profile.gpuRenderer.toLowerCase();
          if (renderer.includes('rtx 4090') || renderer.includes('rtx 4080')) {
            profile.gpuMemoryGB = 16;
          } else if (renderer.includes('rtx 3090') || renderer.includes('rtx 3080')) {
            profile.gpuMemoryGB = 12;
          } else if (renderer.includes('rtx 3070') || renderer.includes('rtx 2080') || renderer.includes('rx 6800')) {
            profile.gpuMemoryGB = 8;
          } else if (renderer.includes('rtx 3060') || renderer.includes('rtx 2070') || renderer.includes('rx 6700')) {
            profile.gpuMemoryGB = 6;
          } else if (renderer.includes('gtx 1660') || renderer.includes('rtx 2060') || renderer.includes('rx 6600')) {
            profile.gpuMemoryGB = 4;
          } else if (renderer.includes('intel') && renderer.includes('iris')) {
            profile.gpuMemoryGB = 2; // Integrated graphics
          }
        } else {
          // Extension not available - use standard WebGL parameters
          profile.gpuRenderer = gl.getParameter(gl.RENDERER) || 'Unknown';
          profile.gpuVendor = gl.getParameter(gl.VENDOR) || 'Unknown';
        }
      }
    } catch (e) {
      console.warn('GPU detection failed:', e);
    }
    
    // Detect monitor refresh rate
    if (window.screen && window.screen.refreshRate) {
      profile.refreshRate = window.screen.refreshRate;
    } else {
      // Estimate via requestAnimationFrame timing
      let lastTime = performance.now();
      let frameCount = 0;
      const measureRefreshRate = () => {
        const now = performance.now();
        const delta = now - lastTime;
        if (delta > 0) {
          const fps = 1000 / delta;
          frameCount++;
          
          if (frameCount > 10) {
            if (fps > 110) profile.refreshRate = 120;
            else if (fps > 200) profile.refreshRate = 240;
            else if (fps > 50) profile.refreshRate = 60;
            else profile.refreshRate = 30;
          } else {
            lastTime = now;
            requestAnimationFrame(measureRefreshRate);
          }
        }
      };
      requestAnimationFrame(measureRefreshRate);
    }
    
    // Set target FPS based on refresh rate
    if (profile.refreshRate >= 240) profile.targetFPS = 240;
    else if (profile.refreshRate >= 120) profile.targetFPS = 120;
    else if (profile.refreshRate >= 60) profile.targetFPS = 60;
    else profile.targetFPS = 30;
    
    // Determine device tier and recommended resolution
    const gpuScore = profile.gpuMemoryGB;
    const cpuScore = profile.cpuCores / 4; // Normalize to 4 cores = 1.0
    const refreshScore = profile.refreshRate / 60; // Normalize to 60Hz = 1.0
    const totalScore = (gpuScore * 0.6) + (cpuScore * 0.2) + (refreshScore * 0.2);
    
    if (totalScore >= 8) {
      // High-end: RTX 3080+, 8+ cores, 120Hz+
      profile.deviceTier = 'Ultra';
      profile.recommendedTierIndex = 5; // 1024x1024 (1M particles)
    } else if (totalScore >= 5) {
      // High: RTX 3060+, 6+ cores, 60Hz+
      profile.deviceTier = 'High';
      profile.recommendedTierIndex = 4; // 768x768 (589k particles)
    } else if (totalScore >= 3) {
      // Medium: GTX 1660+, 4+ cores, 60Hz
      profile.deviceTier = 'Medium';
      profile.recommendedTierIndex = 3; // 600x600 (360k particles)
    } else if (totalScore >= 1.5) {
      // Low: Integrated GPU, 2-4 cores
      profile.deviceTier = 'Low';
      profile.recommendedTierIndex = 2; // 512x512 (262k particles)
    } else {
      // Very Low: Old hardware
      profile.deviceTier = 'Very Low';
      profile.recommendedTierIndex = 1; // 256x256 (65k particles)
    }
    
    return profile;
  }
  
  getCurrentResolution() {
    return this.tiers[this.currentTierIndex];
  }
  
  getHardwareProfile() {
    return this.hardwareProfile;
  }
  
  update() {
    const now = performance.now();
    const delta = now - this.lastFrameTime;
    const fps = 1000 / delta;
    this.lastFrameTime = now;
    
    this.fpsHistory.push(fps);
    if (this.fpsHistory.length > this.maxHistoryLength) {
      this.fpsHistory.shift();
    }
    
    // Check for upgrade opportunity
    if (fps > this.TARGET_FPS_HIGH) {
      this.stableHighFPSCount++;
      this.stableLowFPSCount = 0;
      
      if (this.stableHighFPSCount >= this.UPGRADE_THRESHOLD && this.currentTierIndex < this.tiers.length - 1) {
        this.currentTierIndex++;
        this.needsRegeneration = true;
        this.stableHighFPSCount = 0;
        this.isStable = false;
        console.log(`⬆️ Upgrading to ${this.getCurrentResolution()}x${this.getCurrentResolution()} (${this.getCurrentResolution() * this.getCurrentResolution()} particles)`);
      }
    }
    // Check for downgrade necessity
    else if (fps < this.TARGET_FPS_LOW) {
      this.stableLowFPSCount++;
      this.stableHighFPSCount = 0;
      
      if (this.stableLowFPSCount >= this.DOWNGRADE_THRESHOLD && this.currentTierIndex > 0) {
        this.currentTierIndex--;
        this.needsRegeneration = true;
        this.stableLowFPSCount = 0;
        this.isStable = false;
        console.log(`⬇️ Downgrading to ${this.getCurrentResolution()}x${this.getCurrentResolution()} (${this.getCurrentResolution() * this.getCurrentResolution()} particles)`);
      }
    }
    // Stable range
    else {
      this.stableHighFPSCount = 0;
      this.stableLowFPSCount = 0;
      
      // Mark as stable after 5 seconds of consistent performance
      if (this.fpsHistory.length >= 300 && !this.isStable) {
        this.isStable = true;
        this.saveGPUTier();
      }
    }
    
    return fps;
  }
  
  saveGPUTier() {
    const resolution = this.getCurrentResolution();
    localStorage.setItem('gpu_tier', resolution.toString());
    console.log(`💾 Saved optimal GPU tier: ${resolution}x${resolution}`);
  }
  
  checkAndReset() {
    if (this.needsRegeneration) {
      this.needsRegeneration = false;
      return true;
    }
    return false;
  }
}

// --- Configuration ---
// Mobile Detection: Ensure 60 FPS on all devices
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Adaptive initial resolution based on device
// Mobile: 200x200 (40k particles) for smooth 60 FPS
// Desktop: Uses ResolutionManager (starts at 512x512, adapts up to 1024x1024)
const resolutionManager = new ResolutionManager();
let WIDTH = isMobile ? 200 : resolutionManager.getCurrentResolution();
let PARTICLES = WIDTH * WIDTH;

console.log(`🎮 Device: ${isMobile ? 'Mobile' : 'Desktop'} | Initial particles: ${PARTICLES.toLocaleString()}`);

// --- State ---
let renderer, scene, camera;
let particles;
let gpuCompute;
let variablePos, variableVel;
let positionUniforms, velocityUniforms, renderUniforms;
let currentShape = 0;
let params = {
  bloomStrength: 0.15,
  bloomRadius: 0.01,
  bloomThreshold: 0.8,
  rotationSpeed: 0.05,
  audioSensitivity: 1.0,
  timeScale: 1.0,
};
let composer; // Post-processing
const mouse = new THREE.Vector2(-1000, -1000);
const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

// PHASE 5: Gravity Wells
let gravityWells = []; // Array of {position: Vector3, strength: float}
const MAX_WELLS = 5;

// ============================================================================
// FIXED TIMESTEP PHYSICS (High-Refresh Rate Support)
// ============================================================================
const FIXED_TIMESTEP = 1000 / 60; // 60 physics updates per second
let physicsAccumulator = 0;
let lastPhysicsTime = performance.now();

// ============================================================================
// VISITOR COUNTER
// ============================================================================
async function initVisitorCounter() {
  try {
    // Use localStorage for a simple local visitor counter
    let visits = parseInt(localStorage.getItem('particle_visits') || '0');
    visits++;
    localStorage.setItem('particle_visits', visits.toString());
    
    // Display local visit count
    const counterElement = document.getElementById('visitor-count');
    if (counterElement) {
      counterElement.textContent = visits.toLocaleString();
      console.log(`👁️ Your visits: ${visits}`);
    }
  } catch (error) {
    console.warn('Visitor counter failed:', error);
    const counterElement = document.getElementById('visitor-count');
    if (counterElement) {
      counterElement.textContent = '∞';
    }
  }
}

// --- Initialization ---

async function init() {
  // Initialize visitor counter (non-blocking)
  initVisitorCounter();
  
  const container = document.body;
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    stencil: false,
    depth: false,
  });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2; // Boost brightness for contrast
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000); // Pure black

  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    1,
    3000
  );
  camera.position.z = 400;

  // --- Post Processing (Bloom) ---
  const renderScene = new RenderPass(scene, camera);

  // Bloom - High Contrast Configuration
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,
    0.4,
    0.85
  );
  bloomPass.strength = 0.2; // Slightly higher strength for "pop"
  bloomPass.radius = 0.002; // Very low radius to prevent "milky" background
  bloomPass.threshold = 0.85; // Only brightest particles glow, keeping background black

  composer = new EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);

  // --- GPGPU Setup ---
  gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);

  const dtPosition = gpuCompute.createTexture();
  const dtVelocity = gpuCompute.createTexture();
  await fillTextures(dtPosition, dtVelocity); // Async chunked loading

  variablePos = gpuCompute.addVariable(
    "texturePosition",
    positionFragmentShader,
    dtPosition
  );
  variableVel = gpuCompute.addVariable(
    "textureVelocity",
    velocityFragmentShader,
    dtVelocity
  );

  gpuCompute.setVariableDependencies(variablePos, [variablePos, variableVel]);
  gpuCompute.setVariableDependencies(variableVel, [variablePos, variableVel]);

  positionUniforms = variablePos.material.uniforms;
  velocityUniforms = variableVel.material.uniforms;

  velocityUniforms.time = { value: 0.0 };
  velocityUniforms.shape = { value: 0 };
  velocityUniforms.uMouse = { value: new THREE.Vector3(0, 0, 0) };
  velocityUniforms.uMouseActive = { value: 0.0 };
  velocityUniforms.uClick = { value: 0.0 }; // Black Hole Trigger
  velocityUniforms.uClick = { value: 0.0 }; // Black Hole Trigger
  velocityUniforms.textTexture = { value: new THREE.Texture() };
  velocityUniforms.uSound = { value: 0.0 }; // Audio Reactivity
  velocityUniforms.uBass = { value: 0.0 };
  velocityUniforms.uMid = { value: 0.0 };
  velocityUniforms.uHigh = { value: 0.0 };
  velocityUniforms.uMouseVel = { value: new THREE.Vector2(0, 0) };
  velocityUniforms.uBlow = { value: 0.0 };

  // PHASE 5: Gravity Wells (up to 5 wells)
  velocityUniforms.uWellCount = { value: 0 };
  velocityUniforms.uWells = { value: new Float32Array(MAX_WELLS * 4) }; // xyz position + strength

  const error = gpuCompute.init();
  if (error !== null) {
    console.error(error);
    document.getElementById(
      "ui"
    ).innerHTML = `<h1 style="color:red">Error: ${error}</h1>`;
  }

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLES * 3);

  let p = 0;
  for (let i = 0; i < WIDTH; i++) {
    for (let j = 0; j < WIDTH; j++) {
      positions[p++] = i / (WIDTH - 1);
      positions[p++] = j / (WIDTH - 1);
      positions[p++] = 0;
    }
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      texturePosition: { value: null },
      textureVelocity: { value: null },
      size: { value: 1.0 },
      colorTheme: { value: 0 },
      time: { value: 0.0 },
      shape: { value: 0 }, // Added shape uniform
      uSound: { value: 0.0 }, // Audio Reactivity
      uBass: { value: 0.0 },
      uMid: { value: 0.0 },
      uHigh: { value: 0.0 },
    },
    vertexShader: renderVertexShader,
    fragmentShader: renderFragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  renderUniforms = material.uniforms;

  particles = new THREE.Points(geometry, material);
  scene.add(particles);

  // Generate default text texture
  generateTextTexture("HELLO");

  window.addEventListener("resize", onWindowResize);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("touchmove", onTouchMove);
  window.addEventListener("touchstart", onTouchMove);
  window.addEventListener("touchend", () => {
    velocityUniforms.uMouseActive.value = 0.0;
  });

  // Black Hole Interaction
  window.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      // Left click
      velocityUniforms.uClick.value = 1.0;
      initAudio();
    } else if (e.button === 2) {
      // Right click - Place Gravity Well
      e.preventDefault();
      placeGravityWell(e.clientX, e.clientY);
    }
  });
  window.addEventListener("mouseup", () => {
    velocityUniforms.uClick.value = 0.0;
  });
  window.addEventListener("contextmenu", (e) => e.preventDefault()); // Disable context menu
  window.addEventListener("touchstart", () => {
    velocityUniforms.uClick.value = 1.0;
    initAudio();
  });
  window.addEventListener("touchend", () => {
    velocityUniforms.uClick.value = 0.0;
  });
  window.addEventListener("click", (e) => {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+Click or Cmd+Click for Gravity Well
      placeGravityWell(e.clientX, e.clientY);
    }
    initAudio();
  });

  // Mouse Velocity Tracking
  window.addEventListener("mousemove", (e) => {
    const now = performance.now();
    const dt = now - lastMouseTime;
    if (dt > 0) {
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      // Normalized velocity
      velocityUniforms.uMouseVel.value.set(dx / dt, dy / dt);
    }
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    lastMouseTime = now;
  });

  // Time Control
  window.addEventListener("wheel", (e) => {
    params.timeScale += e.deltaY * -0.001;
    params.timeScale = Math.max(0.1, Math.min(5.0, params.timeScale));
    if (gui)
      gui.controllers.find((c) => c.property === "timeScale").updateDisplay();
  });
  
  // Hide loading screen
  setTimeout(() => {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.style.opacity = '0';
      loadingScreen.style.transition = 'opacity 0.5s';
      setTimeout(() => loadingScreen.remove(), 500);
    }
  }, 1000);

  animate();
}

// ============================================================================
// GPGPU REGENERATION (for adaptive resolution changes)
// ============================================================================
async function regenerateGPGPU() {
  console.log(`🔄 Regenerating GPGPU at ${WIDTH}x${WIDTH}...`);
  
  // Dispose old GPGPU
  if (gpuCompute) {
    gpuCompute.dispose();
  }
  
  // Recreate GPGPU with new resolution
  gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);
  
  const dtPosition = gpuCompute.createTexture();
  const dtVelocity = gpuCompute.createTexture();
  await fillTextures(dtPosition, dtVelocity); // Async chunked loading
  
  variablePos = gpuCompute.addVariable(
    "texturePosition",
    positionFragmentShader,
    dtPosition
  );
  variableVel = gpuCompute.addVariable(
    "textureVelocity",
    velocityFragmentShader,
    dtVelocity
  );
  
  gpuCompute.setVariableDependencies(variablePos, [variablePos, variableVel]);
  gpuCompute.setVariableDependencies(variableVel, [variablePos, variableVel]);
  
  positionUniforms = variablePos.material.uniforms;
  velocityUniforms = variableVel.material.uniforms;
  
  // Restore all uniforms
  velocityUniforms.time = { value: renderUniforms.time.value };
  velocityUniforms.shape = { value: currentShape };
  velocityUniforms.uMouse = { value: new THREE.Vector3(0, 0, 0) };
  velocityUniforms.uMouseActive = { value: 0.0 };
  velocityUniforms.uClick = { value: 0.0 };
  velocityUniforms.textTexture = { value: new THREE.Texture() };
  velocityUniforms.uSound = { value: 0.0 };
  velocityUniforms.uBass = { value: 0.0 };
  velocityUniforms.uMid = { value: 0.0 };
  velocityUniforms.uHigh = { value: 0.0 };
  velocityUniforms.uMouseVel = { value: new THREE.Vector2(0, 0) };
  velocityUniforms.uBlow = { value: 0.0 };
  velocityUniforms.uWellCount = { value: gravityWells.length };
  velocityUniforms.uWells = { value: new Float32Array(MAX_WELLS * 4) };
  
  const error = gpuCompute.init();
  if (error !== null) {
    console.error('GPGPU Regeneration Error:', error);
    return;
  }
  
  // Recreate particle geometry
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(PARTICLES * 3);
  
  let p = 0;
  for (let i = 0; i < WIDTH; i++) {
    for (let j = 0; j < WIDTH; j++) {
      positions[p++] = i / (WIDTH - 1);
      positions[p++] = j / (WIDTH - 1);
      positions[p++] = 0;
    }
  }
  
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  
  // Update particle system
  particles.geometry.dispose();
  particles.geometry = geometry;
  
  // Update stats
  updateStatsDisplay();
  
  console.log(`✅ GPGPU regenerated: ${PARTICLES.toLocaleString()} particles`);
}

function updateStatsDisplay() {
  const statsDiv = document.getElementById('stats');
  if (statsDiv) {
    const profile = resolutionManager.getHardwareProfile();
    const particles = (PARTICLES / 1000).toFixed(0);
    statsDiv.textContent = `${WIDTH}x${WIDTH} (${particles}k) | Target: ${profile.targetFPS} FPS | ${profile.deviceTier} Tier`;
  }
}

let lastMouseX = 0,
  lastMouseY = 0,
  lastMouseTime = 0;

function initGUI(bloomPass) {
  gui = new GUI({ title: "Settings" });

  const folderVisuals = gui.addFolder("Visuals");
  folderVisuals
    .add(params, "bloomStrength", 0.0, 3.0)
    .onChange((v) => (bloomPass.strength = v));
  folderVisuals
    .add(params, "bloomRadius", 0.0, 1.0)
    .onChange((v) => (bloomPass.radius = v));
  folderVisuals
    .add(params, "bloomThreshold", 0.0, 1.0)
    .onChange((v) => (bloomPass.threshold = v));

  const folderSim = gui.addFolder("Simulation");
  folderSim.add(params, "rotationSpeed", 0.0, 0.5);
  folderSim.add(params, "timeScale", -2.0, 2.0).name("Time Scale");

  const folderAudio = gui.addFolder("Audio");
  folderAudio.add(params, "audioSensitivity", 0.0, 5.0);

  gui.close(); // Start closed
}

// --- Audio Analysis ---
let audioContext, analyser, dataArray;
let audioInitialized = false;

function initAudio() {
  if (audioInitialized) return;

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount);

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        audioInitialized = true;
        console.log("Audio initialized");
      })
      .catch((err) => {
        console.warn("Audio init failed (microphone denied?):", err);
        // Fallback or silent mode
      });

    audioInitialized = true; // Prevent multiple attempts even if failed
  } catch (e) {
    console.error("Audio Context Error:", e);
  }
}

async function fillTextures(texturePosition, textureVelocity) {
  const posArray = texturePosition.image.data;
  const velArray = textureVelocity.image.data;
  
  // Process 20k particles per chunk (balance between speed and responsiveness)
  const CHUNK_SIZE = 20000 * 4; // 20k particles × 4 RGBA channels
  const total = posArray.length;

  for (let k = 0; k < total; k += CHUNK_SIZE) {
    const end = Math.min(k + CHUNK_SIZE, total);

    for (let i = k; i < end; i += 4) {
      posArray[i + 0] = (Math.random() * 2 - 1) * 200;
      posArray[i + 1] = (Math.random() * 2 - 1) * 200;
      posArray[i + 2] = (Math.random() * 2 - 1) * 200;
      posArray[i + 3] = 1;

      velArray[i + 0] = 0;
      velArray[i + 1] = 0;
      velArray[i + 2] = 0;
      velArray[i + 3] = 1;
    }

    // Update loading screen progress
    const percent = Math.floor((k / total) * 100);
    const loadingText = document.querySelector('#loading-screen div:last-child');
    if (loadingText) {
      loadingText.textContent = `Generating universe... ${percent}%`;
    }

    // Yield to main thread (prevents browser freeze)
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  
  // Final update
  const loadingText = document.querySelector('#loading-screen div:last-child');
  if (loadingText) {
    loadingText.textContent = 'Finalizing...';
  }
}

// PHASE 5: Gravity Wells Functions
function placeGravityWell(x, y) {
  mouse.x = (x / window.innerWidth) * 2 - 1;
  mouse.y = -(y / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersect = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, intersect);

  if (intersect) {
    if (gravityWells.length >= MAX_WELLS) {
      gravityWells.shift(); // Remove oldest well
    }

    gravityWells.push({
      position: intersect.clone(),
      strength: 3.0,
      life: 1.0, // For visual decay
    });

    updateGravityWells();
    console.log(
      `Gravity Well placed at (${intersect.x.toFixed(1)}, ${intersect.y.toFixed(
        1
      )}, ${intersect.z.toFixed(1)})`
    );
  }
}

function updateGravityWells() {
  const wellData = velocityUniforms.uWells.value;

  for (let i = 0; i < MAX_WELLS; i++) {
    if (i < gravityWells.length) {
      const well = gravityWells[i];
      wellData[i * 4 + 0] = well.position.x;
      wellData[i * 4 + 1] = well.position.y;
      wellData[i * 4 + 2] = well.position.z;
      wellData[i * 4 + 3] = well.strength;
    } else {
      wellData[i * 4 + 0] = 0;
      wellData[i * 4 + 1] = 0;
      wellData[i * 4 + 2] = 0;
      wellData[i * 4 + 3] = 0;
    }
  }

  velocityUniforms.uWellCount.value = gravityWells.length;
}

window.clearGravityWells = function () {
  gravityWells = [];
  updateGravityWells();
  console.log("All gravity wells cleared");
};

function onMouseMove(event) {
  updateMouse(event.clientX, event.clientY);
}

function onTouchMove(event) {
  if (event.touches.length > 0) {
    updateMouse(event.touches[0].clientX, event.touches[0].clientY);
  }
}

function updateMouse(x, y) {
  mouse.x = (x / window.innerWidth) * 2 - 1;
  mouse.y = -(y / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersect = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, intersect);

  if (intersect) {
    velocityUniforms.uMouse.value.copy(intersect);
    velocityUniforms.uMouseActive.value = 1.0;
  }
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

// Global functions for UI interaction
window.setShape = function (id) {
  console.log("Setting shape to:", id);
  currentShape = id;
  velocityUniforms.shape.value = id;
  renderUniforms.shape.value = id; // Update render uniform
  
  // Save to localStorage
  localStorage.setItem('last_shape', id.toString());
  
  // Updated loop to include new shapes (0-36)
  for (let i = 0; i <= 36; i++) {
    const btn = document.getElementById(`btn-${i}`);
    if (btn) btn.classList.remove("active");
  }
  const activeBtn = document.getElementById(`btn-${id}`);
  if (activeBtn) activeBtn.classList.add("active");

  // Show/hide text input
  const textInput = document.getElementById("textInput");
  if (id === 4) {
    textInput.style.display = "block";
  } else {
    textInput.style.display = "none";
  }

  // Auto-hide controls panel after selection
  const panel = document.getElementById("controls-panel");
  const toggleBtn = document.getElementById("controls-toggle");
  if (panel && toggleBtn) {
    panel.classList.add("hidden");
    toggleBtn.classList.remove("open");
  }
};

window.toggleControls = function () {
  const panel = document.getElementById("controls-panel");
  const btn = document.getElementById("controls-toggle");
  const isHidden = panel.classList.contains("hidden");

  if (isHidden) {
    panel.classList.remove("hidden");
    btn.classList.add("open");
    btn.setAttribute('aria-expanded', 'true'); // Accessibility
  } else {
    panel.classList.add("hidden");
    btn.classList.remove("open");
    btn.setAttribute('aria-expanded', 'false'); // Accessibility
  }
};

window.updateText = function () {
  const text = document.getElementById("nameInput").value || "HELLO";
  generateTextTexture(text);
};

// Settings Functions
window.toggleSettings = function () {
  const panel = document.getElementById("settings-panel");
  const btn = document.getElementById("settings-btn");
  const isOpen = panel.style.display === "flex";
  
  panel.style.display = isOpen ? "none" : "flex";
  btn.style.transform = isOpen ? "rotate(0deg)" : "rotate(90deg)";
  btn.setAttribute('aria-expanded', !isOpen); // Accessibility
};

window.setTheme = function (themeId) {
  renderUniforms.colorTheme.value = themeId;
  
  // Save to localStorage
  localStorage.setItem('last_theme', themeId.toString());
  console.log(`🎨 Theme ${themeId} saved`);
};

// ============================================================================
// RESTORE USER PREFERENCES
// ============================================================================
function restoreUserPreferences() {
  // Restore last shape
  const lastShape = localStorage.getItem('last_shape');
  if (lastShape !== null) {
    const shapeId = parseInt(lastShape);
    if (!isNaN(shapeId)) {
      setTimeout(() => window.setShape(shapeId), 100);
      console.log(`🔄 Restored last shape: ${shapeId}`);
    }
  }
  
  // Restore last theme
  const lastTheme = localStorage.getItem('last_theme');
  if (lastTheme !== null) {
    const themeId = parseInt(lastTheme);
    if (!isNaN(themeId)) {
      setTimeout(() => window.setTheme(themeId), 100);
      console.log(`🔄 Restored last theme: ${themeId}`);
    }
  }
}

// Call on page load
window.addEventListener('DOMContentLoaded', restoreUserPreferences);

// ============================================================================
// SLIDER UPDATE FUNCTIONS
// ============================================================================
let bloomPass; // Reference to bloom pass (set during init)

window.updateBloom = function(value) {
  const val = parseFloat(value);
  params.bloomStrength = val;
  if (bloomPass) bloomPass.strength = val;
  document.getElementById('bloom-value').textContent = val.toFixed(2);
};

window.updateBloomRadius = function(value) {
  const val = parseFloat(value);
  params.bloomRadius = val;
  if (bloomPass) bloomPass.radius = val;
  document.getElementById('radius-value').textContent = val.toFixed(2);
};

window.updateBloomThreshold = function(value) {
  const val = parseFloat(value);
  params.bloomThreshold = val;
  if (bloomPass) bloomPass.threshold = val;
  document.getElementById('threshold-value').textContent = val.toFixed(2);
};

window.updateRotation = function(value) {
  const val = parseFloat(value);
  params.rotationSpeed = val;
  document.getElementById('rotation-value').textContent = val.toFixed(2);
};

window.updateTimeScale = function(value) {
  const val = parseFloat(value);
  params.timeScale = val;
  document.getElementById('time-value').textContent = val.toFixed(2);
};

window.updateAudioSensitivity = function(value) {
  const val = parseFloat(value);
  params.audioSensitivity = val;
  document.getElementById('audio-value').textContent = val.toFixed(2);
};

function generateTextTexture(text) {
  const canvas = document.createElement("canvas");
  const size = 2048;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = "white";
  ctx.font = "bold " + size / 4 + "px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.toUpperCase(), size / 2, size / 2);

  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  const validPositions = [];

  for (let y = 0; y < size; y += 4) {
    for (let x = 0; x < size; x += 4) {
      const index = (y * size + x) * 4;
      if (data[index] > 128) {
        const posX = (x / size - 0.5) * 400;
        const posY = -(y / size - 0.5) * 400;
        validPositions.push(posX, posY, 0);
      }
    }
  }

  const particlesData = new Float32Array(WIDTH * WIDTH * 4);

  if (validPositions.length > 0) {
    for (let i = 0; i < particlesData.length; i += 4) {
      const targetIndex = (i / 4) % (validPositions.length / 3);
      const ptr = targetIndex * 3;
      particlesData[i] = validPositions[ptr];
      particlesData[i + 1] = validPositions[ptr + 1];
      particlesData[i + 2] = validPositions[ptr + 2];
      particlesData[i + 3] = 1.0;
    }
  } else {
    for (let i = 0; i < particlesData.length; i++) particlesData[i] = 0;
  }

  const texture = new THREE.DataTexture(
    particlesData,
    WIDTH,
    WIDTH,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  texture.needsUpdate = true;

  velocityUniforms.textTexture.value = texture;
}

function animate() {
  requestAnimationFrame(animate);
  
  // ============================================================================
  // ADAPTIVE RESOLUTION MONITORING
  // ============================================================================
  const currentFPS = resolutionManager.update();
  
  // Check if resolution needs to change
  if (resolutionManager.checkAndReset()) {
    WIDTH = resolutionManager.getCurrentResolution();
    PARTICLES = WIDTH * WIDTH;
    regenerateGPGPU();
  }
  
  // ============================================================================
  // FIXED TIMESTEP PHYSICS (240Hz support)
  // ============================================================================
  const currentTime = performance.now();
  const frameTime = currentTime - lastPhysicsTime;
  lastPhysicsTime = currentTime;
  
  physicsAccumulator += frameTime;
  
  // Cap accumulator to prevent spiral of death
  if (physicsAccumulator > 200) {
    physicsAccumulator = 200;
  }
  
  // Process physics in fixed steps
  while (physicsAccumulator >= FIXED_TIMESTEP) {
    // Physics update with fixed dt
    const dt = FIXED_TIMESTEP / 1000; // Convert to seconds
    velocityUniforms.time.value += dt * params.timeScale;
    
    physicsAccumulator -= FIXED_TIMESTEP;
  }
  
  // Render time (can run at any framerate)
  renderUniforms.time.value += 0.01 * params.timeScale;

  // Update Audio
  if (analyser && audioInitialized) {
    analyser.getByteFrequencyData(dataArray);

    let bassSum = 0,
      midSum = 0,
      highSum = 0;
    let bassCount = 0,
      midCount = 0,
      highCount = 0;

    // Split into bands (approximate for 256 bins)
    // Bass: 0-10 (0-800Hz roughly)
    // Mid: 11-100
    // High: 101-255

    for (let i = 0; i < dataArray.length; i++) {
      const val = dataArray[i];
      if (i < 10) {
        bassSum += val;
        bassCount++;
      } else if (i < 100) {
        midSum += val;
        midCount++;
      } else {
        highSum += val;
        highCount++;
      }
    }

    const bassAvg = bassSum / bassCount;
    const midAvg = midSum / midCount;
    const highAvg = highSum / highCount;

    const sensitivity = params.audioSensitivity;

    const uBassTarget = (bassAvg / 255.0) * sensitivity;
    const uMidTarget = (midAvg / 255.0) * sensitivity;
    const uHighTarget = (highAvg / 255.0) * sensitivity;
    const uSoundTarget =
      ((bassAvg + midAvg + highAvg) / 3.0 / 255.0) * sensitivity;

    // Smooth transition
    velocityUniforms.uBass.value +=
      (uBassTarget - velocityUniforms.uBass.value) * 0.2;
    velocityUniforms.uMid.value +=
      (uMidTarget - velocityUniforms.uMid.value) * 0.2;
    velocityUniforms.uHigh.value +=
      (uHighTarget - velocityUniforms.uHigh.value) * 0.2;
    velocityUniforms.uSound.value +=
      (uSoundTarget - velocityUniforms.uSound.value) * 0.2;

    renderUniforms.uSound.value = velocityUniforms.uSound.value;
    renderUniforms.uBass.value = velocityUniforms.uBass.value;
    renderUniforms.uMid.value = velocityUniforms.uMid.value;
    renderUniforms.uHigh.value = velocityUniforms.uHigh.value;

    // Mic Blow Detection (High frequency sudden spike)
    if (uHighTarget > 0.8) {
      velocityUniforms.uBlow.value = 1.0;
    } else {
      velocityUniforms.uBlow.value *= 0.9; // Decay
    }
  }

  gpuCompute.compute();

  renderUniforms.texturePosition.value =
    gpuCompute.getCurrentRenderTarget(variablePos).texture;
  renderUniforms.textureVelocity.value =
    gpuCompute.getCurrentRenderTarget(variableVel).texture;

  // Use Composer for Bloom
  composer.render();
  
  // Update stats with FPS
  const statsDiv = document.getElementById('stats');
  if (statsDiv && Math.random() < 0.1) { // Update 10% of frames to reduce overhead
    const profile = resolutionManager.getHardwareProfile();
    const particles = (PARTICLES / 1000).toFixed(0);
    statsDiv.textContent = `${WIDTH}x${WIDTH} (${particles}k) @ ${currentFPS.toFixed(0)} FPS | ${profile.deviceTier} Tier`;
  }
}

init();
