# Discord Handler Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Discord support to pi-mom by creating a DiscordBot class that mirrors SlackBot's interface, enabling mom to work on both platforms.

**Architecture:** Extract platform-agnostic interfaces from existing Slack code (BotEvent, BotContext, BotHandler), then implement a DiscordBot class using discord.js that adheres to these interfaces. The main.ts will detect which platform to use based on environment variables.

**Tech Stack:** TypeScript, discord.js (v14+), existing pi-mom infrastructure (Agent, tools, events)

---

## Prerequisites

```bash
# Fork pi-mono on GitHub first, then:
git clone https://github.com/YOUR_USERNAME/pi-mono.git
cd pi-mono
npm install
```

---

## Task 1: Install discord.js Dependency

**Files:**
- Modify: `packages/mom/package.json`

**Step 1: Add discord.js dependency**

Run:
```bash
cd packages/mom && npm install discord.js
```

**Step 2: Verify installation**

Run:
```bash
grep discord.js packages/mom/package.json
```
Expected: `"discord.js": "^14.x.x"` in dependencies

**Step 3: Commit**

```bash
git add packages/mom/package.json packages/mom/package-lock.json
git commit -m "chore(mom): add discord.js dependency"
```

---

## Task 2: Create Platform-Agnostic Types

**Files:**
- Create: `packages/mom/src/types.ts`

**Step 1: Create types.ts with platform-agnostic interfaces**

```typescript
// packages/mom/src/types.ts

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
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
cd /Users/nantas-agent/projects/agentic/pi-mono && npx tsc --noEmit packages/mom/src/types.ts
```
Expected: No errors

**Step 3: Commit**

```bash
git add packages/mom/src/types.ts
git commit -m "feat(mom): add platform-agnostic bot types"
```

---

## Task 3: Refactor SlackBot to Use Shared Types

**Files:**
- Modify: `packages/mom/src/slack.ts`
- Modify: `packages/mom/src/main.ts`

**Step 1: Update slack.ts imports and exports**

Replace the existing type definitions in `slack.ts` (lines 10-66) to import from types.ts and re-export for backward compatibility:

```typescript
// At the top of slack.ts, add import:
import type {
	Attachment,
	BotAdapter,
	BotChannelInfo,
	BotContext,
	BotEvent,
	BotHandler,
	BotUserInfo,
} from "./types.js";

// Export types with old names for backward compatibility
export type { BotEvent as SlackEvent, BotUserInfo as SlackUser, BotChannelInfo as SlackChannel };
export type { BotChannelInfo as ChannelInfo, BotUserInfo as UserInfo };
export type { BotContext as SlackContext, BotHandler as MomHandler };
```

**Step 2: Update SlackBot class to implement BotAdapter**

Change class declaration (line 125):
```typescript
export class SlackBot implements BotAdapter {
```

**Step 3: Update method return types to use shared types**

Update these methods to return the shared types:
- `getUser(userId: string): BotUserInfo | undefined`
- `getChannel(channelId: string): BotChannelInfo | undefined`
- `getAllUsers(): BotUserInfo[]`
- `getAllChannels(): BotChannelInfo[]`

**Step 4: Verify TypeScript compiles**

Run:
```bash
cd /Users/nantas-agent/projects/agentic/pi-mono && npm run build 2>&1 | head -50
```
Expected: Build succeeds or only has unrelated errors

**Step 5: Commit**

```bash
git add packages/mom/src/slack.ts
git commit -m "refactor(mom): SlackBot implements BotAdapter interface"
```

---

## Task 4: Create DiscordBot Class

**Files:**
- Create: `packages/mom/src/discord.ts`

**Step 1: Create discord.ts with basic structure**

