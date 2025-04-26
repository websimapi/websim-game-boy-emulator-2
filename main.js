// Main thread code that communicates with the emulation worker
let worker = null;
let gameCanvas = null;
let glRenderer = null;
const Debug = {
    output: null,
    log: function(message, type = 'normal') {
        if (!this.output) this.output = document.getElementById('debug-output');
        const timestamp = new Date().toISOString().substring(11, 23);
        const logElement = document.createElement('div');
        logElement.classList.add(type);
        logElement.textContent = `[${timestamp}] ${message}`;
        this.output.appendChild(logElement);
        this.output.scrollTop = this.output.scrollHeight;
    },
    error: function(message) {
        this.log(`ERROR: ${message}`, 'error');
        console.error(message);
    },
    warn: function(message) {
        this.log(`WARNING: ${message}`, 'warning');
        console.warn(message);
    },
    info: function(message) {
        this.log(`INFO: ${message}`, 'info');
        console.info(message);
    },
    success: function(message) {
        this.log(`SUCCESS: ${message}`, 'success');
        console.log(message);
    },
    verbose: function(message) {
        if (window.verboseLogging) {
            this.log(`VERBOSE: ${message}`);
        }
    },
    clear: function() {
        if (this.output) this.output.innerHTML = '';
    },
    copyToClipboard: function() {
        if (!this.output) return;
        const text = this.output.innerText;
        navigator.clipboard.writeText(text)
            .then(() => {
                this.success('Debug logs copied to clipboard!');
            })
            .catch(err => {
                this.error('Failed to copy logs: ' + err);
            });
    }
};

// WebGL renderer for GPU-accelerated rendering
class WebGLRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl', { antialias: false });
        
        if (!this.gl) {
            throw new Error('WebGL not supported');
        }
        
        this.initGL();
        this.createTexture();
        Debug.info('WebGL renderer initialized successfully');
    }
    
    initGL() {
        const gl = this.gl;
        
        // Create shader program
        const vertexShaderSource = `
            attribute vec2 a_position;
            attribute vec2 a_texCoord;
            varying vec2 v_texCoord;
            
            void main() {
                gl_Position = vec4(a_position, 0, 1);
                v_texCoord = a_texCoord;
            }
        `;
        
        const fragmentShaderSource = `
            precision mediump float;
            varying vec2 v_texCoord;
            uniform sampler2D u_texture;
            
            void main() {
                gl_FragColor = texture2D(u_texture, v_texCoord);
            }
        `;
        
        // Compile shaders
        const vertexShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertexShader, vertexShaderSource);
        gl.compileShader(vertexShader);
        
        const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragmentShader, fragmentShaderSource);
        gl.compileShader(fragmentShader);
        
        // Create program
        this.program = gl.createProgram();
        gl.attachShader(this.program, vertexShader);
        gl.attachShader(this.program, fragmentShader);
        gl.linkProgram(this.program);
        
        // Check for shader errors
        if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
            console.error('Vertex shader error:', gl.getShaderInfoLog(vertexShader));
        }
        
        if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
            console.error('Fragment shader error:', gl.getShaderInfoLog(fragmentShader));
        }
        
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(this.program));
        }
        
        gl.useProgram(this.program);
        
        // Set up buffers for rendering a textured quad
        const positions = new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            1, 1
        ]);
        
        const texCoords = new Float32Array([
            0, 1,
            1, 1,
            0, 0,
            1, 0
        ]);
        
        // Create and bind position buffer
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        
        const positionLocation = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        
        // Create and bind texture coordinate buffer
        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
        
        const texCoordLocation = gl.getAttribLocation(this.program, 'a_texCoord');
        gl.enableVertexAttribArray(texCoordLocation);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);
    }
    
    createTexture() {
        const gl = this.gl;
        
        // Create a texture to render to
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        
        // Set texture parameters
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        
        // Initialize with empty image (green background)
        const emptyData = new Uint8Array(160 * 144 * 4);
        for (let i = 0; i < emptyData.length; i += 4) {
            emptyData[i] = 155;     // R
            emptyData[i + 1] = 188;  // G
            emptyData[i + 2] = 15;   // B
            emptyData[i + 3] = 255;  // A
        }
        
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            160,
            144,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            emptyData
        );
    }
    
    updateTexture(frameBuffer) {
        const gl = this.gl;
        
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            160,
            144,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            frameBuffer
        );
    }
    
    render() {
        const gl = this.gl;
        
        // Set viewport and clear
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        
        // Draw the textured quad
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
}

