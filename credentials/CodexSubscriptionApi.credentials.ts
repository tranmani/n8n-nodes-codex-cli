import type { ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * Config-only "credential". Holds NO secret: the actual ChatGPT subscription auth
 * lives in the mounted ~/.codex directory (created by `codex login`) that the
 * Codex CLI reads. These fields just tell the node where the binary is + defaults.
 */
export class CodexSubscriptionApi implements ICredentialType {
	name = 'codexSubscriptionApi';

	displayName = 'Codex Subscription (Local CLI)';

	documentationUrl = 'https://github.com/tranmani/n8n-nodes-codex-cli#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'Codex Binary Path',
			name: 'codexBinaryPath',
			type: 'string',
			default: 'codex',
			description:
				'Path to the codex executable inside the n8n environment. Leave as "codex" if it is on PATH.',
		},
		{
			displayName: 'Default Model',
			name: 'defaultModel',
			type: 'string',
			default: '',
			placeholder: 'gpt-5-codex',
			description:
				'Optional default model. Can be overridden per node. Leave blank to use the CLI default.',
		},
		{
			displayName: 'Timeout (Seconds)',
			name: 'timeoutSeconds',
			type: 'number',
			default: 120,
			description: 'Maximum seconds to wait for a single codex invocation before it is killed.',
		},
	];
}
