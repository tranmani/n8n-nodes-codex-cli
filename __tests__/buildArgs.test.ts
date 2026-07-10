import { describe, it, expect } from 'vitest';
import { buildArgs } from '../nodes/CodexSubscription/exec';

const OUT = '/tmp/out.txt';

describe('buildArgs', () => {
	it('builds a minimal chat invocation (read-only sandbox, json events, prompt last)', () => {
		const args = buildArgs({ operation: 'chat', prompt: 'hello' }, OUT);
		expect(args.slice(0, 4)).toEqual(['exec', '--skip-git-repo-check', '--output-last-message', OUT]);
		expect(args).toContain('--json');
		expect(args[args.indexOf('--sandbox') + 1]).toBe('read-only');
		expect(args[args.length - 1]).toBe('hello'); // prompt is the final positional arg
	});

	it('adds model when provided', () => {
		const args = buildArgs({ operation: 'chat', prompt: 'hi', model: 'gpt-5-codex' }, OUT);
		expect(args[args.indexOf('--model') + 1]).toBe('gpt-5-codex');
	});

	it('appends a JSON nudge to the prompt for chat responseFormat=json', () => {
		const args = buildArgs({ operation: 'chat', prompt: 'x', responseFormat: 'json' }, OUT);
		expect(args[args.length - 1]).toMatch(/single valid JSON/i);
		expect(args[args.length - 1]).toMatch(/^x/);
	});

	it('does not nudge for text chat', () => {
		const args = buildArgs({ operation: 'chat', prompt: 'x', responseFormat: 'text' }, OUT);
		expect(args[args.length - 1]).toBe('x');
	});

	it('agentic defaults to a workspace-write sandbox', () => {
		const args = buildArgs({ operation: 'agentic', prompt: 'refactor' }, OUT);
		expect(args[args.indexOf('--sandbox') + 1]).toBe('workspace-write');
	});

	it('agentic fullAuto uses --full-auto instead of --sandbox', () => {
		const args = buildArgs({ operation: 'agentic', prompt: 'x', fullAuto: true }, OUT);
		expect(args).toContain('--full-auto');
		expect(args).not.toContain('--sandbox');
	});

	it('agentic passes --cd for the working directory', () => {
		const args = buildArgs({ operation: 'agentic', prompt: 'x', workingDirectory: '/work' }, OUT);
		expect(args[args.indexOf('--cd') + 1]).toBe('/work');
	});

	it('keeps a malicious-looking prompt as a single argv element (no shell)', () => {
		const evil = 'hi"; rm -rf / #';
		const args = buildArgs({ operation: 'chat', prompt: evil }, OUT);
		expect(args[args.length - 1]).toBe(evil);
		expect(args.filter((a) => a === evil)).toHaveLength(1);
	});

	it('prepends the system prompt to the prompt', () => {
		const args = buildArgs(
			{ operation: 'chat', prompt: 'do the thing', systemPrompt: 'be terse' },
			OUT,
		);
		expect(args[args.length - 1]).toBe('be terse\n\ndo the thing');
	});

	it('system prompt then prompt then JSON nudge for chat+json', () => {
		const args = buildArgs(
			{ operation: 'chat', prompt: 'p', systemPrompt: 's', responseFormat: 'json' },
			OUT,
		);
		const last = args[args.length - 1];
		expect(last.indexOf('s')).toBeLessThan(last.indexOf('p'));
		expect(last).toMatch(/single valid JSON/i);
	});

	it('throws on an empty prompt', () => {
		expect(() => buildArgs({ operation: 'chat', prompt: '   ' }, OUT)).toThrow(/prompt is required/);
	});

	it('omits --json when disabled', () => {
		const args = buildArgs({ operation: 'chat', prompt: 'x', json: false }, OUT);
		expect(args).not.toContain('--json');
	});
});
