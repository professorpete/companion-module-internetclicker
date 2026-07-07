import { type SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	apikey: string
	code: string
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Host URL',
			width: 12,
			default: 'http://localhost:52722',
		},
		{
			type: 'textinput',
			id: 'apikey',
			label: 'API Key',
			width: 12,
		},
		{
			type: 'textinput',
			id: 'code',
			label: 'Event Code',
			width: 12,
		},
	]
}
