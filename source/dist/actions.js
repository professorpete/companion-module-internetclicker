export function UpdateActions(self) {
    self.setActionDefinitions({
        next: {
            name: 'Next Slide',
            options: [],
            callback: async () => {
                self.sendCommand('rightArrow');
            },
        },
        previous: {
            name: 'Previous Slide',
            options: [],
            callback: async () => {
                self.sendCommand('leftArrow');
            },
        },
        startTimer: {
            name: 'Start Timer',
            options: [],
            callback: async () => {
                self.sendCommand('startTimer');
            },
        },
        pauseTimer: {
            name: 'Pause Timer',
            options: [],
            callback: async () => {
                self.sendCommand('pauseTimer');
            },
        },
        stopTimer: {
            name: 'Stop Timer',
            options: [],
            callback: async () => {
                self.sendCommand('stopTimer');
            },
        },
    });
}
//# sourceMappingURL=actions.js.map