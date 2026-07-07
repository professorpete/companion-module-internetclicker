import type ModuleInstance from './main.js'

export type ActionsSchema = {
	next: { options: Record<string, never> }
	previous: { options: Record<string, never> }
	startTimer: { options: Record<string, never> }
	pauseTimer: { options: Record<string, never> }
	stopTimer: { options: Record<string, never> }
}

export function UpdateActions(self: ModuleInstance): void {
	self.setActionDefinitions({
		next: {
			name: 'Next Slide',
			options: [],
			callback: async () => {
				self.sendCommand('RightArrowFromAdmin')
			},
		},
		previous: {
			name: 'Previous Slide',
			options: [],
			callback: async () => {
				self.sendCommand('LeftArrowFromAdmin')
			},
		},
		startTimer: {
			name: 'Start Timer',
			options: [],
			callback: async () => {
				self.sendCommand('StartTimerFromAdmin')
			},
		},
		pauseTimer: {
			name: 'Pause Timer',
			options: [],
			callback: async () => {
				self.sendCommand('PauseTimerFromAdmin')
			},
		},
		stopTimer: {
			name: 'Stop Timer',
			options: [],
			callback: async () => {
				self.sendCommand('StopTimerFromAdmin')
			},
		},
	})
}
