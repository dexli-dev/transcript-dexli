// Shared types for the transcript parser. The parser normalizes three JSONL
// dialects into one renderable shape so the UI never branches on dialect.

/** Detected input dialect. */
export type Dialect = 'claude-code' | 'openai-chat' | 'generic-chat' | 'unknown';

/** Normalized speaker role. */
export type Role = 'user' | 'assistant' | 'system' | 'tool' | 'unknown';

/** One content block inside a message. */
export type Block =
	| { kind: 'text'; text: string }
	| { kind: 'thinking'; text: string }
	| { kind: 'tool_use'; name: string; input: string; id?: string }
	| { kind: 'tool_result'; text: string; isError?: boolean; toolUseId?: string }
	| { kind: 'image'; note: string }
	| { kind: 'other'; note: string; raw: string };

/** One normalized message. */
export interface Msg {
	/** stable index in the conversation, used as render key */
	i: number;
	role: Role;
	blocks: Block[];
	/** ISO timestamp when the dialect carries one */
	ts?: string;
	/** model id when the dialect carries one (Claude Code assistant lines) */
	model?: string;
	/** true when this line belongs to a subagent sidechain (Claude Code) */
	sidechain?: boolean;
	/** source line number in the file (1-based), for error reporting / jump */
	line: number;
}

/** One conversation (OpenAI fine-tune files hold many — one per line). */
export interface Conversation {
	title?: string;
	messages: Msg[];
}

/** A line that failed to parse. */
export interface ParseError {
	line: number;
	message: string;
}

export interface Stats {
	messages: number;
	byRole: Record<Role, number>;
	toolCalls: number;
	thinkingBlocks: number;
	sidechainMessages: number;
	models: string[];
	/** [first, last] ISO timestamps when available */
	span?: [string, string];
}

export interface ParseResult {
	dialect: Dialect;
	conversations: Conversation[];
	errors: ParseError[];
	stats: Stats;
	/** total lines that contained any content */
	totalLines: number;
}