```typescript
// packages/mom/src/discord.ts
import {
	Client,
	GatewayIntentBits,
	Partials,
	type Channel,
	type Guild,
	type Message,
	type TextChannel,
	type ThreadChannel,
	type User,
	type DMChannel,
	type NewsChannel,
	type Attachment as DiscordAttachment,
} from "discord.js";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { basename, join } from "path";
import * as log from "./log.js";
import type {
	Attachment,
	BotAdapter,
	BotChannelInfo,
	BotEvent,
	BotHandler,
	BotUserInfo,
} from "./types.js";
import type { ChannelStore } from "./store.js";

// ============================================================================
// Per-channel queue (same as SlackBot)
// ============================================================================

type QueuedWork = () => Promise<void>;

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
	private workingDir: string;
	private store: ChannelStore;
	private botUserId: string | null = null;
	private startupTime: number = 0;

	private users = new Map<string, BotUserInfo>();
	private channels = new Map<string, BotChannelInfo>();
	private guilds = new Map<string, Guild>();
	private queues = new Map<string, ChannelQueue>();
	private lastMessages = new Map<string, { content: string; edit: (text: string) => Promise<Message> }>();

	constructor(
		handler: BotHandler,
		config: { token: string; workingDir: string; store: ChannelStore },
	) {
		this.handler = handler;
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
		await this.client.login(process.env.MOM_DISCORD_TOKEN);

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
		const message = await discordChannel.send(text);
		this.lastMessages.set(message.id, {
			content: text,
			edit: (newText) => message.edit(newText),
		});
		return message.id;
	}

	async updateMessage(channel: string, ts: string, text: string): Promise<void> {
		const discordChannel = await this.getChannelById(channel);
		if (!discordChannel) return;

		try {
			const message = await discordChannel.messages.fetch(ts);
			await message.edit(text);
			this.lastMessages.set(ts, {
				content: text,
				edit: (newText) => message.edit(newText),
			});
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
		for (const file of message.attachments.values()) {
			if (file.name && file.url) {
				const filename = this.store.generateLocalFilename(file.name, message.id);
				const localPath = `${message.channelId}/attachments/${filename}`;
				attachments.push({ original: file.name, local: localPath });
				// Note: Discord attachments are public URLs, no auth needed
				// Could download here if needed
			}
		}

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
		
		for (const [_, oauth2Guild] of guilds) {
			const guild = await this.client.guilds.fetch(oauth2Guild.id);
			this.guilds.set(guild.id, guild);

			// Fetch channels
			const channels = await guild.channels.fetch();
			for (const [_, channel] of channels) {
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
				for (const [_, member] of members) {
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
```

**Step 2: Verify TypeScript compiles**

Run:
```bash
cd /Users/nantas-agent/projects/agentic/pi-mono && npx tsc --noEmit packages/mom/src/discord.ts 2>&1 | head -30
```
Expected: No errors (or fix any type issues)

**Step 3: Commit**

```bash
git add packages/mom/src/discord.ts
git commit -m "feat(mom): add DiscordBot class implementing BotAdapter"
```

---

## Task 5: Update main.ts for Multi-Platform Support

**Files:**
- Modify: `packages/mom/src/main.ts`

**Step 1: Add Discord imports and environment variables**

Add at top of main.ts (after existing imports):
```typescript
import { createDiscordBot, DiscordBot } from "./discord.js";
import type { BotAdapter, BotContext, BotEvent } from "./types.js";
```

Add Discord env vars (after Slack env vars, around line 17):
```typescript
const MOM_DISCORD_TOKEN = process.env.MOM_DISCORD_TOKEN;
```

**Step 2: Add platform detection logic**

Add after env vars (around line 25):
```typescript
type Platform = "slack" | "discord";

function detectPlatform(): Platform {
	if (MOM_DISCORD_TOKEN) return "discord";
	if (MOM_SLACK_APP_TOKEN && MOM_SLACK_BOT_TOKEN) return "slack";
	
	console.error("No platform credentials found.");
	console.error("For Slack: Set MOM_SLACK_APP_TOKEN and MOM_SLACK_BOT_TOKEN");
	console.error("For Discord: Set MOM_DISCORD_TOKEN");
	process.exit(1);
}

const platform = detectPlatform();
```

**Step 3: Update validation logic**

