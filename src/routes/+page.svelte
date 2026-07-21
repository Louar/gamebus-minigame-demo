<script lang="ts">
	import endFailedSoundUrl from '$lib/assets/sounds/end-failed.mp3';
	import endSuccessfullSoundUrl from '$lib/assets/sounds/end-successful.mp3';
	import tapCorrectSoundUrl from '$lib/assets/sounds/tap-correct.mp3';
	import tapIncorrectSoundUrl from '$lib/assets/sounds/tap-incorrect.mp3';
	import Map from '$lib/components/Map.svelte';
	import type { GuessResult, TopoGeometry } from '$lib/components/types';
	import { getCountriesFromTags, getGeojsonByName, loadWorldCountries } from '$lib/map';
	import { formatTime } from '$lib/time';
	import * as turf from '@turf/turf';
	import { onMount } from 'svelte';
	import { quartOut } from 'svelte/easing';
	import { fly, scale } from 'svelte/transition';

	const worldMap = loadWorldCountries();
	const defaultTags = ['World'];
	const defaultShowFlags = true;
	const defaultShowCountryNames = true;
	const defaultCanRestart = false;
	const defaultDoHover = false;
	const activitySubmitDelayMs = 3000;
	const activitySubmitProgressIntervalMs = 50;

	type ActivityTemplate = {
		reference?: string;
		name?: string | null;
	};

	type EmbeddedTask = {
		activityTemplates?: ActivityTemplate[];
	};

	type ParentMessage =
		{ type: 'TASK'; data?: EmbeddedTask } | { type: 'INPUT_COLLECTIONS'; data?: unknown };

	let width = $state(1024);
	let height = $state(768);
	const initialCountries = getCountriesFromTags(defaultTags, worldMap);
	let targetCountries = $state<string[]>(initialCountries);
	let goal = $state(initialCountries.length);
	let countdownSeconds = $state(0);
	let lives = $state<number | undefined>(undefined);
	let allowedSkips = $state(0);
	let skipsLeft = $state(0);
	let showFlags = $state(defaultShowFlags);
	let showCountryNames = $state(defaultShowCountryNames);
	let canRestart = $state(defaultCanRestart);
	let doHover = $state(defaultDoHover);
	let toFind = $state<TopoGeometry[]>([]);
	let foundFeatures = $state<TopoGeometry[]>([]);
	let unfoundFeatures = $state<TopoGeometry[]>([]);
	let questionFeature = $state<TopoGeometry>();
	let focusedCountry = $state<TopoGeometry>();
	let hint = $state('');
	let mistakes = $state(0);
	let streak = $state(0);
	let maxStreak = $state(0);
	let timeMs = $state(0);
	let startedAt = $state(Date.now());
	let finished = $state(false);
	let showLoadingScreen = $state(true);
	let arrowRotation = $state<number | undefined>(undefined);
	let correctAnimationKey = $state(0);
	let intervalId: ReturnType<typeof setInterval> | undefined;
	let tapCorrect: HTMLAudioElement | undefined;
	let tapIncorrect: HTMLAudioElement | undefined;
	let endSuccesfull: HTMLAudioElement | undefined;
	let endFailed: HTMLAudioElement | undefined;
	let loadingTimeout: ReturnType<typeof setTimeout> | undefined;
	let activitySubmitTimeout: ReturnType<typeof setTimeout> | undefined;
	let activitySubmitProgressInterval: ReturnType<typeof setInterval> | undefined;
	let activitySubmitStartedAt = $state(0);
	let activitySubmitProgress = $state(0);
	let activityTemplateReference = $state('');
	let submittedActivity = $state(false);
	let isEmbedded = $state(false);

	const correct = $derived(foundFeatures.length);
	const currentName = $derived(questionFeature?.properties.name ?? '');
	const currentFlag = $derived(getFlagEmoji(questionFeature?.properties.ISO2));
	const remainingTimeMs = $derived(Math.max(countdownSeconds * 1000 - timeMs, 0));
	const mapHeight = $derived(height);

	startGame(initialCountries);

	onMount(() => {
		isEmbedded = window.self !== window.top;
		if (isEmbedded) {
			window.parent.postMessage({ type: 'IFRAME_READY' }, '*');
			window.addEventListener('message', handleMessage);
		}

		width = window.innerWidth;
		height = window.innerHeight;
		tapCorrect = new Audio(tapCorrectSoundUrl);
		tapIncorrect = new Audio(tapIncorrectSoundUrl);
		endSuccesfull = new Audio(endSuccessfullSoundUrl);
		endFailed = new Audio(endFailedSoundUrl);
		applyQueryParameters(new URLSearchParams(window.location.search));
		loadingTimeout = setTimeout(() => {
			showLoadingScreen = false;
		}, 250);

		const resize = () => {
			width = window.innerWidth;
			height = window.innerHeight;
		};

		window.addEventListener('resize', resize);

		return () => {
			window.removeEventListener('resize', resize);
			if (isEmbedded) window.removeEventListener('message', handleMessage);
			if (intervalId) clearInterval(intervalId);
			if (loadingTimeout) clearTimeout(loadingTimeout);
			clearActivitySubmitDelay();
		};
	});

	function playSound(sound?: HTMLAudioElement) {
		if (!sound) return;
		sound.currentTime = 0;
		void sound.play().catch(() => undefined);
	}

	function getFlagEmoji(countryCode?: string): string {
		if (!countryCode || countryCode.length !== 2) return '';
		return countryCode
			.toUpperCase()
			.replace(/./g, (letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)));
	}

	function startTimer() {
		if (intervalId) clearInterval(intervalId);
		startedAt = Date.now();
		timeMs = 0;
		intervalId = setInterval(() => {
			timeMs = Date.now() - startedAt;
			if (countdownSeconds > 0 && timeMs >= countdownSeconds * 1000) {
				finishGame();
			}
		}, 250);
	}

	function startGame(countries: string[], requestedGoal = goal) {
		targetCountries = countries;
		const targets = worldMap.geometries
			.filter((geometry) => countries.includes(geometry.properties.name))
			.sort((a, b) => countries.indexOf(a.properties.name) - countries.indexOf(b.properties.name));
		goal = Math.min(Math.max(1, requestedGoal), targets.length);

		foundFeatures = [];
		unfoundFeatures = targets;
		toFind = targets;
		skipsLeft = allowedSkips;
		mistakes = 0;
		streak = 0;
		maxStreak = 0;
		hint = '';
		arrowRotation = undefined;
		finished = false;
		submittedActivity = false;
		clearActivitySubmitDelay();
		activitySubmitProgress = 0;
		pickFeature();
		startTimer();
	}

	function handleMessage(event: MessageEvent<ParentMessage>) {
		if (!event.data || typeof event.data !== 'object') return;

		if (event.data.type === 'TASK') {
			const templates = Array.isArray(event.data.data?.activityTemplates)
				? event.data.data.activityTemplates
				: [];
			activityTemplateReference = templates[0]?.reference ?? '';
		}
	}

	function applyQueryParameters(searchParams: URLSearchParams) {
		const queryTags = parseRegions(searchParams);
		const countriesFromTags = getCountriesFromTags(queryTags, worldMap);
		const countries = countriesFromTags.length > 0 ? countriesFromTags : worldMap.countries;
		countdownSeconds = parsePositiveInteger(searchParams.get('countdown')) ?? 0;
		lives = parsePositiveInteger(searchParams.get('lives'));
		allowedSkips = parsePositiveInteger(searchParams.get('allowedSkips')) ?? 0;
		showFlags = parseBoolean(searchParams.get('showFlags')) ?? defaultShowFlags;
		showCountryNames =
			parseBoolean(searchParams.get('showCountryNames')) ?? defaultShowCountryNames;
		canRestart = parseBoolean(searchParams.get('canRestart')) ?? defaultCanRestart;
		doHover = parseBoolean(searchParams.get('doHover')) ?? defaultDoHover;
		startGame(countries, parsePositiveInteger(searchParams.get('goal')) ?? countries.length);
	}

	function parseRegions(searchParams: URLSearchParams): string[] {
		const tagsByLowercase = Object.fromEntries([
			['world', 'World'],
			...worldMap.tags.map((tag) => [tag.toLowerCase(), tag])
		]);
		const regions = searchParams
			.getAll('regions')
			.flatMap((region) => region.split(','))
			.map((region) => region.trim())
			.map((region) => tagsByLowercase[region.toLowerCase()])
			.filter((region) => region !== undefined);

		return regions.length > 0 ? [...new Set(regions)] : defaultTags;
	}

	function parsePositiveInteger(value: string | null): number | undefined {
		if (!value) return undefined;
		const parsed = Number(value);
		return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
	}

	function parseBoolean(value: string | null): boolean | undefined {
		if (!value) return undefined;
		if (['true', '1', 'yes'].includes(value.toLowerCase())) return true;
		if (['false', '0', 'no'].includes(value.toLowerCase())) return false;
		return undefined;
	}

	function finishGame() {
		if (finished) return;
		const reachedGoal = correct >= goal;
		finished = true;
		timeMs =
			countdownSeconds > 0 ? Math.min(timeMs, countdownSeconds * 1000) : Date.now() - startedAt;
		if (intervalId) clearInterval(intervalId);
		playSound(reachedGoal ? endSuccesfull : endFailed);
		questionFeature = undefined;
		if (isEmbedded) startActivitySubmitDelay();
	}

	function startActivitySubmitDelay() {
		clearActivitySubmitDelay();
		activitySubmitStartedAt = Date.now();
		activitySubmitProgress = 0;

		activitySubmitProgressInterval = setInterval(
			updateActivitySubmitProgress,
			activitySubmitProgressIntervalMs
		);
		activitySubmitTimeout = setTimeout(() => {
			clearActivitySubmitDelay();
			activitySubmitProgress = 100;
			submitActivity();
		}, activitySubmitDelayMs);
	}

	function updateActivitySubmitProgress() {
		const elapsed = Date.now() - activitySubmitStartedAt;
		activitySubmitProgress = Math.min(Math.round((elapsed / activitySubmitDelayMs) * 100), 100);
	}

	function clearActivitySubmitDelay() {
		if (activitySubmitTimeout) clearTimeout(activitySubmitTimeout);
		if (activitySubmitProgressInterval) clearInterval(activitySubmitProgressInterval);
		activitySubmitTimeout = undefined;
		activitySubmitProgressInterval = undefined;
	}

	function submitActivity() {
		if (!isEmbedded || !activityTemplateReference?.length || submittedActivity) return;

		submittedActivity = true;
		window.parent.postMessage(
			{
				type: 'ACTIVITY',
				data: {
					template: activityTemplateReference,
					start: new Date(startedAt).toISOString(),
					end: new Date(startedAt + timeMs).toISOString(),
					properties: [
						{
							template: 'duration',
							obj: { value: Math.round(timeMs / 1000), unit: 'seconds' }
						},
						{
							template: 'score',
							obj: {
								value: Math.min(
									Math.max(Math.round((correct / (correct + mistakes)) * 100), 0),
									100
								)
							}
						},
						{
							template: 'mistakes',
							obj: { value: mistakes }
						},
						{
							template: 'streak',
							obj: { value: maxStreak }
						}
					]
				}
			},
			'*'
		);
	}

	function pickFeature() {
		if (toFind.length === 0) {
			questionFeature = undefined;
			return;
		}

		questionFeature = toFind[Math.floor(Math.random() * toFind.length)];
	}

	function skipCountry() {
		if (!questionFeature || finished || skipsLeft <= 0) return;
		skipsLeft -= 1;
		const skippedFeature = questionFeature;
		const candidates = toFind.filter(
			(country) => country.properties.name !== skippedFeature.properties.name
		);
		questionFeature =
			candidates.length > 0
				? candidates[Math.floor(Math.random() * candidates.length)]
				: skippedFeature;
		hint = '';
		triggerArrow();
	}

	function restart() {
		startGame(targetCountries);
	}

	function triggerCorrectAnimation() {
		correctAnimationKey += 1;
	}

	function clickCountryHandler(feature: TopoGeometry): GuessResult {
		const featureName = feature.properties.name;
		if (
			foundFeatures.some((country) => country.properties.name === featureName) ||
			!unfoundFeatures.some((country) => country.properties.name === featureName) ||
			!questionFeature ||
			finished
		)
			return 'already_guessed';

		if (featureName === questionFeature.properties.name) {
			playSound(tapCorrect);
			triggerCorrectAnimation();
			foundFeatures = [...foundFeatures, feature];
			unfoundFeatures = unfoundFeatures.filter(
				(country) => country.properties.name !== featureName
			);
			toFind = toFind.filter((country) => country.properties.name !== featureName);
			streak += 1;
			maxStreak = Math.max(maxStreak, streak);
			hint = '';
			triggerArrow();

			if (correct >= goal || toFind.length === 0) {
				finishGame();
			} else {
				pickFeature();
			}

			return 'correct';
		}

		playSound(tapIncorrect);
		mistakes += 1;
		if (lives !== undefined && mistakes >= lives) {
			finishGame();
			return 'wrong';
		}
		streak = 0;
		const bearing = getBearing(feature, questionFeature);
		triggerArrow(bearing);
		hint = getBearingHint(feature, questionFeature, bearing);
		return 'wrong';
	}

	function getBearing(from: TopoGeometry, to: TopoGeometry): number {
		return turf.bearingToAzimuth(
			turf.rhumbBearing(
				from.properties.center.geometry.coordinates,
				to.properties.center.geometry.coordinates
			)
		);
	}

	function getBearingHint(
		from: TopoGeometry,
		to: TopoGeometry,
		bearing = getBearing(from, to)
	): string {
		const fromFeature = getGeojsonByName(worldMap, from.properties.name);
		const toFeature = getGeojsonByName(worldMap, to.properties.name);
		if (!fromFeature || !toFeature) return 'Try a different country.';

		const directions = [
			'north',
			'north-east',
			'east',
			'south-east',
			'south',
			'south-west',
			'west',
			'north-west'
		];
		const direction = directions[Math.round(bearing / 45) % directions.length];

		return `${to.properties.name} is ${direction} of ${from.properties.name}.`;
	}

	function triggerArrow(bearing?: number) {
		arrowRotation =
			bearing === undefined
				? undefined
				: [360, 45, 90, 135, 180, 225, 270, 315][Math.round(bearing / 45) % 8];
	}

	function countryFocusedHandler(feature?: TopoGeometry) {
		focusedCountry = feature;
	}
