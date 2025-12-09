export const velocityFragmentShader = `
    uniform float time;
    uniform int shape;
    uniform float uReset; // 1.0 = generate from hash, 0.0 = physics
    uniform vec3 uMouse;
    uniform float uMouseActive;
    uniform float uClick; // 0.0 = none, 1.0 = attract (black hole)
    uniform sampler2D textTexture; 
    uniform float uSound; // Audio Reactivity 
    uniform float uBass;
    uniform float uMid;
    uniform float uHigh;
    uniform vec2 uMouseVel;
    uniform float uBlow; 
    
    // PHASE 5: Gravity Wells
    uniform int uWellCount;
    uniform float uWells[20]; // 5 wells * 4 floats (xyz position + strength) 
    
    // Simplex Noise 3D 
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v) { 
        const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy) );
        vec3 x0 = v - i + dot(i, C.xxx) ;
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i); 
        vec4 p = permute( permute( permute( 
                 i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
               + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
        float n_ = 0.142857142857;
        vec3  ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
    }

    vec3 snoiseVec3( vec3 x ){
      float s  = snoise(vec3( x ));
      float s1 = snoise(vec3( x.y - 19.1 , x.z + 33.4 , x.x + 47.2 ));
      float s2 = snoise(vec3( x.z + 74.2 , x.x - 124.5 , x.y + 99.4 ));
      return vec3( s , s1 , s2 );
    }

    vec3 curlNoise( vec3 p ){
      const float e = .1;
      vec3 dx = vec3( e   , 0.0 , 0.0 );
      vec3 dy = vec3( 0.0 , e   , 0.0 );
      vec3 dz = vec3( 0.0 , 0.0 , e   );

      vec3 p_x0 = snoiseVec3( p - dx );
      vec3 p_x1 = snoiseVec3( p + dx );
      vec3 p_y0 = snoiseVec3( p - dy );
      vec3 p_y1 = snoiseVec3( p + dy );
      vec3 p_z0 = snoiseVec3( p - dz );
      vec3 p_z1 = snoiseVec3( p + dz );

      float x = p_y1.z - p_y0.z - p_z1.y + p_z0.y;
      float y = p_z1.x - p_z0.x - p_x1.z + p_x0.z;
      float z = p_x1.y - p_x0.y - p_y1.x + p_y0.x;

      const float divisor = 1.0 / ( 2.0 * e );
      return normalize( vec3( x , y , z ) * divisor );
    }

    vec3 hash3(vec2 p) {
        vec3 q = vec3( dot(p,vec2(127.1,311.7)), 
                       dot(p,vec2(269.5,183.3)), 
                       dot(p,vec2(419.2,371.9)) );
        return fract(sin(q)*43758.5453);
    }

    void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 posData = texture2D( texturePosition, uv );
        vec4 velData = texture2D( textureVelocity, uv );
        vec3 pos = posData.xyz;
        vec3 vel = velData.xyz;
        
        vec3 target = vec3(0.0);
        vec3 rnd = hash3(uv);

        if (uReset > 0.5) {
            // Instant random positions
            vec3 p = (rnd - 0.5) * 400.0;
            gl_FragColor = vec4(p, 1.0);
            return;
        }
        
        // --- SHAPE DEFINITIONS ---
        if (shape == 22) { // HUMAN FACE (SDF Approximation)
            // Simplified "Face" using spheres/ellipsoids
            float r = rnd.x;
            if (r < 0.6) { // Head
                vec3 p = normalize(rnd - 0.5) * 80.0;
                p.y *= 1.3; // Oval
                p.z *= 0.9;
                target = p;
            } else if (r < 0.8) { // Eyes
                float side = rnd.y > 0.5 ? 1.0 : -1.0;
                vec3 p = normalize(rnd - 0.5) * 15.0;
                p.x += side * 30.0;
                p.y += 10.0;
                p.z += 60.0;
                target = p;
                // Sound: Eyes blink/pulse
                target.z += uHigh * 10.0;
            } else { // Mouth
                float t = (rnd.y - 0.5) * 2.0;
                target.x = t * 20.0;
                target.y = -30.0 + sin(t * 3.14) * 10.0; // Smile
                target.z = 70.0;
                // Sound: Mouth open
                target.y -= uMid * 20.0 * (1.0 - abs(t));
            }
            target += curlNoise(pos * 0.02) * 5.0;
        }
        else if (shape == 0) { // SPHERE (Dyson Sphere Panels)
            vec3 p = rnd;
            float theta = p.x * 6.28;
            float phi = acos(2.0 * p.y - 1.0);
            float r = 100.0 + uSound * 30.0;
            
            target.x = r * sin(phi) * cos(theta);
            target.y = r * sin(phi) * sin(theta);
            target.z = r * cos(phi);
            
            // Dyson Sphere hexagonal panel grid
            float panelSize = 0.3;
            float hexU = floor(theta / panelSize);
            float hexV = floor(phi / panelSize);
            
            // Panel edges (darker lines)
            float edgeDist = min(
                abs(mod(theta, panelSize) - panelSize * 0.5),
                abs(mod(phi, panelSize) - panelSize * 0.5)
            );
            
            if (edgeDist < 0.02) {
                // Panel edges - slightly inset
                target *= 0.98;
            }
            
            // Energy lines pulsing across panels
            float energyPulse = sin(hexU + hexV + time * 2.0) * 0.5 + 0.5;
            target *= (1.0 + energyPulse * uMid * 0.1);
        }
        else if (shape == 1) { // CUBE (Borg Cube + 35° Tilt)
            vec3 p = rnd;
            target = (p - 0.5) * 200.0;
            
            // Borg-style surface panels
            float panelSize = 20.0;
            vec3 panelId = floor(target / panelSize);
            vec3 panelPos = mod(target, panelSize);
            
            // Panel edges (recessed)
            vec3 edgeDist = min(panelPos, panelSize - panelPos);
            float minEdge = min(edgeDist.x, min(edgeDist.y, edgeDist.z));
            
            if (minEdge < 1.0) {
                // Recessed panel edges
                float maxVal = max(abs(target.x), max(abs(target.y), abs(target.z)));
                if (abs(target.x) == maxVal) target.x *= 0.95;
                if (abs(target.y) == maxVal) target.y *= 0.95;
                if (abs(target.z) == maxVal) target.z *= 0.95;
            }
            
            // Rotating segments (Borg cube characteristic)
            float segmentId = mod(panelId.x + panelId.y + panelId.z, 3.0);
            if (segmentId < 1.0) {
                float rot = time * 0.3 + uBass * 0.5;
                float c = cos(rot); float s = sin(rot);
                float x = target.x * c - target.y * s;
                float y = target.x * s + target.y * c;
                target.x = x; target.y = y;
            }
            
            // Lights on panels
            float lightPulse = sin(panelId.x * 2.0 + panelId.y * 3.0 + time * 2.0) * 0.5 + 0.5;
            target *= (1.0 + lightPulse * uMid * 0.15);
            
            // 35° TILT (isometric view)
            float tilt = 0.611;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 2) { // TORUS (Stargate + 30° Tilt)
            float u = rnd.x * 6.28;
            float v = rnd.y * 6.28;
            float R = 80.0 + uSound * 30.0;
            float r = 30.0 + uSound * 10.0;
            
            target.x = (R + r * cos(v)) * cos(u);
            target.y = (R + r * cos(v)) * sin(u);
            target.z = r * sin(v);
            
            // Stargate symbols on inner ring
            float symbolCount = 39.0; // Stargate has 39 symbols
            float symbolId = floor(u / (6.28 / symbolCount));
            float symbolAngle = symbolId * (6.28 / symbolCount);
            
            // Symbol positions
            if (abs(v) < 0.5) { // On inner edge
                float symbolDist = abs(mod(u - symbolAngle, 6.28 / symbolCount));
                if (symbolDist < 0.15) {
                    // Symbol glyph (simplified)
                    target.z += sin(symbolId * 2.0 + time) * 3.0;
                }
            }
            
            // Rotating inner ring
            float innerRot = time * 0.5 + uBass * 1.0;
            float x = target.x * cos(innerRot) - target.y * sin(innerRot);
            float y = target.x * sin(innerRot) + target.y * cos(innerRot);
            target.x = x; target.y = y;
            
            // Energy field shimmer
            if (length(vec2(target.x, target.y)) < R * 0.9) {
                target.z += sin(u * 5.0 + time * 3.0) * uMid * 5.0;
            }
            
            // 30° TILT (see through center)
            float tilt = 0.524;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 3) { // FLUID (T-1000 Liquid Metal)
            vec3 p = (rnd - 0.5) * 300.0;
            
            // Liquid metal base flow
            vec3 flow = curlNoise(p * 0.02 + time * 0.1) * (50.0 + uSound * 30.0);
            target = p + flow;
            
            // Metallic tendrils (T-1000 reaching effect)
            float tendrilId = floor(rnd.x * 8.0);
            float tendrilAngle = tendrilId * 0.785;
            
            if (rnd.y < 0.3) { // 30% form tendrils
                float tendrilLength = rnd.z * 150.0;
                vec3 tendrilDir = vec3(
                    cos(tendrilAngle),
                    sin(time * 2.0 + tendrilId) * 0.5,
                    sin(tendrilAngle)
                );
                
                target = tendrilDir * tendrilLength;
                
                // Tendril thickness
                float thickness = (1.0 - rnd.z) * 15.0;
                target += (rnd - 0.5) * thickness;
                
                // Morphing animation
                target += sin(time * 3.0 + tendrilId) * uMid * 20.0;
            }
            
            // Liquid ripples
            target += sin(target * 0.1 + time * 2.0) * uHigh * 10.0;
        }
        else if (shape == 4) { // TEXT (Matrix Digital Rain)
            vec3 textPos = texture2D(textTexture, uv).xyz;
            target = textPos;
            
            // Matrix-style digital rain effect
            float columnId = floor(textPos.x / 10.0);
            float rainSpeed = 50.0 + mod(columnId * 13.7, 30.0);
            float rainOffset = mod(time * rainSpeed + columnId * 100.0, 400.0) - 200.0;
            
            // Falling characters
            target.y += rainOffset;
            
            // Glitch/scramble effect
            float glitchChance = snoise(vec3(columnId, time * 0.5, 0.0));
            if (glitchChance > 0.7) {
                target.x += sin(time * 10.0) * 5.0;
                target.z += cos(time * 15.0) * 3.0;
            }
            
            // Holographic flicker
            float flicker = sin(time * 20.0 + columnId) * 0.5 + 0.5;
            target.z += flicker * uHigh * 10.0;
            
            // Leading character (brighter/larger)
            float distFromLead = abs(textPos.y - rainOffset);
            if (distFromLead < 20.0) {
                target *= (1.0 + (1.0 - distFromLead / 20.0) * 0.3);
            }
            
            // Audio: Rain speed varies
            target.y += uBass * 20.0;
        }
        else if (shape == 5) { // TESSERACT (35° Dual-Axis Tilt, Wireframe)
            vec4 p4 = vec4(0.0);
            float edge = floor(rnd.x * 32.0); 
            float axis = floor(edge / 8.0); 
            float variant = mod(edge, 8.0); 
            
            float c1 = (mod(variant, 2.0) > 0.5) ? 1.0 : -1.0;
            float c2 = (mod(floor(variant/2.0), 2.0) > 0.5) ? 1.0 : -1.0;
            float c3 = (mod(floor(variant/4.0), 2.0) > 0.5) ? 1.0 : -1.0;
            
            float t = rnd.y * 2.0 - 1.0;
            
            if (axis == 0.0) p4 = vec4(t, c1, c2, c3);
            else if (axis == 1.0) p4 = vec4(c1, t, c2, c3);
            else if (axis == 2.0) p4 = vec4(c1, c2, t, c3);
            else p4 = vec4(c1, c2, c3, t);
            
            float cubeSize = 80.0 + uSound * 30.0;
            p4 *= cubeSize;
            
            // Wireframe emphasis - concentrate particles on edges
            if (rnd.z < 0.3) {
                // Vertices (bright points)
                p4 = normalize(p4) * cubeSize * 1.1;
            }
            
            // 4D rotation
            float theta = time * 0.5 + uBass * 0.5;
            float c = cos(theta); float s = sin(theta);
            float x = p4.x * c - p4.w * s; float w = p4.x * s + p4.w * c;
            p4.x = x; p4.w = w;
            
            float phi = time * 0.3 + uMid * 0.3;
            float cp = cos(phi); float sp = sin(phi);
            float y = p4.y * cp - p4.z * sp; float z = p4.y * sp + p4.z * cp;
            p4.y = y; p4.z = z;
            
            // 4D to 3D projection
            float dist = 200.0;
            float wFactor = 1.0 / (dist - p4.w);
            target = p4.xyz * wFactor * dist;
            
            // 35° TILT on X-axis (Interstellar style)
            float tiltX = 0.611;
            float ty = target.y * cos(tiltX) - target.z * sin(tiltX);
            float tz = target.y * sin(tiltX) + target.z * cos(tiltX);
            target.y = ty; target.z = tz;
        }
        else if (shape == 6) { // MILKY WAY GALAXY (45° Tilt, Spiral Arms)
            float r = rnd.x * 180.0; // Larger radius
            float arms = 4.0; // 4 spiral arms like Milky Way
            float armId = floor(rnd.y * arms);
            float armAngle = armId * (6.28 / arms);
            
            // Logarithmic spiral (realistic galaxy arms)
            float spiralTightness = 0.15;
            float angle = armAngle + r * spiralTightness;
            
            // Add variation within arm
            angle += (rnd.z - 0.5) * 0.3;
            
            // Height varies with distance (thicker in center)
            float height = (rnd.z - 0.5) * 8.0 * exp(-r * 0.015);
            
            target.x = r * cos(angle);
            target.z = r * sin(angle);
            target.y = height;
            
            // Audio: Arms twist and expand
            float audioTwist = uBass * 0.3;
            float audioExpand = uMid * 20.0;
            float x = target.x * (1.0 + audioExpand * 0.01);
            float z = target.z * (1.0 + audioExpand * 0.01);
            float newAngle = atan(z, x) + audioTwist;
            float newR = length(vec2(x, z));
            target.x = newR * cos(newAngle);
            target.z = newR * sin(newAngle);
            target.y += uHigh * 15.0;
            
            // 45° TILT
            float tilt = 0.785; // 45 degrees in radians
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 7) { // DNA (30° Tilt, Base Pairs)
            float t = (rnd.x - 0.5) * 10.0 * 3.14; 
            float strand = floor(rnd.y * 2.0); 
            float radius = 40.0 + uSound * 20.0; // Standardized
            float twist = 1.0;
            
            if (rnd.z < 0.85) { // Helix strands (85%)
                float angle = t * twist + strand * 3.14159;
                
                target.x = radius * cos(angle);
                target.z = radius * sin(angle);
                target.y = t * 20.0;
            } else { // Base pairs - connecting rungs (15%)
                float pairT = (rnd.x - 0.5) * 10.0 * 3.14;
                float angle1 = pairT * twist;
                float angle2 = pairT * twist + 3.14159;
                
                // Interpolate between two strands
                float mixFactor = rnd.z;
                float angleInterp = angle1 + (angle2 - angle1) * mixFactor;
                float radiusInterp = radius * (1.0 - abs(mixFactor - 0.5) * 0.3);
                
                target.x = radiusInterp * cos(angleInterp);
                target.z = radiusInterp * sin(angleInterp);
                target.y = pairT * 20.0;
            }
            
            float rot = time * 0.2;
            float x = target.x * cos(rot) - target.z * sin(rot);
            float z = target.x * sin(rot) + target.z * cos(rot);
            target.x = x; target.z = z;
            
            // 30° TILT (classic DNA presentation)
            float tilt = 0.524;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 8) { // MÖBIUS STRIP (25° Tilt, Ants Walking)
            float u = rnd.x * 6.28; // Full loop
            float v = rnd.y * 2.0 - 1.0; // Width of strip
            float radius = 80.0 + uSound * 30.0;
            
            // Möbius strip parametric equations
            float x = (radius + v * 20.0 * cos(u * 0.5)) * cos(u);
            float y = (radius + v * 20.0 * cos(u * 0.5)) * sin(u);
            float z = v * 20.0 * sin(u * 0.5);
            
            // Ants walking on surface
            if (rnd.z < 0.3) { // 30% are "ants"
                // Ant path follows the strip
                float antU = mod(u + time * 2.0, 6.28); // Walking speed
                float antV = v * 0.8; // Stay on surface
                
                // Recalculate position for ant
                x = (radius + antV * 20.0 * cos(antU * 0.5)) * cos(antU);
                y = (radius + antV * 20.0 * cos(antU * 0.5)) * sin(antU);
                z = antV * 20.0 * sin(antU * 0.5);
                
                // Ant body (small cluster)
                x += (rnd.x - 0.5) * 2.0;
                y += (rnd.y - 0.5) * 2.0;
                z += (rnd.z - 0.5) * 2.0;
            }
            
            // Edge highlighting
            if (abs(v) > 0.9) {
                // Emphasize edges
                x *= 1.02;
                y *= 1.02;
                z *= 1.02;
            }
            
            // Thickness variation
            float thickness = (1.0 - abs(v)) * 3.0;
            x += (rnd.x - 0.5) * thickness;
            y += (rnd.y - 0.5) * thickness;
            
            // Rotation
            float rot = time * 0.3 + uBass * 0.5;
            float nx = x * cos(rot) - z * sin(rot);
            float nz = x * sin(rot) + z * cos(rot);
            target = vec3(nx, y, nz);
            
            // Audio: Strip undulates
            target.y += sin(u * 3.0 + time * 2.0) * uMid * 10.0;
            
            // 25° TILT (see twist)
            float tilt = 0.436;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 9) { // SATURN RINGS ONLY (45° Tilt)
            // Only rings, no planet sphere
            float r = 100.0 + rnd.y * 80.0; // Ring radius range
            float theta = rnd.z * 6.28;
            target.x = r * cos(theta);
            target.z = r * sin(theta);
            target.y = (rnd.y - 0.5) * 2.0; // Very thin rings
            
            // Audio: Rings vibrate and expand
            target.y += sin(r * 0.1 + time * 5.0) * uBass * 8.0;
            target.x *= (1.0 + uMid * 0.15);
            target.z *= (1.0 + uMid * 0.15);
            
            // Add ring gaps (Cassini Division)
            float ringDist = length(vec2(target.x, target.z));
            if (ringDist > 130.0 && ringDist < 140.0) {
                // Gap - fewer particles
                if (rnd.x < 0.7) target.y += 1000.0; // Move out of view
            }
            
            // 45° TILT
            float tilt = 0.785;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 10) { // NEBULA (20° Tilt, Color Zones)
            vec3 p = (rnd - 0.5) * 300.0;
            float n = snoise(p * 0.02);
            
            // Create pillars and wispy regions
            if (n > 0.0) {
                target = p; 
            } else {
                target = normalize(p) * 150.0; 
            }
            
            // Add wispy tendrils
            target += curlNoise(p * 0.05 + time * 0.05) * (20.0 + uSound * 30.0);
            
            // Star formation regions (bright cores)
            float starFormation = snoise(p * 0.01 + time * 0.1);
            if (starFormation > 0.7) {
                target *= 0.7; // Concentrate toward centers
            }
            
            // Audio: Nebula expands and contracts
            target *= (1.0 + uBass * 0.2);
            target.y += uMid * 20.0;
            
            // 20° TILT (Guardians of Galaxy style depth)
            float tilt = 0.349;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 11) { // SUPERNOVA (DNA Helix Burst Threads)
            float threadId = floor(rnd.x * 12.0); // 12 burst threads
            float threadAngle = threadId * 0.523; // 360/12 degrees
            
            if (rnd.y < 0.3) {
                // Core explosion
                target = (rnd - 0.5) * 50.0;
                target += normalize(target) * sin(time * 3.0) * uBass * 40.0;
            } else {
                // DNA Helix threads bursting outward
                float t = rnd.z; // Position along thread (0 to 1)
                float distance = t * 200.0; // How far out
                
                // Double helix structure
                float helixAngle = t * 12.0 + time * 2.0; // Multiple twists
                float helixRadius = 15.0 + t * 10.0; // Expands outward
                float strand = floor(rnd.y * 2.0); // Two strands
                
                // Base direction of thread
                float baseX = distance * cos(threadAngle);
                float baseZ = distance * sin(threadAngle);
                
                // Add helix twist
                float helixX = helixRadius * cos(helixAngle + strand * 3.14159);
                float helixY = helixRadius * sin(helixAngle + strand * 3.14159);
                
                target.x = baseX + helixX * cos(threadAngle) - helixY * sin(threadAngle);
                target.z = baseZ + helixX * sin(threadAngle) + helixY * cos(threadAngle);
                target.y = helixY;
                
                // Audio: Threads pulse and expand
                target *= (1.0 + uMid * 0.3);
                target.y += sin(t * 10.0 + time * 5.0) * uHigh * 20.0;
            }
        }
        else if (shape == 12) { // QUASAR (45° Tilt, Enhanced)
            float r = rnd.x;
            if (r < 0.6) {
                // Accretion disk
                float rad = 20.0 + rnd.y * 100.0;
                float ang = rnd.z * 6.28;
                target.x = rad * cos(ang);
                target.z = rad * sin(ang);
                target.y = (rnd.x - 0.5) * 3.0; // Thin disk
                
                // Audio: Disk pulses and rotates faster
                target.x *= (1.0 + uBass * 0.25);
                target.z *= (1.0 + uBass * 0.25);
                target.y += sin(rad * 0.2 + time * 3.0) * uMid * 10.0;
            } else {
                // Polar jets
                float h = 60.0 + rnd.y * 180.0;
                float w = h * 0.08; // Narrow jet
                target.y = (rnd.z > 0.5 ? 1.0 : -1.0) * h;
                target.x = (rnd.x - 0.5) * w;
                target.z = (rnd.y - 0.5) * w;
                
                // Audio: Jets expand and pulse
                target.x *= (1.0 + uHigh * 0.6);
                target.z *= (1.0 + uHigh * 0.6);
                target.y *= (1.0 + uMid * 0.2);
            }
            
            // Rotation
            float rot = time * 2.5 + uBass * 2.0;
            float x = target.x * cos(rot) - target.z * sin(rot);
            float z = target.x * sin(rot) + target.z * cos(rot);
            target.x = x; target.z = z;
            
            // 45° TILT
            float tilt = 0.785;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 13) { // PILLARS OF CREATION (15° Tilt, Star Formation)
            float col = floor(rnd.x * 3.0); // 3 main pillars
            float h = rnd.y * 150.0 - 75.0; // Taller pillars
            float r = 15.0 + rnd.z * 15.0; // Thicker base
            float x_offset = (col - 1.0) * 50.0;
            
            target.x = x_offset + (rnd.x - 0.5) * 12.0;
            target.y = h;
            target.z = (rnd.z - 0.5) * 25.0;
            
            // Pillar taper (thinner at top)
            float taper = (h + 75.0) / 150.0;
            target.x += sin(h * 0.08) * 12.0 * taper;
            target.z += cos(h * 0.08) * 12.0 * taper;
            
            // Evaporating gas (photoevaporation)
            if (h > 50.0) {
                // Gas streaming off tops
                target.x += (rnd.x - 0.5) * 20.0 * (1.0 - taper);
                target.z += (rnd.z - 0.5) * 20.0 * (1.0 - taper);
            }
            
            // Star formation regions (bright embedded protostars)
            float starFormation = snoise(vec3(target.x * 0.1, h * 0.05, target.z * 0.1));
            if (starFormation > 0.6) {
                // Concentrate particles (forming stars)
                target *= 0.85;
                target.y += sin(time * 2.0 + col) * uHigh * 15.0; // Stars pulse
            }
            
            // Dust lanes (darker regions)
            float dustLane = snoise(vec3(target.x * 0.05, h * 0.1, time * 0.1));
            if (dustLane < -0.3) {
                target.x += (rnd.x - 0.5) * 8.0;
            }
            
            // Audio: Pillars sway
            target.x += sin(h * 0.1 + time * 2.0) * uBass * 10.0;
            target.z += cos(h * 0.1 + time * 2.0) * uMid * 8.0;
            
            // 15° TILT (majestic upward view)
            float tilt = 0.262;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 14) { // COSMIC WEB (Nodes + Filaments)
            vec3 p = (rnd - 0.5) * 400.0;
            float n = abs(snoise(p * 0.015));
            
            if (n < 0.08) { // Filaments (matter streams)
                target = p;
                // Flow along filaments
                vec3 flowDir = curlNoise(p * 0.01);
                target += flowDir * 30.0;
            } 
            else { // Nodes (galaxy clusters)
                // Concentrate at nodes
                vec3 nodePos = floor(p / 100.0) * 100.0;
                target = nodePos + (rnd - 0.5) * 40.0;
                
                // Node pulsing
                float nodePulse = sin(length(nodePos) * 0.01 + time) * 0.5 + 0.5;
                target += normalize(rnd - 0.5) * nodePulse * 20.0;
            }
            
            // Voids (empty regions) - push particles away
            float voidDist = snoise(p * 0.005);
            if (voidDist > 0.5) {
                target *= 1.3; // Push outward from voids
            }
            
            // Audio: Web vibrates
            target += curlNoise(p * 0.02 + time * 0.1) * (10.0 + uBass * 40.0);
        }
        else if (shape == 15) { // BINARY STARS (40° Tilt, Mass Transfer)
            float starSeparation = 120.0;
            float orbitRadius = starSeparation * 0.5;
            
            if (rnd.x < 0.35) { // Star 1 (35%)
                float r = 35.0 + rnd.y * 5.0;
                float theta = rnd.z * 6.28;
                float phi = acos(2.0 * rnd.y - 1.0);
                
                // Position in orbit
                float orbitAngle = time * 0.8;
                vec3 starPos;
                starPos.x = r * sin(phi) * cos(theta) + orbitRadius * cos(orbitAngle);
                starPos.y = r * sin(phi) * sin(theta);
                starPos.z = r * cos(phi) + orbitRadius * sin(orbitAngle);
                target = starPos;
                
                // Audio: Star pulses
                target *= (1.0 + uBass * 0.3);
            }
            else if (rnd.x < 0.70) { // Star 2 (35%)
                float r = 30.0 + rnd.y * 5.0;
                float theta = rnd.z * 6.28;
                float phi = acos(2.0 * rnd.y - 1.0);
                
                // Position in orbit (opposite side)
                float orbitAngle = time * 0.8 + 3.14159;
                vec3 starPos;
                starPos.x = r * sin(phi) * cos(theta) + orbitRadius * cos(orbitAngle);
                starPos.y = r * sin(phi) * sin(theta);
                starPos.z = r * cos(phi) + orbitRadius * sin(orbitAngle);
                target = starPos;
                
                // Audio: Star pulses
                target *= (1.0 + uBass * 0.3);
            }
            else { // Mass Transfer Stream (30%)
                // Stream flows from larger to smaller star
                float streamT = rnd.y; // Position along stream
                float orbitAngle = time * 0.8;
                
                // Start and end positions
                vec3 star1Pos = vec3(orbitRadius * cos(orbitAngle), 0.0, orbitRadius * sin(orbitAngle));
                vec3 star2Pos = vec3(orbitRadius * cos(orbitAngle + 3.14159), 0.0, orbitRadius * sin(orbitAngle + 3.14159));
                
                // Curved stream (parabolic arc)
                vec3 streamPos = mix(star1Pos, star2Pos, streamT);
                float arcHeight = sin(streamT * 3.14159) * 25.0;
                streamPos.y += arcHeight;
                
                // Stream thickness
                float streamWidth = 8.0 * (1.0 - abs(streamT - 0.5) * 2.0);
                streamPos.x += (rnd.z - 0.5) * streamWidth;
                streamPos.y += (rnd.x - 0.5) * streamWidth * 0.5;
                
                target = streamPos;
                
                // Audio: Stream flows faster
                target.y += uMid * 10.0;
            }
            
            // 40° TILT (Star Wars Tatooine style)
            float tilt = 0.698;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 16) { // WORMHOLE (45° Tilt, Enhanced)
            float r = 25.0 + rnd.x * 120.0;
            
            // Audio: Radius pulses dramatically
            r += uBass * 40.0;
            
            float theta = rnd.y * 6.28;
            target.x = r * cos(theta);
            target.z = r * sin(theta);
            
            // Deeper tunnel effect
            float depth = 3000.0 / (r + 15.0);
            target.y = -depth + 80.0;
            
            // Rotation speed varies with radius (faster inside)
            float rot = time * (150.0/r) + uMid * 3.0;
            float x = target.x * cos(rot) - target.z * sin(rot);
            float z = target.x * sin(rot) + target.z * cos(rot);
            target.x = x; target.z = z;
            
            // Audio: Tunnel distortion
            target.y += sin(r * 0.1 + time * 2.0) * uHigh * 30.0;
            
            // 45° TILT
            float tilt = 0.785;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 17) { // DARK MATTER (Gravitational Lensing)
            vec3 p = (rnd - 0.5) * 500.0;
            
            // Dark matter halo (invisible but affects light)
            float haloRadius = length(p);
            
            // Cosmic web structure (filamentary)
            float webNoise = snoise(p * 0.008);
            
            if (abs(webNoise) < 0.15) {
                // Filaments (where dark matter concentrates)
                target = p;
                
                // Gravitational lensing effect (light bending)
                vec3 lensCenter = vec3(0.0);
                vec3 toCenter = lensCenter - target;
                float distToCenter = length(toCenter);
                
                // Lensing strength (stronger near center)
                float lensStrength = 100.0 / (distToCenter + 20.0);
                vec3 lensOffset = normalize(toCenter) * lensStrength;
                
                // Bend light paths
                target += lensOffset * sin(time * 0.5);
                
                // Multiple lensing (Einstein rings)
                float ringDist = mod(distToCenter, 80.0);
                if (ringDist < 5.0) {
                    target += normalize(toCenter) * (5.0 - ringDist) * 3.0;
                }
            } else {
                // Voids (empty regions)
                target = normalize(p) * (300.0 + webNoise * 100.0);
            }
            
            // Gravitational distortion waves
            target += curlNoise(p * 0.01 + time * 0.05) * (30.0 + uBass * 40.0);
            
            // Audio: Dark matter vibrates
            target *= (1.0 + uMid * 0.15);
            
            // Subtle rotation (dark matter halo rotation)
            float rot = time * 0.1;
            float x = target.x * cos(rot) - target.z * sin(rot);
            float z = target.x * sin(rot) + target.z * cos(rot);
            target.x = x; target.z = z;
        }

        else if (shape == 18) { // SOLAR SYSTEM (Planets + Asteroid Belt)
            // Planet sizes (relative, more realistic)
            float size_sun = 25.0;
            float size_mercury = 3.5;
            float size_venus = 8.5;
            float size_earth = 9.0;
            float size_mars = 5.0;
            float size_jupiter = 20.0;
            float size_saturn = 17.0;
            float size_uranus = 11.0;
            float size_neptune = 10.5;
            
            // Orbit radii (more spaced)
            float orbit_mercury = 50.0;
            float orbit_venus = 75.0;
            float orbit_earth = 100.0;
            float orbit_mars = 130.0;
            float orbit_jupiter = 180.0;
            float orbit_saturn = 230.0;
            float orbit_uranus = 280.0;
            float orbit_neptune = 330.0;
            
            float p_sel = rnd.y;
            
            if (p_sel < 0.15) { // Sun (15% of particles)
                vec3 p = rnd;
                float theta = p.x * 6.28;
                float phi = acos(2.0 * p.y - 1.0);
                float r = size_sun * (0.85 + rnd.z * 0.15);
                target.x = r * sin(phi) * cos(theta);
                target.y = r * sin(phi) * sin(theta);
                target.z = r * cos(phi);
                
                // Audio: Sun pulses
                target *= (1.0 + uBass * 0.4);
            }
            else if (p_sel < 0.25) { // Asteroid Belt (10%)
                // Between Mars and Jupiter
                float beltRadius = 145.0 + rnd.x * 25.0;
                float angle = rnd.z * 6.28;
                float height = (rnd.y - 0.5) * 8.0;
                
                target.x = beltRadius * cos(angle + time * 0.3);
                target.z = beltRadius * sin(angle + time * 0.3);
                target.y = height;
                
                // Asteroid size variation
                target += (rnd - 0.5) * 2.0;
                
                // Audio: Belt vibrates
                target.y += sin(angle * 10.0 + time * 2.0) * uMid * 5.0;
            }
            else { // Planets (65%)
                // Select planet (distribute evenly)
                float band = floor((p_sel - 0.25) * 10.67); // 0 to 7
                float planetSize = 0.0;
                float orbitRadius = 0.0;
                
                if (band < 1.0) { planetSize = size_mercury; orbitRadius = orbit_mercury; }
                else if (band < 2.0) { planetSize = size_venus; orbitRadius = orbit_venus; }
                else if (band < 3.0) { planetSize = size_earth; orbitRadius = orbit_earth; }
                else if (band < 4.0) { planetSize = size_mars; orbitRadius = orbit_mars; }
                else if (band < 5.0) { planetSize = size_jupiter; orbitRadius = orbit_jupiter; }
                else if (band < 6.0) { planetSize = size_saturn; orbitRadius = orbit_saturn; }
                else if (band < 7.0) { planetSize = size_uranus; orbitRadius = orbit_uranus; }
                else { planetSize = size_neptune; orbitRadius = orbit_neptune; }
                
                // Create sphere for planet
                vec3 p = rnd;
                float theta = p.x * 6.28;
                float phi = acos(2.0 * p.z - 1.0);
                float r = planetSize * (0.9 + rnd.x * 0.1);
                
                // Planet position on sphere
                vec3 planetPos;
                planetPos.x = r * sin(phi) * cos(theta);
                planetPos.y = r * sin(phi) * sin(theta);
                planetPos.z = r * cos(phi);
                
                // Orbital motion (Kepler's laws)
                float speed = 250.0 / sqrt(orbitRadius);
                float rot = time * speed * 0.08;
                
                // Position planet in orbit
                target.x = orbitRadius * cos(rot) + planetPos.x;
                target.y = planetPos.y;
                target.z = orbitRadius * sin(rot) + planetPos.z;
                
                // Audio: Planets vibrate
                target.y += sin(time * 2.0 + band) * uMid * 3.0;
            }
            
            // System TILT
            float tilt = 0.2;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 19) { // BLACK HOLE (60° Tilt, Gravitational Lensing)
            float r = rnd.x;
            
            if (r < 0.05) { // Event Horizon (5%)
                float horizonRadius = 15.0;
                float theta = rnd.y * 6.28;
                float phi = acos(2.0 * rnd.z - 1.0);
                target.x = horizonRadius * sin(phi) * cos(theta);
                target.y = horizonRadius * sin(phi) * sin(theta);
                target.z = horizonRadius * cos(phi);
                
                // Audio: Event horizon pulses
                target *= (1.0 + uBass * 0.5);
            }
            else if (r < 0.60) { // Accretion Disk (55%)
                float diskRadius = 20.0 + rnd.y * 100.0;
                float angle = rnd.z * 6.28;
                target.x = diskRadius * cos(angle);
                target.z = diskRadius * sin(angle);
                target.y = (rnd.x - 0.5) * 3.0;
                
                // Gravitational lensing effect (light bending)
                float distFromCenter = length(vec2(target.x, target.z));
                float lensStrength = 30.0 / (distFromCenter + 5.0);
                target.y += sin(angle * 3.0) * lensStrength;
                
                // Doppler shift simulation (approaching side brighter)
                float rotationAngle = time * 3.0;
                float dopplerFactor = cos(angle - rotationAngle);
                if (dopplerFactor > 0.0) {
                    target.y += dopplerFactor * 5.0; // Blue-shifted side
                }
                
                // Audio: Disk swirls faster
                float audioRot = time * (1.0 + uMid * 2.0);
                float x = target.x * cos(audioRot) - target.z * sin(audioRot);
                float z = target.x * sin(audioRot) + target.z * cos(audioRot);
                target.x = x; target.z = z;
            }
            else { // Photon Ring (40%)
                float ringRadius = 25.0 + rnd.y * 5.0;
                float angle = rnd.z * 6.28;
                
                // Multiple orbits (light bending around black hole)
                float orbitLevel = floor(rnd.x * 3.0);
                float orbitAngle = angle + time * (5.0 - orbitLevel) + uHigh * 2.0;
                
                target.x = ringRadius * cos(orbitAngle);
                target.z = ringRadius * sin(orbitAngle);
                target.y = sin(orbitAngle * 2.0) * (3.0 + orbitLevel * 2.0);
            }
            
            // 60° TILT (Interstellar Gargantua view)
            float tilt = 1.047;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 20) { // SOLAR FLARE (Prominence Arc + 30° Tilt)
            float t = rnd.x; // Position along flare (0 to 1)
            
            // Solar prominence arc shape
            float arcHeight = sin(t * 3.14159) * 120.0; // Parabolic arc
            float arcWidth = 15.0 + t * 40.0; // Widens as it extends
            
            target.x = t * 250.0 - 125.0; // Horizontal extent
            target.y = arcHeight; // Arc upward
            target.z = (rnd.z - 0.5) * arcWidth;
            
            // Magnetic loops (twisted structure)
            float loopTwist = t * 6.28 * 2.0; // 2 full twists
            float loopRadius = arcWidth * 0.3;
            target.y += loopRadius * sin(loopTwist);
            target.z += loopRadius * cos(loopTwist);
            
            // Plasma ejection (particles streaming outward)
            if (t > 0.7) {
                // Ejected material
                target.y += (t - 0.7) * 80.0;
                target += (rnd - 0.5) * 30.0 * (t - 0.7);
            }
            
            // Turbulent flow
            target += curlNoise(pos * 0.02 - vec3(time * 0.5, 0, 0)) * (20.0 + uSound * 30.0);
            
            // Audio: Flare intensity
            target.y += sin(t * 5.0 + time * 3.0) * uBass * 25.0;
            target *= (1.0 + uMid * 0.2);
            
            // 30° TILT (see arc profile)
            float tilt = 0.524;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 21) { // GALAXY COLLISION (50° Tilt, Tidal Tails)
            float which = rnd.x > 0.5 ? 1.0 : -1.0;
            float r = rnd.y * 100.0;
            float a = rnd.z * 6.28 + r * 0.08; // Spiral arms
            
            // Base galaxy positions
            vec3 g1 = vec3(r * cos(a), (rnd.x - 0.5) * 8.0, r * sin(a));
            vec3 g2 = vec3(r * cos(a), (rnd.x - 0.5) * 8.0, r * sin(a));
            
            // Tilt second galaxy
            float tilt2 = 1.2;
            float ty = g2.y * cos(tilt2) - g2.z * sin(tilt2);
            float tz = g2.y * sin(tilt2) + g2.z * cos(tilt2);
            g2.y = ty; g2.z = tz;
            
            // Offset galaxies
            g1.x -= 70.0; 
            g2.x += 70.0;
            
            // Tidal tails (stretched arms from gravitational interaction)
            if (r > 60.0) { // Outer regions form tails
                float tailStrength = (r - 60.0) / 40.0;
                
                if (which > 0.0) {
                    // Tail from galaxy 1
                    g1.x += tailStrength * 80.0 * cos(a + 1.57);
                    g1.z += tailStrength * 80.0 * sin(a + 1.57);
                    g1.y += tailStrength * 30.0;
                } else {
                    // Tail from galaxy 2  
                    g2.x += tailStrength * 80.0 * cos(a - 1.57);
                    g2.z += tailStrength * 80.0 * sin(a - 1.57);
                    g2.y -= tailStrength * 30.0;
                }
            }
            
            // Starburst regions (bright collision zones)
            float collisionDist = length(g1 - g2);
            if (collisionDist < 50.0) {
                // Intense star formation at collision point
                vec3 collisionCenter = (g1 + g2) * 0.5;
                target = mix(which > 0.0 ? g1 : g2, collisionCenter, 0.3);
                target += (rnd - 0.5) * 20.0;
                
                // Starburst pulse
                target *= (1.0 + uHigh * 0.4);
            } else {
                target = which > 0.0 ? g1 : g2;
            }
            
            // Shock waves
            target += curlNoise(target * 0.02 + time * 0.1) * (15.0 + uMid * 35.0);
            
            // 50° TILT (dynamic collision view)
            float tilt = 0.873;
            float tty = target.y * cos(tilt) - target.z * sin(tilt);
            float ttz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = tty; target.z = ttz;
        }
        else if (shape == 22) { // HENRY CAVILL SUPERMAN FACE (Westworld Wireframe)
            // Superman-style masculine face proportions
            float faceWidth = 85.0; // Wider for masculine look
            float faceHeight = 110.0; // Taller, heroic proportions
            
            // UV coordinates for face
            float u = rnd.x;
            float v = rnd.y;
            
            // Face shape - more angular for Superman
            float theta = u * 6.28;
            float phi = (v - 0.5) * 3.14;
            
            // Ellipsoid for head (slightly squared for masculine jaw)
            float rx = faceWidth * 0.48;
            float ry = faceHeight * 0.5;
            float rz = faceWidth * 0.42; // Slightly deeper for masculine features
            
            target.x = rx * sin(phi) * cos(theta);
            target.y = ry * cos(phi);
            target.z = rz * sin(phi) * sin(theta);
            
            // HENRY CAVILL FEATURES
            
            // 1. STRONG JAWLINE (Superman's iconic jaw)
            if (v < 0.35) {
                // Square, chiseled jaw
                float jawStrength = (0.35 - v) / 0.35;
                float jawWidth = 1.0 + jawStrength * 0.3; // Wider at jaw
                target.x *= jawWidth;
                
                // Jaw protrudes forward (strong chin)
                if (v < 0.25 && abs(u - 0.5) < 0.15) {
                    target.z += 15.0 * (0.25 - v) / 0.25; // Prominent chin
                }
                
                // Jaw definition (angular edges)
                if (abs(u - 0.3) < 0.05 || abs(u - 0.7) < 0.05) {
                    target.z += 8.0 * jawStrength; // Jaw corners
                }
            }
            
            // 2. PROMINENT CHEEKBONES (High, defined)
            if (v > 0.50 && v < 0.62) {
                if ((u > 0.25 && u < 0.35) || (u > 0.65 && u < 0.75)) {
                    float cheekHeight = (v - 0.50) / 0.12;
                    target.z += 10.0 * sin(cheekHeight * 3.14159); // High cheekbones
                    target.x *= 1.05; // Wider at cheekbones
                }
            }
            
            // 3. STRONG BROW RIDGE (Superman's intense look)
            if (v > 0.63 && v < 0.70) {
                float browStrength = sin((v - 0.63) / 0.07 * 3.14159);
                target.z += 12.0 * browStrength; // Prominent brow
                
                // Brow furrow (intensity)
                if (abs(u - 0.5) < 0.08) {
                    target.z += 3.0 * browStrength;
                }
            }
            
            // 4. DEEP-SET EYES (Intense gaze)
            if (v > 0.55 && v < 0.65) {
                if ((u > 0.32 && u < 0.42) || (u > 0.58 && u < 0.68)) {
                    // Eye sockets - deeper for intensity
                    target.z -= 12.0;
                    
                    // Eye shape (almond, heroic)
                    float eyeU = (u > 0.5) ? (u - 0.58) / 0.1 : (u - 0.32) / 0.1;
                    float eyeV = (v - 0.55) / 0.1;
                    float eyeShape = sin(eyeU * 3.14159) * sin(eyeV * 3.14159);
                    target.z -= eyeShape * 5.0;
                }
            }
            
            // 5. STRAIGHT, STRONG NOSE (Classic Superman)
            if (v > 0.42 && v < 0.58) {
                if (abs(u - 0.5) < 0.08) {
                    float noseHeight = (v - 0.42) / 0.16;
                    // Straight bridge
                    target.z += 18.0 * sin(noseHeight * 3.14159);
                    
                    // Nose width (narrower at bridge)
                    float noseWidth = 1.0 - noseHeight * 0.3;
                    if (abs(u - 0.5) < 0.05 * noseWidth) {
                        target.z += 5.0;
                    }
                }
            }
            
            // 6. DEFINED LIPS (Heroic, not too full)
            if (v > 0.32 && v < 0.42) {
                if (u > 0.38 && u < 0.62) {
                    float lipV = (v - 0.32) / 0.1;
                    float lipU = (u - 0.38) / 0.24;
                    
                    // Upper lip (defined cupid's bow)
                    if (v > 0.37 && v < 0.40) {
                        float cupidsBow = abs(u - 0.5) * 2.0;
                        target.z += 3.0 * (1.0 - cupidsBow);
                    }
                    
                    // Lower lip (slightly fuller)
                    if (v > 0.32 && v < 0.37) {
                        target.z += 4.0 * sin(lipU * 3.14159);
                    }
                    
                    // Lip corners (slight smile)
                    if (abs(u - 0.38) < 0.02 || abs(u - 0.62) < 0.02) {
                        target.z += 2.0;
                    }
                }
            }
            
            // 7. HAIR LINE (Superman's iconic hair)
            if (v > 0.72) {
                // Forehead to hairline
                float hairStrength = (v - 0.72) / 0.28;
                
                // Superman's curl (right side)
                if (u > 0.55 && u < 0.65 && v > 0.75 && v < 0.82) {
                    float curlU = (u - 0.55) / 0.1;
                    float curlV = (v - 0.75) / 0.07;
                    target.z += 8.0 * sin(curlU * 3.14159) * sin(curlV * 3.14159);
                }
            }
            
            // Wireframe mesh (Westworld scanning)
            float meshDensity = 25.0; // Denser for detail
            float meshU = mod(u * meshDensity, 1.0);
            float meshV = mod(v * meshDensity, 1.0);
            
            // Emphasize mesh lines
            if (meshU < 0.08 || meshV < 0.08) {
                target *= 1.04; // Mesh lines slightly raised
            }
            
            // Scanning lines (Westworld style)
            float scanLine = mod(v * 60.0 + time * 6.0, 1.0);
            if (scanLine < 0.04) {
                // Bright scan line (blue tint for tech)
                target *= 1.15;
            }
            
            // Holographic glitches (rare)
            float glitch = snoise(vec3(u * 12.0, v * 12.0, time * 1.5));
            if (glitch > 0.85) {
                target.x += (rnd.x - 0.5) * 8.0;
                target.z += (rnd.z - 0.5) * 6.0;
            }
            
            // Audio: Face responds heroically
            target.x += sin(v * 8.0 + time * 2.0) * uMid * 4.0;
            target.y += cos(u * 8.0 + time * 1.5) * uHigh * 4.0;
            target.z += sin(time * 3.0) * uBass * 3.0; // Depth pulse
            
            // Rotation (slow, heroic reveal)
            float rot = time * 0.15 + uBass * 0.2;
            float x = target.x * cos(rot) - target.z * sin(rot);
            float z = target.x * sin(rot) + target.z * cos(rot);
            target.x = x; target.z = z;
        }
        else if (shape == 23) { // BANYAN TREE (100 Years Old, Massive)
            float part = rnd.x;
            
            if (part < 0.12) { // Massive Main Trunk (12%)
                float height = rnd.y * 180.0 - 90.0; // Taller trunk
                float radius = 25.0 * (1.0 - abs(height) / 200.0); // Thicker trunk
                radius = max(radius, 8.0); // Minimum thickness
                float angle = rnd.z * 6.28;
                target.x = radius * cos(angle);
                target.z = radius * sin(angle);
                target.y = height;
                
                // Bark texture
                target.x += sin(height * 0.3 + angle * 3.0) * 3.0;
                target.z += cos(height * 0.3 + angle * 3.0) * 3.0;
                
                // Audio: Trunk sways
                target.x += sin(time * 0.2) * uBass * 5.0;
                target.z += cos(time * 0.2) * uBass * 5.0;
            }
            else if (part < 0.20) { // Deep Roots (8%)
                float rootId = floor(rnd.y * 10.0);
                float rootAngle = rootId * 0.628;
                float depth = -rnd.z * 100.0; // Deep underground
                float spread = (100.0 + depth) * 0.8; // Spread outward as they go down
                
                target.x = spread * cos(rootAngle) + (rnd.x - 0.5) * 8.0;
                target.z = spread * sin(rootAngle) + (rnd.y - 0.5) * 8.0;
                target.y = depth;
                
                // Root thickness
                float thickness = (100.0 + depth) / 100.0 * 6.0;
                target.x += (rnd.x - 0.5) * thickness;
                target.z += (rnd.y - 0.5) * thickness;
                
                // Audio: Roots pulse
                target.y += sin(time + rootId) * uBass * 3.0;
            }
            else if (part < 0.45) { // Main Branches (25%)
                // 6-8 massive branches
                float branchId = floor(rnd.y * 7.0);
                float branchAngle = branchId * 0.897 + time * 0.03;
                float branchLength = 60.0 + rnd.z * 90.0; // Longer branches
                float branchHeight = 30.0 + rnd.y * 60.0;
                
                // Branch curves
                float t = rnd.z;
                target.x = branchLength * t * cos(branchAngle);
                target.z = branchLength * t * sin(branchAngle);
                target.y = branchHeight + t * 40.0 - t * t * 25.0;
                
                // Branch thickness (thicker at base)
                float thickness = (1.0 - t) * 8.0 + 2.0;
                target.x += (rnd.x - 0.5) * thickness;
                target.z += (rnd.y - 0.5) * thickness;
                
                // Audio: Branches sway
                target.x += sin(time * 0.4 + branchAngle) * uMid * 8.0 * t;
                target.z += cos(time * 0.4 + branchAngle) * uMid * 8.0 * t;
                target.y += sin(time * 0.6 + branchId) * uHigh * 5.0 * t;
            }
            else if (part < 0.70) { // Aerial Roots (25%) - Rope-like!
                float rootId = floor(rnd.y * 15.0); // More roots
                float rootAngle = rootId * 0.418 + rnd.z * 0.2;
                float rootDistance = 40.0 + rnd.z * 80.0; // Further from trunk
                
                // Roots hang from canopy to ground - ROPE-LIKE CURVE
                float t = rnd.x; // Position along root (0=top, 1=bottom)
                float rootLength = 180.0;
                float rootHeight = 80.0 - t * rootLength;
                
                // Catenary curve (natural hanging rope shape)
                float catenaryFactor = 0.15;
                float horizontalOffset = catenaryFactor * rootLength * (cosh(2.0 * (t - 0.5)) - 1.0);
                
                // Base position
                float baseX = rootDistance * cos(rootAngle);
                float baseZ = rootDistance * sin(rootAngle);
                
                // Apply rope curve
                target.x = baseX + horizontalOffset * cos(rootAngle + 1.57);
                target.z = baseZ + horizontalOffset * sin(rootAngle + 1.57);
                target.y = rootHeight;
                
                // Root thickness variation
                float thickness = 2.0 + (1.0 - t) * 2.0; // Thicker at top
                target.x += (rnd.y - 0.5) * thickness;
                target.z += (rnd.z - 0.5) * thickness;
                
                // Roots sway more at bottom (like rope)
                float sway = t * t; // Quadratic increase
                target.x += sin(time * 0.8 + rootId) * 5.0 * sway;
                target.z += cos(time * 1.1 + rootId) * 5.0 * sway;
                
                // Audio: Roots sway with wind
                target.x += sin(time + rootId * 0.5) * uMid * 7.0 * sway;
                target.z += cos(time * 1.2 + rootId * 0.5) * uMid * 7.0 * sway;
            }
            else { // Dense Canopy (30%)
                // Massive spreading canopy
                float canopyRadius = 120.0; // Huge canopy
                float canopyHeight = 50.0 + rnd.y * 40.0;
                float angle = rnd.z * 6.28;
                float dist = sqrt(rnd.x) * canopyRadius;
                
                target.x = dist * cos(angle);
                target.z = dist * sin(angle);
                target.y = canopyHeight + (rnd.y - 0.5) * 25.0;
                
                // Leaves flutter
                target.x += sin(time * 2.5 + rnd.x * 10.0) * 3.0;
                target.y += sin(time * 3.5 + rnd.y * 10.0) * 2.0;
                target.z += cos(time * 2.0 + rnd.z * 10.0) * 3.0;
                
                // Audio: Leaves rustle
                target.x += sin(time * 5.0 + rnd.x * 20.0) * uHigh * 5.0;
                target.y += cos(time * 4.0 + rnd.y * 20.0) * uHigh * 3.0;
            }
            
            // Audio: Whole tree sways
            target.x += sin(time * 0.25) * uBass * 10.0;
            target.z += cos(time * 0.25) * uBass * 10.0;
        }
        else if (shape == 24) { // KLEIN BOTTLE (30° Tilt, Transparency)
            float u = rnd.x * 6.28;
            float v = rnd.y * 6.28;
            float r = 4.0 + uSound * 2.0;
            
            // Figure-8 Klein Bottle immersion
            float a = 30.0;
            target.x = a * (cos(u) * (cos(u/2.0) * (sqrt(2.0) + cos(v)) + sin(u/2.0) * sin(v) * cos(v)));
            target.y = a * (sin(u) * (cos(u/2.0) * (sqrt(2.0) + cos(v)) + sin(u/2.0) * sin(v) * cos(v)));
            target.z = a * (-sin(u/2.0) * (sqrt(2.0) + cos(v)) + cos(u/2.0) * sin(v) * cos(v));
            
            // Surface flow (particles move along surface)
            float flowSpeed = time * 0.5 + uMid * 1.0;
            u += flowSpeed * 0.1;
            
            // Color gradient (inside/outside simulation)
            float insideOutside = sin(u) * cos(v);
            if (insideOutside > 0.0) {
                // "Outside" surface
                target *= 1.05;
            } else {
                // "Inside" surface (self-intersection region)
                target *= 0.95;
            }
            
            // Transparency effect (vary particle density)
            if (rnd.z < 0.3) {
                // Sparse particles for transparency
                target += (rnd - 0.5) * 5.0;
            }
            
            // Rotation
            float rot = time * 0.2 + uBass * 0.3;
            float x = target.x * cos(rot) - target.z * sin(rot);
            float z = target.x * sin(rot) + target.z * cos(rot);
            target.x = x; target.z = z;
            
            // 30° TILT (see complexity)
            float tilt = 0.524;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 25) { // ATOMIC MODEL (25° Tilt, Electron Trails)
            if (rnd.x < 0.15) { // Nucleus (15%)
                target = normalize(rnd - 0.5) * 20.0;
                
                // Nucleus glow (pulsing)
                target *= (1.0 + uBass * 0.5);
            } else { // Electrons (85%)
                float shell = floor(rnd.y * 3.0) + 1.0; // 3 electron shells
                float r = shell * 45.0;
                float theta = rnd.z * 6.28 + time * (6.0 / shell); // Faster inner shells
                
                // Electron trails (motion blur effect)
                float trailLength = 0.3;
                float trailPos = rnd.x; // Position along trail
                theta -= trailPos * trailLength;
                
                // Quantum probability clouds (uncertainty)
                float cloudRadius = 8.0 / shell; // Smaller clouds for outer shells
                vec3 cloudOffset = (rnd - 0.5) * cloudRadius;
                
                // Tilted orbital planes
                float orbitTilt = 0.0;
                if (shell == 1.0) orbitTilt = 0.0;
                else if (shell == 2.0) orbitTilt = 1.047; // 60°
                else orbitTilt = 0.698; // 40°
                
                vec3 pos = vec3(r * cos(theta), 0.0, r * sin(theta));
                
                // Apply orbital tilt
                float cy = pos.y * cos(orbitTilt) - pos.z * sin(orbitTilt);
                float cz = pos.y * sin(orbitTilt) + pos.z * cos(orbitTilt);
                pos.y = cy; pos.z = cz;
                
                target = pos + cloudOffset;
                
                // Audio: Electrons vibrate
                target += sin(time * 10.0 + shell * 3.0) * uHigh * 5.0;
            }
            
            // 25° TILT (see orbital planes)
            float tilt = 0.436;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 26) { // HOURGLASS (15° Tilt, Time Dilation)
            float t = rnd.x; // 0 to 1 (top to bottom)
            
            // Time dilation effect (slower at bottom - relativity simulation)
            float timeDilation = 1.0 + (1.0 - t) * 0.5; // Slower near bottom
            t = fract(t + time * 0.08 / timeDilation);
            
            float y = (0.5 - t) * 200.0;
            float width = 80.0 * pow(abs(y) / 100.0, 0.8);
            width = max(3.0, width); // Narrow neck
            
            float angle = rnd.y * 6.28;
            float r = rnd.z * width;
            
            target.x = r * cos(angle);
            target.z = r * sin(angle);
            target.y = y;
            
            // Particle color change (aging effect)
            float age = 1.0 - t;
            if (age > 0.8) {
                // Old particles (at bottom) - slightly dispersed
                target.x += (rnd.x - 0.5) * 3.0;
                target.z += (rnd.z - 0.5) * 3.0;
            }
            
            // Temporal distortion at neck
            if (abs(y) < 20.0) {
                float distortion = (20.0 - abs(y)) / 20.0;
                target.x += sin(time * 5.0 + angle) * distortion * 5.0;
                target.z += cos(time * 5.0 + angle) * distortion * 5.0;
            }
            
            // Audio: Shake the sand
            target.x += (rnd.x - 0.5) * uBass * 12.0;
            target.z += (rnd.z - 0.5) * uMid * 8.0;
            
            // 15° TILT (see flow)
            float tilt = 0.262;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 27) { // WAVEFORM (3D Spectrogram - Arrival Style)
            float x = (rnd.x - 0.5) * 400.0;
            
            // 3D Spectrogram layers (bass, mid, high)
            float bassWave = sin(x * 0.03 + time * 4.0) * uBass * 60.0;
            float midWave = sin(x * 0.08 - time * 2.5) * uMid * 40.0;
            float highWave = sin(x * 0.15 + time * 1.5) * uHigh * 20.0;
            
            // Layer selection
            float layer = floor(rnd.y * 3.0);
            float wave = 0.0;
            float zOffset = 0.0;
            
            if (layer < 1.0) {
                wave = bassWave;
                zOffset = -40.0; // Back layer
            } else if (layer < 2.0) {
                wave = midWave;
                zOffset = 0.0; // Middle layer
            } else {
                wave = highWave;
                zOffset = 40.0; // Front layer
            }
            
            target.x = x;
            target.y = wave + (rnd.y - 0.5) * 8.0; // Thickness
            target.z = zOffset + (rnd.z - 0.5) * 15.0; // Layer depth
            
            // Circular waveform option (heptapod language style)
            if (uBass + uMid + uHigh > 1.5) {
                // Transform to circular when loud
                float radius = 150.0 + wave * 0.5;
                float angle = x / 400.0 * 6.28;
                target.x = radius * cos(angle);
                target.z = radius * sin(angle) + zOffset;
            }
            
            // Frequency ripples
            target.y += sin(x * 0.5 + time * 10.0) * uHigh * 5.0;
        }
        else if (shape == 28) { // ORION NEBULA (M42) - 20° Tilt
            vec3 p = (rnd - 0.5) * 350.0;
            float n = snoise(p * 0.015);
            
            // Central bright region (Trapezium cluster)
            float distFromCenter = length(p);
            if (distFromCenter < 60.0) {
                // Intense bright core
                target = p * 0.6; // Concentrate toward center
                
                // Trapezium stars (4 bright points)
                float trapeziumId = floor(rnd.x * 4.0);
                if (rnd.y < 0.08) { // 8% are Trapezium stars
                    float angle = trapeziumId * 1.571; // 90° apart
                    target = vec3(
                        25.0 * cos(angle),
                        (rnd.y - 0.5) * 8.0,
                        25.0 * sin(angle)
                    );
                    // Stars pulse
                    target *= (1.0 + uBass * 0.4);
                }
            } else {
                // Wispy outer regions
                target = p;
            }
            
            // Turbulent structures (wispy appearance)
            vec3 turbulence = curlNoise(p * 0.03 + time * 0.05) * (40.0 + uSound * 50.0);
            target += turbulence;
            
            // Star formation regions (bright knots)
            float starFormation = snoise(p * 0.02 + time * 0.08);
            if (starFormation > 0.65) {
                // Concentrate particles (forming stars)
                target *= 0.75;
                target += sin(time * 2.0) * uHigh * 15.0;
            }
            
            // Ionization fronts (sharp boundaries)
            float ionizationFront = snoise(p * 0.008);
            if (ionizationFront > 0.4 && ionizationFront < 0.5) {
                // Sharp edge
                target += normalize(p) * 20.0;
            }
            
            // Dark dust lanes
            float dustLane = snoise(p * 0.025 + time * 0.02);
            if (dustLane < -0.4) {
                // Push particles away (dark regions)
                target *= 1.3;
            }
            
            // Audio: Nebula expands and pulses
            target *= (1.0 + uBass * 0.25);
            target.y += uMid * 25.0;
            
            // 20° TILT (dramatic depth)
            float tilt = 0.349;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 29) { // CRAB NEBULA (M1) - Supernova Remnant
            float threadId = floor(rnd.x * 16.0); // 16 filament threads
            float threadAngle = threadId * 0.393; // 360/16 degrees
            
            if (rnd.y < 0.25) {
                // Central pulsar region (blue-white synchrotron radiation)
                float r = rnd.z * 40.0;
                float theta = rnd.x * 6.28;
                float phi = acos(2.0 * rnd.y - 1.0);
                
                target.x = r * sin(phi) * cos(theta);
                target.y = r * sin(phi) * sin(theta);
                target.z = r * cos(phi);
                
                // Magnetic field spiral
                float magneticAngle = time * 3.0 + r * 0.2;
                float mx = target.x * cos(magneticAngle) - target.y * sin(magneticAngle);
                float my = target.x * sin(magneticAngle) + target.y * cos(magneticAngle);
                target.x = mx; target.y = my;
                
                // Synchrotron radiation pulse
                target *= (1.0 + uHigh * 0.6);
            } else {
                // Expanding filaments (tangled web)
                float t = rnd.z; // Position along filament
                float distance = t * 180.0; // Expansion distance
                
                // Chaotic, tangled structure
                float chaos = snoise(vec3(threadId * 0.5, t * 5.0, time * 0.1));
                float helixAngle = t * 8.0 + chaos * 3.0;
                float helixRadius = 20.0 + t * 15.0 + chaos * 10.0;
                
                // Base direction
                float baseX = distance * cos(threadAngle + chaos * 0.5);
                float baseZ = distance * sin(threadAngle + chaos * 0.5);
                
                // Add tangled helix
                float helixX = helixRadius * cos(helixAngle);
                float helixY = helixRadius * sin(helixAngle);
                
                target.x = baseX + helixX * cos(threadAngle);
                target.z = baseZ + helixX * sin(threadAngle);
                target.y = helixY + chaos * 20.0;
                
                // Filament thickness variation
                float thickness = 3.0 + (1.0 - t) * 4.0;
                target += (rnd - 0.5) * thickness;
            }
            
            // Expansion (supernova still expanding)
            float expansionSpeed = time * 0.15;
            target *= (1.0 + expansionSpeed * 0.02);
            
            // Audio: Filaments pulse and vibrate
            target *= (1.0 + uMid * 0.3);
            target.y += sin(time * 4.0 + threadId) * uBass * 20.0;
            
            // Rotation
            float rot = time * 0.1;
            float x = target.x * cos(rot) - target.z * sin(rot);
            float z = target.x * sin(rot) + target.z * cos(rot);
            target.x = x; target.z = z;
        }
        else if (shape == 30) { // ANDROMEDA GALAXY (M31) - 45° Tilt
            float r = rnd.x * 250.0; // Larger radius for major galaxy
            float arms = 2.0; // Andromeda has 2 main spiral arms
            float armId = floor(rnd.y * arms);
            float armAngle = armId * (6.28 / arms);
            
            if (rnd.z < 0.35) {
                // Central bulge (yellowish-white core)
                float bulgeR = rnd.x * 50.0;
                float theta = rnd.y * 6.28;
                float phi = acos(2.0 * rnd.z - 1.0);
                
                target.x = bulgeR * sin(phi) * cos(theta);
                target.y = bulgeR * sin(phi) * sin(theta) * 0.5; // Flattened
                target.z = bulgeR * cos(phi) * 0.5;
                
                // Bulge rotation (bar structure)
                float barRot = time * 0.05;
                float bx = target.x * cos(barRot) - target.z * sin(barRot);
                float bz = target.x * sin(barRot) + target.z * cos(barRot);
                target.x = bx; target.z = bz;
            } else {
                // Spiral arms
                float spiralTightness = 0.12;
                float angle = armAngle + r * spiralTightness;
                angle += (rnd.z - 0.5) * 0.4;
                
                // Height varies (thicker in center)
                float height = (rnd.z - 0.5) * 6.0 * exp(-r * 0.012);
                
                target.x = r * cos(angle);
                target.z = r * sin(angle);
                target.y = height;
                
                // Blue patches (star formation regions)
                float starFormation = snoise(vec3(r * 0.05, angle, time * 0.1));
                if (starFormation > 0.6) {
                    // Young blue stars
                    target.y += (rnd.y - 0.5) * 12.0;
                    target *= (1.0 + uHigh * 0.3);
                }
                
                // Dark dust lanes
                float dustLane = snoise(vec3(r * 0.08, angle * 2.0, 0.0));
                if (dustLane < -0.3) {
                    // Darker regions
                    target.y += (rnd.z - 0.5) * 8.0;
                }
            }
            
            // Audio: Galaxy rotates and pulses
            float audioTwist = uBass * 0.2;
            float audioExpand = uMid * 15.0;
            float x = target.x * (1.0 + audioExpand * 0.01);
            float z = target.z * (1.0 + audioExpand * 0.01);
            float newAngle = atan(z, x) + audioTwist;
            float newR = length(vec2(x, z));
            target.x = newR * cos(newAngle);
            target.z = newR * sin(newAngle);
            target.y += uHigh * 10.0;
            
            // 45° TILT (edge-on view)
            float tilt = 0.785;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 31) { // SATURN WITH RINGS - 25° Tilt
            if (rnd.x < 0.40) {
                // Saturn planet (pale yellow/gold)
                float r = 50.0 + rnd.y * 8.0;
                float theta = rnd.z * 6.28;
                float phi = acos(2.0 * rnd.y - 1.0);
                
                target.x = r * sin(phi) * cos(theta);
                target.y = r * sin(phi) * sin(theta) * 0.9; // Slightly flattened
                target.z = r * cos(phi) * 0.9;
                
                // Atmospheric bands
                float bandId = floor(phi * 8.0);
                float bandNoise = snoise(vec3(theta * 3.0, bandId, time * 0.2));
                
                // Band variations
                if (mod(bandId, 2.0) < 1.0) {
                    target *= 1.02; // Lighter bands
                }
                
                // Atmospheric flow
                float flowSpeed = time * 0.3 + bandId * 0.1;
                float fx = target.x * cos(flowSpeed * 0.1) - target.z * sin(flowSpeed * 0.1);
                float fz = target.x * sin(flowSpeed * 0.1) + target.z * cos(flowSpeed * 0.1);
                target.x = fx; target.z = fz;
                
                // Audio: Planet pulses
                target *= (1.0 + uBass * 0.15);
            } else {
                // Rings (bright icy white/tan)
                float ringR = 70.0 + rnd.y * 90.0; // Ring radius range
                float theta = rnd.z * 6.28;
                
                target.x = ringR * cos(theta);
                target.z = ringR * sin(theta);
                target.y = (rnd.y - 0.5) * 1.5; // Very thin rings
                
                // Ring gaps (Cassini Division, Encke Gap)
                if ((ringR > 95.0 && ringR < 102.0) || (ringR > 128.0 && ringR < 132.0)) {
                    // Gaps - fewer particles
                    if (rnd.x < 0.85) target.y += 1000.0; // Move out of view
                }
                
                // Ring density variations
                float ringDensity = snoise(vec3(ringR * 0.1, theta * 5.0, time * 0.05));
                if (ringDensity < -0.2) {
                    // Less dense regions
                    if (rnd.z < 0.4) target.y += 1000.0;
                }
                
                // Ring particle clumping
                float clump = snoise(vec3(ringR * 0.3, theta * 10.0, 0.0));
                if (clump > 0.5) {
                    target.y += (rnd.y - 0.5) * 3.0;
                }
                
                // Audio: Rings vibrate
                target.y += sin(ringR * 0.1 + time * 5.0) * uBass * 5.0;
                target.x *= (1.0 + uMid * 0.1);
                target.z *= (1.0 + uMid * 0.1);
            }
            
            // Slow rotation
            float rot = time * 0.08;
            float x = target.x * cos(rot) - target.z * sin(rot);
            float z = target.x * sin(rot) + target.z * cos(rot);
            target.x = x; target.z = z;
            
            // 25° TILT (see rings clearly)
            float tilt = 0.436;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 32) { // HORSEHEAD NEBULA (Barnard 33) - 15° Tilt
            vec3 p = (rnd - 0.5) * 300.0;
            
            // Background emission nebula (deep red)
            float backgroundNoise = snoise(p * 0.02);
            
            // Horsehead silhouette (dark nebula)
            // Define horsehead shape using SDF approximation
            float horseX = p.x;
            float horseY = p.y;
            
            // Head shape (roughly)
            float headDist = length(vec2(horseX - 20.0, horseY - 30.0)) - 40.0;
            
            // Neck
            float neckDist = length(vec2(horseX - 15.0, horseY + 20.0)) - 25.0;
            
            // Muzzle
            float muzzleDist = length(vec2(horseX - 45.0, horseY - 20.0)) - 18.0;
            
            // Ears
            float ear1Dist = length(vec2(horseX - 10.0, horseY - 60.0)) - 12.0;
            float ear2Dist = length(vec2(horseX + 15.0, horseY - 65.0)) - 10.0;
            
            // Combine shapes
            float horseDist = min(headDist, min(neckDist, min(muzzleDist, min(ear1Dist, ear2Dist))));
            
            if (horseDist < 0.0) {
                // Inside horsehead - dark, opaque
                target = p;
                
                // Dense dust - particles clump
                target += (rnd - 0.5) * 8.0;
                
                // Dark nebula is mostly opaque
                if (rnd.z < 0.3) {
                    // Very dense core
                    target *= 0.9;
                }
            } else {
                // Background emission nebula
                target = p;
                
                // Wispy background
                vec3 turbulence = curlNoise(p * 0.025 + time * 0.03) * 30.0;
                target += turbulence;
                
                // Bright emission regions
                if (backgroundNoise > 0.5) {
                    target += normalize(rnd - 0.5) * 20.0;
                }
            }
            
            // Edge glow (horsehead edge catches light)
            float edgeDist = abs(horseDist);
            if (edgeDist < 8.0 && horseDist > 0.0) {
                // Glowing edge
                float edgeGlow = (8.0 - edgeDist) / 8.0;
                target += normalize(vec3(horseX, horseY, p.z)) * edgeGlow * 15.0;
                target.y += sin(time * 2.0) * uHigh * 10.0 * edgeGlow;
            }
            
            // Audio: Nebula pulses
            target *= (1.0 + uBass * 0.2);
            target.y += uMid * 20.0;
            
            // 15° TILT (dramatic silhouette)
            float tilt = 0.262;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 33) { // HELIX NEBULA (NGC 7293) - "Eye of God" - 30° Tilt
            float r = rnd.x;
            
            if (r < 0.15) {
                // Central white dwarf star (tiny, bright)
                target = normalize(rnd - 0.5) * 8.0;
                
                // Star pulse
                target *= (1.0 + uBass * 0.8);
            } else if (r < 0.60) {
                // Inner ring (bright green/blue)
                float ringR = 40.0 + rnd.y * 50.0;
                float theta = rnd.z * 6.28;
                
                target.x = ringR * cos(theta);
                target.z = ringR * sin(theta);
                target.y = (rnd.y - 0.5) * 15.0; // Ring thickness
                
                // Cometary knots (dense clumps)
                float knotNoise = snoise(vec3(theta * 8.0, ringR * 0.1, time * 0.1));
                if (knotNoise > 0.6) {
                    // Dense knot
                    target.y += (rnd.z - 0.5) * 8.0;
                    target += normalize(rnd - 0.5) * 5.0;
                }
                
                // Inner ring glow
                target *= (1.0 + uHigh * 0.4);
            } else {
                // Outer halo (red/orange filaments)
                float haloR = 90.0 + rnd.y * 80.0;
                float theta = rnd.z * 6.28;
                
                target.x = haloR * cos(theta);
                target.z = haloR * sin(theta);
                target.y = (rnd.y - 0.5) * 35.0; // Thicker halo
                
                // Filamentary structure
                float filamentId = floor(theta * 12.0 / 6.28);
                float filamentNoise = snoise(vec3(filamentId, haloR * 0.05, time * 0.05));
                
                // Radial filaments
                if (filamentNoise > 0.3) {
                    float filamentStrength = (filamentNoise - 0.3) / 0.7;
                    target += normalize(vec3(target.x, 0.0, target.z)) * filamentStrength * 25.0;
                }
                
                // Wispy outer regions
                vec3 turbulence = curlNoise(vec3(target.x * 0.02, target.y * 0.02, target.z * 0.02) + time * 0.02) * 20.0;
                target += turbulence;
            }
            
            // "Eye" appearance - slight 3D spherical shell
            float shellDist = length(target);
            float shellRadius = 100.0;
            if (shellDist > 30.0) {
                // Push toward spherical shell
                float shellFactor = 0.3;
                target = mix(target, normalize(target) * shellRadius, shellFactor * (shellDist - 30.0) / shellRadius);
            }
            
            // Audio: Nebula breathes (like an eye)
            float breathe = sin(time * 0.5) * uBass * 15.0;
            target *= (1.0 + breathe * 0.01);
            target.y += uMid * 12.0;
            
            // Slow rotation
            float rot = time * 0.05;
            float x = target.x * cos(rot) - target.z * sin(rot);
            float z = target.x * sin(rot) + target.z * cos(rot);
            target.x = x; target.z = z;
            
            // 30° TILT (see the "eye" clearly)
            float tilt = 0.524;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }
        else if (shape == 34) { // HUBBLE DEEP FIELD - Thousands of Galaxies
            // Create a crowded field of distant galaxies
            float galaxyId = floor(rnd.x * 150.0); // 150 different galaxies
            
            // Galaxy position in the field (spread across view)
            vec3 fieldPos = vec3(
                (hash3(vec2(galaxyId, 0.0)).x - 0.5) * 400.0,
                (hash3(vec2(galaxyId, 1.0)).y - 0.5) * 400.0,
                (hash3(vec2(galaxyId, 2.0)).z - 0.5) * 200.0
            );
            
            // Galaxy type (spiral, elliptical, irregular)
            float galaxyType = hash3(vec2(galaxyId, 3.0)).x;
            
            if (galaxyType < 0.4) {
                // Spiral galaxies (40%)
                float r = rnd.y * 30.0;
                float arms = 2.0 + floor(hash3(vec2(galaxyId, 4.0)).x * 3.0); // 2-4 arms
                float armId = floor(rnd.z * arms);
                float armAngle = armId * (6.28 / arms);
                
                float spiralTightness = 0.15 + hash3(vec2(galaxyId, 5.0)).x * 0.1;
                float angle = armAngle + r * spiralTightness;
                
                target.x = fieldPos.x + r * cos(angle);
                target.z = fieldPos.z + r * sin(angle);
                target.y = fieldPos.y + (rnd.y - 0.5) * 3.0; // Thin disk
                
                // Random orientation
                float tiltAngle = hash3(vec2(galaxyId, 6.0)).x * 3.14159;
                float ty = (target.y - fieldPos.y) * cos(tiltAngle) - (target.z - fieldPos.z) * sin(tiltAngle);
                float tz = (target.y - fieldPos.y) * sin(tiltAngle) + (target.z - fieldPos.z) * cos(tiltAngle);
                target.y = fieldPos.y + ty;
                target.z = fieldPos.z + tz;
                
            } else if (galaxyType < 0.7) {
                // Elliptical galaxies (30%)
                float r = rnd.y * 25.0;
                float theta = rnd.z * 6.28;
                float phi = acos(2.0 * rnd.x - 1.0);
                
                // Elliptical shape (varying eccentricity)
                float eccentricity = hash3(vec2(galaxyId, 7.0)).x;
                
                target.x = fieldPos.x + r * sin(phi) * cos(theta);
                target.y = fieldPos.y + r * sin(phi) * sin(theta) * (0.5 + eccentricity * 0.5);
                target.z = fieldPos.z + r * cos(phi) * (0.5 + eccentricity * 0.5);
                
            } else {
                // Irregular galaxies (30%)
                float r = rnd.y * 20.0;
                float theta = rnd.z * 6.28;
                
                // Chaotic, irregular structure
                float chaos = snoise(vec3(galaxyId * 0.1, rnd.y * 5.0, rnd.z * 5.0));
                
                target.x = fieldPos.x + r * cos(theta) * (1.0 + chaos * 0.5);
                target.z = fieldPos.z + r * sin(theta) * (1.0 + chaos * 0.5);
                target.y = fieldPos.y + (rnd.x - 0.5) * 15.0 * (1.0 + abs(chaos));
            }
            
            // Distance variation (some galaxies farther away)
            float distance = hash3(vec2(galaxyId, 8.0)).x;
            target *= (0.8 + distance * 0.4);
            
            // Slow rotation for each galaxy
            float galaxyRot = time * 0.02 + galaxyId * 0.1;
            float x = (target.x - fieldPos.x) * cos(galaxyRot) - (target.z - fieldPos.z) * sin(galaxyRot);
            float z = (target.x - fieldPos.x) * sin(galaxyRot) + (target.z - fieldPos.z) * cos(galaxyRot);
            target.x = fieldPos.x + x;
            target.z = fieldPos.z + z;
            
            // Audio: Field pulses
            target *= (1.0 + uBass * 0.1);
        }
        else if (shape == 35) { // SUPERNOVA REMNANT N49 - Delicate Chaotic Web
            float threadId = floor(rnd.x * 20.0); // 20 filament threads
            float threadAngle = threadId * 0.314; // 360/20 degrees
            
            if (rnd.y < 0.20) {
                // Central explosion core (20%)
                float r = rnd.z * 35.0;
                float theta = rnd.x * 6.28;
                float phi = acos(2.0 * rnd.y - 1.0);
                
                target.x = r * sin(phi) * cos(theta);
                target.y = r * sin(phi) * sin(theta);
                target.z = r * cos(phi);
                
                // Core pulse
                target *= (1.0 + uBass * 0.5);
            } else {
                // Delicate expanding filaments (80%)
                float t = rnd.z; // Position along filament
                float distance = t * 160.0; // Expansion distance
                
                // Delicate, wispy structure (less chaotic than Crab)
                float delicacy = snoise(vec3(threadId * 0.3, t * 3.0, time * 0.08));
                float waveAngle = t * 6.0 + delicacy * 2.0;
                float waveRadius = 15.0 + t * 12.0 + delicacy * 8.0;
                
                // Base direction
                float baseX = distance * cos(threadAngle + delicacy * 0.3);
                float baseZ = distance * sin(threadAngle + delicacy * 0.3);
                
                // Add delicate wave pattern
                float waveX = waveRadius * cos(waveAngle);
                float waveY = waveRadius * sin(waveAngle);
                
                target.x = baseX + waveX * cos(threadAngle);
                target.z = baseZ + waveX * sin(threadAngle);
                target.y = waveY + delicacy * 15.0;
                
                // Filament thickness (very thin, delicate)
                float thickness = 2.0 + (1.0 - t) * 3.0;
                target += (rnd - 0.5) * thickness;
                
                // Branching filaments (web-like)
                if (rnd.x > 0.7 && t > 0.4) {
                    // Branch off
                    float branchAngle = threadAngle + (rnd.y - 0.5) * 1.0;
                    target.x += cos(branchAngle) * 20.0;
                    target.z += sin(branchAngle) * 20.0;
                }
            }
            
            // Expansion (still expanding from explosion)
            float expansionSpeed = time * 0.12;
            target *= (1.0 + expansionSpeed * 0.015);
            
            // Audio: Delicate vibration
            target += sin(time * 3.0 + threadId) * uMid * 8.0;
            target.y += cos(time * 2.0 + threadId) * uHigh * 12.0;
            
            // Rotation
            float rot = time * 0.08;
            float x = target.x * cos(rot) - target.z * sin(rot);
            float z = target.x * sin(rot) + target.z * cos(rot);
            target.x = x; target.z = z;
        }
        else if (shape == 36) { // ROSETTE NEBULA - Rose Shape with Central Hole
            vec3 p = (rnd - 0.5) * 350.0;
            float distFromCenter = length(vec2(p.x, p.z));
            
            // Central hole (cavity cleared by stellar winds)
            float holeRadius = 50.0;
            
            if (distFromCenter < holeRadius) {
                // Inside the hole - very few particles (sparse)
                if (rnd.x < 0.15) {
                    // Only 15% of particles in the hole
                    target = p * 0.3; // Push toward edges
                    target.y = (rnd.y - 0.5) * 20.0;
                } else {
                    // Push particles out to the ring
                    target = normalize(vec3(p.x, 0.0, p.z)) * (holeRadius + rnd.z * 30.0);
                    target.y = (rnd.y - 0.5) * 25.0;
                }
            } else {
                // Rose-like ring structure
                float ringRadius = distFromCenter;
                float angle = atan(p.z, p.x);
                
                // Rose petal structure (6 main petals)
                float petalCount = 6.0;
                float petalAngle = mod(angle + 3.14159, 6.28 / petalCount);
                float petalShape = sin(petalAngle * petalCount) * 0.5 + 0.5;
                
                // Petal bulges
                float petalBulge = petalShape * 40.0;
                float adjustedRadius = ringRadius + petalBulge;
                
                target.x = adjustedRadius * cos(angle);
                target.z = adjustedRadius * sin(angle);
                target.y = p.y;
                
                // Petal thickness variation
                if (petalShape > 0.6) {
                    // Thicker at petal centers
                    target.y += (rnd.y - 0.5) * 35.0;
                } else {
                    // Thinner between petals
                    target.y += (rnd.y - 0.5) * 20.0;
                }
                
                // Wispy edges
                vec3 turbulence = curlNoise(p * 0.025 + time * 0.04) * 35.0;
                target += turbulence;
                
                // Star formation regions (bright knots in petals)
                float starFormation = snoise(vec3(angle * 3.0, ringRadius * 0.05, time * 0.1));
                if (starFormation > 0.65 && petalShape > 0.5) {
                    // Concentrate particles (forming stars in petals)
                    target *= 0.85;
                    target.y += sin(time * 2.5) * uHigh * 18.0;
                }
            }
            
            // Ionization fronts (sharp edges at petal boundaries)
            float angle = atan(p.z, p.x);
            float petalBoundary = abs(sin(angle * 3.0)); // 6 petals = 3 cycles
            if (petalBoundary > 0.85) {
                // Sharp petal edges
                target += normalize(p) * 15.0;
            }
            
            // Audio: Nebula breathes and pulses
            target *= (1.0 + uBass * 0.2);
            target.y += uMid * 20.0;
            
            // Slow rotation (rose spinning)
            float rot = time * 0.06;
            float x = target.x * cos(rot) - target.z * sin(rot);
            float z = target.x * sin(rot) + target.z * cos(rot);
            target.x = x; target.z = z;
            
            // 20° TILT (see rose shape clearly)
            float tilt = 0.349;
            float ty = target.y * cos(tilt) - target.z * sin(tilt);
            float tz = target.y * sin(tilt) + target.z * cos(tilt);
            target.y = ty; target.z = tz;
        }

        // Physics
        vec3 force = (target - pos) * 0.05; 
        
        // Curl Noise Turbulence (Conditional)
        // Only apply global turbulence to organic shapes
        if (shape == 3 || shape == 10 || shape == 14 || shape == 17 || shape == 20 || shape == 21 || shape == 28 || shape == 32 || shape == 33 || shape == 35 || shape == 36) {
             force += curlNoise(pos * 0.02 + time * 0.2) * 0.4;
        }

        // Interaction
        if (uMouseActive > 0.5) {
            vec3 diff = pos - uMouse;
            float dist = length(diff);
            float radius = 80.0;
            if (dist < radius) {
                float power = (1.0 - dist / radius);
                force += normalize(diff) * power * 20.0; 
            }
        }
        
        // PHASE 5: Force Push (Mouse Velocity Repels)
        float mouseSpeed = length(uMouseVel);
        if (mouseSpeed > 0.01) {
            vec3 diff = pos - uMouse;
            float dist = length(diff);
            float pushRadius = 100.0;
            if (dist < pushRadius) {
                float power = (1.0 - dist / pushRadius) * mouseSpeed * 50.0;
                force += normalize(diff) * power;
            }
        }
        
        // PHASE 5: Mic Blow (High Frequency Scatters)
        if (uBlow > 0.5) {
            vec3 blowDir = hash3(uv) - 0.5; // Random scatter direction
            force += normalize(blowDir) * uBlow * 30.0;
        }
        
        // PHASE 5: Gravity Wells (Attractors)
        for (int i = 0; i < 5; i++) {
            if (i >= uWellCount) break;
            
            vec3 wellPos = vec3(uWells[i*4], uWells[i*4+1], uWells[i*4+2]);
            float wellStrength = uWells[i*4+3];
            
            vec3 diff = wellPos - pos;
            float dist = length(diff);
            float attractRadius = 200.0;
            
            if (dist < attractRadius && wellStrength > 0.0) {
                float power = (1.0 - dist / attractRadius) * wellStrength;
                force += normalize(diff) * power * 2.0;
            }
        }
        
        // Black Hole / Shockwave Click Interaction
        if (uClick > 0.5) {
            vec3 diff = vec3(0.0) - pos; // Attract to center
            float dist = length(diff);
            // Black hole suck
            force += normalize(diff) * 5.0; 
            // Swirl
            force += cross(normalize(diff), vec3(0,1,0)) * 2.0;
        }

        vel += force;
        vel *= 0.92; // Less friction for more flow
        gl_FragColor = vec4(vel, 1.0);
    }
`;

