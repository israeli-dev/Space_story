import { useEffect, useState } from 'react';
import type { BodyConfig, CategoryConfig, Dataset, SiteRecord } from './types';

let cache: Dataset | null = null;

async function loadDataset(): Promise<Dataset> {
  if (cache) return cache;
  const res = await fetch(`${import.meta.env.BASE_URL}data/sites.json`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load the site dataset (HTTP ${res.status})`);
  const json = (await res.json()) as Dataset;
  cache = json;
  return json;
}

export interface DatasetState {
  dataset: Dataset | null;
  sites: SiteRecord[];
  bodies: BodyConfig[];
  categories: CategoryConfig[];
  loading: boolean;
  error: string | null;
}

export function useDataset(): DatasetState {
  const [state, setState] = useState<DatasetState>({
    dataset: null,
    sites: [],
    bodies: [],
    categories: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    loadDataset()
      .then((dataset) => {
        if (cancelled) return;
        setState({
          dataset,
          sites: dataset.sites,
          bodies: dataset.bodies,
          categories: dataset.categories,
          loading: false,
          error: null,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState((s) => ({ ...s, loading: false, error: (error as Error).message }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function categoryColor(categories: CategoryConfig[], id: string) {
  return categories.find((c) => c.id === id)?.color ?? '#ffffff';
}

export function categoryLabel(categories: CategoryConfig[], id: string) {
  return categories.find((c) => c.id === id)?.label ?? id;
}

export interface SearchResult {
  site: SiteRecord;
  score: number;
}

/** Small, dependency-free ranked search across names, missions, keywords and narrative. */
export function searchSites(sites: SiteRecord[], query: string, limit = 24): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/).filter(Boolean);

  const results: SearchResult[] = [];
  for (const site of sites) {
    const haystackName = `${site.name} ${site.siteName ?? ''}`.toLowerCase();
    const haystackMeta = `${site.mission} ${site.program ?? ''} ${site.agency} ${site.categoryDetail ?? ''}`.toLowerCase();
    const haystackKeywords = (site.keywords ?? []).join(' ').toLowerCase();
    const haystackBody = `${site.summary} ${site.narrative.join(' ')}`.toLowerCase();

    let score = 0;
    let matchedAll = true;
    for (const term of terms) {
      let termScore = 0;
      if (haystackName.startsWith(term)) termScore += 120;
      else if (haystackName.includes(term)) termScore += 70;
      if (haystackMeta.includes(term)) termScore += 40;
      if (haystackKeywords.includes(term)) termScore += 26;
      if (haystackBody.includes(term)) termScore += 8;
      if (site.date.includes(term)) termScore += 30;
      if (termScore === 0) {
        matchedAll = false;
        break;
      }
      score += termScore;
    }
    if (!matchedAll) continue;
    // an exact mission-name hit is what people usually mean
    if (site.mission.toLowerCase().includes(q)) score += 90;
    if (site.featured) score += 12;
    results.push({ site, score });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function sitesByIds(sites: SiteRecord[], ids: string[] | undefined): SiteRecord[] {
  if (!ids?.length) return [];
  const map = new Map(sites.map((s) => [s.id, s]));
  return ids.map((id) => map.get(id)).filter((s): s is SiteRecord => Boolean(s));
}
