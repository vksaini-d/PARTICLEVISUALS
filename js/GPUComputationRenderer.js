import * as THREE from 'three';

export class GPUComputationRenderer {
    constructor(sizeX, sizeY, renderer) {
        this.variables = [];
        this.currentTextureIndex = 0;
        
        const scene = new THREE.Scene();
        const camera = new THREE.Camera();
        camera.position.z = 1;
        
        const passThruUniforms = { passThruTexture: { value: null } };
        const passThruShader = createShaderMaterial(
            `void main() { gl_Position = vec4( position, 1.0 ); }`,
            `uniform sampler2D passThruTexture;
            void main() { gl_FragColor = texture2D( passThruTexture, gl_FragCoord.xy / resolution.xy ); }`,
            passThruUniforms
        );
        
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), passThruShader);
        scene.add(mesh);

        this.addVariable = function(variableName, computeFragmentShader, initialValueTexture) {
            const material = createShaderMaterial(
                `void main() { gl_Position = vec4( position, 1.0 ); }`,
                computeFragmentShader,
                {} 
            );
            const variable = {
                name: variableName,
                initialValueTexture: initialValueTexture,
                material: material,
                dependencies: null,
                renderTargets: [],
                wrapS: null,
                wrapT: null,
                minFilter: THREE.NearestFilter,
                magFilter: THREE.NearestFilter
            };
            this.variables.push(variable);
            return variable;
        };

        this.setVariableDependencies = function(variable, dependencies) {
            variable.dependencies = dependencies;
        };

        this.init = function() {
            if (renderer.capabilities.isWebGL2 === false && renderer.extensions.has('OES_texture_float') === false) {
                return "No OES_texture_float support for float textures.";
            }
            if (renderer.capabilities.maxVertexTextures === 0) {
                return "No support for vertex shader textures.";
            }
            
            for (let i = 0; i < this.variables.length; i++) {
                const variable = this.variables[i];
                variable.renderTargets[0] = createRenderTarget(sizeX, sizeY, variable.wrapS, variable.wrapT, variable.minFilter, variable.magFilter);
                variable.renderTargets[1] = createRenderTarget(sizeX, sizeY, variable.wrapS, variable.wrapT, variable.minFilter, variable.magFilter);
                
                renderTexture(variable.initialValueTexture, variable.renderTargets[0]);
                renderTexture(variable.initialValueTexture, variable.renderTargets[1]);
                
                const material = variable.material;
                const uniforms = material.uniforms;
                if (variable.dependencies !== null) {
                    for (let d = 0; d < variable.dependencies.length; d++) {
                        const depVar = variable.dependencies[d];
                        if (uniforms[depVar.name] === undefined) {
                            uniforms[depVar.name] = { value: null };
                            material.fragmentShader = "\nuniform sampler2D " + depVar.name + ";\n" + material.fragmentShader;
                        }
                    }
                }
            }
            
            this.currentTextureIndex = 0;
            return null;
        };

        this.compute = function() {
            const currentTextureIndex = this.currentTextureIndex;
            const nextTextureIndex = this.currentTextureIndex === 0 ? 1 : 0;

            for (let i = 0; i < this.variables.length; i++) {
                const variable = this.variables[i];

                // 1. Switch Material
                if (mesh.material !== variable.material) {
                    mesh.material = variable.material;
                }

                // 2. Update Uniforms (Inputs)
                if (variable.dependencies !== null) {
                    const uniforms = variable.material.uniforms;
                    for (let d = 0; d < variable.dependencies.length; d++) {
                        const depVar = variable.dependencies[d];
                        if (uniforms[depVar.name]) {
                            // Point input uniform to the CURRENT texture
                            uniforms[depVar.name].value = depVar.renderTargets[currentTextureIndex].texture;
                        }
                    }
                }
                
                // 3. Set Render Target (Output) -> NEXT texture
                renderer.setRenderTarget(variable.renderTargets[nextTextureIndex]);
                renderer.render(scene, camera);
            }
            
            // 4. Cleanup: Unbind framebuffer to prevent feedback loop errors in next pass
            renderer.setRenderTarget(null);
            
            this.currentTextureIndex = nextTextureIndex;
        };

        this.getCurrentRenderTarget = function(variable) {
            return variable.renderTargets[this.currentTextureIndex];
        };
        
        this.createTexture = function() {
            const data = new Float32Array( sizeX * sizeY * 4 );
            return new THREE.DataTexture( data, sizeX, sizeY, THREE.RGBAFormat, THREE.FloatType );
        };

        function createShaderMaterial(vs, fs, uniforms) {
            return new THREE.ShaderMaterial({
                uniforms: uniforms,
                vertexShader: vs,
                fragmentShader: fs, 
                defines: {
                    resolution: 'vec2(' + sizeX.toFixed(1) + ',' + sizeY.toFixed(1) + ')'
                }
            });
        }

        function createRenderTarget(sizeX, sizeY, wrapS, wrapT, minFilter, magFilter) {
            return new THREE.WebGLRenderTarget(sizeX, sizeY, {
                wrapS: wrapS || THREE.ClampToEdgeWrapping,
                wrapT: wrapT || THREE.ClampToEdgeWrapping,
                minFilter: minFilter || THREE.NearestFilter,
                magFilter: magFilter || THREE.NearestFilter,
                format: THREE.RGBAFormat,
                type: THREE.FloatType,
                depthBuffer: false,
                stencilBuffer: false // Ensure no extra buffers
            });
        }

        function renderTexture(input, output) {
            mesh.material = passThruShader;
            passThruUniforms.passThruTexture.value = input;
            renderer.setRenderTarget(output);
            renderer.render(scene, camera);
            passThruUniforms.passThruTexture.value = null;
        }
        this.dispose = function() {
            mesh.geometry.dispose();
            mesh.material.dispose();
            
            for (let i = 0; i < this.variables.length; i++) {
                const variable = this.variables[i];
                if (variable.initialValueTexture) variable.initialValueTexture.dispose();
                variable.material.dispose();
                if (variable.renderTargets) {
                    variable.renderTargets[0].dispose();
                    variable.renderTargets[1].dispose();
                }
            }
            this.variables = [];
        };
    }
}
