// CPU implementation for Game Boy emulator
export class CPU {
    constructor(memory, interrupts) {
        this.memory = memory;
        this.interrupts = interrupts;
        this.halted = false;
        
        // Initialize registers
        this.initializeRegisters();
        
        // For debugging
        this.instructionMap = this.buildInstructionMap();
    }
    
    initializeRegisters() {
        // Main registers
        this.a = 0x01;
        this.b = 0x00;
        this.c = 0x13;
        this.d = 0x00;
        this.e = 0xD8;
        this.h = 0x01;
        this.l = 0x4D;
        
        // Flag register (lower 4 bits of F)
        this.fZero = false;     // Zero flag
        this.fSubtract = false; // Subtract/Negative flag
        this.fHalfCarry = false; // Half Carry flag
        this.fCarry = false;    // Carry flag
        
        // Program counter and stack pointer
        this.pc = 0x0100; // Start execution at 0x0100 (after boot ROM)
        this.sp = 0xFFFE; // Initialize stack pointer at top of memory
    }
    
    // Pack the F register flags into a byte
    get f() {
        return (this.fZero ? 0x80 : 0x00) |
               (this.fSubtract ? 0x40 : 0x00) |
               (this.fHalfCarry ? 0x20 : 0x00) |
               (this.fCarry ? 0x10 : 0x00);
    }
    
    // Set the F register flags from a byte
    set f(value) {
        this.fZero = !!(value & 0x80);
        this.fSubtract = !!(value & 0x40);
        this.fHalfCarry = !!(value & 0x20);
        this.fCarry = !!(value & 0x10);
    }
    
    buildInstructionMap() {
        // Map opcodes to their cycle counts and names
        // This will help with debugging
        const map = {};
        
        // Standard opcodes (partial list)
        map[0x00] = { cycles: 4, name: "NOP" };
        map[0x01] = { cycles: 12, name: "LD BC,nn" };
        map[0x06] = { cycles: 8, name: "LD B,n" };
        map[0x0E] = { cycles: 8, name: "LD C,n" };
        map[0x11] = { cycles: 12, name: "LD DE,nn" };
        map[0x16] = { cycles: 8, name: "LD D,n" };
        map[0x1E] = { cycles: 8, name: "LD E,n" };
        map[0x21] = { cycles: 12, name: "LD HL,nn" };
        map[0x26] = { cycles: 8, name: "LD H,n" };
        map[0x2E] = { cycles: 8, name: "LD L,n" };
        map[0x31] = { cycles: 12, name: "LD SP,nn" };
        map[0x3E] = { cycles: 8, name: "LD A,n" };
        map[0x76] = { cycles: 4, name: "HALT" };
        map[0xAF] = { cycles: 4, name: "XOR A" };
        map[0xC3] = { cycles: 16, name: "JP nn" };
        map[0xC9] = { cycles: 16, name: "RET" };
        map[0xCD] = { cycles: 24, name: "CALL nn" };
        map[0xE0] = { cycles: 12, name: "LDH (n),A" };
        map[0xF0] = { cycles: 12, name: "LDH A,(n)" };
        map[0xF3] = { cycles: 4, name: "DI" };
        map[0xFB] = { cycles: 4, name: "EI" };
        
        return map;
    }
    
    // Helper for 8-bit ALU operations
    addA(value) {
        const result = this.a + value;
        
        // Set flags
        this.fZero = (result & 0xFF) === 0;
        this.fSubtract = false;
        this.fHalfCarry = ((this.a & 0x0F) + (value & 0x0F)) > 0x0F;
        this.fCarry = result > 0xFF;
        
        this.a = result & 0xFF;
    }
    
    subA(value) {
        const result = this.a - value;
        
        // Set flags
        this.fZero = (result & 0xFF) === 0;
        this.fSubtract = true;
        this.fHalfCarry = ((this.a & 0x0F) - (value & 0x0F)) < 0;
        this.fCarry = result < 0;
        
        this.a = result & 0xFF;
    }
    
    andA(value) {
        this.a &= value;
        
        // Set flags
        this.fZero = this.a === 0;
        this.fSubtract = false;
        this.fHalfCarry = true;
        this.fCarry = false;
    }
    
    orA(value) {
        this.a |= value;
        
        // Set flags
        this.fZero = this.a === 0;
        this.fSubtract = false;
        this.fHalfCarry = false;
        this.fCarry = false;
    }
    
    xorA(value) {
        this.a ^= value;
        
        // Set flags
        this.fZero = this.a === 0;
        this.fSubtract = false;
        this.fHalfCarry = false;
        this.fCarry = false;
    }
    
    cpA(value) {
        // Compare - like subA but doesn't store result
        const result = this.a - value;
        
        // Set flags
        this.fZero = (result & 0xFF) === 0;
        this.fSubtract = true;
        this.fHalfCarry = ((this.a & 0x0F) - (value & 0x0F)) < 0;
        this.fCarry = result < 0;
    }
    