Replace the Slack-only validation (around line 74-77):
```typescript
// OLD:
if (!MOM_SLACK_APP_TOKEN || !MOM_SLACK_BOT_TOKEN) {
	console.error("Missing env: MOM_SLACK_APP_TOKEN, MOM_SLACK_BOT_TOKEN");
	process.exit(1);
}

// NEW:
if (platform === "slack" && (!MOM_SLACK_APP_TOKEN || !MOM_SLACK_BOT_TOKEN)) {
	console.error("Missing env: MOM_SLACK_APP_TOKEN, MOM_SLACK_BOT_TOKEN");
	process.exit(1);
}
if (platform === "discord" && !MOM_DISCORD_TOKEN) {
	console.error("Missing env: MOM_DISCORD_TOKEN");
	process.exit(1);
}
```

**Step 4: Update createSlackContext to createBotContext**

Rename and generalize `createSlackContext` function (around line 114):
```typescript
function createBotContext(
	event: BotEvent,
	bot: BotAdapter,
	state: ChannelState,
	isEvent?: boolean,
): BotContext {
	// ... existing implementation, change slack.getUser to bot.getUser, etc.
	// Replace slack.getChannel with bot.getChannel
	// Replace slack.getAllChannels with bot.getAllChannels
	// Replace slack.getAllUsers with bot.getAllUsers
	// Replace slack.postMessage with bot.postMessage
	// Replace slack.updateMessage with bot.updateMessage
	// Replace slack.postInThread with bot.postInThread
	// Replace slack.uploadFile with bot.uploadFile
	// Replace slack.deleteMessage with bot.deleteMessage
	// Replace slack.logBotResponse with bot.logBotResponse
}
```

**Step 5: Update handler to use BotAdapter**

Change handler type annotation (around line 236):
```typescript
const handler: MomHandler = {
	// ... methods stay the same, but change slack param type to BotAdapter
	async handleStop(channelId: string, bot: BotAdapter): Promise<void> {
		// ...
	},
	async handleEvent(event: BotEvent, bot: BotAdapter, isEvent?: boolean): Promise<void> {
		// ... change createSlackContext to createBotContext
		const ctx = createBotContext(event, bot, state, isEvent);
		// ...
	},
};
```

**Step 6: Update bot initialization (at bottom of file, around line 296)**

Replace:
```typescript
const bot = new SlackBotClass(handler, {
	appToken: MOM_SLACK_APP_TOKEN,
	botToken: MOM_SLACK_BOT_TOKEN,
	workingDir,
	store: sharedStore,
});
```

With:
```typescript
let bot: BotAdapter;

if (platform === "slack") {
	bot = new SlackBotClass(handler, {
		appToken: MOM_SLACK_APP_TOKEN!,
		botToken: MOM_SLACK_BOT_TOKEN!,
		workingDir,
		store: sharedStore,
	});
} else {
	bot = createDiscordBot(handler, {
		token: MOM_DISCORD_TOKEN!,
		workingDir,
		store: sharedStore,
	});
}
```

**Step 7: Update events watcher for platform-agnostic bot**

Change (around line 306):
```typescript
// OLD:
const eventsWatcher = createEventsWatcher(workingDir, bot);

// NEW (events.ts needs update too, see Task 6):
const eventsWatcher = createEventsWatcher(workingDir, bot);
```

**Step 8: Verify TypeScript compiles**

Run:
```bash
cd /Users/nantas-agent/projects/agentic/pi-mono && npm run build 2>&1 | head -50
```
Expected: Build succeeds or shows only type issues to fix

**Step 9: Commit**

```bash
git add packages/mom/src/main.ts
git commit -m "feat(mom): add multi-platform support (Slack/Discord)"
```

---

## Task 6: Update events.ts for BotAdapter

**Files:**
- Modify: `packages/mom/src/events.ts`

**Step 1: Update imports**

Change line 6:
```typescript
// OLD:
import type { SlackBot, SlackEvent } from "./slack.js";

// NEW:
import type { BotAdapter, BotEvent } from "./types.js";
```

**Step 2: Update EventsWatcher class**

Update constructor (line 51-56):
```typescript
constructor(
	private eventsDir: string,
	private bot: BotAdapter,  // Changed from SlackBot
) {
	this.startTime = Date.now();
}
```

**Step 3: Update execute method**

