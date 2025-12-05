import * as THREE from "three";
import { GPUComputationRenderer } from "./GPUComputationRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { GUI } from "lil-gui";
import {
  velocityFragmentShader,
  positionFragmentShader,
  renderVertexShader,
  renderFragmentShader,
} from "./shaders.js";

// --- Configuration ---
const WIDTH = 600; // Optimized for i3/2GB GPU (~360k particles)
const PARTICLES = WIDTH * WIDTH;

// --- State ---
let renderer, scene, camera;
let particles;
let gpuCompute;
let variablePos, variableVel;
let positionUniforms, velocityUniforms, renderUniforms;
let currentShape = 0;
let gui;
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

// --- Initialization ---

function init() {
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
  const bloomPass = new UnrealBloomPass(
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

  // --- GUI Setup ---
  initGUI(bloomPass);

  // --- GPGPU Setup ---
  gpuCompute = new GPUComputationRenderer(WIDTH, WIDTH, renderer);

  const dtPosition = gpuCompute.createTexture();
  const dtVelocity = gpuCompute.createTexture();
  fillTextures(dtPosition, dtVelocity);

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

  animate();
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

function fillTextures(texturePosition, textureVelocity) {
  const posArray = texturePosition.image.data;
  const velArray = textureVelocity.image.data;

  for (let k = 0, kl = posArray.length; k < kl; k += 4) {
    posArray[k + 0] = (Math.random() * 2 - 1) * 200;
    posArray[k + 1] = (Math.random() * 2 - 1) * 200;
    posArray[k + 2] = (Math.random() * 2 - 1) * 200;
    posArray[k + 3] = 1;

    velArray[k + 0] = 0;
    velArray[k + 1] = 0;
    velArray[k + 2] = 0;
    velArray[k + 3] = 1;
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

  if (panel.classList.contains("hidden")) {
    panel.classList.remove("hidden");
    btn.classList.add("open");
  } else {
    panel.classList.add("hidden");
    btn.classList.remove("open");
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
  if (panel.style.display === "flex") {
    panel.style.display = "none";
    btn.style.transform = "rotate(0deg)";
  } else {
    panel.style.display = "flex";
    btn.style.transform = "rotate(90deg)";
  }
};

window.setTheme = function (themeId) {
  renderUniforms.colorTheme.value = themeId;
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

  velocityUniforms.time.value += 0.01 * params.timeScale;
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
}

init();