// Initialize application
window.addEventListener('DOMContentLoaded', () => {
    Debug.output = document.getElementById('debug-output');
    Debug.log('Emulator initialized and ready to load ROM');
    
    gameCanvas = document.getElementById('screen');
    
    // Set up event listeners
    document.getElementById('rom-input').addEventListener('change', handleRomFileSelect);
    document.getElementById('start-btn').addEventListener('click', handleStartEmulation);
    document.getElementById('pause-btn').addEventListener('click', handlePauseEmulation);
    document.getElementById('reset-btn').addEventListener('click', handleResetEmulation);
    document.getElementById('step-btn').addEventListener('click', handleStepEmulation);
    document.getElementById('copy-debug').addEventListener('click', () => Debug.copyToClipboard());
    document.getElementById('clear-debug').addEventListener('click', () => Debug.clear());
    document.getElementById('toggle-verbose').addEventListener('click', toggleVerboseLogging);
    
    setupInputHandlers();
});

// Handle ROM file selection
function handleRomFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const romData = new Uint8Array(e.target.result);
        Debug.success(`ROM loaded: ${file.name}, Size: ${romData.length} bytes`);
        
        // Initialize WebGL renderer
        try {
            glRenderer = new WebGLRenderer(gameCanvas);
        } catch (error) {
            Debug.error(`Failed to initialize WebGL: ${error.message}`);
            Debug.warn('Falling back to Canvas 2D renderer');
        }
        
        // Initialize worker
        initWorker(romData);
    };
    reader.onerror = function() {
        Debug.error('Error reading ROM file');
    };
    reader.readAsArrayBuffer(file);
}

// Initialize the worker with the ROM data
function initWorker(romData) {
    if (worker) {
        worker.terminate();
    }
    
    try {
        worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
        
        worker.onmessage = handleWorkerMessage;
        worker.onerror = (error) => {
            Debug.error(`Worker error: ${error.message}`);
        };
        
        // Send ROM data to worker
        worker.postMessage({
            type: 'loadROM',
            data: { romData }
        });
        
        Debug.info('Emulation worker initialized');
    } catch (error) {
        Debug.error(`Failed to initialize worker: ${error.message}`);
    }
}

// Handle messages from the worker
function handleWorkerMessage(e) {
    const { type, data } = e.data;
    
    switch (type) {
        case 'romLoaded':
            Debug.info(`ROM Title: ${data.title}`);
            Debug.info(`Cartridge Type: 0x${data.cartridgeType.toString(16).padStart(2, '0')}`);
            Debug.info(`ROM Size: 0x${data.romSize.toString(16).padStart(2, '0')}`);
            Debug.info(`RAM Size: 0x${data.ramSize.toString(16).padStart(2, '0')}`);
            break;
            
        case 'frame':
            // Update frame counter if provided
            if (data.fps) {
                document.getElementById('fps-counter').textContent = `${data.fps} FPS`;
            }
            
            // Render the frame
            if (glRenderer) {
                // Use GPU-accelerated WebGL rendering
                const frameBuffer = new Uint8Array(data.buffer);
                glRenderer.updateTexture(frameBuffer);
                glRenderer.render();
            } else {
                // Fallback to 2D canvas
                const frameBuffer = new Uint8Array(data.buffer);
                const ctx = gameCanvas.getContext('2d');
                const imageData = ctx.createImageData(160, 144);
                imageData.data.set(frameBuffer);
                ctx.putImageData(imageData, 0, 0);
            }
            break;
            
        case 'debugInfo':
            updateDebugDisplay(data.debugInfo, data.instructionContext);
            break;
            
        case 'error':
            Debug.error(`Emulation error: ${data.message}`);
            console.error(data.stack);
            break;
            
        case 'started':
            Debug.success('Emulation started successfully');
            break;
            
        case 'paused':
            Debug.info('Emulation paused');
            break;
            
        case 'reset':
            Debug.info('Emulation reset');
            break;
            
        case 'stepped':
            Debug.info(`Executed single step (${data.cycles} cycles)`);
            break;
    }
}

