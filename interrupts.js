// Interrupt handling for Game Boy emulator
export class Interrupts {
    constructor() {
        this.enabled = false;
        this.memory = null; // Will be set after Memory is created
    }
    
    enable() {
        this.enabled = true;
    }
    
    disable() {
        this.enabled = false;
    }
    
    // Request an interrupt
    requestInterrupt(interrupt) {
        if (!this.memory) {
            console.error("Interrupts: Memory not initialized");
            return;
        }
        
        // Set the corresponding bit in IF register (0xFF0F)
        const currentIF = this.memory.readByte(0xFF0F);
        this.memory.writeByte(0xFF0F, currentIF | (1 << interrupt));
    }
    
    // Handle interrupts
    handle(cpu) {
        if (!this.enabled || !this.memory) {
            return 0;
        }
        
        const interruptFlags = this.memory.readByte(0xFF0F); // IF register
        const interruptEnable = this.memory.readByte(0xFFFF); // IE register
        
        // Mask of pending interrupts
        const pendingInterrupts = interruptFlags & interruptEnable & 0x1F;
        
        if (pendingInterrupts === 0) {
            return 0;
        }
        
        // Process the highest priority interrupt
        for (let i = 0; i < 5; i++) {
            if (pendingInterrupts & (1 << i)) {
                // Clear the interrupt flag
                this.memory.writeByte(0xFF0F, interruptFlags & ~(1 << i));
                
                // Disable further interrupts
                this.enabled = false;
                
                // Push the PC to the stack
                cpu.sp -= 2;
                this.memory.writeWord(cpu.sp, cpu.pc);
                
                // Jump to the interrupt handler
                switch (i) {
                    case 0: cpu.pc = 0x0040; break; // V-blank
                    case 1: cpu.pc = 0x0048; break; // LCDC
                    case 2: cpu.pc = 0x0050; break; // Timer
                    case 3: cpu.pc = 0x0058; break; // Serial
                    case 4: cpu.pc = 0x0060; break; // Joypad
                }
                
                return 12; // 12 cycles for handling an interrupt
            }
        }
        
        return 0;
    }
}