import {
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';

import { runCodex, type BuildArgsInput } from './exec';
import { parseCodexEvents, extractJson } from './parse';

export class CodexSubscription implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Codex (Subscription)',
		name: 'codexSubscription',
		icon: 'file:codex.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{ $parameter["operation"] }}',
		description:
			'Run OpenAI Codex via your local, subscription-authenticated Codex CLI (Sign in with ChatGPT, no API key)',
		defaults: { name: 'Codex (Subscription)' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'codexSubscriptionApi', required: true }],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Chat',
						value: 'chat',
						description: 'One prompt in, one answer out (read-only sandbox; optionally forced to JSON)',
						action: 'Chat with Codex',
					},
					{
						name: 'Agentic',
						value: 'agentic',
						description: 'Let Codex use tools / edit files in a working directory to complete a task',
						action: 'Run an agentic task',
					},
				],
				default: 'chat',
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				description: 'The message / task sent to Codex',
			},
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				options: [
					{ name: 'Default (CLI / credential)', value: '' },
					{ name: 'gpt-5-codex', value: 'gpt-5-codex' },
					{ name: 'gpt-5', value: 'gpt-5' },
					{ name: 'gpt-5-mini', value: 'gpt-5-mini' },
					{ name: 'o4-mini', value: 'o4-mini' },
					{ name: 'o3', value: 'o3' },
					{ name: 'Custom (type below)…', value: '__custom' },
				],
				default: '',
				description:
					'Model to use. Pick a preset or choose Custom to type any model slug. Blank uses the credential/CLI default.',
			},
			{
				displayName: 'Custom Model',
				name: 'customModel',
				type: 'string',
				default: '',
				placeholder: 'e.g. gpt-5.1-codex',
				description: 'Exact model slug passed to `codex --model`',
				displayOptions: { show: { model: ['__custom'] } },
			},
			// ---- Chat-only ----
			{
				displayName: 'Response Format',
				name: 'responseFormat',
				type: 'options',
				options: [
					{ name: 'Text', value: 'text' },
					{ name: 'JSON', value: 'json' },
				],
				default: 'text',
				description:
					'JSON asks the model for a single JSON value and returns it parsed under "data" (retries once if the first answer is not valid JSON)',
				displayOptions: { show: { operation: ['chat'] } },
			},
			// ---- Agentic-only ----
			{
				displayName: 'Sandbox',
				name: 'sandbox',
				type: 'options',
				options: [
					{ name: 'Read Only', value: 'read-only' },
					{ name: 'Workspace Write', value: 'workspace-write' },
					{ name: 'Danger: Full Access', value: 'danger-full-access' },
				],
				default: 'workspace-write',
				description: 'What Codex is allowed to do on the filesystem',
				displayOptions: { show: { operation: ['agentic'] } },
			},
			{
				displayName: 'Full Auto',
				name: 'fullAuto',
				type: 'boolean',
				default: false,
				description:
					'Whether to auto-approve actions in a workspace-write sandbox (implies workspace-write; overrides Sandbox)',
				displayOptions: { show: { operation: ['agentic'] } },
			},
			{
				displayName: 'Working Directory',
				name: 'workingDirectory',
				type: 'string',
				default: '',
				placeholder: '/data/project',
				description: 'Directory Codex runs in (must exist in the n8n environment)',
				displayOptions: { show: { operation: ['agentic'] } },
			},
			// ---- Shared advanced ----
			{
				displayName: 'Timeout (Seconds)',
				name: 'timeout',
				type: 'number',
				default: 0,
				description: 'Override the credential timeout for this node. 0 = use the credential value.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const creds = await this.getCredentials('codexSubscriptionApi');

		const binary = (creds.codexBinaryPath as string) || 'codex';
		const defaultModel = (creds.defaultModel as string) || '';
		const credTimeout = Number(creds.timeoutSeconds) || 120;

		const out: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as 'chat' | 'agentic';
				const prompt = this.getNodeParameter('prompt', i) as string;
				let modelSel = this.getNodeParameter('model', i, '') as string;
				if (modelSel === '__custom') {
					modelSel = (this.getNodeParameter('customModel', i, '') as string) || '';
				}
				const model = (modelSel || defaultModel) || undefined;
				const timeoutOverride = Number(this.getNodeParameter('timeout', i, 0));
				const timeoutSec = timeoutOverride > 0 ? timeoutOverride : credTimeout;

				const base: BuildArgsInput = { operation, prompt, model, json: true };

				let responseFormat: 'text' | 'json' = 'text';
				let cwd: string | undefined;

				if (operation === 'chat') {
					responseFormat = this.getNodeParameter('responseFormat', i, 'text') as 'text' | 'json';
					base.responseFormat = responseFormat;
				} else {
					base.sandbox = this.getNodeParameter('sandbox', i, 'workspace-write') as any;
					base.fullAuto = this.getNodeParameter('fullAuto', i, false) as boolean;
					cwd = (this.getNodeParameter('workingDirectory', i, '') as string) || undefined;
					if (cwd) base.workingDirectory = cwd;
				}

				const runOnce = async (extraPrompt?: string) => {
					const input: BuildArgsInput = extraPrompt
						? { ...base, prompt: `${prompt}\n\n${extraPrompt}` }
						: base;
					const res = await runCodex(input, { binary, cwd, timeoutMs: timeoutSec * 1000 });
					if (res.timedOut) {
						throw new NodeOperationError(this.getNode(), `codex timed out after ${timeoutSec}s`, {
							itemIndex: i,
						});
					}
					if (res.code !== 0 && !res.text) {
						throw new NodeOperationError(
							this.getNode(),
							`codex exited with code ${res.code}: ${res.stderr.slice(0, 500) || '(no stderr)'}`,
							{ itemIndex: i },
						);
					}
					const meta = parseCodexEvents(res.stdout);
					const text = res.text || meta.message || '';
					return { text, meta };
				};

				let { text, meta } = await runOnce();
				const json: IDataObject = {
					text,
					model: model ?? null,
					inputTokens: meta.inputTokens ?? null,
					outputTokens: meta.outputTokens ?? null,
					sessionId: meta.sessionId ?? null,
				};

				if (operation === 'chat' && responseFormat === 'json') {
					try {
						json.data = extractJson(text) as IDataObject;
					} catch {
						({ text, meta } = await runOnce('Return ONLY a single valid JSON value. No explanation.'));
						json.text = text;
						json.data = extractJson(text) as IDataObject;
					}
				}

				out.push({ json, pairedItem: { item: i } });
			} catch (err) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (err as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw err;
			}
		}

		return [out];
	}
}
