// Constants for GameBoy hardware
const CLOCK_SPEED = 4194304; // Hz
const FRAME_RATE = 60; // FPS
const CYCLES_PER_FRAME = CLOCK_SPEED / FRAME_RATE;

// Memory map constants
const ROM_BANK_0_START = 0x0000;
const ROM_BANK_0_END = 0x3FFF;
const ROM_BANK_N_START = 0x4000;
const ROM_BANK_N_END = 0x7FFF;
const VRAM_START = 0x8000;
const VRAM_END = 0x9FFF;
const EXTERNAL_RAM_START = 0xA000;
const EXTERNAL_RAM_END = 0xBFFF;
const WRAM_START = 0xC000;
const WRAM_END = 0xDFFF;
const ECHO_RAM_START = 0xE000;
const ECHO_RAM_END = 0xFDFF;
const OAM_START = 0xFE00;
const OAM_END = 0xFE9F;
const IO_REGISTERS_START = 0xFF00;
const IO_REGISTERS_END = 0xFF7F;
const HRAM_START = 0xFF80;
const HRAM_END = 0xFFFE;
const IE_REGISTER = 0xFFFF;

export class GameBoy {
    constructor(romData, renderer, input) {
        this.renderer = renderer;
        this.input = input;
        
        // Initialize memory
        this.memory = new Uint8Array(0x10000); // 64KB memory map
        
        // Load ROM data into memory
        this.loadRom(romData);
        
        // Initialize registers
        this.initializeRegisters();
        
        // Initialize flags
        this.halted = false;
        this.stopped = false;
        this.interruptsEnabled = false;
        
        // Timer variables
        this.dividerRegister = 0;
        this.timerCounter = 0;
        this.timerModulo = 0;
        this.timerEnabled = false;
        
        // LCD variables
        this.lcdEnabled = false;
        this.windowEnabled = false;
        this.objEnabled = false;
        this.bgEnabled = false;
        this.lcdMode = 0;
        this.scanlineCounter = 0;
        
        // Initialize the memory with boot values (normally this would be set by the boot ROM)
        this.initializeMemory();
    }
    