export const positionFragmentShader = `
    uniform float uReset; // 1.0 = reset
    
    // Hash function needed for position reset
    vec3 hash3(vec2 p) {
        vec3 q = vec3( dot(p,vec2(127.1,311.7)), 
                       dot(p,vec2(269.5,183.3)), 
                       dot(p,vec2(419.2,371.9)) );
        return fract(sin(q)*43758.5453);
    }

    void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        
        if (uReset > 0.5) {
            vec3 rnd = hash3(uv);
            vec3 p = (rnd - 0.5) * 400.0;
            gl_FragColor = vec4(p, 1.0);
            return;
        }

        vec4 posData = texture2D( texturePosition, uv );
        vec4 velData = texture2D( textureVelocity, uv );
        vec3 pos = posData.xyz;
        vec3 vel = velData.xyz;
        pos += vel * 0.6; // Speed multiplier
        gl_FragColor = vec4(pos, 1.0);
    }
`;

export const renderVertexShader = `
    uniform sampler2D texturePosition;
    uniform sampler2D textureVelocity;
    uniform float size;
    varying vec3 vVel;
    varying vec2 vUv;
    varying vec3 vPos; // View position for Fresnel
    varying vec3 vLocalPos; // Local position for coloring

    void main() {
        vUv = position.xy;
        vec4 posData = texture2D( texturePosition, position.xy );
        vec4 velData = texture2D( textureVelocity, position.xy );
        vec3 pos = posData.xyz;
        vVel = velData.xyz;
        vec4 mvPosition = modelViewMatrix * vec4( pos, 1.0 );
        vPos = mvPosition.xyz; // Pass view position
        vLocalPos = pos; // Pass local position
        gl_Position = projectionMatrix * mvPosition;
        
        // Stretch based on velocity (Motion Blur effect)
        float speed = length(vVel);
        float pointSize = size * ( 350.0 / -mvPosition.z ); // Balanced size
        pointSize *= (1.0 + speed * 0.1); // Slight stretch
        
        gl_PointSize = pointSize;
    }
`;

