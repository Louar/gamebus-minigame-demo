<script lang="ts">
	import * as d3 from 'd3';
	import { geoPatterson } from 'd3-geo-projection';

	import Country from './Country.svelte';
	import type { GuessResult, TopoGeometry } from '$lib/components/types';
	import type { LoadedWorldMap } from '../map';

	interface Props {
		clickCountryHandler: (feature: TopoGeometry) => GuessResult;
		countryFocusedHandler: (feature?: TopoGeometry) => void;
		foundFeatures: TopoGeometry[];
		height: number;
		unfoundFeatures: TopoGeometry[];
		width: number;
		worldMap: LoadedWorldMap;
	}

	let {
		clickCountryHandler,
		countryFocusedHandler,
		foundFeatures,
		height,
		unfoundFeatures,
		width,
		worldMap
	}: Props = $props();

	let svg: SVGSVGElement;
	let transform = $state(d3.zoomIdentity);
	let projection = geoPatterson();
	let scale = $state(1);
	const strokeWidth = $derived(0.002 * scale);

	const path = $derived(
		d3
			.geoPath()
			.projection({ stream: (stream) => projection.stream(stream) })
			.pointRadius(0.01 * scale)
	);
	const bounds = $derived(
		d3
			.geoPath()
			.projection(projection.scale(1).translate([0, 0]).rotate([-11, 0]))
			.bounds(worldMap.geojson)
	);
	const mapData = $derived(
		worldMap.geojson.features.map((feature, index) => ({
			feature,
			geometry: worldMap.geometries[index]
		}))
	);
	const geometriesByName = $derived(
		new Map(worldMap.geometries.map((geometry) => [geometry.properties.name, geometry]))
	);

	function handleMapClick(event: MouseEvent) {
		const target =
			event.target instanceof SVGElement ? event.target.closest('[data-country-name]') : null;
		const countryName = target?.getAttribute('data-country-name');
		const geometry = countryName ? geometriesByName.get(countryName) : undefined;
		if (geometry) clickCountryHandler(geometry);
	}

	$effect(() => {
		const d3Svg = d3.select(svg);
		const zoom = d3
			.zoom<SVGSVGElement, unknown>()
			.scaleExtent([1, 50])
			.clickDistance(10)
			.on('zoom', (event) => {
				const next = event.transform;
				next.x = Math.min(width / 2, Math.max(next.x, width / 2 - width * next.k));
				next.y = Math.min(height / 2, Math.max(next.y, height / 2 - height * next.k));
				transform = next;
			});

		d3Svg.call(zoom).on('click.zoom', null).on('dblclick.zoom', null);

		return () => {
			d3Svg.on('.zoom', null);
		};
	});

	$effect(() => {
		const mapWidth = bounds[1][0] - bounds[0][0];
		const mapHeight = bounds[1][1] - bounds[0][1];
		scale = 0.95 / Math.max(mapWidth / width, mapHeight / height);
		projection
			.scale(scale)
			.translate([
				(width - scale * (bounds[1][0] + bounds[0][0])) / 2,
				(height - scale * (bounds[1][1] + bounds[0][1])) / 2
			]);
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg
	bind:this={svg}
	{width}
	{height}
	viewBox={`0 0 ${width} ${height}`}
	aria-label="World countries map"
	onclick={handleMapClick}
>
	<g transform={transform.toString()}>
		{#each mapData as data (data.geometry.properties.name)}
			<Country
				{data}
				{path}
				{foundFeatures}
				{unfoundFeatures}
				{clickCountryHandler}
				{countryFocusedHandler}
			/>
		{/each}
		{#each mapData as data (`helper-${data.geometry.properties.name}`)}
			{#if data.geometry.properties.helper}
				<Country
					{data}
					{path}
					{foundFeatures}
					{unfoundFeatures}
					{clickCountryHandler}
					{countryFocusedHandler}
					{strokeWidth}
					helper
				/>
			{/if}
		{/each}
	</g>
</svg>
