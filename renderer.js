export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.frameBuffer = this.ctx.createImageData(this.width, this.height);
        
        // GameBoy screen is 160x144 pixels
        if (this.width !== 160 || this.height !== 144) {
            console.warn('Canvas dimensions are not 160x144. Scaling may occur.');
        }
        
        // Color palette (0-3) using GameBoy colors (light to dark)
        this.colors = [
            [155, 188, 15],  // Lightest (off)
            [139, 172, 15],  // Light
            [48, 98, 48],    // Dark
            [15, 56, 15]     // Darkest (on)
        ];
        
        // Clear the screen
        this.clear();
    }
    
    clear() {
        // Fill with white
        for (let i = 0; i < this.frameBuffer.data.length; i += 4) {
            const color = this.colors[0]; // Lightest color
            this.frameBuffer.data[i] = color[0];     // R
            this.frameBuffer.data[i + 1] = color[1]; // G
            this.frameBuffer.data[i + 2] = color[2]; // B
            this.frameBuffer.data[i + 3] = 255;      // A
        }
        
        this.ctx.putImageData(this.frameBuffer, 0, 0);
    }
    
    setPixel(x, y, colorId) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return;
        }
        
        const index = (y * this.width + x) * 4;
        const color = this.colors[colorId & 3]; // Ensure color is 0-3
        
        this.frameBuffer.data[index] = color[0];     // R
        this.frameBuffer.data[index + 1] = color[1]; // G
        this.frameBuffer.data[index + 2] = color[2]; // B
        this.frameBuffer.data[index + 3] = 255;      // A
    }
    
    render() {
        this.ctx.putImageData(this.frameBuffer, 0, 0);
    }
}

