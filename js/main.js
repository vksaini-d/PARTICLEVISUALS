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

// Global Error Handler
window.onerror = function(message, source, lineno, colno, error) {
  console.error("Global Error Caught:", message, error);
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) loadingScreen.style.display = 'none';
};

// --- CONFIGURATION ---
// 1. MASSIVE CEILING: 4096 x 4096 = 16.7 Million particles capacity.
const MAX_WIDTH = 4096; 
const MAX_PARTICLES = MAX_WIDTH * MAX_WIDTH;

// 2. REASONABLE START: Start with just 100k to ensure instant load on i3-5005U
let currentActiveCount = 100000; 

// Track how much of the texture we actually need to process
let effectiveSimulationHeight = Math.ceil(currentActiveCount / MAX_WIDTH);

// --- PARTICLE CONTROLLER ---
window.setParticleCount = function(count) {
    count = parseInt(count);
    
    // Allow going up to the massive limit
    if (count > MAX_PARTICLES) count = MAX_PARTICLES;
    if (count < 64) count = 64;

    currentActiveCount = count;
    
    // OPTIMIZATION: Calculate how many rows of pixels we actually need to update
    effectiveSimulationHeight = Math.ceil(currentActiveCount / MAX_WIDTH);
    
    // 1. Tell the Renderer to draw fewer points
    if (particles && particles.geometry) {
        particles.geometry.setDrawRange(0, currentActiveCount);
    }
    
    console.log(`⚡ Updated: ${count.toLocaleString()} particles (Processing ${effectiveSimulationHeight}/${MAX_WIDTH} rows)`);
    
    
    // Update display text
    if (window.updateParticleCountDisplay) {
        window.updateParticleCountDisplay(count);
    } else {
        const statsDiv = document.getElementById('particle-value-display');
        if (statsDiv) statsDiv.textContent = (count / 1000).toFixed(0) + 'k';
    }
};

window.updateParticleCountDisplay = function(count) {
    const kVal = (count / 1000).toFixed(0) + 'k';
    
    // 1. Settings Panel Display
    const display1 = document.getElementById('particle-value-display');
    if(display1) display1.textContent = kVal;
    
    // 2. Shapes Panel Header Display
    const display2 = document.getElementById('particle-header-display');
    if(display2) display2.textContent = kVal + ' Particles';
};

// --- State ---
let renderer, scene, camera;
let particles;
let gpuCompute;
let variablePos, variableVel;
let positionUniforms, velocityUniforms, renderUniforms;
let currentShape = 0;
let bloomPass, composer;
let lastMouseX = 0, lastMouseY = 0, lastMouseTime = 0;

let params = {
  bloomStrength: 0.15,
  bloomRadius: 0.005,
  bloomThreshold: 0.8,
  rotationSpeed: 0.05,
  audioSensitivity: 1.0,
  timeScale: 1.0,
};

// Physics Timer
const FIXED_TIMESTEP = 1000 / 60;
let physicsAccumulator = 0;
let lastPhysicsTime = performance.now();

// Audio
let audioContext, analyser, dataArray, audioInitialized = false;

