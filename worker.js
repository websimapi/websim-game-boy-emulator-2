// Main emulation worker that runs the Game Boy in a separate thread
import { CPU } from './cpu.js';
import { Memory } from './memory.js';
import { PPU } from './ppu.js';
import { Timer } from './timer.js';
import { Interrupts } from './interrupts.js';

// Constants for GameBoy hardware
const CLOCK_SPEED = 4194304; // Hz
const FRAME_RATE = 60; // FPS
const CYCLES_PER_FRAME = CLOCK_SPEED / FRAME_RATE;

let gameboy = null;
let frameBuffer = null;
let isRunning = false;
let frameId = null;
let lastFrameTime = 0;
let fpsCounter = 0;
let fpsTimer = 0;
let currentFps = 0;

// Initialize frame buffer for transferring pixel data back to main thread
function initFrameBuffer() {
  frameBuffer = new Uint8Array(160 * 144 * 4); // RGBA for each pixel
}

// Handle messages from main thread
self.onmessage = function(e) {
  const { type, data } = e.data;
  
  switch (type) {
    case 'loadROM':
      try {
        initFrameBuffer();
        initGameboy(data.romData);
        self.postMessage({ type: 'romLoaded', data: { 
          title: gameboy.memory.cartridgeTitle,
          cartridgeType: gameboy.memory.cartridgeType,
          romSize: gameboy.memory.romSize,
          ramSize: gameboy.memory.ramSize
        }});
      } catch (error) {
        self.postMessage({ type: 'error', data: { message: error.message, stack: error.stack }});
      }
      break;
      
    case 'start':
      if (gameboy) {
        isRunning = true;
        startEmulationLoop();
        self.postMessage({ type: 'started' });
      } else {
        self.postMessage({ type: 'error', data: { message: 'GameBoy not initialized' }});
      }
      break;
      
    case 'pause':
      isRunning = false;
      if (frameId) {
        clearTimeout(frameId);
        frameId = null;
      }
      self.postMessage({ type: 'paused' });
      break;
      
    case 'reset':
      if (gameboy) {
        resetGameboy();
        self.postMessage({ type: 'reset' });
      }
      break;
      
    case 'step':
      if (gameboy) {
        try {
          const cycles = gameboy.step();
          sendDebugInfo();
          self.postMessage({ type: 'stepped', data: { cycles }});
        } catch (error) {
          self.postMessage({ type: 'error', data: { message: error.message, stack: error.stack }});
        }
      }
      break;
      
    case 'input':
      if (gameboy && gameboy.input) {
        if (data.pressed) {
          gameboy.input.buttonDown(data.button);
        } else {
          gameboy.input.buttonUp(data.button);
        }
      }
      break;
  }
};

// Initialize the GameBoy emulator
function initGameboy(romData) {
  const interrupts = new Interrupts();
  const input = {
    buttonStates: {
      up: false,
      down: false,
      left: false,
      right: false,
      a: false,
      b: false,
      start: false,
      select: false
    },
    buttonDown(button) {
      if (button in this.buttonStates) {
        this.buttonStates[button] = true;
      }
    },
    buttonUp(button) {
      if (button in this.buttonStates) {
        this.buttonStates[button] = false;
      }
    },
    isButtonPressed(button) {
      return button in this.buttonStates ? this.buttonStates[button] : false;
    }
  };
  
  const memory = new Memory(romData, interrupts, input);
  interrupts.memory = memory;
  
  const workerRenderer = {
    setPixel(x, y, colorId) {
      if (x < 0 || x >= 160 || y < 0 || y >= 144) return;
      
      // GameBoy colors (light to dark)
      const colors = [
        [155, 188, 15, 255],  // Lightest 
        [139, 172, 15, 255],  // Light
        [48, 98, 48, 255],    // Dark
        [15, 56, 15, 255]     // Darkest
      ];
      
      const index = (y * 160 + x) * 4;
      const color = colors[colorId & 3];
      
      frameBuffer[index] = color[0];     // R
      frameBuffer[index + 1] = color[1]; // G
      frameBuffer[index + 2] = color[2]; // B
      frameBuffer[index + 3] = color[3]; // A
    },
    
    render() {
      // Just send the frame buffer to the main thread
      self.postMessage({ 
        type: 'frame', 
        data: { 
          buffer: frameBuffer.buffer,
          fps: currentFps
        }
      }, [frameBuffer.buffer]); // Transfer the buffer to avoid copying
      
      // After transfer, we need to recreate the buffer
      frameBuffer = new Uint8Array(160 * 144 * 4);
    },
    
    clear() {
      const lightestColor = [155, 188, 15, 255];
      for (let i = 0; i < frameBuffer.length; i += 4) {
        frameBuffer[i] = lightestColor[0];
        frameBuffer[i + 1] = lightestColor[1];
        frameBuffer[i + 2] = lightestColor[2];
        frameBuffer[i + 3] = lightestColor[3];
      }
    }
  };
  
  const timer = new Timer(memory, interrupts);
  const ppu = new PPU(memory, workerRenderer);
  const cpu = new CPU(memory, interrupts);
  
  gameboy = {
    memory,
    interrupts,
    timer,
    ppu,
    cpu,
    input,
    
    step() {
      try {
        // Handle interrupts
        let cycles = this.interrupts.handle(this.cpu);
        
        // Execute next instruction if not interrupted
        if (!this.cpu.halted && cycles === 0) {
          cycles = this.cpu.executeInstruction();
        } else if (this.cpu.halted) {
          cycles = 4;
          
          // Check if an interrupt occurred to unhalt the CPU
          if (this.memory.readByte(0xFF0F) & this.memory.readByte(0xFFFF) & 0x1F) {
            this.cpu.halted = false;
          }
        }
        
        // Update timers and graphics
        this.timer.update(cycles);
        this.ppu.update(cycles);
        
        return cycles;
      } catch (error) {
        throw error;
      }
    },
    
    runFrame() {
      let cyclesThisFrame = 0;
      
      // Run enough cycles to complete a frame
      while (cyclesThisFrame < CYCLES_PER_FRAME) {
        const stepCycles = this.step();
        cyclesThisFrame += stepCycles;
      }
      
      // After the frame is complete, render the screen
      workerRenderer.render();
    },
    
    getDebugInfo() {
      return {
        pc: this.cpu.pc,
        sp: this.cpu.sp,
        a: this.cpu.a,
        f: this.cpu.f,
        fZero: this.cpu.fZero,
        fSubtract: this.cpu.fSubtract,
        fHalfCarry: this.cpu.fHalfCarry,
        fCarry: this.cpu.fCarry,
        b: this.cpu.b,
        c: this.cpu.c,
        d: this.cpu.d,
        e: this.cpu.e,
        h: this.cpu.h,
        l: this.cpu.l,
        lcdStatus: this.memory.readByte(0xFF41),
        lcdMode: this.memory.readByte(0xFF41) & 0x03,
        lcdLine: this.memory.readByte(0xFF44),
        timer: this.memory.readByte(0xFF05),
        divider: this.memory.readByte(0xFF04)
      };
    }
  };
}

