import type ModuleInstance from './main.js'

export type VariablesSchema = {
	eventCode: string
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	self.setVariableDefinitions({
		eventCode: { name: 'Event Code' },
	})
}
