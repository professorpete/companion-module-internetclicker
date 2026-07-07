import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import * as signalR from '@microsoft/signalr'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Setup in init()
	private connection: signalR.HubConnection | null = null
	private reconnectTimeout: NodeJS.Timeout | null = null

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		this.updateStatus(InstanceStatus.Connecting)

		this.updateActions() // export actions
		this.updateFeedbacks() // export feedbacks
		this.updatePresets() // export Presets
		this.updateVariableDefinitions() // export variable definitions

		await this.initConnection()
	}

	// When module gets deleted
	async destroy(): Promise<void> {
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout)
		}
		if (this.connection) {
			await this.connection.stop()
		}
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		await this.initConnection()
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	async initConnection(): Promise<void> {
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout)
		}

		if (this.connection) {
			await this.connection.stop()
			this.connection = null
		}

		if (!this.config.host || !this.config.code) {
			this.updateStatus(InstanceStatus.BadConfig, 'Missing Host or Event Code')
			return
		}

		const apiKeyEncoded = encodeURIComponent(this.config.apikey || '')
		const codeEncoded = encodeURIComponent(this.config.code)
		let baseUrl = this.config.host
		if (baseUrl.endsWith('/')) {
			baseUrl = baseUrl.slice(0, -1)
		}
		const url = `${baseUrl}/keypresshub?isAccount=${codeEncoded}&apikey=${apiKeyEncoded}`

		this.connection = new signalR.HubConnectionBuilder()
			.withUrl(url)
			.withAutomaticReconnect()
			.configureLogging(signalR.LogLevel.Information)
			.build()

		this.connection.onclose(() => {
			this.updateStatus(InstanceStatus.Disconnected)
			this.reconnectTimeout = setTimeout(() => {
				this.startConnection()
			}, 5000)
		})

		this.connection.on('UpdateActivePresenters', (_room) => {
			this.log('info', 'Received UpdateActivePresenters from server')
		})

		await this.startConnection()
	}

	async startConnection(): Promise<void> {
		try {
			if (this.connection) {
				await this.connection.start()
				this.updateStatus(InstanceStatus.Ok)
				this.log('info', 'Hub connection started')
			}
		} catch (err: any) {
			this.log('error', err.toString())
			this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
			this.reconnectTimeout = setTimeout(() => {
				this.startConnection()
			}, 5000)
		}
	}

	public sendCommand(command: string): void {
		if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) {
			this.connection.invoke(command, this.config.code).catch((err: any) => {
				this.log('error', `Command ${command} failed: ${err.toString()}`)
			})
		} else {
			this.log('warn', `Cannot send command ${command}, not connected.`)
		}
	}
}