</script>

<svelte:head>
	<title>GeoQuest</title>
</svelte:head>

<main class="min-h-screen bg-quest-bg">
	{#if showLoadingScreen}
		<section
			class="fixed inset-0 z-50 flex items-center justify-center bg-quest-bg"
			aria-label="Loading GeoQuest"
			transition:fly|global={{ y: 100, duration: 200 }}
		>
			<h1
				class="font-serif text-[clamp(2.5rem,10vw,8rem)] leading-none font-black text-quest-green"
			>
				GeoQuest
			</h1>
		</section>
	{:else}
		<div in:fly|global={{ y: 20, duration: 500 }}>
			<Map
				{worldMap}
				{width}
				height={mapHeight}
				{foundFeatures}
				{unfoundFeatures}
				{clickCountryHandler}
				{countryFocusedHandler}
			/>
		</div>

		<section
			class="pointer-events-none fixed top-4 left-1/2 z-2 flex w-[min(100vw-2rem,44rem)] -translate-x-1/2 flex-col items-center gap-3.5 max-[760px]:w-[calc(100vw-1rem)]"
			aria-label="Game status"
			in:fly|global={{ y: -100, duration: 250, delay: 50 }}
		>
			<div
				class="z-1 flex flex-wrap items-center justify-center gap-2 rounded-md bg-quest-surface px-2.5 py-2 shadow-panel"
			>
				<span
					aria-label={`${correct} of ${goal} found`}
					class="rounded-md px-1.5 py-0.5 font-extrabold"
					>🎯 {#key correct}<span in:scale|global={{ start: 1.5 }}>{correct}</span>{/key} / {goal}</span
				>
				<span
					class="rounded-md px-1.5 py-0.5 font-extrabold text-quest-red"
					aria-label={`${mistakes} mistakes`}
					>❌ {#key mistakes}<span in:scale|global={{ start: 1.5 }}>{mistakes}</span
						>{/key}{lives === undefined ? '' : ` / ${lives}`}</span
				>
				<span
					aria-label={`${streak} current streak, ${maxStreak} max streak`}
					class="rounded-md px-1.5 py-0.5 font-extrabold"
					>🔥 {#key streak}<span in:scale|global={{ start: 1.5 }}>{streak}</span>{/key} / {maxStreak}</span
				>
				{#if allowedSkips > 0}
					<span
						class="rounded-md px-1.5 py-0.5 font-extrabold"
						aria-label={`${skipsLeft} skips left`}>💡 {skipsLeft}</span
					>
				{/if}
				{#if countdownSeconds > 0}
					<span
						class="rounded-md px-1.5 py-0.5 font-extrabold"
						aria-label={`Time remaining ${formatTime(remainingTimeMs)}`}
						>⏳ {formatTime(remainingTimeMs)}</span
					>
				{:else}
					<span
						class="rounded-md px-1.5 py-0.5 font-extrabold"
						aria-label={`Time ${formatTime(timeMs)}`}>⏱️ {formatTime(timeMs)}</span
					>
				{/if}
			</div>
			<div in:fly|global={{ y: -100, duration: 500, delay: 75 }} class="flex justify-center">
				{#key questionFeature}
					<div
						in:fly|global={{ y: 20 }}
						class="flex items-center justify-center rounded-md bg-quest-inverse px-4 py-2 text-quest-inverse-text shadow-panel"
					>
						<h1 class="font-serif text-[clamp(1.7rem,3.6vw,3.5rem)] leading-none font-black">
							{#if finished}
								Game finished
							{:else}
								{#key correctAnimationKey}
									<span
										in:scale|global={{ start: 1.15, duration: 250 }}
										class:correct-pop={correctAnimationKey > 0}
									>
										{#if showFlags && currentFlag}<span
												class="mr-2 inline-block font-sans"
												aria-hidden="true">{currentFlag}</span
											>{/if}{showCountryNames ? currentName : ''}
									</span>
								{/key}
								{#if allowedSkips > 0 && skipsLeft > 0}
									<button
										class="pointer-events-auto rounded-md border-0 bg-transparent px-2 py-1 text-inherit hover:bg-transparent"
										type="button"
										aria-label="Skip country"
										onclick={skipCountry}>⏩</button
									>
								{/if}
							{/if}
						</h1>
					</div>
				{/key}
			</div>
			{#if hint || (doHover && focusedCountry)}
				<p class="rounded-md bg-quest-surface px-3 py-2 text-quest-text-soft shadow-panel">
					{hint || `Hovering: ${focusedCountry?.properties.name}`}
				</p>
			{/if}
			{#if arrowRotation !== undefined}
				<div
					class="pointer-events-none absolute top-[calc(100%+0.75rem)] left-1/2 grid size-18 -translate-x-1/2 place-items-center rounded-full border-8 border-quest-bg bg-quest-inverse text-4xl font-black text-quest-inverse-text shadow-arrow"
					aria-label="Direction hint"
					in:fly|global={{ y: -80, duration: 200 }}
					out:fly|global={{ y: 20, duration: 500, easing: quartOut }}
				>
					<span
						class="grid size-full place-items-center leading-none transition-transform duration-150"
						style={`transform: rotate(${arrowRotation}deg)`}>↑</span
					>
				</div>
			{/if}
		</section>

		{#if finished}
			<section
				class="fixed top-1/2 left-1/2 z-2 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-md bg-quest-surface p-5 text-center shadow-panel"
				aria-live="polite"
			>
				<h2 class="m-0">Finished in {formatTime(timeMs, true)}</h2>
				<p class="my-2.5 text-quest-blue-soft">
					{correct} countries found with {mistakes} mistakes.
				</p>
				{#if isEmbedded}
					<div class="mt-4 text-left" aria-label="Submitting">
						<div
							class="mb-1.5 flex items-center justify-between text-xs font-bold text-quest-text-soft"
						>
							<span>{submittedActivity ? 'Submitted' : 'Submitting'}</span>
						</div>
						<div
							class="h-2 overflow-hidden rounded-full bg-quest-bg"
							role="progressbar"
							aria-valuemin="0"
							aria-valuemax="100"
							aria-valuenow={activitySubmitProgress}
						>
							<div
								class="h-full rounded-full bg-quest-green transition-[width] duration-75 ease-linear"
								style={`width: ${activitySubmitProgress}%`}
							></div>
						</div>
					</div>
				{/if}
				{#if canRestart}
					<button
						class="rounded-md border border-quest-border bg-quest-bg px-3 py-2 text-quest-text hover:bg-quest-muted"
						type="button"
						onclick={restart}>Play again</button
					>
				{/if}
			</section>
		{/if}
	{/if}
</main>

<style>
	:global(body) {
		overflow: hidden;
		overscroll-behavior: contain;
	}

	.correct-pop {
		display: inline-block;
		animation: correct-pop 600ms ease-out;
	}

	@keyframes correct-pop {
		0% {
			filter: drop-shadow(0 0 0 rgba(184, 187, 38, 0));
		}

		35% {
			filter: drop-shadow(0 0 0.75rem rgba(184, 187, 38, 0.8));
		}

		100% {
			filter: drop-shadow(0 0 0 rgba(184, 187, 38, 0));
		}
	}
</style>
