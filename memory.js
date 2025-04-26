// Memory management for Game Boy emulator

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

export class Memory {
    constructor(romData, interrupts, input) {
        this.interrupts = interrupts;
        this.input = input;
        
        // Initialize memory
        this.memory = new Uint8Array(0x10000); // 64KB memory map
        
        // Load ROM data into memory
        this.loadRom(romData);
        
        // Initialize the memory with boot values (normally set by the boot ROM)
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
}