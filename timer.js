// Timer system for Game Boy emulator
export class Timer {
    constructor(memory, interrupts) {
        this.memory = memory;
        this.interrupts = interrupts;
        
        // Timer variables
        this.dividerRegister = 0;
        this.timerCounter = 0;
    }
    
    update(cycles) {
        // Divider register always increments at rate of 16384Hz (CPU / 256)
        this.dividerRegister += cycles;
        if (this.dividerRegister >= 256) {
            this.dividerRegister -= 256;
            this.memory.memory[0xFF04]++; // Increment DIV register
        }
        
        // Timer (TIMA) only updates if enabled
        const timerEnabled = !!(this.memory.readByte(0xFF07) & 0x04);
        if (timerEnabled) {
            // Timer frequency depends on TAC bits 0-1
            const timerFreq = this.memory.readByte(0xFF07) & 0x03;
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
                if (this.memory.readByte(0xFF05) === 0xFF) {
                    // TIMA overflow
                    this.memory.writeByte(0xFF05, this.memory.readByte(0xFF06)); // Reset to TMA
                    // Request timer interrupt
                    this.interrupts.requestInterrupt(2);
                } else {
                    this.memory.writeByte(0xFF05, this.memory.readByte(0xFF05) + 1);
                }
            }
        }
    }
}