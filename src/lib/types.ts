export type BodyId = 'earth' | 'moon' | 'mars' | 'venus';

export type CategoryId =
  | 'launch'
  | 'facility'
  | 'crewed-landing'
  | 'robotic-landing'
  | 'rover'
  | 'impact'
  | 'artifact';

export type CoordAccuracy = 'surveyed' | 'mapped' | 'approximate' | 'uncertain';
export type StatusKind = 'success' | 'partial' | 'failure' | 'ongoing' | 'unknown';

export interface SourceRef {
  title: string;
  publisher?: string;
  url: string;
  accessed?: string;
}

export interface FactRef {
  label: string;
  value: string;
}

export interface ArtifactRef {
  name: string;
  status?: string;
  note?: string;
}

export interface ImageRef {
  url: string;
  title: string;
  credit: string;
  caption?: string;
  sourceUrl?: string;
}

export interface SiteRecord {
  id: string;
  body: BodyId;
  name: string;
  siteName?: string;
  mission: string;
  program?: string;
  agency: string;
  country?: string;
  category: CategoryId;
  categoryDetail?: string;
  date: string;
  dateNote?: string;
  status: string;
  statusKind: StatusKind;
  summary: string;
  narrative: string[];
  lat: number;
  lon: number;
  coordSystem: string;
  coordAccuracy: CoordAccuracy;
  coordNote?: string;
  artifacts?: ArtifactRef[];
  facts?: FactRef[];
  images?: ImageRef[];
  keywords?: string[];
  sources: SourceRef[];
  related?: string[];
  narrationAudio?: string;
  featured?: boolean;
  verification?: { dataset: string; match: string };
}

export interface BodyConfig {
  id: BodyId;
  name: string;
  subtitle: string;
  radiusKm: number;
  hasGlobe: boolean;
  globeRadius: number;
  textures: { map: string; bump?: string; normal?: string; clouds?: string };
  atmosphere: string;
  atmosphereStrength: number;
  coordSystem: string;
  coordNote: string;
  accent: string;
  intro: string;
  featuredIds: string[];
}

export interface CategoryConfig {
  id: CategoryId;
  label: string;
  short: string;
  color: string;
  description: string;
}

export interface DatasetStats {
  total: number;
  byBody: Record<string, number>;
  byCategory: Record<string, number>;
  byAgency: Record<string, number>;
  byDecade: Record<string, number>;
  withImages: number;
  withVerification: number;
  uniqueSources: number;
  yearRange: [number, number];
}

export interface Dataset {
  meta: {
    title: string;
    subtitle: string;
    version: string;
    builtAt: string;
    recordCount: number;
    license: string;
    methodology: string;
  };
  bodies: BodyConfig[];
  categories: CategoryConfig[];
  stats: DatasetStats;
  sites: SiteRecord[];
}

export interface ProjectedMarker {
  x: number;
  y: number;
  visible: boolean;
  depth: number;
}
