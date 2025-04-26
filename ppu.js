// Picture Processing Unit for Game Boy emulator
export class PPU {
    constructor(memory, renderer) {
        this.memory = memory;
        this.renderer = renderer;
        
        // LCD variables
        this.lcdEnabled = false;
        this.windowEnabled = false;
        this.objEnabled = false;
        this.bgEnabled = false;
        this.lcdMode = 0;
        this.scanlineCounter = 0;
        
        // Clear the screen initially
        this.renderer.clear();
        
        // Debug counters
        this.frameCount = 0;
        this.lastFrameTime = performance.now();
    }
    
    update(cycles) {
        // Check if LCD is enabled (bit 7 of LCDC register)
        this.lcdEnabled = !!(this.memory.readByte(0xFF40) & 0x80);
        
        if (!this.lcdEnabled) {
            // If LCD is disabled, reset counters and return
            this.scanlineCounter = 0;
            this.memory.writeByte(0xFF44, 0); // Reset LY to 0
            return;
        }
        
        // Update scanline counter with cycles elapsed
        this.scanlineCounter += cycles;
        
        // Current scanline
        const currentLine = this.memory.readByte(0xFF44);
        
        // LCD status register
        let stat = this.memory.readByte(0xFF41);
        
        // Determine the current mode
        let newMode = stat & 0x03;
        let requestInterrupt = false;
        
        if (currentLine >= 144) {
            // V-blank period (Mode 1)
            newMode = 1;
            
            // Request V-blank interrupt if mode changed
            if ((stat & 0x03) !== 1) {
                this.memory.interrupts.requestInterrupt(0); // V-blank interrupt
                
                // Also request LCDC interrupt if mode 1 interrupts enabled
                if (stat & 0x10) {
                    requestInterrupt = true;
                }
                
                // We just entered V-blank, so a frame is complete
                this.renderer.render();
                
                // Debug: log frame rate
                this.frameCount++;
                const now = performance.now();
                if (now - this.lastFrameTime >= 1000) {
                    const fps = Math.round(this.frameCount * 1000 / (now - this.lastFrameTime));
                    console.debug(`FPS: ${fps}`);
                    this.frameCount = 0;
                    this.lastFrameTime = now;
                }
            }
        } else {
            // Visible scanlines have 3 modes
            if (this.scanlineCounter <= 80) {
                // Mode 2 - OAM access (80 cycles)
                newMode = 2;
                
                // Request LCDC interrupt if mode 2 interrupts enabled
                if ((stat & 0x03) !== 2 && (stat & 0x20)) {
                    requestInterrupt = true;
                }
            } else if (this.scanlineCounter <= 252) {
                // Mode 3 - VRAM access (172 cycles)
                // During this time CPU cannot access VRAM
                newMode = 3;
            } else {
                // Mode 0 - H-blank (204 cycles)
                newMode = 0;
                
                // Request LCDC interrupt if mode 0 interrupts enabled
                if ((stat & 0x03) !== 0 && (stat & 0x08)) {
                    requestInterrupt = true;
                }
                
                // End of scanline - render it
                this.renderScanline(currentLine);
            }
        }
        
        // Update LCD mode in STAT register
        stat = (stat & 0xFC) | newMode;
        
        // Check LYC=LY coincidence flag
        if (currentLine === this.memory.readByte(0xFF45)) {
            // Set coincidence flag
            stat |= 0x04;
            
            // Request LCDC interrupt if coincidence interrupts enabled
            if (stat & 0x40) {
                requestInterrupt = true;
            }
        } else {
            // Clear coincidence flag
            stat &= 0xFB;
        }
        
        // Write back status
        this.memory.writeByte(0xFF41, stat);
        
        // Request LCDC interrupt if needed
        if (requestInterrupt) {
            this.memory.interrupts.requestInterrupt(1);
        }
        
        // Move to next scanline if we've completed the current one
        if (this.scanlineCounter >= 456) {
            this.scanlineCounter -= 456;
            
            // Increment LY register, with wrapping from 153 to 0
            this.memory.writeByte(0xFF44, (currentLine + 1) % 154);
            
            // If entering V-blank (line 144), request V-blank interrupt
            if (this.memory.readByte(0xFF44) === 144) {
                this.memory.interrupts.requestInterrupt(0);
            }
        }
    }
    
