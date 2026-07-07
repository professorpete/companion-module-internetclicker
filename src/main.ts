import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

// SignalR Long Polling transport using native fetch (no ws/eventsource dependencies)
class SignalRConnection {
	private baseUrl: string
	private connectionId: string | null = null
	private running = false
	private logger: { info: (msg: string) => void; error: (msg: string) => void; warn: (msg: string) => void }
	private handlers: Record<string, ((...args: any[]) => void)[]> = {}
	private pollAbortController: AbortController | null = null

	constructor(
		hubUrl: string,
		logger: { info: (msg: string) => void; error: (msg: string) => void; warn: (msg: string) => void },
	) {
		this.baseUrl = hubUrl
		this.logger = logger
	}

	on(event: string, handler: (...args: any[]) => void): void {
		if (!this.handlers[event]) {
			this.handlers[event] = []
		}
		this.handlers[event].push(handler)
	}

	private emit(event: string, ...args: any[]): void {
		if (this.handlers[event]) {
			for (const handler of this.handlers[event]) {
				handler(...args)
			}
		}
	}

	async start(): Promise<void> {
		// Step 1: Negotiate
		const negotiateUrl = `${this.baseUrl}/negotiate?negotiateVersion=1`
		const negotiateResponse = await fetch(negotiateUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
		})

		if (!negotiateResponse.ok) {
			throw new Error(`Negotiate failed: ${negotiateResponse.status} ${negotiateResponse.statusText}`)
		}

		const negotiateData: any = await negotiateResponse.json()
		this.connectionId = negotiateData.connectionToken || negotiateData.connectionId

		if (!this.connectionId) {
			throw new Error('No connectionId received from negotiate')
		}

		this.logger.info(`Negotiated connection: ${this.connectionId.substring(0, 8)}...`)
		this.running = true

		// Start long polling in the background
		this.pollLoop()
	}

	async stop(): Promise<void> {
		this.running = false
		if (this.pollAbortController) {
			this.pollAbortController.abort()
			this.pollAbortController = null
		}
		if (this.connectionId) {
			try {
				await fetch(`${this.baseUrl}?id=${encodeURIComponent(this.connectionId)}`, {
					method: 'DELETE',
				})
			} catch (_e) {
				// ignore cleanup errors
			}
			this.connectionId = null
		}
	}

	async invoke(method: string, ...args: any[]): Promise<void> {
		if (!this.connectionId) {
			throw new Error('Not connected')
		}

		const message = {
			arguments: args,
			target: method,
			type: 1, // Invocation message
		}

		const url = `${this.baseUrl}?id=${encodeURIComponent(this.connectionId)}`
		const body = JSON.stringify(message) + '\x1e' // Record separator

		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
			body: body,
		})

		if (!response.ok) {
			throw new Error(`Invoke failed: ${response.status} ${response.statusText}`)
		}
	}

	private async pollLoop(): Promise<void> {
		while (this.running && this.connectionId) {
			try {
				this.pollAbortController = new AbortController()
				const url = `${this.baseUrl}?id=${encodeURIComponent(this.connectionId)}`
				const response = await fetch(url, {
					method: 'GET',
					signal: this.pollAbortController.signal,
				})

				if (!response.ok) {
					this.logger.error(`Poll failed: ${response.status}`)
					break
				}

				const text = await response.text()
				if (text) {
					// Parse SignalR messages (delimited by 0x1E record separator)
					const messages = text.split('\x1e').filter((m) => m.trim())
					for (const msg of messages) {
						try {
							const parsed = JSON.parse(msg)
							if (parsed.type === 1 && parsed.target) {
								// Invocation message
								this.emit(parsed.target, ...(parsed.arguments || []))
							}
						} catch (_e) {
							// skip unparseable messages
						}
					}
				}
			} catch (e: any) {
				if (e.name === 'AbortError') {
					break
				}
				this.logger.error(`Poll error: ${e.message}`)
				// Wait before retrying
				await new Promise((resolve) => setTimeout(resolve, 2000))
			}
		}
	}
}

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Setup in init()
	private connection: SignalRConnection | null = null

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
		if (this.connection) {
			await this.connection.stop()
			this.connection = null
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
		if (this.connection) {
			await this.connection.stop()
			this.connection = null
		}

		if (!this.config.code) {
			this.updateStatus(InstanceStatus.BadConfig, 'Missing Event Code')
			return
		}

		const codeEncoded = encodeURIComponent(this.config.code)
		const hubUrl = `https://internetclicker.com/keypressHub?sdkVersion=1&code=${codeEncoded}`

		const logger = {
			info: (msg: string) => this.log('info', msg),
			error: (msg: string) => this.log('error', msg),
			warn: (msg: string) => this.log('warn', msg),
		}

		this.connection = new SignalRConnection(hubUrl, logger)

		this.connection.on('GetSettings', (isActive: boolean) => {
			this.log('info', `Connected to event. Active: ${isActive}`)
		})

		try {
			await this.connection.start()
			this.updateStatus(InstanceStatus.Ok)
			this.log('info', 'Connected to Internet Clicker')
		} catch (err: any) {
			this.log('error', `Connection failed: ${err.message}`)
			this.updateStatus(InstanceStatus.ConnectionFailure, err.message)
		}
	}

	public sendCommand(command: string): void {
		if (this.connection) {
			this.connection.invoke(command).catch((err: any) => {
				this.log('error', `Command ${command} failed: ${err.toString()}`)
			})
		} else {
			this.log('warn', `Cannot send command ${command}, not connected.`)
		}
	}
}
