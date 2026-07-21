<script lang="ts">
	import type { GeoPath } from 'd3-geo';
	import type { CountryFeature, GuessResult, TopoGeometry } from '$lib/components/types';

	interface Props {
		clickCountryHandler: (feature: TopoGeometry) => GuessResult;
		countryFocusedHandler: (feature?: TopoGeometry) => void;
		data: { feature: CountryFeature; geometry: TopoGeometry };
		foundFeatures: TopoGeometry[];
		helper?: boolean;
		path: GeoPath;
		strokeWidth?: number;
		unfoundFeatures: TopoGeometry[];
	}

	let {
		clickCountryHandler,
		countryFocusedHandler,
		data,
		foundFeatures,
		helper = false,
		path,
		strokeWidth,
		unfoundFeatures
	}: Props = $props();

	const colors = ['country-blue', 'country-yellow', 'country-green', 'country-red'];
	const countryName = $derived(data.geometry.properties.name);
	const found = $derived(foundFeatures.some((feature) => feature.properties.name === countryName));
	const disabled = $derived(
		!unfoundFeatures.some((feature) => feature.properties.name === countryName)
	);
	const color = $derived(colors[data.geometry.properties.color ?? 0] ?? colors[0]);
	const d = $derived(path(helper ? data.geometry.properties.center : data.feature) ?? '');

	function handleClick(event: MouseEvent) {
		event.stopPropagation();
		clickCountryHandler(data.geometry);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_mouse_events_have_key_events -->
<path
	class:found
	class:disabled
	class:helper
	class={color}
	data-country-name={data.geometry.properties.name}
	{d}
	style={strokeWidth === undefined ? undefined : `stroke-width: ${strokeWidth}px`}
	onmouseover={() => countryFocusedHandler(data.geometry)}
	onmouseleave={() => countryFocusedHandler()}
	onclick={handleClick}
/>