Update line 335-345:
```typescript
// Create synthetic BotEvent (was SlackEvent)
const syntheticEvent: BotEvent = {
	type: "mention",
	channel: event.channelId,
	user: "EVENT",
	text: message,
	ts: Date.now().toString(),
};

// Enqueue for processing
const enqueued = this.bot.enqueueEvent(syntheticEvent);
```

**Step 4: Update createEventsWatcher function**

Update line 380-383:
```typescript
export function createEventsWatcher(workspaceDir: string, bot: BotAdapter): EventsWatcher {
	const eventsDir = join(workspaceDir, "events");
	return new EventsWatcher(eventsDir, bot);
}
```

**Step 5: Verify TypeScript compiles**

Run:
```bash
cd /Users/nantas-agent/projects/agentic/pi-mono && npm run build 2>&1 | head -30
```

**Step 6: Commit**

```bash
git add packages/mom/src/events.ts
git commit -m "refactor(mom): events watcher uses BotAdapter interface"
```

---

## Task 7: Update agent.ts to Use Shared Types

**Files:**
- Modify: `packages/mom/src/agent.ts`

**Step 1: Update imports**

Change line 22:
```typescript
// OLD:
import type { ChannelInfo, UserInfo, SlackContext } from "./slack.js";

// NEW:
import type { BotChannelInfo, BotUserInfo, BotContext } from "./types.js";
```

**Step 2: Update function signatures**

Update `buildSystemPrompt` (line 141):
```typescript
function buildSystemPrompt(
	workspacePath: string,
	channelId: string,
	memory: string,
	sandboxConfig: SandboxConfig,
	channels: BotChannelInfo[],  // Changed from ChannelInfo
	users: BotUserInfo[],         // Changed from UserInfo
	skills: Skill[],
): string {
```

Update `AgentRunner.run` interface (line 36-43):
```typescript
export interface AgentRunner {
	run(
		ctx: BotContext,  // Changed from SlackContext
		store: ChannelStore,
		pendingMessages?: PendingMessage[],
	): Promise<{ stopReason: string; errorMessage?: string }>;
	abort(): void;
}
```

**Step 3: Update system prompt for Discord**

In `buildSystemPrompt` (around line 170), add platform-specific formatting:
```typescript
// Around line 170, update the Slack formatting section:
const formattingSection = `## Message Formatting (Markdown)
Bold: **text**, Italic: *text*, Code: \`code\`, Block: \`\`\`code\`\`\`, Links: [text](url)
Use standard Markdown formatting.`;

// Replace the "## Slack Formatting" section with the above
```

**Step 4: Verify TypeScript compiles**

Run:
```bash
cd /Users/nantas-agent/projects/agentic/pi-mono && npm run build 2>&1 | head -30
```

**Step 5: Commit**

```bash
git add packages/mom/src/agent.ts
git commit -m "refactor(mom): agent uses shared BotContext types"
```

---

## Task 8: Update README with Discord Setup

**Files:**
- Modify: `packages/mom/README.md`

**Step 1: Add Discord section after Slack App Setup**

Add after the Slack setup section (around line 57):

```markdown
### Discord Bot Setup

1. Go to https://discord.com/developers/applications
2. Create a new application
3. Go to **Bot** section and click **Add Bot**
4. Enable **Message Content Intent** under Privileged Gateway Intents
5. Copy the **Token**. This is `MOM_DISCORD_TOKEN`
6. Go to **OAuth2** > **URL Generator**
7. Select **bot** scope
8. Select permissions: 
   - Read Messages/View Channels
   - Send Messages
   - Manage Messages
   - Read Message History
   - Attach Files
9. Use the generated URL to invite the bot to your server
```

**Step 2: Update Environment Variables section**

Update the environment variables table (around line 93):

```markdown
| Variable | Description |
|----------|-------------|
| `MOM_SLACK_APP_TOKEN` | Slack app-level token (xapp-...) |
| `MOM_SLACK_BOT_TOKEN` | Slack bot token (xoxb-...) |
| `MOM_DISCORD_TOKEN` | Discord bot token |
| `ANTHROPIC_API_KEY` | (Optional) Anthropic API key |
```

**Step 3: Add Discord Quick Start example**

Add after Slack Quick Start (around line 80):

```markdown
### Quick Start (Discord)