async function init() {
  const container = document.body;

  // 1. Renderer Setup
  renderer = new THREE.WebGLRenderer({
    antialias: false,
    powerPreference: "high-performance",
    stencil: false, // We don't need stencil, but we WILL use scissor
    depth: false,
    alpha: false
  });
  
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 5000);
  camera.position.z = 600;

  // 2. Post Processing
  const renderScene = new RenderPass(scene, camera);
  bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth/2, window.innerHeight/2), 1.5, 0.4, 0.85);
  bloomPass.strength = params.bloomStrength;
  bloomPass.radius = params.bloomRadius;
  bloomPass.threshold = params.bloomThreshold;

  composer = new EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);

  // 3. GPGPU Setup (ALLOCATE ONCE)
  gpuCompute = new GPUComputationRenderer(MAX_WIDTH, MAX_WIDTH, renderer);

  const dtPosition = gpuCompute.createTexture();
  const dtVelocity = gpuCompute.createTexture();
  
  // Instant Fill (Zeros)
  fillTextures(dtPosition, dtVelocity);

  variablePos = gpuCompute.addVariable("texturePosition", positionFragmentShader, dtPosition);
  variableVel = gpuCompute.addVariable("textureVelocity", velocityFragmentShader, dtVelocity);

  gpuCompute.setVariableDependencies(variablePos, [variablePos, variableVel]);
  gpuCompute.setVariableDependencies(variableVel, [variablePos, variableVel]);

  positionUniforms = variablePos.material.uniforms;
  velocityUniforms = variableVel.material.uniforms;

  // Initialize Uniforms
  velocityUniforms.time = { value: 0.0 };
  velocityUniforms.shape = { value: 0 };
  velocityUniforms.uReset = { value: 1.0 }; 
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
  velocityUniforms.uWellCount = { value: 0 };
  velocityUniforms.uWells = { value: new Float32Array(20) };

  const error = gpuCompute.init();
  if (error !== null) {
      console.error(error);
      alert("GPU Init Error: " + error);
      return;
  }

  // 4. Particle System Setup
  const geometry = new THREE.BufferGeometry();
  
  // Allocate buffer for 16M particles (Fast in JS)
  const positions = new Float32Array(MAX_PARTICLES * 3);
  
  // Optimized UV Generation
  let p = 0;
  for (let i = 0; i < MAX_WIDTH; i++) {
    for (let j = 0; j < MAX_WIDTH; j++) {
      positions[p++] = i / (MAX_WIDTH - 1);
      positions[p++] = j / (MAX_WIDTH - 1);
      positions[p++] = 0;
    }
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  
  // **CRITICAL**: Only draw the active particles
  geometry.setDrawRange(0, currentActiveCount);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      texturePosition: { value: null },
      textureVelocity: { value: null },
      size: { value: 0.6 }, 
      colorTheme: { value: 0 },
      time: { value: 0.0 },
      shape: { value: 0 },
      uSound: { value: 0.0 },
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
  particles.frustumCulled = false; 
  scene.add(particles);

  // 5. Cleanup Loading Screen immediately
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
      loadingScreen.style.opacity = '0';
      setTimeout(() => loadingScreen.remove(), 500);
  }

  // 6. Interaction & Settings
  const savedShape = localStorage.getItem('last_shape');
  if(savedShape) window.setShape(parseInt(savedShape));
  
  window.addEventListener("resize", onWindowResize);
  setupInteraction();
  
  // Initialize calculation for Scissor optimization
  effectiveSimulationHeight = Math.ceil(currentActiveCount / MAX_WIDTH);

  // Sync UI with actual initial values
  if(document.getElementById('pixel-ratio')) {
      const pr = renderer.getPixelRatio();
      document.getElementById('pixel-ratio').value = pr;
      document.getElementById('pixel-ratio-value').textContent = pr.toFixed(3);
  }
  if(document.getElementById('dot-size')) {
     const ds = renderUniforms.size.value;
     document.getElementById('dot-size').value = ds;
     document.getElementById('dot-size-value').textContent = ds.toFixed(3);
  }
  // Sync others if needed, but defaults roughly match
  
  animate();
}

function fillTextures(texturePosition, textureVelocity) {
  const posArray = texturePosition.image.data;
  const velArray = textureVelocity.image.data;
  // Initialize with zeros (Instant)
  posArray.fill(0);
  velArray.fill(0);
  // Set 'w' component (life/mass) to 1.0
  for (let i = 3; i < posArray.length; i += 4) {
      posArray[i] = 1; 
      velArray[i] = 1;
  }
}

function animate() {
  requestAnimationFrame(animate);

  const currentTime = performance.now();
  const frameTime = currentTime - lastPhysicsTime;
  lastPhysicsTime = currentTime;
  physicsAccumulator += frameTime;
  if (physicsAccumulator > 200) physicsAccumulator = 200;

  while (physicsAccumulator >= FIXED_TIMESTEP) {
    const dt = FIXED_TIMESTEP / 1000;
    velocityUniforms.time.value += dt * params.timeScale;
    physicsAccumulator -= FIXED_TIMESTEP;
  }
  
  renderUniforms.time.value += 0.01 * params.timeScale;
  updateAudio();

  if (velocityUniforms.uReset.value > 0) velocityUniforms.uReset.value = 0;

  // =================================================================
  // SCISSOR OPTIMIZATION (The Secret Sauce)
  // =================================================================
  // Instead of updating the entire 4096x4096 texture, we only update
  // the rows that actually contain active particles.
  
  // 1. Enable Scissor Test
  renderer.setScissorTest(true);
  
  // 2. Set the Scissor Window (0, 0, Width, NeededHeight)
  renderer.setScissor(0, 0, MAX_WIDTH, effectiveSimulationHeight);
  
  // 3. Compute Physics (Only for the active area)
  gpuCompute.compute();
  
  // 4. Disable Scissor for standard rendering
  renderer.setScissorTest(false);
  // =================================================================

  renderUniforms.texturePosition.value = gpuCompute.getCurrentRenderTarget(variablePos).texture;
  renderUniforms.textureVelocity.value = gpuCompute.getCurrentRenderTarget(variableVel).texture;

  composer.render();
}

// --- HELPERS ---

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