// Display updated debug information
function updateDebugDisplay(debugInfo, instructionContext) {
    if (!debugInfo) return;
    
    let debugOutput = `${'-'.repeat(40)}\n`;
    debugOutput += `PC: 0x${debugInfo.pc.toString(16).padStart(4, '0')} | `;
    debugOutput += `SP: 0x${debugInfo.sp.toString(16).padStart(4, '0')} | `;
    debugOutput += `Flags: ${debugInfo.f.toString(2).padStart(8, '0')} `;
    debugOutput += `[${debugInfo.fZero ? 'Z' : '-'}${debugInfo.fSubtract ? 'N' : '-'}${debugInfo.fHalfCarry ? 'H' : '-'}${debugInfo.fCarry ? 'C' : '-'}]`;
    debugOutput += '\n';
    
    debugOutput += `A: 0x${debugInfo.a.toString(16).padStart(2, '0')} | `;
    debugOutput += `B: 0x${debugInfo.b.toString(16).padStart(2, '0')} | `;
    debugOutput += `C: 0x${debugInfo.c.toString(16).padStart(2, '0')} | `;
    debugOutput += `D: 0x${debugInfo.d.toString(16).padStart(2, '0')} | `;
    debugOutput += `E: 0x${debugInfo.e.toString(16).padStart(2, '0')} | `;
    debugOutput += `H: 0x${debugInfo.h.toString(16).padStart(2, '0')} | `;
    debugOutput += `L: 0x${debugInfo.l.toString(16).padStart(2, '0')}`;
    debugOutput += '\n';
    
    if (instructionContext) {
        debugOutput += `Next Opcode: 0x${instructionContext.opcode.toString(16).padStart(2, '0')} `;
        if (instructionContext.name) {
            debugOutput += `(${instructionContext.name})`;
        }
    }
    
    debugOutput += '\n';
    debugOutput += `LCD Status: 0x${debugInfo.lcdStatus.toString(16).padStart(2, '0')} | `;
    debugOutput += `LCD Mode: ${debugInfo.lcdMode} | `;
    debugOutput += `LCD Line: ${debugInfo.lcdLine} | `;
    debugOutput += `Timer: ${debugInfo.timer} | `;
    debugOutput += `Divider: ${debugInfo.divider}`;
    
    if (window.verboseLogging) {
        Debug.log(debugOutput);
    } else {
        const lastChild = document.getElementById('debug-output').lastChild;
        if (lastChild && lastChild.textContent.startsWith('--')) {
            lastChild.textContent = debugOutput;
        } else {
            Debug.log(debugOutput);
        }
    }
}

// Handle start button click
function handleStartEmulation() {
    if (!worker) {
        Debug.error('Please load a ROM file first.');
        return;
    }
    
    worker.postMessage({ type: 'start' });
}

// Handle pause button click
function handlePauseEmulation() {
    if (!worker) return;
    
    worker.postMessage({ type: 'pause' });
}

// Handle reset button click
function handleResetEmulation() {
    if (!worker) return;
    
    worker.postMessage({ type: 'reset' });
}

// Handle step button click
function handleStepEmulation() {
    if (!worker) {
        Debug.error('Please load a ROM file first.');
        return;
    }
    
    worker.postMessage({ type: 'step' });
}

// Toggle verbose logging
function toggleVerboseLogging() {
    window.verboseLogging = !window.verboseLogging;
    Debug.info(`Verbose logging ${window.verboseLogging ? 'enabled' : 'disabled'}`);
}

// Set up input handlers for gamepad buttons
function setupInputHandlers() {
    // Map DOM elements to Game Boy buttons
    const buttonElements = {
        'btn-up': 'up',
        'btn-right': 'right',
        'btn-down': 'down',
        'btn-left': 'left',
        'btn-a': 'a',
        'btn-b': 'b',
        'btn-start': 'start',
        'btn-select': 'select'
    };
    
    // Set up mouse events for on-screen buttons
    for (const [elementId, buttonName] of Object.entries(buttonElements)) {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener('mousedown', () => sendInputToWorker(buttonName, true));
            element.addEventListener('mouseup', () => sendInputToWorker(buttonName, false));
            element.addEventListener('touchstart', (e) => {
                e.preventDefault();
                sendInputToWorker(buttonName, true);
            });
            element.addEventListener('touchend', (e) => {
                e.preventDefault();
                sendInputToWorker(buttonName, false);
            });
        }
    }
    
    // Keyboard controls
    const keyMap = {
        'ArrowUp': 'up',
        'ArrowRight': 'right',
        'ArrowDown': 'down',
        'ArrowLeft': 'left',
        'z': 'a',
        'x': 'b',
        'Enter': 'start',
        'Shift': 'select'
    };
    
    document.addEventListener('keydown', (e) => {
        if (keyMap[e.key]) {
            sendInputToWorker(keyMap[e.key], true);
        }
    });
    
    document.addEventListener('keyup', (e) => {
        if (keyMap[e.key]) {
            sendInputToWorker(keyMap[e.key], false);
        }
    });
    
    Debug.info('Input controls initialized');
}

// Send input events to the worker
function sendInputToWorker(button, pressed) {
    if (!worker) return;
    
    worker.postMessage({
        type: 'input',
        data: { button, pressed }
    });
}

// Global error handler
window.addEventListener('error', function(event) {
    Debug.error(`Unhandled error: ${event.message} at ${event.filename}:${event.lineno}`);
});