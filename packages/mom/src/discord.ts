import {
	Client,
	type DMChannel,
	GatewayIntentBits,
	type Message,
	type NewsChannel,
	Partials,
	type TextChannel,
} from "discord.js";
import { appendFileSync, existsSync, mkdirSync } from "fs";
import { basename, join } from "path";
import * as log from "./log.js";
import type { ChannelStore } from "./store.js";
import type { Attachment, BotAdapter, BotChannelInfo, BotEvent, BotHandler, BotUserInfo } from "./types.js";

// ============================================================================
// Per-channel queue (same as SlackBot)
// ============================================================================

type QueuedWork = () => Promise<void>;

const DISCORD_MAX_LENGTH = 4000;
const TRUNCATION_SUFFIX = '\n\n...(内容过长已截断，如需查看完整输出请回复"是"或"继续")';

function truncateForDiscord(text: string): string {
	if (text.length <= DISCORD_MAX_LENGTH) return text;
	const safeLength = DISCORD_MAX_LENGTH - TRUNCATION_SUFFIX.length;
	return text.slice(0, safeLength) + TRUNCATION_SUFFIX;
}

class ChannelQueue {
	private queue: QueuedWork[] = [];
	private processing = false;

	enqueue(work: QueuedWork): void {
		this.queue.push(work);
		this.processNext();
	}

	size(): number {
		return this.queue.length;
	}

	private async processNext(): Promise<void> {
		if (this.processing || this.queue.length === 0) return;
		this.processing = true;
		const work = this.queue.shift()!;
		try {
			await work();
		} catch (err) {
			log.logWarning("Queue error", err instanceof Error ? err.message : String(err));
		}
		this.processing = false;
		this.processNext();
	}
}

// ============================================================================
// DiscordBot
// ============================================================================

export class DiscordBot implements BotAdapter {
	private client: Client;
	private handler: BotHandler;
	private token: string;
	private workingDir: string;
	private store: ChannelStore;
	private botUserId: string | null = null;
	private startupTime = 0;

	private users = new Map<string, BotUserInfo>();
	private channels = new Map<string, BotChannelInfo>();
	private queues = new Map<string, ChannelQueue>();

