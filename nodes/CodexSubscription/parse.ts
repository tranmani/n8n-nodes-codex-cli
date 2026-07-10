/**
 * Pure parsers for Codex CLI output. No n8n imports — unit-tested directly.
 */

export interface CodexMeta {
	/** final assistant message, if present in the event stream (fallback to the output file) */
	message?: string;
	inputTokens?: number;
	outputTokens?: number;
	sessionId?: string;
	isError?: boolean;
}

/**
 * Mine `codex exec --json` newline-delimited events for metadata. Codex emits one
 * JSON object per line; shapes vary across versions, so we look for a few common
 * fields defensively and never throw on malformed lines.
 */
export function parseCodexEvents(stdout: string): CodexMeta {
	const meta: CodexMeta = {};
	const lines = (stdout || '').split(/\r?\n/).filter(Boolean);

	for (const line of lines) {
		let ev: any;
		try {
			ev = JSON.parse(line);
		} catch {
			continue;
		}
		if (!ev || typeof ev !== 'object') continue;

		const type = String(ev.type || ev.event || '');

		// final assistant message (various shapes seen across versions)
		const msg =
			ev.last_agent_message ??
			ev.message ??
			(type.includes('message') || type.includes('complete') ? ev.text ?? ev.content : undefined);
		if (typeof msg === 'string' && msg.trim()) meta.message = msg;

		// token usage
		const usage = ev.usage || ev.token_usage || ev.tokens;
		if (usage && typeof usage === 'object') {
			if (typeof usage.input_tokens === 'number') meta.inputTokens = usage.input_tokens;
			if (typeof usage.output_tokens === 'number') meta.outputTokens = usage.output_tokens;
		}

		if (typeof ev.session_id === 'string') meta.sessionId = ev.session_id;
		if (type.includes('error') || ev.is_error === true) meta.isError = true;
	}

	return meta;
}

/**
 * Extract a JSON value from a model's text answer. Tolerates ```json fences and
 * leading/trailing prose. Throws if no JSON can be recovered.
 */
export function extractJson(text: string): unknown {
	const t = (text || '').trim();

	const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
	const candidate = (fence ? fence[1] : t).trim();

	try {
		return JSON.parse(candidate);
	} catch {
		const block = candidate.match(/[{[][\s\S]*[\]}]/);
		if (block) {
			try {
				return JSON.parse(block[0]);
			} catch {
				/* fall through */
			}
		}
		throw new Error('model did not return valid JSON');
	}
}
