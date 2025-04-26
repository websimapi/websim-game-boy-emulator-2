import { GameBoy } from './gameboy.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';

let gameboy = null;
let renderer = null;
let input = null;
let animationFrame = null;
let romData = null;
let verboseLogging = false;

// Debug utility
const Debug = {
    output: document.getElementById('debug-output'),
    
    log: function(message, type = 'normal') {
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
        if (verboseLogging) {
            this.log(`VERBOSE: ${message}`);
        }
    },
    
    clear: function() {
        this.output.innerHTML = '';
    },
    
    copyToClipboard: function() {
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

// Initialize debug element reference
window.addEventListener('DOMContentLoaded', () => {
    Debug.output = document.getElementById('debug-output');
    Debug.log('Emulator initialized and ready to load ROM');
});

document.getElementById('rom-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        romData = new Uint8Array(e.target.result);
        Debug.success(`ROM loaded: ${file.name}, Size: ${romData.length} bytes`);
        
        // Display ROM header info
        if (romData.length >= 0x150) {
            const title = Array.from(romData.slice(0x134, 0x143))
                .map(char => char ? String.fromCharCode(char) : '')
                .join('').trim();
            
            const cartridgeType = romData[0x147];
            const romSize = romData[0x148];
            const ramSize = romData[0x149];
            
            Debug.info(`ROM Title: ${title}`);
            Debug.info(`Cartridge Type: 0x${cartridgeType.toString(16).padStart(2, '0')}`);
            Debug.info(`ROM Size: 0x${romSize.toString(16).padStart(2, '0')}`);
            Debug.info(`RAM Size: 0x${ramSize.toString(16).padStart(2, '0')}`);
        }
    };
    reader.onerror = function() {
        Debug.error('Error reading ROM file');
    };
    reader.readAsArrayBuffer(file);
});

document.getElementById('start-btn').addEventListener('click', function() {
    if (!romData) {
        Debug.error('Please load a ROM file first.');
        return;
    }
    
    if (gameboy) {
        // Stop the current emulation if running
        stopEmulation();
    }
    
    startEmulation();
});

document.getElementById('pause-btn').addEventListener('click', function() {
    if (gameboy && animationFrame) {
        stopEmulation();
        Debug.info('Emulation paused');
    } else if (gameboy) {
        continueEmulation();
        Debug.info('Emulation resumed');
    }
});

document.getElementById('reset-btn').addEventListener('click', function() {
    if (gameboy) {
        stopEmulation();
        startEmulation();
        Debug.info('Emulation reset');
    }
});

document.getElementById('step-btn').addEventListener('click', function() {
    if (gameboy && !animationFrame) {
        try {
            // Run a single instruction
            const cycles = gameboy.step();
            Debug.info(`Executed single step (${cycles} cycles)`);
            updateDebugInfo();
        } catch (error) {
            Debug.error(`Error during step execution: ${error.message}`);
            console.error(error);
        }
    } else if (!gameboy) {
        Debug.error('Emulator not initialized. Please load a ROM and start emulation first.');
    } else {
        Debug.warn('Cannot step while emulation is running. Pause first.');
    }
});

document.getElementById('copy-debug').addEventListener('click', function() {
    Debug.copyToClipboard();
});

document.getElementById('clear-debug').addEventListener('click', function() {
    Debug.clear();
    Debug.log('Debug logs cleared');
});

document.getElementById('toggle-verbose').addEventListener('click', function() {
    verboseLogging = !verboseLogging;
    Debug.info(`Verbose logging ${verboseLogging ? 'enabled' : 'disabled'}`);
});

function startEmulation() {
    try {
        Debug.info('Initializing emulator...');
        const canvas = document.getElementById('screen');
        renderer = new Renderer(canvas);
        input = new Input();
        
        // Set up input buttons
        setupInputs();
        
        // Create a new GameBoy instance and load the ROM
        gameboy = new GameBoy(romData, renderer, input);
        
        // Start the emulation loop
        Debug.success('Emulation started successfully');
        continueEmulation();
    } catch (error) {
        Debug.error(`Failed to start emulation: ${error.message}`);
        console.error(error);
    }
}