function setupInteraction() {
    window.addEventListener("mousemove", (e) => {
        const now = performance.now();
        if (now - lastMouseTime > 16) {
            const dt = now - lastMouseTime;
            const dx = e.clientX - lastMouseX;
            const dy = e.clientY - lastMouseY;
            velocityUniforms.uMouseVel.value.set(dx / dt, dy / dt);
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            lastMouseTime = now;
            const x = (e.clientX / window.innerWidth - 0.5) * 800;
            const y = -(e.clientY / window.innerHeight - 0.5) * 600;
            velocityUniforms.uMouse.value.set(x, y, 0);
            velocityUniforms.uMouseActive.value = 1.0;
        }
    });
    
    window.addEventListener("mousedown", () => {
        velocityUniforms.uClick.value = 1.0;
        initAudio();
    });
    window.addEventListener("mouseup", () => {
        velocityUniforms.uClick.value = 0.0;
    });
}

function updateAudio() {
    if (analyser && audioInitialized) {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i=0; i<50; i++) sum += dataArray[i];
        let avg = sum / 50;
        let sens = params.audioSensitivity;
        let target = (avg / 255.0) * sens;
        velocityUniforms.uSound.value += (target - velocityUniforms.uSound.value) * 0.2;
        velocityUniforms.uBass.value = velocityUniforms.uSound.value; 
        velocityUniforms.uMid.value = velocityUniforms.uSound.value * 0.8;
        velocityUniforms.uHigh.value = velocityUniforms.uSound.value * 0.6;
        renderUniforms.uSound.value = velocityUniforms.uSound.value;
        renderUniforms.uBass.value = velocityUniforms.uBass.value;
        renderUniforms.uMid.value = velocityUniforms.uMid.value;
        renderUniforms.uHigh.value = velocityUniforms.uHigh.value;
    }
}

function initAudio() {
  if (audioInitialized) return;
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        audioInitialized = true;
    }).catch(e => console.log("Audio denied"));
  } catch (e) {}
}

window.setShape = function(id) {
    currentShape = id;
    if(velocityUniforms) velocityUniforms.shape.value = id;
    if(renderUniforms) renderUniforms.shape.value = id;
    localStorage.setItem('last_shape', id);
    document.querySelectorAll('.category-buttons button').forEach(b => b.classList.remove('active'));
    let btn = document.getElementById(`btn-${id}`);
    if(btn) btn.classList.add('active');
    
    // Always hide controls after selection for immersive view
    document.getElementById("controls-panel").classList.add("hidden");
    document.getElementById("controls-toggle").classList.remove("open");
};

window.toggleControls = function() {
    const p = document.getElementById("controls-panel");
    const b = document.getElementById("controls-toggle");
    p.classList.toggle("hidden");
    b.classList.toggle("open");
};

window.toggleSettings = function() {
    const p = document.getElementById("settings-panel");
    p.style.display = p.style.display === "flex" ? "none" : "flex";
};

window.setTheme = function(id) {
    if(renderUniforms) renderUniforms.colorTheme.value = id;
};

window.updateBloom = v => {
    bloomPass.strength = parseFloat(v);
    const el = document.getElementById('bloom-value');
    if(el) el.textContent = parseFloat(v).toFixed(2);
};
window.updateBloomRadius = v => {
    bloomPass.radius = parseFloat(v);
    const el = document.getElementById('radius-value');
    if(el) el.textContent = parseFloat(v).toFixed(2);
};
window.updateBloomThreshold = v => {
    bloomPass.threshold = parseFloat(v);
    const el = document.getElementById('threshold-value');
    if(el) el.textContent = parseFloat(v).toFixed(2);
};
window.updateRotation = v => {
    params.rotationSpeed = parseFloat(v);
    const el = document.getElementById('rotation-value');
    if(el) el.textContent = parseFloat(v).toFixed(2);
};
window.updateTimeScale = v => {
    params.timeScale = parseFloat(v);
    const el = document.getElementById('time-value');
    if(el) el.textContent = parseFloat(v).toFixed(2);
};
window.updateAudioSensitivity = v => {
    params.audioSensitivity = parseFloat(v);
    const el = document.getElementById('audio-value');
    if(el) el.textContent = parseFloat(v).toFixed(2);
};

// New Sliders
window.updatePixelRatio = v => {
    const r = parseFloat(v);
    if(renderer) renderer.setPixelRatio(r);
    const el = document.getElementById('pixel-ratio-value');
    if(el) el.textContent = r.toFixed(3);
};

window.updateDotSize = v => {
    const s = parseFloat(v);
    if(renderUniforms) renderUniforms.size.value = s;
    const el = document.getElementById('dot-size-value');
    if(el) el.textContent = s.toFixed(3);
};

init();