    renderScanline(line) {
        // LCDC register controls which background and which sprites to use
        const lcdc = this.memory.readByte(0xFF40);
        
        // Clear this scanline
        for (let x = 0; x < 160; x++) {
            this.renderer.setPixel(x, line, 0);
        }
        
        // Render background if enabled
        if (lcdc & 0x01) {
            this.renderBackground(line);
        }
        
        // Render window if enabled and visible on this scanline
        if ((lcdc & 0x20) && this.memory.readByte(0xFF4A) <= line) {
            this.renderWindow(line);
        }
        
        // Render sprites if enabled
        if (lcdc & 0x02) {
            this.renderSprites(line);
        }
    }
    
    renderBackground(line) {
        const lcdc = this.memory.readByte(0xFF40);
        const scrollY = this.memory.readByte(0xFF42);
        const scrollX = this.memory.readByte(0xFF43);
        const bgPalette = this.memory.readByte(0xFF47);
        
        // Determine tile map and tile data addresses
        const tileMapAddress = (lcdc & 0x08) ? 0x9C00 : 0x9800;
        const tileDataAddress = (lcdc & 0x10) ? 0x8000 : 0x9000;
        const signedTileData = !(lcdc & 0x10);
        
        // Calculate the y position within the 256x256 background map
        const yPos = (line + scrollY) & 0xFF;
        const tileRow = Math.floor(yPos / 8);
        
        // For each pixel on the current scanline
        for (let pixelX = 0; pixelX < 160; pixelX++) {
            // Calculate the x position within the background map
            const xPos = (pixelX + scrollX) & 0xFF;
            const tileCol = Math.floor(xPos / 8);
            
            // Get the tile ID from the tile map
            const tileMapOffset = tileRow * 32 + tileCol;
            let tileID = this.memory.readByte(tileMapAddress + tileMapOffset);
            
            // If using signed tile data (0x9000 base), convert to signed
            if (signedTileData) {
                tileID = (tileID & 0x80) ? -((~tileID & 0x7F) + 1) : tileID;
            }
            
            // Get the specific line of pixels within the tile
            const tileDataOffset = signedTileData ? 
                ((tileID + 128) * 16 + (yPos % 8) * 2) : 
                (tileID * 16 + (yPos % 8) * 2);
            
            const tileLowByte = this.memory.readByte(tileDataAddress + tileDataOffset);
            const tileHighByte = this.memory.readByte(tileDataAddress + tileDataOffset + 1);
            
            // Get the specific pixel within the tile line
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
        const lcdc = this.memory.readByte(0xFF40);
        const windowY = this.memory.readByte(0xFF4A);
        const windowX = this.memory.readByte(0xFF4B) - 7;
        const bgPalette = this.memory.readByte(0xFF47);
        
        // Only proceed if the window is visible on this scanline
        if (windowY > line) return;
        
        // Determine window tile map address
        const tileMapAddress = (lcdc & 0x40) ? 0x9C00 : 0x9800;
        const tileDataAddress = (lcdc & 0x10) ? 0x8000 : 0x9000;
        const signedTileData = !(lcdc & 0x10);
        
        // Calculate which row of the window we're drawing
        const windowLine = line - windowY;
        const tileRow = Math.floor(windowLine / 8);
        
        // For each visible pixel of the window on this scanline
        for (let pixel = 0; pixel < 160; pixel++) {
            // Skip if this pixel is before the window's X position
            if (pixel < windowX) continue;
            
            // Calculate the window-relative X coordinate
            const windowXPos = pixel - windowX;
            const tileCol = Math.floor(windowXPos / 8);
            
            // Skip if outside the window bounds
            if (tileCol >= 32) continue;
            
            // Get the tile ID from the window tile map
            const tileMapOffset = tileRow * 32 + tileCol;
            let tileID = this.memory.readByte(tileMapAddress + tileMapOffset);
            
            // If using signed tile data, convert to signed
            if (signedTileData) {
                tileID = (tileID & 0x80) ? -((~tileID & 0x7F) + 1) : tileID;
            }
            
            // Calculate the tile data address
            const tileDataOffset = signedTileData ? 
                ((tileID + 128) * 16 + (windowLine % 8) * 2) : 
                (tileID * 16 + (windowLine % 8) * 2);
            
            const tileLowByte = this.memory.readByte(tileDataAddress + tileDataOffset);
            const tileHighByte = this.memory.readByte(tileDataAddress + tileDataOffset + 1);
            
            // Get the specific pixel within the tile
            const pixelBit = 7 - (windowXPos % 8);
            
            // Combine the high and low bits to get the color ID
            const colorID = ((tileHighByte >> pixelBit) & 1) << 1 | ((tileLowByte >> pixelBit) & 1);
            
            // Apply the BGP palette
            const colorFromPalette = (bgPalette >> (colorID * 2)) & 0x03;
            
            // Set the pixel
            this.renderer.setPixel(pixel, line, colorFromPalette);
        }
    }
    
    renderSprites(line) {
        const lcdc = this.memory.readByte(0xFF40);
        const tallSprites = !!(lcdc & 0x04); // 8x16 sprites if true, 8x8 if false
        const spriteHeight = tallSprites ? 16 : 8;
        
        // Object palette registers
        const obp0 = this.memory.readByte(0xFF48);
        const obp1 = this.memory.readByte(0xFF49);
        
        // Track sprites to draw on this line (max 10 per line)
        const spritesToRender = [];
        
        // Scan through OAM (Object Attribute Memory) to find sprites on this line
        for (let i = 0; i < 40; i++) {
            const oamOffset = i * 4;
            const spriteY = this.memory.readByte(0xFE00 + oamOffset) - 16;
            
            // Check if sprite is visible on this scanline
            if (line >= spriteY && line < spriteY + spriteHeight) {
                const spriteX = this.memory.readByte(0xFE00 + oamOffset + 1) - 8;
                const tileIndex = tallSprites ? 
                    (this.memory.readByte(0xFE00 + oamOffset + 2) & 0xFE) : 
                    this.memory.readByte(0xFE00 + oamOffset + 2);
                const attributes = this.memory.readByte(0xFE00 + oamOffset + 3);
                
                spritesToRender.push({
                    x: spriteX,
                    y: spriteY,
                    tileIndex: tileIndex,
                    xFlip: !!(attributes & 0x20),
                    yFlip: !!(attributes & 0x40),
                    belowBG: !!(attributes & 0x80),
                    palette: !!(attributes & 0x10) ? obp1 : obp0
                });
                
                // Only consider 10 sprites per scanline
                if (spritesToRender.length === 10) break;
            }
        }
        
        // Sort sprites by X coordinate (higher X values have priority if overlapping)
        // In real hardware, this is more complex with different priorities
        spritesToRender.sort((a, b) => b.x - a.x);
        
        // Draw each sprite
        for (const sprite of spritesToRender) {
            const spriteLine = line - sprite.y;
            const yFlipped = sprite.yFlip ? (spriteHeight - 1 - spriteLine) : spriteLine;
            
            // For 8x16 sprites, we need to determine which tile to use
            const tileToUse = tallSprites ? 
                (yFlipped >= 8 ? sprite.tileIndex + 1 : sprite.tileIndex) : 
                sprite.tileIndex;
            
            // Get the line data from the tile
            const tileLine = yFlipped % 8;
            const tileAddress = 0x8000 + (tileToUse * 16) + (tileLine * 2);
            
            const tileLowByte = this.memory.readByte(tileAddress);
            const tileHighByte = this.memory.readByte(tileAddress + 1);
            
            // Draw all 8 pixels of the sprite line
            for (let x = 0; x < 8; x++) {
                // Skip if off-screen
                if (sprite.x + x < 0 || sprite.x + x >= 160) continue;
                
                // Handle X-flipping
                const xBit = sprite.xFlip ? x : (7 - x);
                
                // Get color id from the tile data
                const colorID = ((tileHighByte >> xBit) & 1) << 1 | ((tileLowByte >> xBit) & 1);
                
                // Color 0 is transparent for sprites
                if (colorID === 0) continue;
                
                // Apply palette
                const colorFromPalette = (sprite.palette >> (colorID * 2)) & 0x03;
                
                // Set the pixel if it's not below background or if background is white
                this.renderer.setPixel(sprite.x + x, line, colorFromPalette);
            }
        }
    }
}