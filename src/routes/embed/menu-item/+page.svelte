<script lang="ts">
	import highlighter from '$lib/client/shiki';
	import type { ResolvedInputCollections } from '$lib/components/app/menu/resolve-menu-items';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Tabs from '$lib/components/ui/tabs';
	import type {
		EmbeddedInputCollectionsMessage,
		EmbeddedNavigateMessage,
		EmbeddedReadyMessage
	} from '$lib/db/schemas/3-mission-module.schemas';
	import { cn } from '$lib/utils';
	import { onMount } from 'svelte';
	import { stringify as stringifyYaml } from 'yaml';

	let inputCollections: ResolvedInputCollections = $state({});
	let sendStatus = $state('');
	let sendStatusType: 'idle' | 'success' | 'error' = $state('idle');
	let navigatePath = $state('/activities');

	const inputCollectionsYaml = $derived(formatYaml(inputCollections));
	const readyMessageYaml = $derived(formatYaml({ type: 'IFRAME_READY', data: { height: 420 } }));
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
	const navigateSchemaYaml = $derived.by(() =>
		formatYaml({
			type: 'NAVIGATE',
			data: '[route]'
		})
	);
	const readyMessageHtml = $derived.by(() => highlightYaml(readyMessageYaml));
	const inputCollectionsYamlHtml = $derived.by(() => highlightYaml(inputCollectionsYaml));
	const inputCollectionsSchemaHtml = $derived.by(() => highlightYaml(inputCollectionsSchemaYaml));
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

	function getDocumentHeight() {
		return Math.ceil(
			Math.max(
				document.body.scrollHeight,
				document.body.offsetHeight,
				document.documentElement.scrollHeight,
				document.documentElement.offsetHeight
			)
		);
	}

	function postReadyMessage() {
		window.parent.postMessage(
			{ type: 'IFRAME_READY', data: { height: getDocumentHeight() } } satisfies EmbeddedReadyMessage,
			'*'
		);
	}

	onMount(() => {
		postReadyMessage();

		const observer = new ResizeObserver(() => postReadyMessage());
		observer.observe(document.body);
		observer.observe(document.documentElement);

		return () => {
			observer.disconnect();
		};
	});

	function formatYaml(data: unknown) {
		try {
			return stringifyYaml(data, { indent: 2 }).trimEnd();
		} catch {
			return String(data);
		}
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
</script>

<svelte:window onmessage={handleMessage} />

<svelte:head>
	<title>Embedded menu item</title>
</svelte:head>

<div class="mx-auto grid w-full max-w-6xl gap-1 rounded-2xl border p-1 text-xs">
	<Card.Root class="min-w-0 gap-2 p-0">
		<Card.Header class="p-2">
			<Card.Title class="text-sm">Embedded menu item iframe protocol</Card.Title>
			<Card.Description class="text-xs">
				This child iframe receives the input data from the parent, then (optionally) posts
				activity-shaped events back.
			</Card.Description>
		</Card.Header>
	</Card.Root>

	<Card.Root class="min-w-0 gap-2 p-0">
		<Card.Header class="p-2 pb-0">
			<Card.Title class="text-sm">1. Child to parent: IFRAME_READY</Card.Title>
			<Card.Description class="text-xs">
				Sent by the child when the Svelte component is mounted and ready to receive messages.
			</Card.Description>
		</Card.Header>
		<Card.Content class="min-w-0 p-2 pt-0">
			<div
				class="code-block max-h-20 overflow-auto rounded-md border bg-muted/20 p-2 text-xs hidden-scrollbar"
			>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html readyMessageHtml}
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root class="min-w-0 gap-2 p-0">
		<Card.Header class="p-2 pb-0">
			<Card.Title class="text-sm">2. Parent to child: Input data</Card.Title>
			<Card.Description class="text-xs">
				Optionally sent by the parent when the input collections requested by the task are
				available.
			</Card.Description>
		</Card.Header>
		<Card.Content class="min-w-0 p-2 pt-0">
			<Tabs.Root class="min-w-0" value="actual">
				<Tabs.List class="h-8">
					<Tabs.Trigger class="h-7 px-2 text-xs" value="actual">Current data</Tabs.Trigger>
					<Tabs.Trigger class="h-7 px-2 text-xs" value="schema">Schema</Tabs.Trigger>
				</Tabs.List>
				<Tabs.Content class="min-w-0" value="actual">
					<div
						class="code-block max-h-40 overflow-auto rounded-md border bg-muted/20 p-2 text-xs hidden-scrollbar"
					>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html inputCollectionsYamlHtml}
					</div>
				</Tabs.Content>
				<Tabs.Content class="min-w-0" value="schema">
					<div
						class="code-block max-h-40 overflow-auto rounded-md border bg-muted/20 p-2 text-xs hidden-scrollbar"
					>
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html inputCollectionsSchemaHtml}
					</div>
				</Tabs.Content>
			</Tabs.Root>
		</Card.Content>
	</Card.Root>

	<Card.Root class="min-w-0 gap-2 p-0">
		<Card.Header class="p-2 pb-0">
			<Card.Title class="text-sm">3. Child to parent: Navigate (optional)</Card.Title>
			<Card.Description class="text-xs">
				Sent by the child when the parent app should navigate to another page. The
				<code>data</code> value must be an internal path.
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid min-w-0 gap-2 p-2 pt-0">
			<div
				class="code-block max-h-24 overflow-auto rounded-md border bg-muted/20 p-2 text-xs hidden-scrollbar"
			>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html navigateSchemaHtml}
			</div>

			<div class="grid gap-1 pt-1">
				<Label class="text-xs" for="navigatePath">Navigation path</Label>
				<Input
					class="h-6 px-1.5 text-xs"
					id="navigatePath"
					bind:value={navigatePath}
					placeholder="/activities"
				/>
			</div>

			<div class="flex flex-col gap-1 sm:flex-row sm:items-center">
				<Button class="h-8 px-3 text-xs" type="button" onclick={sendNavigate}
					>Navigate parent</Button
				>
				{#if sendStatus}
					<p
						class={cn('text-xs', {
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

<style>
	:global(body) {
		background: transparent;
	}

	.code-block :global(pre) {
		margin: 0 !important;
		width: 100%;
		min-width: 100%;
		background: transparent !important;
		font-family: var(--font-mono);
		font-size: 0.75rem !important;
		line-height: 1rem;
		white-space: pre;
	}
</style>
