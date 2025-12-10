# 🌌 Particle Visuals

**High-performance, audio-reactive particle simulation using Three.js and GPGPU.**

<img src="https://github.com/user-attachments/assets/b63e1c60-b430-44b9-a0ea-4552b32283a9" alt="banner image" style="width: 100%; height: auto; border-radius: 15px;" />

## 🚀 The Gist

This is a WebGL experiment that renders a lot of particles.  
  
Specifically, it uses **GPGPU** (General-Purpose computing on Graphics Processing Units) to offload physics calculations to usage textures, allowing us to simulate **16 million particles** in real-time without melting your CPU. It's built with **Three.js** and raw **GLSL shaders**.

It listens to your microphone (if you let it) and makes things explode in sync with the beat. It also has a bunch of knobs you can turn to break the simulation or make it look cool.

## ✨ Features

### ⚡ Visuals & Physics
It’s not just random noise. We modeled actual math and physics here:
- **35+ Shapes**: Everything from a **Solar System** to a **Tesseract (4D)**.
- **Cinematic Themes**: Color palettes inspired by movies like *Tron*, *Dune*, and *Blade Runner*.
- **Post-Processing**: **Unreal Bloom** implementation because everything looks better with glow.

### 🚀 Adaptive Performance
Browser-based 3D is tricky. To keep this running smoothly on everything from a potato laptop to a gaming rig, I added some serious optimization levers:
- **Scissor Testing**: We only compute physics for the particles currently visible.
- **Variable Count**: You can simulate **64** particles or **4,000,000+**. It’s your call. (And your risk).
- **Pixel Ratio Control**: If your framerate drops, lower the resolution. 
- **Dot Size**: Customize the aesthetic or improve visibility.

### 🎵 Audio Reactivity
The simulation analyzes audio frequencies in real-time:
- **Bass**: Expands the universe.
- **Mids**: Rotates it.
- **Highs**: Adds sparkle.

## 🛠️ Tech Stack

- **JavaScript (ES6+)**: No framework bloat, just logic.
- **[Three.js](https://threejs.org/)**: WebGL rendering engine.
- **GLSL**: The heavy lifting happens here (Vertex & Fragment shaders).
- **GPGPU**: Texture-swapping technique for position/velocity updates.

## 📦 Installation & Usage

To be completely honest, you probably don't need to install this locally.

This is a WebGL application that I've already optimized and hosted. Running it locally requires spinning up a server to handle texture loading and CORS policies—which is a bit of a hassle if you just want to see the visuals.

For the smoothest experience (and to save you some time), I highly recommend using the live version:

👉 [**Launch Simulation**](https://particlevisuals.vercel.app/)

**For Developers:**
If you *do* want to dig into the code or modify the shaders, you're welcome to clone it. Just remember you'll need a local server (like standard standard `http.server`, `npx serve`, or VS Code's Live Server) to run it properly. I assume if you're cloning a repo like this, you know the drill. Happy coding.

## 🎮 Controls

### Mouse & Keyboard
| Action            | Input               | Effect                                       |
| :---------------- | :------------------ | :------------------------------------------- |
| **Rotate Camera** | Left Click + Drag   | Orbit around the center                      |
| **Zoom**          | Scroll Wheel        | Move closer or further                       |
| **Force Push**    | Fast Mouse Movement | Disperse particles with cursor momentum      |
| **Black Hole**    | Left Click (Hold)   | Collapse particles to cursor                 |
| **Gravity Well**  | Right Click (Hold)  | Attract particles to cursor                  |
| **Time Warp**     | Scroll (Fast)       | Speed up or slow down simulation time        |

### UI Settings (Gear Icon)
- **Performance**: Adjust Particle Count and Pixel Ratio.
- **Visuals**: Tune Bloom, Dot Size, and Color Themes.
- **Simulation**: Control Rotation Speed and Time Scale.
- **Audio**: Toggle Mic and adjust Sensitivity.

## 🤝 Contributing

Valid improvements are always welcome.

If you have a math formula for a cool shape or a shader optimization that saves 2ms, feel free to open a PR.

1.  Fork it.
2.  Branch it (`git checkout -b feature/CoolShape`).
3.  Commit it (`git commit -m 'Added CoolShape'`).
4.  Push it.
5.  PR it.

## 📄 License

Open source under the [MIT License](LICENSE). Do whatever you want with it, just give credit.
