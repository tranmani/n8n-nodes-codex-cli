import { describe, it, expect } from 'vitest';
import { parseCodexEvents, extractJson } from '../nodes/CodexSubscription/parse';

describe('parseCodexEvents', () => {
	it('extracts the final message and token usage from ndjson events', () => {
		const stdout = [
			JSON.stringify({ type: 'session', session_id: 'sess_1' }),
			JSON.stringify({ type: 'agent_message', message: 'The answer is 42.' }),
			JSON.stringify({ type: 'task_complete', usage: { input_tokens: 120, output_tokens: 8 } }),
		].join('\n');
		const m = parseCodexEvents(stdout);
		expect(m.message).toBe('The answer is 42.');
		expect(m.inputTokens).toBe(120);
		expect(m.outputTokens).toBe(8);
		expect(m.sessionId).toBe('sess_1');
	});

	it('flags error events', () => {
		const stdout = JSON.stringify({ type: 'error', is_error: true, message: 'boom' });
		expect(parseCodexEvents(stdout).isError).toBe(true);
	});

	it('ignores unparseable lines', () => {
		const stdout = 'not json\n' + JSON.stringify({ type: 'agent_message', message: 'ok' });
		expect(parseCodexEvents(stdout).message).toBe('ok');
	});

	it('returns empty meta for empty input', () => {
		expect(parseCodexEvents('')).toEqual({});
	});
});

describe('extractJson', () => {
	it('parses a bare JSON object', () => {
		expect(extractJson('{"a":1}')).toEqual({ a: 1 });
	});
	it('strips ```json fences', () => {
		expect(extractJson('```json\n{"ok":true}\n```')).toEqual({ ok: true });
	});
	it('recovers JSON embedded in prose', () => {
		expect(extractJson('Sure! {"x":[1,2]} done')).toEqual({ x: [1, 2] });
	});
	it('parses top-level arrays', () => {
		expect(extractJson('[1,2,3]')).toEqual([1, 2, 3]);
	});
	it('throws when there is no JSON', () => {
		expect(() => extractJson('just words')).toThrow(/did not return valid JSON/);
	});
});