```bash
# Set environment variables
export MOM_DISCORD_TOKEN=your-bot-token
export ANTHROPIC_API_KEY=sk-ant-...

# Create Docker sandbox (recommended)
docker run -d \
  --name mom-sandbox \
  -v $(pwd)/data:/workspace \
  alpine:latest \
  tail -f /dev/null

# Run mom in Docker mode
mom --sandbox=docker:mom-sandbox ./data
```
```

**Step 4: Commit**

```bash
git add packages/mom/README.md
git commit -m "docs(mom): add Discord setup instructions"
```

---

## Task 9: Add CHANGELOG Entry

**Files:**
- Modify: `packages/mom/CHANGELOG.md`

**Step 1: Add entry to Unreleased section**

```markdown
## [Unreleased]

### Added
- Discord platform support via `MOM_DISCORD_TOKEN` environment variable
- Platform-agnostic `BotAdapter` interface for multi-platform support
- `discord.ts` module with `DiscordBot` class

### Changed
- Refactored `SlackBot` to implement shared `BotAdapter` interface
- Platform types moved to `types.ts` for reuse
```

**Step 2: Commit**

```bash
git add packages/mom/CHANGELOG.md
git commit -m "docs(mom): add Discord support to changelog"
```

---

## Task 10: Build and Test

**Step 1: Run full build**

Run:
```bash
cd /Users/nantas-agent/projects/agentic/pi-mono && npm run build
```
Expected: Build completes successfully

**Step 2: Run linting**

Run:
```bash
cd /Users/nantas-agent/projects/agentic/pi-mono && npm run check
```
Expected: No errors (fix any that appear)

**Step 3: Test Slack mode (optional, requires tokens)**

Run:
```bash
export MOM_SLACK_APP_TOKEN=xapp-...
export MOM_SLACK_BOT_TOKEN=xoxb-...
./pi-test.sh mom --sandbox=docker:mom-sandbox ./data
```

**Step 4: Test Discord mode (optional, requires token)**

Run:
```bash
export MOM_DISCORD_TOKEN=your-bot-token
./pi-test.sh mom --sandbox=docker:mom-sandbox ./data
```

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(mom): complete Discord platform support"
```

---

## Task 11: Create Pull Request

**Step 1: Push to fork**

```bash
git push origin main
```

**Step 2: Create PR on GitHub**

Go to https://github.com/YOUR_USERNAME/pi-mono and create a pull request with:

**Title:** `feat(mom): add Discord platform support`

**Description:**
```markdown
## Summary
- Add Discord platform support via discord.js
- Create platform-agnostic `BotAdapter` interface
- Refactor `SlackBot` to implement shared interface
- Update documentation with Discord setup instructions

## Testing
- [ ] Tested Slack mode with `MOM_SLACK_*` tokens
- [ ] Tested Discord mode with `MOM_DISCORD_TOKEN`
- [ ] Build passes: `npm run build`
- [ ] Lint passes: `npm run check`

Fixes #XXX (if applicable)
```

---

## Summary

After completing this plan, pi-mom will support both Slack and Discord platforms:

1. **Platform Detection**: Automatically detects which platform to use based on environment variables
2. **Shared Interface**: `BotAdapter` abstracts platform-specific operations
3. **DiscordBot**: Full implementation using discord.js with thread support, file uploads, and event queuing
4. **Backward Compatible**: Existing Slack setup continues to work unchanged

**Files Created:**
- `packages/mom/src/types.ts` - Platform-agnostic types
- `packages/mom/src/discord.ts` - Discord implementation

**Files Modified:**
- `packages/mom/src/main.ts` - Multi-platform support
- `packages/mom/src/slack.ts` - Implements BotAdapter
- `packages/mom/src/events.ts` - Uses BotAdapter
- `packages/mom/src/agent.ts` - Uses shared types
- `packages/mom/README.md` - Discord docs
- `packages/mom/CHANGELOG.md` - Version tracking
- `packages/mom/package.json` - discord.js dependency
