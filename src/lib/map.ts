import * as turf from '@turf/turf';
import bboxCalc from 'geojson-bbox';
import * as topojsonClient from 'topojson-client';

import type { CountryData, CountryFeatureCollection, TopoGeometry, Topology } from '$lib/components/types';
import elements from './assets/world-countries/elements.json';
import rawMap from './assets/world-countries/map.json';

const excludedCountries = new Set(['Antarctica', 'Spratly Islands', 'Scarborough Shoal']);

export interface LoadedWorldMap {
  topojson: Topology;
  geojson: CountryFeatureCollection;
  geometries: TopoGeometry[];
  countries: string[];
  tags: string[];
  elements: Record<string, CountryData>;
}

export function loadWorldCountries(): LoadedWorldMap {
  const topojson = structuredClone(rawMap) as unknown as Topology;
  const data = elements as unknown as Record<string, CountryData>;
  preprocessTopojson(topojson, 'countries', data);

  const geojson = topojsonClient.feature(topojson as never, topojson.objects.countries as never) as unknown as CountryFeatureCollection;
  const geometries = topojson.objects.countries.geometries;
  const countries = geometries.map((geometry) => geometry.properties.name).sort((a, b) => a.localeCompare(b));
  const tags = Array.from(new Set(Object.values(data).flatMap((country) => country.tags ?? []))).sort((a, b) => a.localeCompare(b));

  return { topojson, geojson, geometries, countries, tags, elements: data };
}

export function getCountriesFromTags(tags: string[], map: LoadedWorldMap): string[] {
  if (tags.includes('World')) return map.countries;

  const chosen = new Set(tags);
  const activeCountries = new Set(map.countries);

  return Object.entries(map.elements)
    .filter(([name, data]) => activeCountries.has(name) && (data.tags ?? []).some((tag) => chosen.has(tag)))
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));
}

export function getGeojsonByName(map: LoadedWorldMap, name: string) {
  return map.geojson.features.find((feature) => feature.properties.name === name);
}

function preprocessTopojson(json: Topology, dataKey: string, data: Record<string, CountryData>): void {
  const object = json.objects[dataKey];
  const geometriesByName = Object.fromEntries(object.geometries.map((geometry) => [geometry.properties.name, geometry]));
  const mergeGroups = Object.entries(data).reduce<Record<string, string[]>>((groups, [name, country]) => {
    if (country.belongsTo) groups[country.belongsTo] = [...(groups[country.belongsTo] ?? []), name];
    return groups;
  }, {});

  for (const [parentName, names] of Object.entries(mergeGroups)) {
    const parent = geometriesByName[parentName];
    if (!parent) continue;

    const geometries = [parent, ...names.map((name) => geometriesByName[name]).filter(Boolean)];
    const merged = topojsonClient.mergeArcs(json as never, geometries as never) as TopoGeometry;
    merged.properties = parent.properties;

    for (const name of names) delete geometriesByName[name];
    geometriesByName[parentName] = merged;
  }

  object.geometries = Object.values(geometriesByName).filter((geometry) => !excludedCountries.has(geometry.properties.name));

  const neighbors = topojsonClient.neighbors(object.geometries as never);
  const geojson = topojsonClient.feature(json as never, object as never) as unknown as CountryFeatureCollection;

  object.geometries = object.geometries.map((geometry, index) => {
    const feature = geojson.features[index];
    const countryData = data[geometry.properties.name] ?? {};
    const bbox = bboxCalc(feature);
    const xs = Math.abs(bbox[0] - bbox[2]);
    const ys = Math.abs(bbox[1] - bbox[3]);
    const center = countryData.center?.length === 2
      ? { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: countryData.center as [number, number] }, properties: {} }
      : turf.center(feature);
    const squareKm = countryData.squareKm ?? Math.floor(turf.area(feature) / 1000000);
    const countryNeighbors = neighbors[index].map((neighborIndex: number) => geojson.features[neighborIndex].properties.name);
    const isIsland = countryNeighbors.length === 0;

    geometry.properties = {
      ...geometry.properties,
      ...countryData,
      center,
      helper: countryData.helper ?? (!isIsland && squareKm < 6000 && xs < 0.7 && ys < 0.7),
      isIsland,
      name: geometry.properties.name,
      neighbors: countryNeighbors,
      squareKm
    };

    return geometry;
  });
}
