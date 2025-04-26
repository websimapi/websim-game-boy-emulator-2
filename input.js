export class Input {
    constructor() {
        this.buttonStates = {
            up: false,
            down: false,
            left: false,
            right: false,
            a: false,
            b: false,
            start: false,
            select: false
        };
    }
    
    buttonDown(button) {
        if (button in this.buttonStates) {
            this.buttonStates[button] = true;
        }
    }
    
    buttonUp(button) {
        if (button in this.buttonStates) {
            this.buttonStates[button] = false;
        }
    }
    
    isButtonPressed(button) {
        return button in this.buttonStates ? this.buttonStates[button] : false;
    }
}

