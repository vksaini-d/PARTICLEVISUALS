# 🌌 Particle Visuals

**A high-performance, audio-reactive particle simulation web application built with Three.js and GPGPU.**

![Particle Visuals Banner](https://images.unsplash.com/photo-1534796636912-3b95b3ab5986?q=80&w=2072&auto=format&fit=crop)
_(Note: Replace the above image with a screenshot of your actual application for the best effect)_

## 🚀 About the Project

**Particle Visuals** is an immersive 3D experience that renders **360,000+ interactive particles** in real-time. Leveraging the power of **GPGPU (General-Purpose computing on Graphics Processing Units)** and **GLSL shaders**, this application simulates complex physics and behaviors to create stunning visual representations of celestial bodies, mathematical structures, and cosmic phenomena.

The application is fully **audio-reactive**, meaning the particles dance, pulse, and explode in sync with your music or microphone input.

## ✨ Key Features

- **30+ Unique Shapes**: Explore a vast library of particle formations across multiple categories:
  - **🌍 Space Objects**: Solar System, Saturn (with rings), Black Hole, Binary Stars.
  - **✨ Cosmic Phenomena**: Galaxy, Nebula, Supernova, Quasar, Wormhole, Dark Matter.
  - **🌌 Celestial Objects**: Orion Nebula, Crab Nebula, Andromeda Galaxy, Pillars of Creation.
  - **🔬 Advanced Math**: Tesseract (4D), Möbius Strip, Klein Bottle, Strange Attractors.
  - **🌳 Nature & Abstract**: DNA Helix, Banyan Tree, Fluid simulations, and more.
- **🎵 Audio Reactivity**:
  - **Bass**: Triggers expansion and pulsing effects.
  - **Mids**: Controls rotation speed and vibration.
  - **Highs**: Activates fine details and star formation sparkles.
- **🎨 Dynamic Color Themes**: Choose from cinematic color palettes like "Neon," "Deep Space (NASA)," "Tron," "Interstellar," and "Thermal."
- **⚡ High Performance**: Uses **GPGPU** technology to offload heavy physics calculations to the GPU, allowing for hundreds of thousands of particles to run smoothly in the browser.
- **🎮 Interactive Controls**:
  - **Rotate/Zoom**: Explore the 3D space with your mouse.
  - **Force Push**: Move your mouse quickly to push particles away.
  - **Gravity Well**: Right-click to create a gravitational pull.
  - **Black Hole**: Left-click to collapse particles into a singularity.

## 🛠️ Technologies Used

- **HTML5 & CSS3**: For the responsive user interface and layout.
- **JavaScript (ES6+)**: Core application logic.
- **[Three.js](https://threejs.org/)**: The industry-standard 3D library for WebGL.
- **GLSL (OpenGL Shading Language)**: Custom shaders for high-performance particle rendering and physics.
- **GPGPU**: Texture-based position and velocity simulation.

## 📦 Installation & Usage

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/yourusername/particle-visuals.git
    ```
2.  **Navigate to the Directory**:
    ```bash
    cd particle-visuals
    ```
3.  **Run a Local Server**:
    Because this project uses ES6 modules and loads textures, it requires a local server to run (opening `index.html` directly won't work due to CORS policies).
    - **VS Code**: Install the "Live Server" extension and click "Go Live".
    - **Python**:
      ```bash
      # Python 3.x
      python -m http.server
      ```
    - **Node.js**:
      ```bash
      npx serve
      ```
4.  **Open in Browser**: Visit `http://localhost:8000` (or the port provided by your server).

## 🎮 Controls

| Action            | Input               | Effect                                       |
| :---------------- | :------------------ | :------------------------------------------- |
| **Rotate Camera** | Left Click + Drag   | Orbit around the center                      |
| **Zoom**          | Scroll Wheel        | Move closer or further                       |
| **Force Push**    | Fast Mouse Movement | Disperse particles with cursor momentum      |
| **Black Hole**    | Left Click (Hold)   | Collapse particles to cursor                 |
| **Gravity Well**  | Right Click (Hold)  | Attract particles to cursor                  |
| **Time Warp**     | Scroll (Fast)       | Speed up or slow down simulation time        |
| **Audio Mode**    | Microphone Icon     | Enable microphone input for audio reactivity |

## 🤝 Contributing

Contributions are welcome! If you have ideas for new shapes, physics behaviors, or optimizations:

1.  Fork the project.
2.  Create your feature branch (`git checkout -b feature/AmazingShape`).
3.  Commit your changes (`git commit -m 'Add AmazingShape'`).
4.  Push to the branch (`git push origin feature/AmazingShape`).
5.  Open a Pull Request.

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
