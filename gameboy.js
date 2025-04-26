// This is the main coordinator class that connects all components
import { CPU } from './cpu.js';
import { Memory } from './memory.js';
import { PPU } from './ppu.js';
import { Timer } from './timer.js';
import { Interrupts } from './interrupts.js';

// Constants for GameBoy hardware
const CLOCK_SPEED = 4194304; // Hz
const FRAME_RATE = 60; // FPS
const CYCLES_PER_FRAME = CLOCK_SPEED / FRAME_RATE;

export class GameBoy {
    constructor(romData, renderer, input) {
        this.renderer = renderer;
        this.input = input;
        
        // Initialize components
        this.interrupts = new Interrupts();
        this.memory = new Memory(romData, this.interrupts, input);
        this.ppu = new PPU(this.memory, renderer);
        this.timer = new Timer(this.memory, this.interrupts);
        this.cpu = new CPU(this.memory, this.interrupts);
        
        // Initialize state
        this.halted = false;
        this.stopped = false;
        
        console.log(`Loaded ROM: ${this.memory.cartridgeTitle}`);
        console.log(`Cartridge Type: ${this.memory.cartridgeType.toString(16)}`);
        console.log(`ROM Size: ${this.memory.romSize.toString(16)}`);
        console.log(`RAM Size: ${this.memory.ramSize.toString(16)}`);
    }
    
    // Run a single machine cycle
    step() {
        // Handle interrupts
        let cycles = this.cpu.handleInterrupts();
        
        // If no interrupt was serviced or if CPU is halted, execute the next instruction
        if (!this.halted && !this.stopped && cycles === 0) {
            cycles = this.cpu.executeInstruction();
        } else if (this.halted) {
            // If CPU is halted, we still need to count cycles
            cycles = 4;
            
            // Check if an interrupt occurred to unhalt the CPU
            if (this.memory.readByte(0xFF0F) & this.memory.readByte(0xFFFF) & 0x1F) {
                this.halted = false;
            }
        }
        
        // Update timers
        this.timer.update(cycles);
        
        // Update graphics
        this.ppu.update(cycles);
        
        return cycles;
    }
    
    // Run the emulation for a single frame
    runFrame() {
        let cyclesThisFrame = 0;
        
        while (cyclesThisFrame < CYCLES_PER_FRAME) {
            cyclesThisFrame += this.step();
        }
        
        // After the frame is complete, render the screen
        this.renderer.render();
    }
    
    // Get debug information
    getDebugInfo() {
        return {
            pc: this.cpu.pc,
            sp: this.cpu.sp,
            a: this.cpu.a,
            f: this.cpu.f,
            b: this.cpu.b,
            c: this.cpu.c,
            d: this.cpu.d,
            e: this.cpu.e,
            h: this.cpu.h,
            l: this.cpu.l,
            lcdStatus: this.memory.readByte(0xFF41)
        };
    }
}