    loadRom(romData) {
        // Copy ROM data to memory (up to available size)
        const bytesToCopy = Math.min(romData.length, 0x8000); // Max 32KB for ROM banks 0 and 1
        for (let i = 0; i < bytesToCopy; i++) {
            this.memory[i] = romData[i];
        }
        
        // Extract and store cartridge information
        this.cartridgeType = romData[0x147];
        this.romSize = romData[0x148];
        this.ramSize = romData[0x149];
        this.cartridgeTitle = '';
        for (let i = 0x134; i <= 0x143; i++) {
            const char = romData[i];
            if (char === 0) break;
            this.cartridgeTitle += String.fromCharCode(char);
        }
        
        console.log(`Loaded ROM: ${this.cartridgeTitle}`);
        console.log(`Cartridge Type: ${this.cartridgeType.toString(16)}`);
        console.log(`ROM Size: ${this.romSize.toString(16)}`);
        console.log(`RAM Size: ${this.ramSize.toString(16)}`);
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
    
    initializeMemory() {
        // Initialize I/O registers with post-boot values
        this.memory[0xFF05] = 0x00; // TIMA
        this.memory[0xFF06] = 0x00; // TMA
        this.memory[0xFF07] = 0x00; // TAC
        this.memory[0xFF10] = 0x80; // NR10
        this.memory[0xFF11] = 0xBF; // NR11
        this.memory[0xFF12] = 0xF3; // NR12
        this.memory[0xFF14] = 0xBF; // NR14
        this.memory[0xFF16] = 0x3F; // NR21
        this.memory[0xFF17] = 0x00; // NR22
        this.memory[0xFF19] = 0xBF; // NR24
        this.memory[0xFF1A] = 0x7F; // NR30
        this.memory[0xFF1B] = 0xFF; // NR31
        this.memory[0xFF1C] = 0x9F; // NR32
        this.memory[0xFF1E] = 0xBF; // NR34
        this.memory[0xFF20] = 0xFF; // NR41
        this.memory[0xFF21] = 0x00; // NR42
        this.memory[0xFF22] = 0x00; // NR43
        this.memory[0xFF23] = 0xBF; // NR44
        this.memory[0xFF24] = 0x77; // NR50
        this.memory[0xFF25] = 0xF3; // NR51
        this.memory[0xFF26] = 0xF1; // NR52
        this.memory[0xFF40] = 0x91; // LCDC
        this.memory[0xFF42] = 0x00; // SCY
        this.memory[0xFF43] = 0x00; // SCX
        this.memory[0xFF45] = 0x00; // LYC
        this.memory[0xFF47] = 0xFC; // BGP
        this.memory[0xFF48] = 0xFF; // OBP0
        this.memory[0xFF49] = 0xFF; // OBP1
        this.memory[0xFF4A] = 0x00; // WY
        this.memory[0xFF4B] = 0x00; // WX
        this.memory[0xFFFF] = 0x00; // IE
    }
    
    // Memory access methods
    readByte(address) {
        // Handle special memory regions
        if (address === 0xFF00) {
            // Joypad register
            return this.handleJoypadRead();
        }
        
        return this.memory[address];
    }
    
    writeByte(address, value) {
        // Handle special memory regions
        if (address >= ROM_BANK_0_START && address <= ROM_BANK_N_END) {
            // ROM is read-only, but writes to ROM area can trigger memory bank switching
            this.handleRomBankSwitching(address, value);
            return;
        }
        
        if (address === 0xFF00) {
            // Joypad register
            this.handleJoypadWrite(value);
            return;
        }
        
        if (address === 0xFF04) {
            // DIV register - writing any value resets it to 0
            this.dividerRegister = 0;
            this.memory[0xFF04] = 0;
            return;
        }
        
        if (address === 0xFF44) {
            // LY register (read-only) - writing resets it
            this.memory[0xFF44] = 0;
            return;
        }
        
        if (address === 0xFF46) {
            // DMA transfer
            this.doDMATransfer(value);
            return;
        }
        
        // Write to memory
        this.memory[address] = value;
        
        // Handle ECHO RAM mirroring
        if (address >= WRAM_START && address <= WRAM_END) {
            this.memory[address + 0x2000] = value; // Mirror to ECHO RAM
        } else if (address >= ECHO_RAM_START && address <= ECHO_RAM_END) {
            this.memory[address - 0x2000] = value; // Mirror to WRAM
        }
    }
    
    readWord(address) {
        return this.readByte(address) | (this.readByte(address + 1) << 8);
    }
    
    writeWord(address, value) {
        this.writeByte(address, value & 0xFF);
        this.writeByte(address + 1, value >> 8);
    }
    
    // Joypad handling
    handleJoypadRead() {
        // Get the joypad register
        let joypadReg = this.memory[0xFF00] & 0xF0; // Get the top 4 bits (selection)
        
        // Lower 4 bits are the input state (0 = pressed, 1 = not pressed)
        const dpadSelected = !(joypadReg & 0x10);
        const buttonsSelected = !(joypadReg & 0x20);
        
        let result = joypadReg;
        
        if (dpadSelected) {
            result |= (this.input.isButtonPressed('right') ? 0 : 1) |
                      (this.input.isButtonPressed('left') ? 0 : 1) << 1 |
                      (this.input.isButtonPressed('up') ? 0 : 1) << 2 |
                      (this.input.isButtonPressed('down') ? 0 : 1) << 3;
        }
        
        if (buttonsSelected) {
            result |= (this.input.isButtonPressed('a') ? 0 : 1) |
                      (this.input.isButtonPressed('b') ? 0 : 1) << 1 |
                      (this.input.isButtonPressed('select') ? 0 : 1) << 2 |
                      (this.input.isButtonPressed('start') ? 0 : 1) << 3;
        }
        
        return result;
    }
    
    handleJoypadWrite(value) {
        // Only bits 4-5 are writable
        this.memory[0xFF00] = (value & 0x30) | (this.memory[0xFF00] & 0xCF);
    }
    
    // DMA transfer (from specified source address to OAM memory)
    doDMATransfer(value) {
        const sourceAddress = value << 8; // Source address is value * 0x100
        
        // Copy 160 bytes from source to OAM
        for (let i = 0; i < 160; i++) {
            this.memory[0xFE00 + i] = this.memory[sourceAddress + i];
        }
    }
    
    // ROM bank switching (MBC handling)
    handleRomBankSwitching(address, value) {
        // Different types of Memory Bank Controllers (MBCs) have different behavior
        // This is a simplified implementation
        switch (this.cartridgeType) {
            case 0x00: // ROM ONLY
                // No bank switching
                break;
                
            case 0x01: // MBC1
            case 0x02: // MBC1+RAM
            case 0x03: // MBC1+RAM+BATTERY
                if (address < 0x2000) {
                    // RAM enable/disable
                    // Implementation omitted for simplicity
                } else if (address < 0x4000) {
                    // ROM bank number (lower 5 bits)
                    // Implementation omitted for simplicity
                } else if (address < 0x6000) {
                    // RAM bank number or upper bits of ROM bank number
                    // Implementation omitted for simplicity
                } else {
                    // Banking mode select
                    // Implementation omitted for simplicity
                }
                break;
                
            // More MBC types would be implemented here
        }
    }
    
    // CPU instruction execution (with improved error handling)
    executeInstruction() {
        // Fetch opcode
        const opcode = this.readByte(this.pc++);
        
        // Track cycles this instruction takes
        let cycles = 0;
        
        try {
            // Execute instruction
            switch (opcode) {
                // NOP
                case 0x00:
                    // No operation
                    cycles = 4;
                    break;
                
                // LD instructions
                case 0x06: // LD B, n
                    this.b = this.readByte(this.pc++);
                    cycles = 8;
                    break;
                    
                case 0x0E: // LD C, n
                    this.c = this.readByte(this.pc++);
                    cycles = 8;
                    break;
                
                case 0x16: // LD D, n
                    this.d = this.readByte(this.pc++);
                    cycles = 8;
                    break;
                
                case 0x1E: // LD E, n
                    this.e = this.readByte(this.pc++);
                    cycles = 8;
                    break;
                
                case 0x26: // LD H, n
                    this.h = this.readByte(this.pc++);
                    cycles = 8;
                    break;
                
                case 0x2E: // LD L, n
                    this.l = this.readByte(this.pc++);
                    cycles = 8;
                    break;
                
                case 0x3E: // LD A, n
                    this.a = this.readByte(this.pc++);
                    cycles = 8;
                    break;
                
                // 16-bit loads
                case 0x01: // LD BC, nn
                    this.c = this.readByte(this.pc++);
                    this.b = this.readByte(this.pc++);
                    cycles = 12;
                    break;
                
                case 0x11: // LD DE, nn
                    this.e = this.readByte(this.pc++);
                    this.d = this.readByte(this.pc++);
                    cycles = 12;
                    break;
                
                case 0x21: // LD HL, nn
                    this.l = this.readByte(this.pc++);
                    this.h = this.readByte(this.pc++);
                    cycles = 12;
                    break;
                
                case 0x31: // LD SP, nn
                    this.sp = this.readWord(this.pc);
                    this.pc += 2;
                    cycles = 12;
                    break;
                
                // PUSH instructions
                case 0xC5: // PUSH BC
                    this.sp -= 2;
                    this.writeWord(this.sp, (this.b << 8) | this.c);
                    cycles = 16;
                    break;
                
                case 0xD5: // PUSH DE
                    this.sp -= 2;
                    this.writeWord(this.sp, (this.d << 8) | this.e);
                    cycles = 16;
                    break;
                
                case 0xE5: // PUSH HL
                    this.sp -= 2;
                    this.writeWord(this.sp, (this.h << 8) | this.l);
                    cycles = 16;
                    break;
                
                case 0xF5: // PUSH AF
                    this.sp -= 2;
                    this.writeWord(this.sp, (this.a << 8) | this.f);
                    cycles = 16;
                    break;
                
                // POP instructions
                case 0xC1: // POP BC
                    this.c = this.readByte(this.sp++);
                    this.b = this.readByte(this.sp++);
                    cycles = 12;
                    break;
                
                case 0xD1: // POP DE
                    this.e = this.readByte(this.sp++);
                    this.d = this.readByte(this.sp++);
                    cycles = 12;
                    break;
                
                case 0xE1: // POP HL
                    this.l = this.readByte(this.sp++);
                    this.h = this.readByte(this.sp++);
                    cycles = 12;
                    break;
                
                case 0xF1: // POP AF
                    this.f = this.readByte(this.sp++) & 0xF0; // Lower 4 bits always 0
                    this.a = this.readByte(this.sp++);
                    cycles = 12;
                    break;
                
                // Jump instructions
                case 0xC3: // JP nn
                    this.pc = this.readWord(this.pc);
                    cycles = 16;
                    break;
                
                // Call instructions
                case 0xCD: // CALL nn
                    {
                        const address = this.readWord(this.pc);
                        this.pc += 2;
                        this.sp -= 2;
                        this.writeWord(this.sp, this.pc);
                        this.pc = address;
                        cycles = 24;
                    }
                    break;
                
                // Return instructions
                case 0xC9: // RET
                    this.pc = this.readWord(this.sp);
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
                    this.interruptsEnabled = true;
                    cycles = 4;
                    break;
                
                case 0xF3: // DI
                    this.interruptsEnabled = false;
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
                
                // Default case for unimplemented opcodes
                default:
                    console.warn(`Unhandled opcode: 0x${opcode.toString(16).padStart(2, '0')} at PC: 0x${(this.pc - 1).toString(16).padStart(4, '0')}`);
                    // Return a default cycle count to keep emulation running
                    cycles = 4;
                    break;
            }
        } catch (error) {
            console.error(`Error executing opcode 0x${opcode.toString(16).padStart(2, '0')} at PC: 0x${(this.pc - 1).toString(16).padStart(4, '0')}`);
            console.error(error);
            // Return a default cycle count to prevent freezing
            cycles = 4;
        }
        
        return cycles;
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
    
    // Update timers
    updateTimers(cycles) {
        // Divider register always increments at rate of 16384Hz (CPU / 256)
        this.dividerRegister += cycles;
        if (this.dividerRegister >= 256) {
            this.dividerRegister -= 256;
            this.memory[0xFF04]++; // Increment DIV register
        }
        
        // Timer (TIMA) only updates if enabled
        const timerEnabled = !!(this.memory[0xFF07] & 0x04);
        if (timerEnabled) {
            // Timer frequency depends on TAC bits 0-1
            const timerFreq = this.memory[0xFF07] & 0x03;
            let timerSpeed;
            switch (timerFreq) {
                case 0: timerSpeed = 1024; break; // 4096Hz (CPU / 1024)
                case 1: timerSpeed = 16; break;   // 262144Hz (CPU / 16)
                case 2: timerSpeed = 64; break;   // 65536Hz (CPU / 64)
                case 3: timerSpeed = 256; break;  // 16384Hz (CPU / 256)
            }
            
            this.timerCounter += cycles;
            
            if (this.timerCounter >= timerSpeed) {
                this.timerCounter -= timerSpeed;
                
                // Increment TIMA
                if (this.memory[0xFF05] === 0xFF) {
                    // TIMA overflow
                    this.memory[0xFF05] = this.memory[0xFF06]; // Reset to TMA
                    // Request timer interrupt
                    this.requestInterrupt(2);
                } else {
                    this.memory[0xFF05]++;
                }
            }
        }
    }
    
    // Update LCD
    updateGraphics(cycles) {
        // Only update if LCD is enabled
        if (!(this.memory[0xFF40] & 0x80)) {
            return;
        }
        
        this.scanlineCounter += cycles;
        
        // Current scanline
        const currentLine = this.memory[0xFF44];
        
        // LCD mode
        let newMode = this.memory[0xFF41] & 0x03;
        
        if (currentLine >= 144) {
            // V-blank period
            newMode = 1;
            
            // Request V-blank interrupt
            if (newMode !== (this.memory[0xFF41] & 0x03)) {
                this.requestInterrupt(0);
            }
        } else {
            // Visible scanlines
            if (this.scanlineCounter <= 80) {
                // Mode 2 - OAM access
                newMode = 2;
            } else if (this.scanlineCounter <= 252) {
                // Mode 3 - VRAM access
                newMode = 3;
            } else {
                // Mode 0 - H-blank
                newMode = 0;
                
                // Draw the current scanline
                this.renderScanline(currentLine);
            }
        }
        
        // Update LCD status
        this.memory[0xFF41] = (this.memory[0xFF41] & 0xFC) | newMode;
        
        // Check for LYC=LY coincidence flag
        if (currentLine === this.memory[0xFF45]) {
            this.memory[0xFF41] |= 0x04; // Set coincidence flag
            if (this.memory[0xFF41] & 0x40) {
                this.requestInterrupt(1); // Request LCDC interrupt
            }
        } else {
            this.memory[0xFF41] &= 0xFB; // Clear coincidence flag
        }
        
        // After 456 clock cycles, move to next scanline
        if (this.scanlineCounter >= 456) {
            this.scanlineCounter -= 456;
            
            // Increment LY register
            this.memory[0xFF44] = (this.memory[0xFF44] + 1) % 154;
            
            // If entering V-blank (line 144), request V-blank interrupt
            if (this.memory[0xFF44] === 144) {
                this.requestInterrupt(0);
            }
        }
    }
    
    renderScanline(line) {
        // LCDC register controls which background and which sprites to use
        const lcdc = this.memory[0xFF40];
        
        // Render background
        if (lcdc & 0x01) {
            this.renderBackground(line);
        }
        
        // Render window
        if ((lcdc & 0x20) && this.memory[0xFF4A] <= line) {
            this.renderWindow(line);
        }
        
        // Render sprites
        if (lcdc & 0x02) {
            this.renderSprites(line);
        }
    }
    
    renderBackground(line) {
        // Implementation would render the background for a single scanline
        // For brevity, a simplified implementation is shown
        
        const lcdc = this.memory[0xFF40];
        const scrollY = this.memory[0xFF42];
        const scrollX = this.memory[0xFF43];
        const bgPalette = this.memory[0xFF47];
        
        // Determine tile map and tile data addresses
        const tileMapAddress = (lcdc & 0x08) ? 0x9C00 : 0x9800;
        const windowMapAddress = (lcdc & 0x40) ? 0x9C00 : 0x9800;
        const tileDataAddress = (lcdc & 0x10) ? 0x8000 : 0x8800;
        const signedTileData = !(lcdc & 0x10);
        
        // For each pixel on the current scanline
        for (let pixelX = 0; pixelX < 160; pixelX++) {
            // Calculate which tile this pixel falls in
            const yPos = (line + scrollY) & 0xFF;
            const xPos = (pixelX + scrollX) & 0xFF;
            
            const tileY = Math.floor(yPos / 8);
            const tileX = Math.floor(xPos / 8);
            
            // Get the tile ID from the tile map
            const tileMapOffset = tileY * 32 + tileX;
            let tileID = this.memory[tileMapAddress + tileMapOffset];
            
            // If using signed tile data, adjust the tile ID
            if (signedTileData) {
                tileID = (tileID & 0x80) ? -((~tileID & 0x7F) + 1) : tileID;
            }
            
            // Get the specific line of pixels within the tile
            const tileDataOffset = signedTileData ? 
                (tileID + 128) * 16 + (yPos % 8) * 2 : 
                tileID * 16 + (yPos % 8) * 2;
            
            const tileLowByte = this.memory[tileDataAddress + tileDataOffset];
            const tileHighByte = this.memory[tileDataAddress + tileDataOffset + 1];
            
            // Get the specific pixel within the tile
            const pixelBit = 7 - (xPos % 8);
            
            // Combine the high and low bits to get the color ID (0-3)
            const colorID = ((tileHighByte >> pixelBit) & 1) << 1 | ((tileLowByte >> pixelBit) & 1);
            
            // Apply the BGP palette to get the actual color
            const colorFromPalette = (bgPalette >> (colorID * 2)) & 0x03;
            
            // Set the pixel in the display buffer
            this.renderer.setPixel(pixelX, line, colorFromPalette);
        }
    }
    
    renderWindow(line) {
        // Implementation would render the window for a single scanline
        // Omitted for brevity
    }
    
    renderSprites(line) {
        // Implementation would render sprites for a single scanline
        // Omitted for brevity
    }
    
    // Request an interrupt
    requestInterrupt(interrupt) {
        // Set the corresponding bit in IF register
        this.memory[0xFF0F] |= (1 << interrupt);
    }
    
    // Handle interrupts
    handleInterrupts() {
        if (!this.interruptsEnabled) {
            return 0;
        }
        
        const interruptFlags = this.memory[0xFF0F]; // IF register
        const interruptEnable = this.memory[0xFFFF]; // IE register
        
        // Mask of pending interrupts
        const pendingInterrupts = interruptFlags & interruptEnable & 0x1F;
        
        if (pendingInterrupts === 0) {
            return 0;
        }
        
        // Process the highest priority interrupt
        for (let i = 0; i < 5; i++) {
            if (pendingInterrupts & (1 << i)) {
                // Clear the interrupt flag
                this.memory[0xFF0F] &= ~(1 << i);
                
                // Disable further interrupts
                this.interruptsEnabled = false;
                
                // Push the PC to the stack
                this.sp -= 2;
                this.writeWord(this.sp, this.pc);
                
                // Jump to the interrupt handler
                switch (i) {
                    case 0: this.pc = 0x0040; break; // V-blank
                    case 1: this.pc = 0x0048; break; // LCDC
                    case 2: this.pc = 0x0050; break; // Timer
                    case 3: this.pc = 0x0058; break; // Serial
                    case 4: this.pc = 0x0060; break; // Joypad
                }
                
                return 12; // 12 cycles for handling an interrupt
            }
        }
        
        return 0;
    }
    
    // Run a single machine cycle
    step() {
        // Handle interrupts
        let cycles = this.handleInterrupts();
        
        // If no interrupt was serviced or if CPU is halted, execute the next instruction
        if (!this.halted && !this.stopped && cycles === 0) {
            cycles = this.executeInstruction();
        } else if (this.halted) {
            // If CPU is halted, we still need to count cycles
            cycles = 4;
            
            // Check if an interrupt occurred to unhalt the CPU
            if (this.memory[0xFF0F] & this.memory[0xFFFF] & 0x1F) {
                this.halted = false;
            }
        }
        
        // Update timers
        this.updateTimers(cycles);
        
        // Update graphics
        this.updateGraphics(cycles);
        
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
            pc: this.pc,
            sp: this.sp,
            a: this.a,
            f: this.f,
            b: this.b,
            c: this.c,
            d: this.d,
            e: this.e,
            h: this.h,
            l: this.l,
            lcdStatus: this.memory[0xFF41]
        };
    }
}