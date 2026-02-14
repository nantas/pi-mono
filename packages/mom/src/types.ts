// ============================================================================
// Platform-Agnostic Bot Event
// ============================================================================

export type BotEventType = "mention" | "dm";

export interface BotEvent {
	type: BotEventType;
	channel: string;
	ts: string;
	user: string;
	text: string;
	files?: Array<{ name?: string; url?: string }>;
	attachments?: Attachment[];
}

// ============================================================================
// User and Channel Info
// ============================================================================

export interface BotUserInfo {
	id: string;
	userName: string;
	displayName: string;
}

export interface BotChannelInfo {
	id: string;
	name: string;
}

// ============================================================================
// Attachment
// ============================================================================

export interface Attachment {
	original: string;
	local: string;
}

// ============================================================================
// Bot Context (passed to agent)
// ============================================================================

export interface BotContext {
	message: {
		text: string;
		rawText: string;
		user: string;
		userName?: string;
		channel: string;
		ts: string;
		attachments: Array<{ local: string }>;
	};
	channelName?: string;
	channels: BotChannelInfo[];
	users: BotUserInfo[];
	respond: (text: string, shouldLog?: boolean) => Promise<void>;
	replaceMessage: (text: string) => Promise<void>;
	respondInThread: (text: string) => Promise<void>;
	setTyping: (isTyping: boolean) => Promise<void>;
	uploadFile: (filePath: string, title?: string) => Promise<void>;
	setWorking: (working: boolean) => Promise<void>;
	deleteMessage: () => Promise<void>;
}

// ============================================================================
// Bot Handler (implemented by main.ts)
// ============================================================================

export interface BotHandler {
	isRunning(channelId: string): boolean;
	handleEvent(event: BotEvent, bot: BotAdapter, isEvent?: boolean): Promise<void>;
	handleStop(channelId: string, bot: BotAdapter): Promise<void>;
}

// ============================================================================
// Bot Adapter (implemented by SlackBot, DiscordBot)
// ============================================================================

export interface BotAdapter {
	getUser(userId: string): BotUserInfo | undefined;
	getChannel(channelId: string): BotChannelInfo | undefined;
	getAllUsers(): BotUserInfo[];
	getAllChannels(): BotChannelInfo[];
	postMessage(channel: string, text: string): Promise<string>;
	updateMessage(channel: string, ts: string, text: string): Promise<void>;
	deleteMessage(channel: string, ts: string): Promise<void>;
	postInThread(channel: string, threadTs: string, text: string): Promise<string>;
	uploadFile(channel: string, filePath: string, title?: string): Promise<void>;
	logToFile(channel: string, entry: object): void;
	logBotResponse(channel: string, text: string, ts: string): void;
	enqueueEvent(event: BotEvent): boolean;
	start(): Promise<void>;
}