    // Handle interrupts
    handleInterrupts() {
        if (!this.interrupts) {
            console.error("CPU: Interrupts not initialized");
            return 0;
        }
        return this.interrupts.handle(this);
    }
    
    // CPU instruction execution
    executeInstruction() {
        try {
            // Fetch opcode
            const opcode = this.memory.readByte(this.pc++);
            
            // Track cycles this instruction takes
            let cycles = 0;
            
            // For debugging
            if (this.instructionMap[opcode]) {
                console.debug(`Executing ${this.instructionMap[opcode].name} (0x${opcode.toString(16)}) at PC: 0x${(this.pc-1).toString(16).padStart(4, '0')}`);
            } else {
                console.debug(`Executing unknown opcode 0x${opcode.toString(16)} at PC: 0x${(this.pc-1).toString(16).padStart(4, '0')}`);
            }
            
            // Execute instruction
            switch (opcode) {
                // NOP
                case 0x00:
                    // No operation
                    cycles = 4;
                    break;
                
                // LD instructions
                case 0x06: // LD B, n
                    this.b = this.memory.readByte(this.pc++);
                    cycles = 8;
                    break;
                    
                case 0x0E: // LD C, n
                    this.c = this.memory.readByte(this.pc++);
                    cycles = 8;
                    break;
                
                case 0x16: // LD D, n
                    this.d = this.memory.readByte(this.pc++);
                    cycles = 8;
                    break;
                
                case 0x1E: // LD E, n
                    this.e = this.memory.readByte(this.pc++);
                    cycles = 8;
                    break;
                
                case 0x26: // LD H, n
                    this.h = this.memory.readByte(this.pc++);
                    cycles = 8;
                    break;
                
                case 0x2E: // LD L, n
                    this.l = this.memory.readByte(this.pc++);
                    cycles = 8;
                    break;
                
                case 0x3E: // LD A, n
                    this.a = this.memory.readByte(this.pc++);
                    cycles = 8;
                    break;
                
                // 16-bit loads
                case 0x01: // LD BC, nn
                    this.c = this.memory.readByte(this.pc++);
                    this.b = this.memory.readByte(this.pc++);
                    cycles = 12;
                    break;
                
                case 0x11: // LD DE, nn
                    this.e = this.memory.readByte(this.pc++);
                    this.d = this.memory.readByte(this.pc++);
                    cycles = 12;
                    break;
                
                case 0x21: // LD HL, nn
                    this.l = this.memory.readByte(this.pc++);
                    this.h = this.memory.readByte(this.pc++);
                    cycles = 12;
                    break;
                
                case 0x31: // LD SP, nn
                    this.sp = this.memory.readWord(this.pc);
                    this.pc += 2;
                    cycles = 12;
                    break;
                
                // PUSH instructions
                case 0xC5: // PUSH BC
                    this.sp -= 2;
                    this.memory.writeWord(this.sp, (this.b << 8) | this.c);
                    cycles = 16;
                    break;
                
                case 0xD5: // PUSH DE
                    this.sp -= 2;
                    this.memory.writeWord(this.sp, (this.d << 8) | this.e);
                    cycles = 16;
                    break;
                
                case 0xE5: // PUSH HL
                    this.sp -= 2;
                    this.memory.writeWord(this.sp, (this.h << 8) | this.l);
                    cycles = 16;
                    break;
                
                case 0xF5: // PUSH AF
                    this.sp -= 2;
                    this.memory.writeWord(this.sp, (this.a << 8) | this.f);
                    cycles = 16;
                    break;
                
                // POP instructions
                case 0xC1: // POP BC
                    this.c = this.memory.readByte(this.sp++);
                    this.b = this.memory.readByte(this.sp++);
                    cycles = 12;
                    break;
                
                case 0xD1: // POP DE
                    this.e = this.memory.readByte(this.sp++);
                    this.d = this.memory.readByte(this.sp++);
                    cycles = 12;
                    break;
                
                case 0xE1: // POP HL
                    this.l = this.memory.readByte(this.sp++);
                    this.h = this.memory.readByte(this.sp++);
                    cycles = 12;
                    break;
                
                case 0xF1: // POP AF
                    this.f = this.memory.readByte(this.sp++) & 0xF0; // Lower 4 bits always 0
                    this.a = this.memory.readByte(this.sp++);
                    cycles = 12;
                    break;
                
                // Jump instructions
                case 0xC3: // JP nn
                    this.pc = this.memory.readWord(this.pc);
                    cycles = 16;
                    break;
                
                case 0xC2: // JP NZ, nn
                    if (!this.fZero) {
                        this.pc = this.memory.readWord(this.pc);
                    } else {
                        this.pc += 2;
                    }
                    cycles = this.fZero ? 12 : 16;
                    break;
                
                case 0xCA: // JP Z, nn
                    if (this.fZero) {
                        this.pc = this.memory.readWord(this.pc);
                    } else {
                        this.pc += 2;
                    }
                    cycles = this.fZero ? 16 : 12;
                    break;
                
                case 0xD2: // JP NC, nn
                    if (!this.fCarry) {
                        this.pc = this.memory.readWord(this.pc);
                    } else {
                        this.pc += 2;
                    }
                    cycles = this.fCarry ? 12 : 16;
                    break;
                
                case 0xDA: // JP C, nn
                    if (this.fCarry) {
                        this.pc = this.memory.readWord(this.pc);
                    } else {
                        this.pc += 2;
                    }
                    cycles = this.fCarry ? 16 : 12;
                    break;
                
                // Call instructions
                case 0xCD: // CALL nn
                    {
                        const address = this.memory.readWord(this.pc);
                        this.pc += 2;
                        this.sp -= 2;
                        this.memory.writeWord(this.sp, this.pc);
                        this.pc = address;
                        cycles = 24;
                    }
                    break;
                
                // Return instructions
                case 0xC9: // RET
                    this.pc = this.memory.readWord(this.sp);
                    this.sp += 2;
                    cycles = 16;
                    break;
                
                // HALT
                case 0x76:
                    this.halted = true;
                    cycles = 4;
                    break;
                
                // Enable/disable interrupts
                case 0xFB: // EI
                    this.interrupts.enable();
                    cycles = 4;
                    break;
                
                case 0xF3: // DI
                    this.interrupts.disable();
                    cycles = 4;
                    break;
                
                // 8-bit ALU
                case 0x80: // ADD A, B
                    this.addA(this.b);
                    cycles = 4;
                    break;
                
                case 0x81: // ADD A, C
                    this.addA(this.c);
                    cycles = 4;
                    break;
                
                case 0x82: // ADD A, D
                    this.addA(this.d);
                    cycles = 4;
                    break;

                case 0x83: // ADD A, E
                    this.addA(this.e);
                    cycles = 4;
                    break;

                case 0x84: // ADD A, H
                    this.addA(this.h);
                    cycles = 4;
                    break;

                case 0x85: // ADD A, L
                    this.addA(this.l);
                    cycles = 4;
                    break;
                
                case 0xAF: // XOR A
                    this.a = 0;
                    this.fZero = true;
                    this.fSubtract = false;
                    this.fHalfCarry = false;
                    this.fCarry = false;
                    cycles = 4;
                    break;
                
                case 0xE0: // LDH (n),A - Put A into memory address $FF00+n
                    {
                        const address = 0xFF00 + this.memory.readByte(this.pc++);
                        this.memory.writeByte(address, this.a);
                        cycles = 12;
                    }
                    break;
                
                case 0xF0: // LDH A,(n) - Put memory address $FF00+n into A
                    {
                        const address = 0xFF00 + this.memory.readByte(this.pc++);
                        this.a = this.memory.readByte(address);
                        cycles = 12;
                    }
                    break;
                
                case 0xFA: // LD A,(nn)
                    {
                        const address = this.memory.readWord(this.pc);
                        this.pc += 2;
                        this.a = this.memory.readByte(address);
                        cycles = 16;
                    }
                    break;
                
                case 0x1B: // DEC DE
                    {
                        let value = (this.d << 8) | this.e;
                        value = (value - 1) & 0xFFFF;
                        this.d = (value >> 8) & 0xFF;
                        this.e = value & 0xFF;
                        cycles = 8;
                    }
                    break;
                
                // 8-bit INC/DEC
                case 0x3C: // INC A
                    {
                        this.a = (this.a + 1) & 0xFF;
                        this.fZero = this.a === 0;
                        this.fSubtract = false;
                        this.fHalfCarry = (this.a & 0x0F) === 0;
                        cycles = 4;
                    }
                    break;
                
                case 0x04: // INC B
                    {
                        this.b = (this.b + 1) & 0xFF;
                        this.fZero = this.b === 0;
                        this.fSubtract = false;
                        this.fHalfCarry = (this.b & 0x0F) === 0;
                        cycles = 4;
                    }
                    break;
                
                // Default case for unimplemented opcodes
                default:
                    console.warn(`Unhandled opcode: 0x${opcode.toString(16).padStart(2, '0')} at PC: 0x${(this.pc - 1).toString(16).padStart(4, '0')}`);
                    // Return a default cycle count to keep emulation running
                    cycles = 4;
                    break;
            }
            
            return cycles;
        } catch (error) {
            console.error(`CPU Error: ${error.message} at PC=0x${(this.pc - 1).toString(16)}`);
            throw error; // Re-throw to be caught by main loop
        }
    }
}