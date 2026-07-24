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
		EmbeddedNavigateMessage,
		ResolvedInputCollections
	} from '$lib/schemas';
	import { cn } from '$lib/utils';
	import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

	let inputCollections: ResolvedInputCollections = $state({});
	let type: EmbeddedActivityMessage['type'] = $state('ACTIVITY');
	let selectedTemplate = $state('generalActivity');
	let start = $state(toDateTimeLocal(new Date()));
	let end = $state(toDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000)));
	let extraPropertiesYaml = $state(`- template: score
  obj:
    value: 75`);
	let sendStatus = $state('');
	let sendStatusType: 'idle' | 'success' | 'error' = $state('idle');
	let navigatePath = $state('/activities');
	let editorScrollRef = $state<HTMLDivElement | null>(null);

	const inputCollectionsYaml = $derived(formatYaml(inputCollections));
	const extraPropertiesPreviewHtml = $derived.by(() => highlightYaml(extraPropertiesYaml ?? ''));
	const readyMessageYaml = $derived(formatYaml({ type: 'IFRAME_READY' }));
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
			type: 'ACTIVITY',
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
	const navigateSchemaYaml = $derived.by(() =>
		formatYaml({
			type: 'NAVIGATE',
			data: '[route]'
		})
	);
	const readyMessageHtml = $derived.by(() => highlightYaml(readyMessageYaml));
	const inputCollectionsYamlHtml = $derived.by(() => highlightYaml(inputCollectionsYaml));
	const inputCollectionsSchemaHtml = $derived.by(() => highlightYaml(inputCollectionsSchemaYaml));
	const activitySchemaHtml = $derived.by(() => highlightYaml(activitySchemaYaml));
	const navigateSchemaHtml = $derived.by(() => highlightYaml(navigateSchemaYaml));

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

	function sendNavigateToParent(data: EmbeddedNavigateMessage) {
		window.parent.postMessage(data, '*');
		sendStatus = `Sent navigation to parent at ${new Date().toLocaleString()}`;
		sendStatusType = 'success';
	}

	function handleMessage(event: MessageEvent<EmbeddedInputCollectionsMessage>) {
		if (!event.data || typeof event.data !== 'object') return;

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
			sendToParent(buildActivityPayload(type));
		} catch (error) {
			sendStatus = error instanceof Error ? error.message : 'Unable to return activity.';
			sendStatusType = 'error';
		}
	}

	function sendNavigate() {
		sendStatus = '';
		sendStatusType = 'idle';

		try {
			if (!navigatePath.trim()) throw new Error('Navigation path is required.');
			sendNavigateToParent({ type: 'NAVIGATE', data: navigatePath.trim() });
		} catch (error) {
			sendStatus = error instanceof Error ? error.message : 'Unable to navigate parent.';
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
	<title>Embedded page</title>
</svelte:head>

<div class="mx-auto grid w-full max-w-6xl gap-4 p-4 md:p-6">
	<Card.Root>
		<Card.Header>
			<Card.Title>Embedded page iframe protocol</Card.Title>
			<Card.Description>
				This child iframe receives the input data from the parent, then (optionally) posts
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
			<Card.Title>2. Parent to child: Input data</Card.Title>
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
			<Card.Title>3. Child to parent: Activity (optional)</Card.Title>
			<Card.Description>
				Sent by the child after submitting the form. Use <code>ACTIVITY</code> to save an activity.
				In this demo, the
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
								<Select.Item value="SILENT_ACTIVITY" disabled>SILENT_ACTIVITY</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>

					<div class="grid gap-2">
						<Label for="template">Activity template</Label>
						<Input id="template" bind:value={selectedTemplate} required />
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

	<Card.Root>
		<Card.Header>
			<Card.Title>4. Child to parent: Navigate (optional)</Card.Title>
			<Card.Description>
				Sent by the child when the parent app should navigate to another page. The
				<code>data</code> value must be an internal path.
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
						{@html navigateSchemaHtml}
					</div>
				</Tabs.Content>
			</Tabs.Root>

			<div class="grid gap-2">
				<Label for="navigatePath">Navigation path</Label>
				<Input id="navigatePath" bind:value={navigatePath} placeholder="/activities" />
			</div>

			<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
				<Button type="button" onclick={sendNavigate}>Navigate parent</Button>
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
		</Card.Content>
	</Card.Root>
</div>
