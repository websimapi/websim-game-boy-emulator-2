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
        
        // Initialize components in the correct order with proper references
        this.interrupts = new Interrupts(); // Create interrupts first
        this.memory = new Memory(romData, this.interrupts, input);
        this.interrupts.memory = this.memory; // Now connect memory to interrupts
        this.timer = new Timer(this.memory, this.interrupts);
        this.ppu = new PPU(this.memory, renderer);
        this.cpu = new CPU(this.memory, this.interrupts);
        
        // Initialize state
        this.halted = false;
        this.stopped = false;
        this.totalCycles = 0;
        
        // Debug information
        this.lastExecutedInstruction = null;
        
        // Log initialization
        console.log(`Loaded ROM: ${this.memory.cartridgeTitle}`);
        console.log(`Cartridge Type: ${this.memory.cartridgeType.toString(16)}`);
        console.log(`ROM Size: ${this.memory.romSize.toString(16)}`);
        console.log(`RAM Size: ${this.memory.ramSize.toString(16)}`);
    }
    
    // Run a single machine cycle
    step() {
        try {
            // Handle interrupts
            let cycles = this.interrupts.handle(this.cpu);
            
            // If no interrupt was serviced or if CPU is halted, execute the next instruction
            if (!this.halted && !this.stopped && cycles === 0) {
                // Save information about the current instruction for debugging
                const pc = this.cpu.pc;
                const opcode = this.memory.readByte(pc);
                
                cycles = this.cpu.executeInstruction();
                
                // Save the executed instruction info for debugging
                this.lastExecutedInstruction = {
                    pc: pc,
                    opcode: opcode,
                    cycles: cycles,
                    // Add any additional info you want for debugging
                };
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
            
            // Track total cycles for debugging
            this.totalCycles += cycles;
            
            return cycles;
        } catch (error) {
            console.error(`Error in step() at PC=${this.cpu.pc.toString(16)}: ${error.message}`);
            throw error; // Re-throw to be caught by the main loop
        }
    }
    
    // Run the emulation for a single frame
    runFrame() {
        let cyclesThisFrame = 0;
        
        while (cyclesThisFrame < CYCLES_PER_FRAME) {
            const stepCycles = this.step();
            cyclesThisFrame += stepCycles;
        }
        
        // After the frame is complete, render the screen
        this.renderer.render();
    }
    
    // Get instruction context for debugging
    getInstructionContext() {
        try {
            const pc = this.cpu.pc;
            const opcode = this.memory.readByte(pc);
            
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
                // Add more as needed
            };
            
            return {
                opcode: opcode,
                name: opcodeNames[opcode] || null,
                pc: pc
            };
        } catch (error) {
            console.error("Error getting instruction context:", error);
            return null;
        }
    }
    
    // Get debug information
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
            divider: this.memory.readByte(0xFF04),
            totalCycles: this.totalCycles,
            lastInstruction: this.lastExecutedInstruction
        };
    }
}