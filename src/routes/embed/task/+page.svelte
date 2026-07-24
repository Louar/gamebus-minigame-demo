<script lang="ts">
	import highlighter from '$lib/client/shiki';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import * as Tabs from '$lib/components/ui/tabs';
	import type {
		EmbeddedActivityMessage,
		EmbeddedInputCollectionsMessage,
		EmbeddedTaskMessage,
		ResolvedInputCollections
	} from '$lib/schemas';
	import { cn } from '$lib/utils';
	import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

	let currentTask: EmbeddedTaskMessage['data'] | undefined = $state();
	let inputCollections: ResolvedInputCollections = $state({});
	let type: EmbeddedActivityMessage['type'] = $state('ACTIVITY');
	let selectedTemplate = $state('');
	let start = $state(toDateTimeLocal(new Date()));
	let end = $state(toDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000)));
	let extraPropertiesYaml = $state(`- template: score
  obj:
    value: 75`);
	let sendStatus = $state('');
	let sendStatusType: 'idle' | 'success' | 'error' = $state('idle');
	let editorScrollRef = $state<HTMLDivElement | null>(null);

	const activityTemplates = $derived(
		Array.isArray(currentTask?.activityTemplates) ? currentTask.activityTemplates : []
	);
	const hasTask = $derived(Boolean(currentTask));
	const taskYaml = $derived(
		currentTask ? formatYaml({ type: 'TASK', data: currentTask }) : 'No task received yet.'
	);
	const inputCollectionsYaml = $derived(formatYaml(inputCollections));
	const selectedTemplateLabel = $derived(
		(activityTemplates.find((template) => template.reference === selectedTemplate)?.name ??
			selectedTemplate) ||
			'No templates'
	);
	const extraPropertiesPreviewHtml = $derived.by(() => highlightYaml(extraPropertiesYaml ?? ''));
	const readyMessageYaml = $derived(formatYaml({ type: 'IFRAME_READY' }));
	const taskSchemaYaml = $derived.by(() =>
		formatYaml({
			type: 'TASK',
			data: {
				id: 'task-reference',
				title: 'Embedded task title',
				type: 'userTriggeredEmbedded',
				activityTemplates: [
					{
						reference: '[activity-template-reference]',
						name: 'Activity template name'
					}
				],
				taskRules: [
					{
						id: 'task-rule-reference',
						order: 1,
						description: 'Task rule description',
						complianceExpression: 'all(properties.score.obj.value >= 75)',
						taskRuleOutcomes: [
							{
								id: 'task-rule-outcome-reference',
								skillId: 'skill-reference',
								skillHref: 'skill-href',
								skillName: 'Skill name',
								completionPercentageExpression: '100'
							}
						]
					}
				]
			}
		})
	);
	const inputCollectionsSchemaYaml = $derived.by(() =>
		formatYaml({
			type: 'INPUT_COLLECTIONS',
			data: {
				'[collection-reference-1]': {
					'[item-reference-1]': {
						property: 'value'
					}
				}
			}
		})
	);
	const activitySchemaYaml = $derived.by(() =>
		formatYaml({
			type: 'ACTIVITY | SILENT_ACTIVITY',
			data: {
				template: 'activity-template-reference',
				start: '2026-07-14T09:00:00.000Z',
				end: '2026-07-14T10:00:00.000Z',
				properties: [
					{
						template: '[property-template-reference-1]',
						obj: '[value returned to the parent]'
					},
					{
						template: '[property-template-reference-2]',
						obj: '[value returned to the parent]'
					}
				]
			}
		})
	);
	const readyMessageHtml = $derived.by(() => highlightYaml(readyMessageYaml));
	const taskYamlHtml = $derived.by(() => highlightYaml(taskYaml));
	const taskSchemaHtml = $derived.by(() => highlightYaml(taskSchemaYaml));
	const inputCollectionsYamlHtml = $derived.by(() => highlightYaml(inputCollectionsYaml));
	const inputCollectionsSchemaHtml = $derived.by(() => highlightYaml(inputCollectionsSchemaYaml));
	const activitySchemaHtml = $derived.by(() => highlightYaml(activitySchemaYaml));

	function highlightYaml(code: string) {
		return highlighter.codeToHtml(code, {
			lang: 'yaml',
			themes: {
				light: 'snazzy-light',
				dark: 'aurora-x'
			},
			defaultColor: 'light-dark()'
		});
	}

	$effect(() => {
		window.parent.postMessage({ type: 'IFRAME_READY' }, '*');
	});

	function toDateTimeLocal(date: Date) {
		const pad = (value: number) => String(value).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
	}

	function formatYaml(data: unknown) {
		try {
			return stringifyYaml(data, { indent: 2 }).trimEnd();
		} catch {
			return String(data);
		}
	}

	function parseExtraProperties() {
		const trimmed = extraPropertiesYaml.trim();
		if (!trimmed) return [];

		const parsed = parseYaml(trimmed);
		if (!Array.isArray(parsed)) throw new Error('Extra properties YAML must be an array.');
		return parsed;
	}

	function buildActivityPayload(type: EmbeddedActivityMessage['type']): EmbeddedActivityMessage {
		if (!selectedTemplate) throw new Error('Select an activity template first.');
		if (!start || !end) throw new Error('Start and end are required.');
		const startDate = new Date(start);
		const endDate = new Date(end);
		if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
			throw new Error('Start and end must be valid dates.');
		}

		return {
			type,
			data: {
				template: selectedTemplate,
				start: startDate,
				end: endDate,
				properties: [...parseExtraProperties()]
			}
		};
	}

	function sendToParent(data: EmbeddedActivityMessage) {
		window.parent.postMessage(data, '*');
		sendStatus = `Sent to parent at ${new Date().toLocaleString()}`;
		sendStatusType = 'success';
	}

	function handleMessage(
		event: MessageEvent<EmbeddedInputCollectionsMessage | EmbeddedTaskMessage>
	) {
		if (!event.data || typeof event.data !== 'object') return;

		if (event.data.type === 'TASK') {
			currentTask = event.data.data;
			const templates = Array.isArray(event.data.data?.activityTemplates)
				? event.data.data.activityTemplates
				: [];
			selectedTemplate = templates[0]?.reference ?? '';
			return;
		}

		if (event.data.type === 'INPUT_COLLECTIONS') {
			inputCollections = event.data.data ?? {};
		}
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		sendActivity(type);
	}

	function sendActivity(type: EmbeddedActivityMessage['type']) {
		sendStatus = '';
		sendStatusType = 'idle';

		try {
			if (!currentTask) throw new Error('The parent has not sent a task yet.');
			sendToParent(buildActivityPayload(type));
		} catch (error) {
			sendStatus = error instanceof Error ? error.message : 'Unable to return activity.';
			sendStatusType = 'error';
		}
	}

	function handleYamlScroll(event: Event) {
		if (!editorScrollRef) return;
		const textarea = event.currentTarget as HTMLTextAreaElement;
		editorScrollRef.scrollTop = textarea.scrollTop;
		editorScrollRef.scrollLeft = textarea.scrollLeft;
	}
