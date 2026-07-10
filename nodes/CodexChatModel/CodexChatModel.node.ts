import { SimpleChatModel, type BaseChatModelParams } from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import type {
	ISupplyDataFunctions,
	INodeType,
	INodeTypeDescription,
	SupplyData,
} from 'n8n-workflow';

import { runCodex, type SandboxMode } from '../CodexSubscription/exec';

interface CodexChatModelParams extends BaseChatModelParams {
	binary?: string;
	model?: string;
	timeoutMs?: number;
	sandbox?: SandboxMode;
}

/**
 * A LangChain chat model that answers by shelling out to the local, subscription-
 * authenticated `codex` CLI. Non-streaming (one `codex exec` per call). Lets the
 * n8n **AI Agent** node use Codex as its language model, with the Agent's own
 * Memory and Tool sub-nodes doing orchestration.
 *
 * Note: no native (OpenAI-style) tool calling — works with agent types that parse
 * tool use from text (ReAct/Conversational) + Memory, not the strict Tools Agent.
 */
class CodexCliChatModel extends SimpleChatModel {
	binary: string;
	modelName?: string;
	timeoutMs: number;
	sandbox: SandboxMode;

	constructor(fields: CodexChatModelParams) {
		super(fields);
		this.binary = fields.binary ?? 'codex';
		this.modelName = fields.model;
		this.timeoutMs = fields.timeoutMs ?? 120_000;
		this.sandbox = fields.sandbox ?? 'read-only';
	}

	_llmType(): string {
		return 'codex-cli';
	}

	async _call(
		messages: BaseMessage[],
		_options: this['ParsedCallOptions'],
		_runManager?: CallbackManagerForLLMRun,
	): Promise<string> {
		const typeOf = (m: BaseMessage): string => (m as any)._getType?.() ?? 'human';
		const system = messages
			.filter((m) => typeOf(m) === 'system')
			.map((m) => String(m.content))
			.join('\n\n');
		const convo = messages
			.filter((m) => typeOf(m) !== 'system')
			.map((m) => {
				const t = typeOf(m);
				const role = t === 'human' ? 'User' : t === 'ai' ? 'Assistant' : t;
				return `${role}: ${String(m.content)}`;
			})
			.join('\n\n');

		const res = await runCodex(
			{
				operation: 'chat',
				prompt: convo || ' ',
				systemPrompt: system || undefined,
				model: this.modelName,
				json: true,
				sandbox: this.sandbox,
			},
			{ binary: this.binary, timeoutMs: this.timeoutMs },
		);
		return res.text;
	}
}

export class CodexChatModel implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Codex Chat Model (Subscription)',
		name: 'codexChatModel',
		icon: 'file:codex.svg',
		group: ['transform'],
		version: 1,
		description:
			'OpenAI Codex CLI (ChatGPT subscription) as a Chat Model for the AI Agent node — no API key',
		defaults: { name: 'Codex Chat Model' },
		codex: {
			categories: ['AI'],
			subcategories: { AI: ['Language Models', 'Root Nodes'] },
		},
		// Sub-node: no main input; outputs a Language Model connection for the AI Agent.
		inputs: [],
		outputs: ['ai_languageModel'] as any,
		outputNames: ['Model'],
		credentials: [{ name: 'codexSubscriptionApi', required: true }],
		properties: [
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
				description: 'Model to use. Pick a preset or choose Custom to type any model slug.',
			},
			{
				displayName: 'Custom Model',
				name: 'customModel',
				type: 'string',
				default: '',
				placeholder: 'e.g. gpt-5.1-codex',
				displayOptions: { show: { model: ['__custom'] } },
			},
			{
				displayName: 'Sandbox',
				name: 'sandbox',
				type: 'options',
				options: [
					{ name: 'Read Only', value: 'read-only' },
					{ name: 'Workspace Write', value: 'workspace-write' },
				],
				default: 'read-only',
				description: 'Filesystem access when Codex runs (read-only is safe for a chat model)',
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const creds = await this.getCredentials('codexSubscriptionApi');

		let modelSel = this.getNodeParameter('model', itemIndex, '') as string;
		if (modelSel === '__custom') {
			modelSel = (this.getNodeParameter('customModel', itemIndex, '') as string) || '';
		}
		const model = modelSel || (creds.defaultModel as string) || undefined;
		const sandbox = this.getNodeParameter('sandbox', itemIndex, 'read-only') as SandboxMode;

		const chat = new CodexCliChatModel({
			binary: (creds.codexBinaryPath as string) || 'codex',
			model,
			timeoutMs: (Number(creds.timeoutSeconds) || 120) * 1000,
			sandbox,
		});

		return { response: chat };
	}
}
