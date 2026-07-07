import { InstanceBase, InstanceStatus } from '@companion-module/base';
import { GetConfigFields } from './config.js';
import { UpdateVariableDefinitions } from './variables.js';
import { UpgradeScripts } from './upgrades.js';
import { UpdateActions } from './actions.js';
import { UpdateFeedbacks } from './feedbacks.js';
import { UpdatePresets } from './presets.js';
export { UpgradeScripts };
// SignalR WebSocket transport using Node.js native WebSocket (Node 22+, no external deps)
class SignalRConnection {
    negotiateUrl;
    ws = null;
    logger;
    handlers = {};
    connected = false;
    constructor(hubUrl, logger) {
        // Build negotiate URL by inserting /negotiate before query params
        const urlObj = new URL(hubUrl);
        const basePath = urlObj.pathname.replace(/\/$/, '');
        const negotiatePath = `${basePath}/negotiate`;
        const params = new URLSearchParams(urlObj.search);
        params.set('negotiateVersion', '1');
        this.negotiateUrl = `${urlObj.origin}${negotiatePath}?${params.toString()}`;
        this.logger = logger;
    }
    on(event, handler) {
        if (!this.handlers[event]) {
            this.handlers[event] = [];
        }
        this.handlers[event].push(handler);
    }
    emit(event, ...args) {
        if (this.handlers[event]) {
            for (const handler of this.handlers[event]) {
                handler(...args);
            }
        }
    }
    async start() {
        // Step 1: Negotiate with the app server
        this.logger.info(`Negotiating at: ${this.negotiateUrl}`);
        const negotiateResponse = await fetch(this.negotiateUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        });
        if (!negotiateResponse.ok) {
            throw new Error(`Negotiate failed: ${negotiateResponse.status} ${negotiateResponse.statusText}`);
        }
        const negotiateData = await negotiateResponse.json();
        if (!negotiateData.url || !negotiateData.accessToken) {
            throw new Error('No Azure SignalR redirect received');
        }
        this.logger.info('Got Azure SignalR redirect, connecting via WebSocket...');
        // Step 2: Build WebSocket URL from the Azure redirect
        // Change https:// to wss:// and append access_token
        const wsUrl = negotiateData.url.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
            + '&access_token=' + encodeURIComponent(negotiateData.accessToken);
        // Step 3: Connect via WebSocket
        await new Promise((resolve, reject) => {
            this.ws = new WebSocket(wsUrl);
            const timeout = setTimeout(() => {
                reject(new Error('WebSocket connection timeout'));
            }, 10000);
            this.ws.onopen = () => {
                clearTimeout(timeout);
                this.logger.info('WebSocket connected, sending handshake...');
                // Send SignalR handshake
                this.ws.send(JSON.stringify({ protocol: 'json', version: 1 }) + '\x1e');
            };
            this.ws.onmessage = (event) => {
                const data = typeof event.data === 'string' ? event.data : event.data.toString();
                const messages = data.split('\x1e').filter((m) => m.trim());
                for (const msg of messages) {
                    try {
                        const parsed = JSON.parse(msg);
                        if (!this.connected) {
                            // First message is handshake response
                            if (parsed.error) {
                                reject(new Error(`Handshake error: ${parsed.error}`));
                            }
                            else {
                                this.connected = true;
                                this.logger.info('SignalR handshake complete');
                                resolve();
                            }
                            continue;
                        }
                        // Handle different message types
                        if (parsed.type === 1 && parsed.target) {
                            // Invocation message from server
                            this.emit(parsed.target, ...(parsed.arguments || []));
                        }
                        else if (parsed.type === 6) {
                            // Ping - respond with ping
                            this.ws?.send(JSON.stringify({ type: 6 }) + '\x1e');
                        }
                        else if (parsed.type === 7) {
                            // Close message
                            this.logger.info('Server sent close message');
                            this.ws?.close();
                        }
                    }
                    catch (_e) {
                        // skip unparseable
                    }
                }
            };
            this.ws.onerror = (err) => {
                clearTimeout(timeout);
                this.logger.error(`WebSocket error: ${err}`);
                reject(new Error('WebSocket connection error'));
            };
            this.ws.onclose = () => {
                clearTimeout(timeout);
                this.connected = false;
                this.logger.info('WebSocket closed');
            };
        });
    }
    async stop() {
        this.connected = false;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
    async invoke(method, ...args) {
        if (!this.ws || !this.connected) {
            throw new Error('Not connected');
        }
        const message = {
            arguments: args,
            target: method,
            type: 1, // Invocation message
        };
        this.ws.send(JSON.stringify(message) + '\x1e');
    }
}
export default class ModuleInstance extends InstanceBase {
    config; // Setup in init()
    connection = null;
    constructor(internal) {
        super(internal);
    }
    async init(config) {
        this.config = config;
        this.updateStatus(InstanceStatus.Connecting);
        this.updateActions(); // export actions
        this.updateFeedbacks(); // export feedbacks
        this.updatePresets(); // export Presets
        this.updateVariableDefinitions(); // export variable definitions
        await this.initConnection();
    }
    // When module gets deleted
    async destroy() {
        if (this.connection) {
            await this.connection.stop();
            this.connection = null;
        }
        this.log('debug', 'destroy');
    }
    async configUpdated(config) {
        this.config = config;
        await this.initConnection();
    }
    // Return config fields for web config
    getConfigFields() {
        return GetConfigFields();
    }
    updateActions() {
        UpdateActions(this);
    }
    updateFeedbacks() {
        UpdateFeedbacks(this);
    }
    updatePresets() {
        UpdatePresets(this);
    }
    updateVariableDefinitions() {
        UpdateVariableDefinitions(this);
    }
    async initConnection() {
        if (this.connection) {
            await this.connection.stop();
            this.connection = null;
        }
        if (!this.config.code) {
            this.updateStatus(InstanceStatus.BadConfig, 'Missing Event Code');
            return;
        }
        const codeEncoded = encodeURIComponent(this.config.code);
        const hubUrl = `https://internetclicker.com/keypressHub?sdkVersion=1&code=${codeEncoded}`;
        const logger = {
            info: (msg) => this.log('info', msg),
            error: (msg) => this.log('error', msg),
            warn: (msg) => this.log('warn', msg),
        };
        this.connection = new SignalRConnection(hubUrl, logger);
        this.connection.on('GetSettings', (isActive) => {
            this.log('info', `Connected to event. Active: ${isActive}`);
        });
        try {
            await this.connection.start();
            this.updateStatus(InstanceStatus.Ok);
            this.log('info', 'Connected to Internet Clicker');
        }
        catch (err) {
            this.log('error', `Connection failed: ${err.message}`);
            this.updateStatus(InstanceStatus.ConnectionFailure, err.message);
        }
    }
    sendCommand(command) {
        if (this.connection) {
            this.connection.invoke(command).catch((err) => {
                this.log('error', `Command ${command} failed: ${err.toString()}`);
            });
        }
        else {
            this.log('warn', `Cannot send command ${command}, not connected.`);
        }
    }
}
//# sourceMappingURL=main.js.map