</script>

<svelte:window onmessage={handleMessage} />

<svelte:head>
	<title>Embedded task</title>
</svelte:head>

<div class="mx-auto grid w-full max-w-6xl gap-4 p-4 md:p-6">
	<Card.Root>
		<Card.Header>
			<Card.Title>Embedded task iframe protocol</Card.Title>
			<Card.Description>
				This child iframe receives the current task and input data from the parent, then posts
				activity-shaped events back.
			</Card.Description>
		</Card.Header>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>1. Child to parent: IFRAME_READY</Card.Title>
			<Card.Description>
				Sent by the child when the Svelte page is mounted and ready to receive messages.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<div
				class="overflow-auto rounded-md border bg-muted/20 p-3 text-sm hidden-scrollbar [&>pre]:m-0! [&>pre]:bg-transparent! [&>pre]:font-mono! [&>pre]:text-sm! [&>pre]:wrap-break-word [&>pre]:whitespace-pre-wrap"
			>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html readyMessageHtml}
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>2. Parent to child: Embedded task</Card.Title>
			<Card.Description>
				Sent by the parent when the embedded task is available. The child uses
				<code>task.activityTemplates</code> to populate the template selector.
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4">
			<dl class="grid gap-3 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
				<dt class="font-medium text-muted-foreground">Status</dt>
				<dd>
					{hasTask ? 'Task data received from parent.' : 'Waiting for task data from parent.'}
				</dd>

				{#if currentTask}
					<dt class="font-medium text-muted-foreground">Title</dt>
					<dd>{currentTask.title || 'Task'}</dd>

					<dt class="font-medium text-muted-foreground">Task ID</dt>
					<dd class="break-all">{currentTask.id || '-'}</dd>

					<dt class="font-medium text-muted-foreground">Type</dt>
					<dd>{currentTask.type || '-'}</dd>

					<dt class="font-medium text-muted-foreground">Activity templates</dt>
					<dd>
						{activityTemplates
							.map((template) => template.name || template.reference)
							.filter(Boolean)
							.join(', ') || 'None'}
					</dd>
				{/if}
			</dl>

			<Tabs.Root value="actual">
				<Tabs.List>
					<Tabs.Trigger value="actual">Current data</Tabs.Trigger>
					<Tabs.Trigger value="schema">Schema</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="actual">
					<div
						class="max-h-96 overflow-auto rounded-md border bg-muted/20 p-3 text-sm hidden-scrollbar [&>pre]:m-0! [&>pre]:bg-transparent! [&>pre]:font-mono! [&>pre]:text-sm! [&>pre]:wrap-break-word [&>pre]:whitespace-pre-wrap"
					>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html taskYamlHtml}
					</div>
				</Tabs.Content>
				<Tabs.Content value="schema">
					<div
						class="max-h-96 overflow-auto rounded-md border bg-muted/20 p-3 text-sm hidden-scrollbar [&>pre]:m-0! [&>pre]:bg-transparent! [&>pre]:font-mono! [&>pre]:text-sm! [&>pre]:wrap-break-word [&>pre]:whitespace-pre-wrap"
					>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html taskSchemaHtml}
					</div>
				</Tabs.Content>
			</Tabs.Root>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>3. Parent to child: Input data</Card.Title>
			<Card.Description>
				Optionally sent by the parent when the input collections requested by the task are
				available.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Tabs.Root value="actual">
				<Tabs.List>
					<Tabs.Trigger value="actual">Current data</Tabs.Trigger>
					<Tabs.Trigger value="schema">Schema</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="actual">
					<div
						class="max-h-96 overflow-auto rounded-md border bg-muted/20 p-3 text-sm hidden-scrollbar [&>pre]:m-0! [&>pre]:bg-transparent! [&>pre]:font-mono! [&>pre]:text-sm! [&>pre]:wrap-break-word [&>pre]:whitespace-pre-wrap"
					>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html inputCollectionsYamlHtml}
					</div>
				</Tabs.Content>
				<Tabs.Content value="schema">
					<div
						class="max-h-96 overflow-auto rounded-md border bg-muted/20 p-3 text-sm hidden-scrollbar [&>pre]:m-0! [&>pre]:bg-transparent! [&>pre]:font-mono! [&>pre]:text-sm! [&>pre]:wrap-break-word [&>pre]:whitespace-pre-wrap"
					>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html inputCollectionsSchemaHtml}
					</div>
				</Tabs.Content>
			</Tabs.Root>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header>
			<Card.Title>4. Child to parent: Activity</Card.Title>
			<Card.Description>
				Sent by the child after submitting the form. Use <code>ACTIVITY</code> to save and close the
				modal, or <code>SILENT_ACTIVITY</code> to save without closing it. In this demo, the
				<code>data.properties</code> array can be entered as YAML, using the editor below.
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4">
			<Tabs.Root value="schema">
				<Tabs.List>
					<Tabs.Trigger value="schema">Schema</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content value="schema">
					<div
						class="max-h-96 overflow-auto rounded-md border bg-muted/20 p-3 text-sm hidden-scrollbar [&>pre]:m-0! [&>pre]:bg-transparent! [&>pre]:font-mono! [&>pre]:text-sm! [&>pre]:wrap-break-word [&>pre]:whitespace-pre-wrap"
					>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html activitySchemaHtml}
					</div>
				</Tabs.Content>
			</Tabs.Root>

			<form class="grid gap-4" onsubmit={handleSubmit}>
				<div class="grid gap-4 md:grid-cols-2">
					<div class="grid gap-2">
						<Label for="type">Event type</Label>
						<Select.Root type="single" bind:value={type}>
							<Select.Trigger id="type" class="w-full">
								<span data-slot="select-value" class="truncate">
									{type}
								</span>
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="ACTIVITY">ACTIVITY</Select.Item>
								<Select.Item value="SILENT_ACTIVITY">SILENT_ACTIVITY</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>

					<div class="grid gap-2">
						<Label for="template">Activity template</Label>
						<Select.Root
							type="single"
							bind:value={selectedTemplate}
							disabled={activityTemplates.length === 0}
						>
							<Select.Trigger id="template" class="w-full">
								<span data-slot="select-value" class="truncate">
									{selectedTemplateLabel}
								</span>
							</Select.Trigger>
							<Select.Content>
								{#each activityTemplates as template (template.reference)}
									{#if template.reference}
										<Select.Item value={template.reference}>
											{template.name || template.reference}
										</Select.Item>
									{/if}
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					<div class="grid gap-2">
						<Label for="start">Start</Label>
						<Input id="start" type="datetime-local" bind:value={start} required />
					</div>

					<div class="grid gap-2">
						<Label for="end">End</Label>
						<Input id="end" type="datetime-local" bind:value={end} required />
					</div>
				</div>

				<div class="grid gap-2">
					<Label for="propertiesYaml">Extra properties YAML</Label>
					<div
						class="relative h-56 overflow-hidden rounded-md border bg-muted/20 font-mono text-sm"
					>
						<div
							bind:this={editorScrollRef}
							class="pointer-events-none absolute inset-0 overflow-hidden p-3 [&>pre]:font-mono! [&>pre]:text-sm! [&>pre]:wrap-break-word [&>pre]:whitespace-pre-wrap"
						>
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html extraPropertiesPreviewHtml}
						</div>
						<textarea
							id="propertiesYaml"
							bind:value={extraPropertiesYaml}
							spellcheck="false"
							class="relative z-10 h-full w-full resize-none overflow-auto bg-transparent p-3 font-mono text-sm text-transparent caret-foreground outline-none"
							onscroll={handleYamlScroll}></textarea>
					</div>
					<p class="text-sm text-muted-foreground">
						This YAML must parse to an array and is sent as <code>data.properties</code>.
					</p>
				</div>

				<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
					<Button type="submit">Return activity to parent</Button>
					{#if sendStatus}
						<p
							class={cn('text-sm', {
								'text-muted-foreground': sendStatusType === 'idle',
								'text-emerald-700 dark:text-emerald-400': sendStatusType === 'success',
								'text-destructive': sendStatusType === 'error'
							})}
						>
							{sendStatus}
						</p>
					{/if}
				</div>
			</form>
		</Card.Content>
	</Card.Root>
</div>