	constructor(handler: BotHandler, config: { token: string; workingDir: string; store: ChannelStore }) {
		this.handler = handler;
		this.token = config.token;
		this.workingDir = config.workingDir;
		this.store = config.store;

		this.client = new Client({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.GuildMessageTyping,
				GatewayIntentBits.DirectMessages,
				GatewayIntentBits.DirectMessageTyping,
				GatewayIntentBits.MessageContent,
			],
			partials: [Partials.Channel, Partials.Message],
		});
	}

	// ==========================================================================
	// Public API - BotAdapter implementation
	// ==========================================================================

	async start(): Promise<void> {
		this.client.once("ready", (client) => {
			this.botUserId = client.user?.id ?? null;
			this.startupTime = Date.now();
			log.logInfo(`Discord bot ready: ${client.user?.tag}`);
		});

		this.setupEventHandlers();
		await this.client.login(this.token);

		// Wait for ready
		await new Promise<void>((resolve) => {
			if (this.botUserId) {
				resolve();
			} else {
				this.client.once("ready", () => resolve());
			}
		});

		await this.fetchGuildsAndChannels();
		log.logInfo(`Loaded ${this.channels.size} channels, ${this.users.size} users`);
		log.logConnected();
	}

	getUser(userId: string): BotUserInfo | undefined {
		return this.users.get(userId);
	}

	getChannel(channelId: string): BotChannelInfo | undefined {
		return this.channels.get(channelId);
	}

	getAllUsers(): BotUserInfo[] {
		return Array.from(this.users.values());
	}

	getAllChannels(): BotChannelInfo[] {
		return Array.from(this.channels.values());
	}

	async postMessage(channel: string, text: string): Promise<string> {
		const discordChannel = await this.getChannelById(channel);
		if (!discordChannel) {
			throw new Error(`Channel not found: ${channel}`);
		}
		const message = await discordChannel.send(truncateForDiscord(text));
		return message.id;
	}

	async updateMessage(channel: string, ts: string, text: string): Promise<void> {
		const discordChannel = await this.getChannelById(channel);
		if (!discordChannel) return;

		try {
			const message = await discordChannel.messages.fetch(ts);
			await message.edit(truncateForDiscord(text));
		} catch {
			// Message may not exist, post new one
			await this.postMessage(channel, text);
		}
	}

	async deleteMessage(channel: string, ts: string): Promise<void> {
		const discordChannel = await this.getChannelById(channel);
		if (!discordChannel) return;

		try {
			const message = await discordChannel.messages.fetch(ts);
			await message.delete();
		} catch {
			// Ignore if message doesn't exist
		}
	}

	async postInThread(channel: string, threadTs: string, text: string): Promise<string> {
		const discordChannel = await this.getChannelById(channel);
		if (!discordChannel) {
			throw new Error(`Channel not found: ${channel}`);
		}

		try {
			const parentMessage = await discordChannel.messages.fetch(threadTs);
			const thread = parentMessage.hasThread
				? parentMessage.thread
				: await parentMessage.startThread({ name: "Response thread" });

			if (thread) {
				const reply = await thread.send(text);
				return reply.id;
			}
		} catch {
			// Fallback: just reply to the channel
		}

		return this.postMessage(channel, text);
	}

	async uploadFile(channel: string, filePath: string, title?: string): Promise<void> {
		const discordChannel = await this.getChannelById(channel);
		if (!discordChannel) return;

		const fileName = title || basename(filePath);
		await discordChannel.send({
			files: [{ attachment: filePath, name: fileName }],
		});
	}

	logToFile(channel: string, entry: object): void {
		const dir = join(this.workingDir, channel);
		if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
		appendFileSync(join(dir, "log.jsonl"), `${JSON.stringify(entry)}\n`);
	}

	logBotResponse(channel: string, text: string, ts: string): void {
		this.logToFile(channel, {
			date: new Date().toISOString(),
			ts,
			user: "bot",
			text,
			attachments: [],
			isBot: true,
		});
	}

	enqueueEvent(event: BotEvent): boolean {
		const queue = this.getQueue(event.channel);
		if (queue.size() >= 5) {
			log.logWarning(`Event queue full for ${event.channel}, discarding: ${event.text.substring(0, 50)}`);
			return false;
		}
		log.logInfo(`Enqueueing event for ${event.channel}: ${event.text.substring(0, 50)}`);
		queue.enqueue(() => this.handler.handleEvent(event, this, true));
		return true;
	}

	// ==========================================================================
	// Private - Event Handlers
	// ==========================================================================

	private setupEventHandlers(): void {
		this.client.on("messageCreate", async (message) => {
			await this.handleMessage(message);
		});
	}

	private async handleMessage(message: Message): Promise<void> {
		// Skip bot messages
		if (message.author.bot || message.author.id === this.botUserId) return;

		// Skip messages before startup
		if (message.createdTimestamp < this.startupTime) return;

		const channelId = message.channelId;
		const isDM = message.channel.type === 1; // DM

		// Check for bot mention in guild channels
		const isMentioned = message.mentions.users.has(this.botUserId ?? "");
		const text = this.cleanMentions(message.content);

		// Only respond to mentions in guilds, or all messages in DMs
		if (!isDM && !isMentioned) {
			// Still log for context
			this.logUserMessage(message);
			return;
		}

		const event: BotEvent = {
			type: isDM ? "dm" : "mention",
			channel: channelId,
			ts: message.id,
			user: message.author.id,
			text,
			files: message.attachments.map((a) => ({ name: a.name ?? undefined, url: a.url })),
		};

		// Log and process attachments
		event.attachments = this.logUserMessage(message);

		// Check for stop command
		if (text.toLowerCase().trim() === "stop") {
			if (this.handler.isRunning(channelId)) {
				this.handler.handleStop(channelId, this);
			} else {
				await this.postMessage(channelId, "_Nothing running_");
			}
			return;
		}

		if (this.handler.isRunning(channelId)) {
			await this.postMessage(channelId, "_Already working. Say `@mom stop` to cancel._");
		} else {
			this.getQueue(channelId).enqueue(() => this.handler.handleEvent(event, this));
		}
	}

	private cleanMentions(text: string): string {
		// Remove <@userid> and <@!userid> mentions
		return text.replace(/<@!?\d+>/g, "").trim();
	}

	private logUserMessage(message: Message): Attachment[] {
		const user: BotUserInfo = {
			id: message.author.id,
			userName: message.author.username,
			displayName: message.author.displayName ?? message.author.username,
		};
		this.users.set(user.id, user);

		// Process attachments
		const attachments: Attachment[] = [];
		message.attachments.forEach((file) => {
			if (file.name && file.url) {
				const filename = this.store.generateLocalFilename(file.name, message.id);
				const localPath = `${message.channelId}/attachments/${filename}`;
				attachments.push({ original: file.name, local: localPath });
			}
		});

		this.logToFile(message.channelId, {
			date: new Date(message.createdTimestamp).toISOString(),
			ts: message.id,
			user: message.author.id,
			userName: user.userName,
			displayName: user.displayName,
			text: this.cleanMentions(message.content),
			attachments,
			isBot: false,
		});

		return attachments;
	}

	private getQueue(channelId: string): ChannelQueue {
		let queue = this.queues.get(channelId);
		if (!queue) {
			queue = new ChannelQueue();
			this.queues.set(channelId, queue);
		}
		return queue;
	}

	private async getChannelById(channelId: string): Promise<TextChannel | DMChannel | NewsChannel | null> {
		try {
			const channel = await this.client.channels.fetch(channelId);
			if (channel?.isTextBased() && !channel.isVoiceBased()) {
				return channel as TextChannel | DMChannel | NewsChannel;
			}
		} catch {
			// Channel not accessible
		}
		return null;
	}

	private async fetchGuildsAndChannels(): Promise<void> {
		const guilds = await this.client.guilds.fetch();
		const guildList = guilds.map((oauth2Guild) => oauth2Guild);

		for (let guildIndex = 0; guildIndex < guildList.length; guildIndex++) {
			const oauth2Guild = guildList[guildIndex];
			const guild = await this.client.guilds.fetch(oauth2Guild.id);

			// Fetch channels
			const channels = await guild.channels.fetch();
			const channelList = channels.map((channel) => channel);
			for (let channelIndex = 0; channelIndex < channelList.length; channelIndex++) {
				const channel = channelList[channelIndex];
				if (channel?.isTextBased() && !channel.isVoiceBased()) {
					this.channels.set(channel.id, {
						id: channel.id,
						name: `${guild.name}/${channel.name}`,
					});
				}
			}

			// Fetch members for user info
			try {
				const members = await guild.members.fetch();
				const memberList = members.map((member) => member);
				for (let memberIndex = 0; memberIndex < memberList.length; memberIndex++) {
					const member = memberList[memberIndex];
					if (!member.user.bot) {
						this.users.set(member.id, {
							id: member.id,
							userName: member.user.username,
							displayName: member.displayName ?? member.user.username,
						});
					}
				}
			} catch {
				// May not have permission
			}
		}
	}
}

export function createDiscordBot(
	handler: BotHandler,
	config: { token: string; workingDir: string; store: ChannelStore },
): DiscordBot {
	return new DiscordBot(handler, config);
}
