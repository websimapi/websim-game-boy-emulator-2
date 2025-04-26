import { GameBoy } from './gameboy.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';

let gameboy = null;
let renderer = null;
let input = null;
let animationFrame = null;
let romData = null;

document.getElementById('rom-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        romData = new Uint8Array(e.target.result);
        document.getElementById('debug-output').textContent = `ROM loaded: ${file.name}, Size: ${romData.length} bytes`;
    };
    reader.readAsArrayBuffer(file);
});

document.getElementById('start-btn').addEventListener('click', function() {
    if (!romData) {
        alert('Please load a ROM file first.');
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
    } else if (gameboy) {
        continueEmulation();
    }
});

document.getElementById('reset-btn').addEventListener('click', function() {
    if (gameboy) {
        stopEmulation();
        startEmulation();
    }
});

function startEmulation() {
    const canvas = document.getElementById('screen');
    renderer = new Renderer(canvas);
    input = new Input();
    
    // Set up input buttons
    setupInputs();
    
    // Create a new GameBoy instance and load the ROM
    gameboy = new GameBoy(romData, renderer, input);
    
    // Start the emulation loop
    continueEmulation();
    
    document.getElementById('debug-output').textContent += '\nEmulation started!';
}

function continueEmulation() {
    if (!gameboy) return;
    
    const emulationLoop = () => {
        // Run a frame of emulation
        gameboy.runFrame();
        
        // Update debug info
        updateDebugInfo();
        
        // Request the next frame
        animationFrame = requestAnimationFrame(emulationLoop);
    };
    
    // Start the loop
    emulationLoop();
}

function stopEmulation() {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
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
}

function updateDebugInfo() {
    if (!gameboy) return;
    
    const debugInfo = gameboy.getDebugInfo();
    document.getElementById('debug-output').textContent = `
        PC: ${debugInfo.pc.toString(16)}
        SP: ${debugInfo.sp.toString(16)}
        A: ${debugInfo.a.toString(16)}
        F: ${debugInfo.f.toString(16)}
        B: ${debugInfo.b.toString(16)}
        C: ${debugInfo.c.toString(16)}
        D: ${debugInfo.d.toString(16)}
        E: ${debugInfo.e.toString(16)}
        H: ${debugInfo.h.toString(16)}
        L: ${debugInfo.l.toString(16)}
        LCD Status: ${debugInfo.lcdStatus}
    `;
}

