import type { Feature, FeatureCollection, Geometry, Point } from 'geojson';

export interface CountryData {
  ISO2?: string;
  ISO3?: string;
  belongsTo?: string;
  center?: number[];
  color?: number;
  difficulty?: number;
  helper?: boolean;
  name?: string;
  squareKm?: number;
  tags?: string[];
}

export interface CountryProperties extends Omit<CountryData, 'center'> {
  center: Feature<Point>;
  helper: boolean;
  isIsland: boolean;
  name: string;
  neighbors: string[];
  squareKm: number;
}

export interface TopoGeometry {
  type: string;
  arcs?: unknown;
  properties: CountryProperties;
}

export interface Topology {
  type: 'Topology';
  arcs: unknown[];
  bbox?: number[];
  objects: Record<string, { type: string; geometries: TopoGeometry[] }>;
  transform?: unknown;
}

export type CountryFeature = Feature<Geometry, CountryProperties>;
export type CountryFeatureCollection = FeatureCollection<Geometry, CountryProperties>;

export type GuessResult = 'correct' | 'wrong' | 'already_guessed';
