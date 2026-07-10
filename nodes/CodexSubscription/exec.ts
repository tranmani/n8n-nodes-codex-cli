import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Pure argv builder + process runner for the OpenAI Codex CLI.
 *
 * Imports NOTHING from n8n so it can be unit-tested in isolation. `buildArgs` is
 * pure; `runCodex` spawns the binary with an argv array — never a shell string —
 * so prompt content can never be interpreted as shell syntax (no injection).
 *
 * We drive Codex like `codex exec <prompt> --json --output-last-message <file>`:
 * the CLI writes the final assistant message to that file (the reliable way to
 * get the answer text), while `--json` streams newline-delimited events we can
 * mine for token/usage metadata.
 */

export type Operation = 'chat' | 'agentic';
export type ResponseFormat = 'text' | 'json';
export type SandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export interface BuildArgsInput {
	operation: Operation;
	prompt: string;
	/** instructions prepended to the prompt (how to process the input) */
	systemPrompt?: string;
	model?: string;
	/** chat only: nudge the model to emit JSON (parsing happens in parse.ts) */
	responseFormat?: ResponseFormat;
	/** override sandbox; defaults: chat -> read-only, agentic -> workspace-write */
	sandbox?: SandboxMode;
	/** agentic: auto-approve in a workspace-write sandbox (implies workspace-write) */
	fullAuto?: boolean;
	/** agentic: directory Codex runs in */
	workingDirectory?: string;
	/** emit newline-delimited JSON events on stdout (for metadata). Default true. */
	json?: boolean;
	/** escape hatch: raw extra flags inserted before the prompt */
	extraArgs?: string[];
}

const JSON_NUDGE =
	'Respond with a single valid JSON value and nothing else. No prose, no markdown code fences.';

/** Build the argv passed to `codex`. Pure and deterministic. `outputFile` receives the final message. */
export function buildArgs(input: BuildArgsInput, outputFile: string): string[] {
	const {
		operation,
		prompt,
		systemPrompt,
		model,
		responseFormat = 'text',
		sandbox,
		fullAuto = false,
		workingDirectory,
		json = true,
		extraArgs = [],
	} = input;

	if (!prompt || !prompt.trim()) {
		throw new Error('prompt is required');
	}

	const args: string[] = ['exec', '--skip-git-repo-check', '--output-last-message', outputFile];

	if (json) args.push('--json');
	if (model) args.push('--model', model);

	if (operation === 'agentic' && fullAuto) {
		args.push('--full-auto');
	} else {
		const sb: SandboxMode = sandbox ?? (operation === 'agentic' ? 'workspace-write' : 'read-only');
		args.push('--sandbox', sb);
	}

	if (operation === 'agentic' && workingDirectory) {
		args.push('--cd', workingDirectory);
	}

	// Codex exec takes a single prompt, so a system prompt is prepended as leading
	// instructions, then the JSON nudge (chat+json) is appended.
	const parts: string[] = [];
	if (systemPrompt && systemPrompt.trim()) parts.push(systemPrompt.trim());
	parts.push(prompt);
	if (operation === 'chat' && responseFormat === 'json') parts.push(JSON_NUDGE);
	const finalPrompt = parts.join('\n\n');

	return [...args, ...extraArgs, finalPrompt];
}

export interface RunOptions {
	binary?: string;
	cwd?: string;
	timeoutMs?: number;
	env?: NodeJS.ProcessEnv;
}

export interface RunResult {
	code: number | null;
	/** the final assistant message (from --output-last-message) */
	text: string;
	stdout: string;
	stderr: string;
	timedOut: boolean;
}

let counter = 0;

/** Spawn the Codex CLI (no shell), collect its output + the final-message file. */
export async function runCodex(input: BuildArgsInput, opts: RunOptions = {}): Promise<RunResult> {
	const { binary = 'codex', cwd, timeoutMs = 120_000, env } = opts;
	const outputFile = join(tmpdir(), `codex-out-${process.pid}-${Date.now()}-${counter++}.txt`);
	const args = buildArgs(input, outputFile);

	const spawnResult = await new Promise<Omit<RunResult, 'text'>>((resolve, reject) => {
		const child = spawn(binary, args, {
			cwd,
			env: env ?? process.env,
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';
		let timedOut = false;

		const timer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGKILL');
		}, timeoutMs);

		child.stdout.on('data', (d) => (stdout += d.toString()));
		child.stderr.on('data', (d) => (stderr += d.toString()));
		child.on('error', (err) => {
			clearTimeout(timer);
			reject(err);
		});
		child.on('close', (code) => {
			clearTimeout(timer);
			resolve({ code, stdout, stderr, timedOut });
		});
	});

	let text = '';
	try {
		text = (await readFile(outputFile, 'utf8')).trim();
	} catch {
		/* file may not exist if codex failed early — leave text empty */
	} finally {
		void unlink(outputFile).catch(() => {});
	}

	return { ...spawnResult, text };
}