export const renderFragmentShader = `
    varying vec3 vVel;
    varying vec2 vUv;
    varying vec3 vPos;
    varying vec3 vLocalPos;
    uniform int colorTheme;
    uniform int shape; // Added shape uniform
    uniform float time;
    uniform float uSound;
    uniform float uBass;
    uniform float uMid;
    uniform float uHigh;
    
    // Simplex Noise for Fragment Shader
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v) { 
        const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy) );
        vec3 x0 = v - i + dot(i, C.xxx) ;
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289(i); 
        vec4 p = permute( permute( permute( 
                 i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
               + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
        float n_ = 0.142857142857;
        vec3  ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
    }
    
    vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    void main() {
        vec2 uv = gl_PointCoord.xy - 0.5;
        float r = length(uv);
        if (r > 0.5) discard;
        // Maximum sharpness (Aliased edge)
        float alpha = 1.0 - step(0.5, r);
        
        float t = vUv.x + vUv.y * 0.5; 
        vec3 color = vec3(1.0); // Default to white
        float speed = length(vVel);
        
        // Realism: Twinkle based on sound
        float twinkle = 1.0 + sin(time * 20.0 + vUv.x * 100.0) * uSound * 0.5;
        alpha *= twinkle;
        
        // --- BLACK HOLE OVERRIDE (Interstellar Style) ---
        if (shape == 19) {
            // Gold/Orange Accretion Disk
            float dist = length(vPos.xz); // Distance from center
            float noise = snoise(vPos * 0.1 + time * 0.5);
            
            // Core is darker/redder, outer is brighter/gold
            if (speed > 5.0) {
                color = vec3(1.0, 0.9, 0.5); // Bright Gold/White
            } else {
                color = mix(vec3(1.0, 0.3, 0.0), vec3(1.0, 0.6, 0.1), noise); // Deep Orange
            }
            // Make inner edge fade to black (Event Horizon)
            // Note: vPos is view position, we need local position but we don't have it easily here.
            // We use speed as proxy: faster = closer to center.
        }
        else if (shape == 18) { // SOLAR SYSTEM COLORS
            float dist = length(vLocalPos);
            
            if (dist < 20.0) color = vec3(1.0, 0.8, 0.0); // Sun (Yellow/Orange)
            else if (dist < 38.0) color = vec3(0.7, 0.7, 0.7); // Mercury (Grey)
            else if (dist < 52.0) color = vec3(1.0, 0.9, 0.6); // Venus (Pale Yellow)
            else if (dist < 68.0) color = vec3(0.0, 0.4, 1.0); // Earth (Blue)
            else if (dist < 90.0) color = vec3(1.0, 0.2, 0.0); // Mars (Red)
            else if (dist < 125.0) color = vec3(0.9, 0.7, 0.5); // Jupiter (Beige/Orange)
            else if (dist < 155.0) color = vec3(0.9, 0.8, 0.4); // Saturn (Gold)
            else if (dist < 185.0) color = vec3(0.4, 0.9, 0.9); // Uranus (Cyan)
            else color = vec3(0.2, 0.3, 0.9); // Neptune (Deep Blue)
            
            // Sound: Brighten on beat (High)
            color *= (1.0 + uSound * 1.5);
        }
        else if (colorTheme == 1) { // FIRE (Red & Orange, no Yellow)
            float hue = 0.0 + 0.08 * fract(t * 5.0); // Limit to Red-Orange
            color = hsv2rgb(vec3(hue, 1.0, 1.0));
        }
        else if (colorTheme == 2) { // ICE (Cyan & Blue, no White)
            float hue = 0.5 + 0.2 * fract(t * 2.0); 
            float sat = 0.8 + 0.2 * sin(t * 20.0); // High saturation
            color = hsv2rgb(vec3(hue, sat, 1.0));
        }
        else if (colorTheme == 3) { // NATURE (Green, no Yellow)
            float hue = 0.25 + 0.15 * fract(t * 3.0); // Pure Green to Cyan
            color = hsv2rgb(vec3(hue, 1.0, 0.8));
        }
        else if (colorTheme == 4) { // MATRIX (Green)
            color = vec3(0.0, 1.0, 0.2) * (0.5 + 0.5 * sin(t * 50.0));
        }
        else if (colorTheme == 5) { // TRON (Cyan & Orange)
            if (fract(t * 10.0) > 0.5) color = vec3(0.0, 1.0, 1.0); 
            else color = vec3(1.0, 0.2, 0.0); // Red-Orange instead of Yellow-Orange
        }
        else if (colorTheme == 6) { // BARBIE (Pink & Magenta, no Pastel White)
            float shade = fract(t * 5.0);
            if (shade > 0.5) color = vec3(1.0, 0.0, 0.5); 
            else color = vec3(0.8, 0.0, 0.8); // Deep Magenta
        }
        else if (colorTheme == 7) { // DUNE (Blue & Deep Orange, no Sand/White)
            if (fract(t * 20.0) > 0.9) color = vec3(0.0, 0.5, 1.0); 
            else color = vec3(1.0, 0.3, 0.0); // Deep Orange
        }
        else if (colorTheme == 8) { // BLADE RUNNER (Purple/Pink/Cyan)
            float grad = fract(t * 2.0 + speed * 0.1);
            color = hsv2rgb(vec3(0.7 + 0.2 * grad, 1.0, 1.0));
        }
        else if (colorTheme == 9) { // STAR WARS (Red vs Blue)
            if (fract(t * 2.0) > 0.5) color = vec3(1.0, 0.0, 0.0); 
            else color = vec3(0.0, 0.5, 1.0); 
        }
        else if (colorTheme == 10) { // GAME OF THRONES (Ice & Fire)
            if (fract(t * 10.0 + sin(time * 0.5)) > 0.5) color = vec3(0.0, 0.8, 1.0); 
            else color = vec3(1.0, 0.0, 0.0); // Pure Red
        }
        else if (colorTheme == 11) { // TRON: ARES (Red & Dark Grey)
            if (fract(t * 15.0) > 0.7) color = vec3(0.2); // Dark Grey
            else color = vec3(1.0, 0.0, 0.1); 
        }
        else if (colorTheme == 12) { // BREAKING BAD (Blue & Green, no Yellow)
            if (fract(t * 5.0) > 0.6) color = vec3(0.0, 1.0, 0.0); // Green
            else color = vec3(0.0, 0.8, 1.0); // Blue
        }
        else if (colorTheme == 13) { // STRANGER THINGS (Red & Dark Blue, no White)
            float noise = fract(t * 20.0);
            if (noise > 0.8) color = vec3(0.1, 0.1, 0.3); // Dark Blue
            else color = vec3(0.8, 0.0, 0.0); // Red
        }
        else if (colorTheme == 14) { // SQUID GAME (Pink & Green)
            if (fract(t * 2.0) > 0.5) color = vec3(1.0, 0.0, 0.4); 
            else color = vec3(0.0, 0.6, 0.4); 
        }
        else if (colorTheme == 15) { // KINETIC (Speed Based - Blue to Red)
            // Slow = Blue, Fast = Red
            float s = smoothstep(0.0, 5.0, speed);
            color = mix(vec3(0.0, 0.1, 0.8), vec3(1.0, 0.0, 0.2), s);
            alpha *= (0.5 + s * 0.5); 
        }
        else if (colorTheme == 16) { // IRIDESCENCE (Purple/Cyan/Magenta, no White)
            vec3 viewDir = normalize(-vPos);
            vec3 normal = normalize(vPos); 
            float fresnel = dot(viewDir, normal);
            fresnel = abs(fresnel); 
            
            vec3 c1 = vec3(0.5, 0.0, 1.0); // Purple
            vec3 c2 = vec3(0.0, 1.0, 1.0); // Cyan
            vec3 c3 = vec3(1.0, 0.0, 1.0); // Magenta (instead of White)
            
            if (fresnel < 0.3) color = c3;
            else if (fresnel < 0.7) color = c2;
            else color = c1;
            
            alpha = 0.8;
        }
        else if (colorTheme == 17) { // DEEP SPACE (NASA Style)
            // Deep Blue/Black background, Bright Stars, Nebula clouds
            float noise = snoise(vPos * 0.01 + time * 0.05);
            if (noise > 0.6) color = vec3(1.0, 0.0, 0.5); // Magenta Nebula
            else if (noise > 0.3) color = vec3(0.0, 0.8, 1.0); // Cyan Nebula
            else if (noise > 0.0) color = vec3(0.1, 0.0, 0.4); // Deep Purple
            else color = vec3(1.0, 0.8, 0.5); // Gold Stars
            
            // Make stars pop
            if (length(vVel) > 2.0) color = vec3(1.0); // Bright white/blue stars for fast particles
        }
        else if (colorTheme == 18) { // DIGITAL RAIN (MATRIX)
            float col = floor(vUv.x * 50.0);
            float drop = fract(vUv.y * 10.0 + time * (2.0 + sin(col)*2.0));
            if (drop > 0.8) color = vec3(0.8, 1.0, 0.8); // Bright head
            else color = vec3(0.0, 1.0, 0.2) * drop; // Tail
        }
        else if (colorTheme == 19) { // BIOLUMINESCENCE
            // Deep Blue background
            color = vec3(0.0, 0.1, 0.3);
            // Flash on sound
            float flash = snoise(vPos * 0.05 + time);
            if (flash > 0.5) {
                color = mix(color, vec3(0.0, 1.0, 0.8), (flash - 0.5) * 2.0 * (1.0 + uHigh));
            }
        }
        else if (colorTheme == 20) { // SYNTHWAVE SUNSET
            if (vPos.y < -10.0) { // Grid floor
                float grid = max(step(0.95, fract(vPos.x * 0.1)), step(0.95, fract(vPos.z * 0.1)));
                color = mix(vec3(0.2, 0.0, 0.4), vec3(1.0, 0.0, 1.0), grid);
            } else { // Sky/Sun
                color = mix(vec3(0.1, 0.0, 0.2), vec3(1.0, 0.5, 0.0), vPos.y / 200.0);
            }
        }
        else if (colorTheme == 21) { // GLITCH / CYBERPUNK
            float glitch = step(0.9, fract(time * 10.0));
            if (glitch > 0.5) {
                color = vec3(1.0); // White flash
            } else {
                float noise = snoise(vPos * 0.1);
                if (noise > 0.0) color = vec3(1.0, 0.0, 0.5); // Neon Pink
                else color = vec3(0.0, 1.0, 1.0); // Cyan
            }
        }
        else if (colorTheme == 22) { // GOLDEN HOUR
            float warm = 0.5 + 0.5 * sin(time + vPos.x * 0.01);
            color = mix(vec3(1.0, 0.8, 0.4), vec3(1.0, 0.6, 0.2), warm);
            alpha *= 0.6; // Soft dust
        }
        else if (colorTheme == 23) { // ORION NEBULA (Red/Pink with Green/Blue hints)
            float distFromCenter = length(vPos);
            float noise = snoise(vPos * 0.02 + time * 0.05);
            
            // Central region - intense red/pink
            if (distFromCenter < 60.0) {
                // Trapezium stars - bright white/blue
                if (length(vVel) > 3.0) {
                    color = vec3(0.9, 0.95, 1.0); // Bright blue-white stars
                } else {
                    // Ionized hydrogen - vibrant red/pink
                    color = vec3(1.0, 0.2, 0.4);
                }
            } else {
                // Outer regions - mix of colors
                if (noise > 0.6) {
                    // Oxygen (green/blue-green)
                    color = vec3(0.2, 0.9, 0.6);
                } else if (noise > 0.3) {
                    // Hydrogen (red/pink)
                    color = vec3(1.0, 0.3, 0.5);
                } else if (noise > 0.0) {
                    // Sulfur (blue)
                    color = vec3(0.3, 0.5, 1.0);
                } else {
                    // Dark dust
                    color = vec3(0.1, 0.05, 0.08);
                }
            }
            
            // Star formation - bright spots
            float starFormation = snoise(vPos * 0.02);
            if (starFormation > 0.65) {
                color = mix(color, vec3(1.0, 0.9, 0.8), 0.6);
            }
            
            alpha = 0.85;
        }
        else if (colorTheme == 24) { // CRAB NEBULA (Multi-colored with blue center)
            float distFromCenter = length(vPos);
            float noise = snoise(vPos * 0.03);
            
            // Central synchrotron radiation - eerie blue-white
            if (distFromCenter < 40.0) {
                color = vec3(0.6, 0.8, 1.0); // Blue-white haze
                // Magnetic field glow
                color = mix(color, vec3(0.4, 0.7, 1.0), sin(time * 3.0) * 0.5 + 0.5);
            } else {
                // Filaments - red, yellow, orange
                if (noise > 0.5) {
                    color = vec3(1.0, 0.3, 0.2); // Red filaments
                } else if (noise > 0.2) {
                    color = vec3(1.0, 0.7, 0.2); // Orange/yellow
                } else if (noise > -0.2) {
                    color = vec3(0.9, 0.5, 0.3); // Orange
                } else {
                    color = vec3(0.6, 0.8, 1.0); // Blue background
                }
            }
            
            alpha = 0.8;
        }
        else if (colorTheme == 25) { // ANDROMEDA GALAXY
            float distFromCenter = length(vec2(vPos.x, vPos.z));
            float noise = snoise(vPos * 0.05);
            
            // Central bulge - yellowish-white
            if (distFromCenter < 50.0) {
                color = vec3(1.0, 0.95, 0.8); // Bright yellow-white core
            } else {
                // Spiral arms
                if (noise > 0.6) {
                    // Star formation regions - blue
                    color = vec3(0.4, 0.6, 1.0);
                } else if (noise > 0.3) {
                    // Mixed stellar population - white
                    color = vec3(0.9, 0.9, 0.95);
                } else if (noise > 0.0) {
                    // Older stars - yellow
                    color = vec3(1.0, 0.9, 0.7);
                } else {
                    // Dark dust lanes
                    color = vec3(0.1, 0.08, 0.06);
                }
            }
            
            // Distance fade (appears grey/faint from Earth)
            color = mix(vec3(0.3, 0.3, 0.35), color, 0.4);
            
            alpha = 0.7;
        }
        else if (colorTheme == 26) { // SATURN
            float distFromCenter = length(vPos);
            
            // Planet vs Rings
            if (distFromCenter < 60.0) {
                // Planet - pale yellow/gold with bands
                float bandNoise = snoise(vec3(vPos.x * 0.1, vPos.y * 0.3, vPos.z * 0.1));
                if (bandNoise > 0.3) {
                    color = vec3(0.95, 0.88, 0.65); // Lighter gold
                } else if (bandNoise > 0.0) {
                    color = vec3(0.88, 0.80, 0.55); // Medium gold
                } else {
                    color = vec3(0.80, 0.72, 0.50); // Darker gold
                }
            } else {
                // Rings - icy white/light tan
                float ringNoise = snoise(vPos * 0.2);
                if (ringNoise > 0.4) {
                    color = vec3(0.95, 0.93, 0.88); // Bright icy white
                } else if (ringNoise > 0.0) {
                    color = vec3(0.88, 0.85, 0.78); // Light tan
                } else {
                    color = vec3(0.80, 0.76, 0.68); // Tan
                }
                
                // Ring gaps - darker
                float ringDist = length(vec2(vPos.x, vPos.z));
                if ((ringDist > 95.0 && ringDist < 102.0) || (ringDist > 128.0 && ringDist < 132.0)) {
                    color *= 0.3;
                }
            }
            
            alpha = 0.9;
        }
        else if (colorTheme == 27) { // HORSEHEAD NEBULA
            // Horsehead silhouette calculation
            float horseX = vPos.x;
            float horseY = vPos.y;
            
            float headDist = length(vec2(horseX - 20.0, horseY - 30.0)) - 40.0;
            float neckDist = length(vec2(horseX - 15.0, horseY + 20.0)) - 25.0;
            float muzzleDist = length(vec2(horseX - 45.0, horseY - 20.0)) - 18.0;
            float ear1Dist = length(vec2(horseX - 10.0, horseY - 60.0)) - 12.0;
            float ear2Dist = length(vec2(horseX + 15.0, horseY - 65.0)) - 10.0;
            
            float horseDist = min(headDist, min(neckDist, min(muzzleDist, min(ear1Dist, ear2Dist))));
            
            if (horseDist < 0.0) {
                // Horsehead - dark, opaque brown/black
                color = vec3(0.05, 0.03, 0.02); // Very dark brown
            } else {
                // Background emission nebula - deep red
                float noise = snoise(vPos * 0.02);
                if (noise > 0.5) {
                    color = vec3(0.8, 0.1, 0.15); // Bright red
                } else if (noise > 0.2) {
                    color = vec3(0.6, 0.08, 0.12); // Medium red
                } else {
                    color = vec3(0.4, 0.05, 0.08); // Dark red
                }
                
                // Edge glow
                float edgeDist = abs(horseDist);
                if (edgeDist < 8.0) {
                    float edgeGlow = (8.0 - edgeDist) / 8.0;
                    color = mix(color, vec3(1.0, 0.4, 0.3), edgeGlow * 0.6);
                }
            }
            
            alpha = 0.85;
        }
        else if (colorTheme == 28) { // HELIX NEBULA (Green, Blue, Orange/Red)
            float distFromCenter = length(vPos);
            float noise = snoise(vPos * 0.03);
            
            // Central white dwarf - tiny bright white
            if (distFromCenter < 8.0) {
                color = vec3(1.0, 1.0, 1.0); // Bright white
            } else if (distFromCenter < 90.0) {
                // Inner ring - vibrant green/blue
                if (noise > 0.5) {
                    color = vec3(0.2, 1.0, 0.6); // Bright green
                } else if (noise > 0.2) {
                    color = vec3(0.3, 0.8, 1.0); // Cyan/blue
                } else {
                    color = vec3(0.4, 0.9, 0.8); // Turquoise
                }
                
                // Cometary knots - brighter
                float knotNoise = snoise(vPos * 0.1);
                if (knotNoise > 0.6) {
                    color = mix(color, vec3(1.0, 1.0, 0.9), 0.5);
                }
            } else {
                // Outer halo - orange/red filaments
                if (noise > 0.4) {
                    color = vec3(1.0, 0.4, 0.2); // Orange-red
                } else if (noise > 0.1) {
                    color = vec3(0.9, 0.5, 0.3); // Orange
                } else if (noise > -0.2) {
                    color = vec3(0.7, 0.3, 0.4); // Reddish
                } else {
                    color = vec3(0.5, 0.6, 0.8); // Blue background
                }
            }
            
            alpha = 0.8;
        }
        else if (colorTheme == 29) { // HUBBLE DEEP FIELD (Varied galaxy colors)
            // Determine which galaxy this particle belongs to
            float galaxyId = floor(vPos.x * 0.01 + vPos.y * 0.01 + vPos.z * 0.01);
            
            // Simple pseudo-random function (replacement for hash3)
            float galaxyAge = fract(sin(galaxyId * 12.9898 + 78.233) * 43758.5453);
            float galaxyType = fract(sin(galaxyId * 93.9898 + 47.233) * 43758.5453);
            
            // Color based on galaxy age and type
            if (galaxyAge < 0.25) {
                // Young galaxies - blue (active star formation)
                color = vec3(0.4, 0.6, 1.0); // Bright blue
            } else if (galaxyAge < 0.50) {
                // Middle-aged galaxies - white/blue-white
                color = vec3(0.9, 0.95, 1.0); // Blue-white
            } else if (galaxyAge < 0.75) {
                // Mature galaxies - yellow/white
                color = vec3(1.0, 0.95, 0.8); // Yellow-white
            } else {
                // Old galaxies - red/orange
                color = vec3(1.0, 0.7, 0.5); // Orange-red
            }
            
            // Elliptical galaxies are more yellow
            if (galaxyType > 0.4 && galaxyType < 0.7) {
                color = mix(color, vec3(1.0, 0.9, 0.7), 0.4);
            }
            
            // Distance fade (farther galaxies dimmer)
            float distFromOrigin = length(vPos);
            float fade = 1.0 - smoothstep(200.0, 400.0, distFromOrigin);
            color *= (0.5 + fade * 0.5);
            
            // Core brightness
            float noise = snoise(vPos * 0.1);
            if (noise > 0.6) {
                color = mix(color, vec3(1.0, 1.0, 0.95), 0.3); // Bright cores
            }
            
            alpha = 0.75;
        }
        else if (colorTheme == 30) { // SUPERNOVA REMNANT N49 (Delicate red/white web)
            float distFromCenter = length(vPos);
            float noise = snoise(vPos * 0.04);
            
            // Central core - bright white
            if (distFromCenter < 35.0) {
                color = vec3(1.0, 0.98, 0.95); // Bright white
                // Pulsing core
                color = mix(color, vec3(1.0, 0.9, 0.85), sin(time * 2.0) * 0.5 + 0.5);
            } else {
                // Delicate filaments - red and white mix
                if (noise > 0.5) {
                    // White filaments
                    color = vec3(0.95, 0.93, 0.90);
                } else if (noise > 0.2) {
                    // Pink/red filaments
                    color = vec3(1.0, 0.5, 0.5);
                } else if (noise > -0.2) {
                    // Deep red
                    color = vec3(0.9, 0.3, 0.3);
                } else {
                    // Faint red background
                    color = vec3(0.6, 0.2, 0.2);
                }
                
                // Delicate glow on filaments
                float filamentGlow = snoise(vPos * 0.08 + time * 0.1);
                if (filamentGlow > 0.6) {
                    color = mix(color, vec3(1.0, 0.8, 0.8), 0.4);
                }
            }
            
            alpha = 0.8;
        }
        else if (colorTheme == 31) { // ROSETTE NEBULA (Vivid rich red)
            float distFromCenter = length(vec2(vPos.x, vPos.z));
            float angle = atan(vPos.z, vPos.x);
            float noise = snoise(vPos * 0.02);
            
            // Central hole - very dark with hints of red
            if (distFromCenter < 50.0) {
                color = vec3(0.15, 0.05, 0.08); // Dark with red tint
            } else {
                // Rose petals - vivid rich red (ionized hydrogen)
                
                // Petal structure
                float petalCount = 6.0;
                float petalAngle = mod(angle + 3.14159, 6.28 / petalCount);
                float petalShape = sin(petalAngle * petalCount) * 0.5 + 0.5;
                
                if (petalShape > 0.6) {
                    // Petal centers - brightest red
                    if (noise > 0.5) {
                        color = vec3(1.0, 0.15, 0.25); // Vivid bright red
                    } else if (noise > 0.2) {
                        color = vec3(0.95, 0.2, 0.3); // Rich red
                    } else {
                        color = vec3(0.85, 0.15, 0.25); // Deep red
                    }
                } else if (petalShape > 0.3) {
                    // Between petals - medium red
                    color = vec3(0.75, 0.2, 0.25);
                } else {
                    // Petal edges - darker red
                    color = vec3(0.6, 0.15, 0.2);
                }
                
                // Star formation regions (bright knots)
                float starFormation = snoise(vec3(angle * 3.0, distFromCenter * 0.05, time * 0.1));
                if (starFormation > 0.65 && petalShape > 0.5) {
                    // Bright white/pink stars forming
                    color = mix(color, vec3(1.0, 0.8, 0.85), 0.6);
                }
                
                // Petal edge glow
                float petalBoundary = abs(sin(angle * 3.0));
                if (petalBoundary > 0.85) {
                    color = mix(color, vec3(1.0, 0.4, 0.45), 0.5);
                }
            }
            
            alpha = 0.85;
        }
        else { // NEON (Default - 0)
            float group = floor(fract(t * 3.0) * 3.0);
            if (group < 1.0) color = hsv2rgb(vec3(0.9 + 0.05 * sin(t * 10.0), 1.0, 1.0)); // Red/Pink
            else if (group < 2.0) color = hsv2rgb(vec3(0.6 + 0.05 * sin(t * 10.0), 1.0, 1.0)); // Blue
            else color = hsv2rgb(vec3(0.75 + 0.15 * sin(t * 10.0), 1.0, 1.0)); // Purple
        }
        
        gl_FragColor = vec4( color, alpha ); 
    }
`;