// Reset the GameBoy to initial state
function resetGameboy() {
  if (gameboy) {
    gameboy.cpu.initializeRegisters();
    gameboy.memory.initializeMemory();
    
    // Stop and restart emulation if it was running
    const wasRunning = isRunning;
    isRunning = false;
    if (frameId) {
      clearTimeout(frameId);
      frameId = null;
    }
    
    if (wasRunning) {
      isRunning = true;
      startEmulationLoop();
    }
  }
}

// Send current debug information to main thread
function sendDebugInfo() {
  if (!gameboy) return;
  
  const debugInfo = gameboy.getDebugInfo();
  const pc = gameboy.cpu.pc;
  const opcode = gameboy.memory.readByte(pc);
  
  // Map common opcodes to their names for debugging
  const opcodeNames = {
    0x00: "NOP",
    0x01: "LD BC,nn",
    0x06: "LD B,n",
    0x0E: "LD C,n",
    0x11: "LD DE,nn",
    0x16: "LD D,n",
    0x1E: "LD E,n",
    0x21: "LD HL,nn",
    0x26: "LD H,n",
    0x2E: "LD L,n",
    0x31: "LD SP,nn",
    0x3E: "LD A,n",
    0x76: "HALT",
    0xC3: "JP nn",
    0xC9: "RET",
    0xCD: "CALL nn",
    0xF3: "DI",
    0xFB: "EI"
    // More would be added in a real implementation
  };
  
  const instructionContext = {
    opcode: opcode,
    name: opcodeNames[opcode] || null,
    pc: pc
  };
  
  self.postMessage({ 
    type: 'debugInfo', 
    data: { 
      debugInfo,
      instructionContext
    }
  });
}

// Start the emulation loop with proper timing
function startEmulationLoop() {
  if (!isRunning) return;
  
  const now = performance.now();
  const elapsed = now - lastFrameTime;
  
  // Calculate time until next frame (aim for 60fps)
  const frameTime = 1000 / 60; // ~16.67ms for 60fps
  const delay = Math.max(0, frameTime - (elapsed % frameTime));
  
  try {
    // Run a frame of emulation
    gameboy.runFrame();
    
    // Update FPS counter
    fpsCounter++;
    fpsTimer += elapsed;
    if (fpsTimer >= 1000) {
      currentFps = Math.round(fpsCounter * 1000 / fpsTimer);
      fpsCounter = 0;
      fpsTimer = 0;
      
      // Also send debug info periodically
      sendDebugInfo();
    }
    
    // Schedule next frame with timing to maintain target framerate
    lastFrameTime = now;
    frameId = setTimeout(startEmulationLoop, delay);
    
  } catch (error) {
    isRunning = false;
    self.postMessage({ type: 'error', data: { message: error.message, stack: error.stack }});
  }
}