function continueEmulation() {
    if (!gameboy) {
        Debug.error('Cannot continue emulation: GameBoy instance not initialized');
        return;
    }
    
    const emulationLoop = () => {
        try {
            // Run a frame of emulation
            gameboy.runFrame();
            
            // Update debug info occasionally (not every frame to avoid performance issues)
            if (Math.random() < 0.1) {  // Update roughly every 10 frames
                updateDebugInfo();
            }
            
            // Request the next frame
            animationFrame = requestAnimationFrame(emulationLoop);
        } catch (error) {
            Debug.error(`Emulation error: ${error.message}`);
            console.error(error);
            stopEmulation();
        }
    };
    
    // Start the loop
    Debug.info('Starting emulation loop');
    emulationLoop();
}

function stopEmulation() {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
        Debug.info('Emulation loop stopped');
    }
}

function setupInputs() {
    // D-Pad
    document.getElementById('btn-up').addEventListener('mousedown', () => input.buttonDown('up'));
    document.getElementById('btn-up').addEventListener('mouseup', () => input.buttonUp('up'));
    document.getElementById('btn-right').addEventListener('mousedown', () => input.buttonDown('right'));
    document.getElementById('btn-right').addEventListener('mouseup', () => input.buttonUp('right'));
    document.getElementById('btn-down').addEventListener('mousedown', () => input.buttonDown('down'));
    document.getElementById('btn-down').addEventListener('mouseup', () => input.buttonUp('down'));
    document.getElementById('btn-left').addEventListener('mousedown', () => input.buttonDown('left'));
    document.getElementById('btn-left').addEventListener('mouseup', () => input.buttonUp('left'));
    
    // Action buttons
    document.getElementById('btn-a').addEventListener('mousedown', () => input.buttonDown('a'));
    document.getElementById('btn-a').addEventListener('mouseup', () => input.buttonUp('a'));
    document.getElementById('btn-b').addEventListener('mousedown', () => input.buttonDown('b'));
    document.getElementById('btn-b').addEventListener('mouseup', () => input.buttonUp('b'));
    
    // Menu buttons
    document.getElementById('btn-start').addEventListener('mousedown', () => input.buttonDown('start'));
    document.getElementById('btn-start').addEventListener('mouseup', () => input.buttonUp('start'));
    document.getElementById('btn-select').addEventListener('mousedown', () => input.buttonDown('select'));
    document.getElementById('btn-select').addEventListener('mouseup', () => input.buttonUp('select'));
    
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        switch (e.key) {
            case 'ArrowUp': input.buttonDown('up'); break;
            case 'ArrowRight': input.buttonDown('right'); break;
            case 'ArrowDown': input.buttonDown('down'); break;
            case 'ArrowLeft': input.buttonDown('left'); break;
            case 'z': input.buttonDown('a'); break;
            case 'x': input.buttonDown('b'); break;
            case 'Enter': input.buttonDown('start'); break;
            case 'Shift': input.buttonDown('select'); break;
        }
    });
    
    document.addEventListener('keyup', (e) => {
        switch (e.key) {
            case 'ArrowUp': input.buttonUp('up'); break;
            case 'ArrowRight': input.buttonUp('right'); break;
            case 'ArrowDown': input.buttonUp('down'); break;
            case 'ArrowLeft': input.buttonUp('left'); break;
            case 'z': input.buttonUp('a'); break;
            case 'x': input.buttonUp('b'); break;
            case 'Enter': input.buttonUp('start'); break;
            case 'Shift': input.buttonUp('select'); break;
        }
    });
    
    Debug.info('Input controls initialized');
}

function updateDebugInfo() {
    if (!gameboy) return;
    
    try {
        const debugInfo = gameboy.getDebugInfo();
        
        const instructionContext = gameboy.getInstructionContext();
        
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
        
        if (verboseLogging) {
            Debug.log(debugOutput);
        } else {
            document.getElementById('debug-output').lastChild.textContent = debugOutput;
        }
    } catch (error) {
        Debug.error(`Error updating debug info: ${error.message}`);
        console.error(error);
    }
}

// Global error handler
window.addEventListener('error', function(event) {
    Debug.error(`Unhandled error: ${event.message} at ${event.filename}:${event.lineno}`);
});

// Initialize debug when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    Debug.log('Game Boy Emulator initialized. Load a ROM to begin.');
});