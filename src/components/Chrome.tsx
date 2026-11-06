import { useMemo } from 'react';
import type { BodyConfig, CategoryConfig, DatasetStats, SiteRecord } from '../lib/types';
import { yearOf } from '../lib/geo';

export function TopBar({
  onOpenSearch,
  onOpenAbout,
  recordCount,
  bodyName,
}: {
  onOpenSearch: () => void;
  onOpenAbout: () => void;
  recordCount: number;
  bodyName: string;
}) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="26" height="26">
            <circle cx="16" cy="16" r="12.5" stroke="currentColor" strokeWidth="1.1" fill="none" opacity="0.55" />
            <ellipse cx="16" cy="16" rx="13" ry="5.4" stroke="currentColor" strokeWidth="0.9" fill="none" opacity="0.35" transform="rotate(-22 16 16)" />
            <circle cx="23.4" cy="10.6" r="2.3" fill="currentColor" />
          </svg>
        </span>
        <span className="brand-text">
          <span className="brand-title">Abandoned but Not Forgotten</span>
          <span className="brand-sub">
            {recordCount} documented sites · {bodyName}
          </span>
        </span>
      </div>
      <div className="topbar-actions">
        <button type="button" className="search-trigger" onClick={onOpenSearch}>
          <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
            <circle cx="11" cy="11" r="6.4" stroke="currentColor" strokeWidth="1.6" fill="none" />
            <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <span>Search the archive</span>
          <kbd>/</kbd>
        </button>
        <button type="button" className="ghost-button" onClick={onOpenAbout}>
          About the data
        </button>
      </div>
    </header>
  );
}

export function PlanetSwitcher({
  bodies,
  activeId,
  counts,
  onChange,
}: {
  bodies: BodyConfig[];
  activeId: string;
  counts: Record<string, number>;
  onChange: (id: BodyConfig['id']) => void;
}) {
  return (
    <nav className="planet-switcher" aria-label="Choose a planetary body">
      {bodies.map((body) => (
        <button
          key={body.id}
          type="button"
          className={`planet-tab${body.id === activeId ? ' is-active' : ''}`}
          style={{ ['--body-accent' as string]: body.accent }}
          onClick={() => onChange(body.id)}
          aria-pressed={body.id === activeId}
        >
          <span className="planet-dot" aria-hidden="true" />
          <span className="planet-name">{body.name}</span>
          <span className="planet-count">{counts[body.id] ?? 0}</span>
        </button>
      ))}
    </nav>
  );
}

export function ExplorePanel({
  body,
  stats,
  categories,
  categoryCounts,
  activeCategories,
  onToggleCategory,
  featured,
  onSelect,
  onRandom,
  bodySiteCount,
  bodySources,
  bodyYears,
}: {
  body: BodyConfig;
  stats: DatasetStats;
  categories: CategoryConfig[];
  categoryCounts: Record<string, number>;
  activeCategories: string[];
  onToggleCategory: (id: string) => void;
  featured: SiteRecord[];
  onSelect: (site: SiteRecord) => void;
  onRandom: () => void;
  bodySiteCount: number;
  bodySources: number;
  bodyYears: [number, number] | null;
}) {
  return (
    <section className="explore-panel" aria-label={`About ${body.name}`}>
      <div className="explore-head">
        <h2>{body.name}</h2>
        <p className="explore-sub">{body.subtitle}</p>
      </div>
      <p className="explore-intro">{body.intro}</p>

      <div className="explore-stats">
        <span>
          <strong>{bodySiteCount}</strong> sites
        </span>
        <span>
          <strong>{bodyYears ? `${bodyYears[0]}–${bodyYears[1]}` : '—'}</strong> years covered
        </span>
        <span>
          <strong>{bodySources}</strong> source pages
        </span>
      </div>

      <div className="section-label-row">
        <span className="section-label">Filter by category</span>
        <span className="section-hint">tap to hide</span>
      </div>
      <div className="category-chips">
        {categories.map((category) => {
          const count = categoryCounts[category.id] ?? 0;
          const active = activeCategories.includes(category.id);
          return (
            <button
              key={category.id}
              type="button"
              className={`category-chip${active ? ' is-active' : ''}${count === 0 ? ' is-empty' : ''}`}
              style={{ ['--chip-color' as string]: category.color }}
              onClick={() => onToggleCategory(category.id)}
              aria-pressed={active}
              disabled={count === 0}
              title={category.description}
            >
              <span className="chip-dot" />
              <span>{category.short}</span>
              <span className="chip-count">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="featured-block">
        <span className="section-label">Start here</span>
        <div className="featured-list">
          {featured.map((site) => (
            <button key={site.id} type="button" className="featured-item" onClick={() => onSelect(site)}>
              <span className="featured-year">{site.date.slice(0, 4)}</span>
              <span className="featured-text">
                <span className="featured-name">{site.name}</span>
                <span className="featured-mission">{site.mission}</span>
              </span>
              <span className="featured-arrow" aria-hidden="true">
                →
              </span>
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="random-button" onClick={onRandom}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M4 7h4l8 10h4M4 17h4l3-3.7M14.5 9.2L16 7h4M18 4l2 3-2 3M18 14l2 3-2 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Take me somewhere
      </button>

      <details className="coord-details">
        <summary>Coordinate reference</summary>
        <p>{body.coordSystem}</p>
        <p className="muted">{body.coordNote}</p>
      </details>
    </section>
  );
}

export function TimelineBar({
  sites,
  value,
  bounds,
  onChange,
  yearRange,
}: {
  sites: SiteRecord[];
  value: [number, number];
  bounds: [number, number];
  onChange: (range: [number, number]) => void;
  yearRange: [number, number];
}) {
  const [minYear, maxYear] = bounds;
  const span = Math.max(1, maxYear - minYear);

  const histogram = useMemo(() => {
    const buckets = new Array(span + 1).fill(0);
    for (const site of sites) {
      const year = yearOf(site.date);
      if (year >= minYear && year <= maxYear) buckets[year - minYear] += 1;
    }
    const max = Math.max(1, ...buckets);
    return { buckets, max };
  }, [sites, minYear, maxYear, span]);

  const visible = sites.filter((s) => yearOf(s.date) >= value[0] && yearOf(s.date) <= value[1]).length;
  const left = ((value[0] - minYear) / span) * 100;
  const right = ((value[1] - minYear) / span) * 100;

  return (
    <div className="timeline" aria-label="Timeline filter">
      <div className="timeline-head">
        <span className="section-label">Timeline</span>
        <span className="timeline-years">
          {value[0]} — {value[1]}
        </span>
        <span className="timeline-count">
          {visible} / {sites.length} markers
        </span>
      </div>
      <div className="histogram" aria-hidden="true">
        {histogram.buckets.map((count, i) => {
          const year = minYear + i;
          const inRange = year >= value[0] && year <= value[1];
          return (
            <span
              key={year}
              className={`bar${inRange ? ' is-in' : ''}`}
              style={{ height: `${Math.max(2, (count / histogram.max) * 100)}%` }}
            />
          );
        })}
      </div>
      <div className="range-wrap">
        <div className="range-track">
          <div className="range-fill" style={{ left: `${left}%`, right: `${100 - right}%` }} />
        </div>
        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={value[0]}
          aria-label="Start year"
          onChange={(event) => {
            const next = Math.min(Number(event.target.value), value[1]);
            onChange([next, value[1]]);
          }}
        />
        <input
          type="range"
          min={minYear}
          max={maxYear}
          value={value[1]}
          aria-label="End year"
          onChange={(event) => {
            const next = Math.max(Number(event.target.value), value[0]);
            onChange([value[0], next]);
          }}
        />
      </div>
      <div className="timeline-presets">
        <button type="button" onClick={() => onChange([minYear, maxYear])}>
          Everything
        </button>
        <button
          type="button"
          onClick={() => onChange([Math.max(minYear, 1957), Math.min(maxYear, 1975)])}
        >
          Space race
        </button>
        <button type="button" onClick={() => onChange([1976, maxYear])}>
          After Apollo
        </button>
        <button type="button" onClick={() => onChange([2000, maxYear])}>
          Modern era
        </button>
        <span className="timeline-dataset-range">dataset {yearRange[0]}–{yearRange[1]}</span>
      </div>
    </div>
  );
}

export function LoadingScreen({ error }: { error?: string | null }) {
  return (
    <div className="loading-screen">
      <div className="loading-brand">
        <span className="loading-orbit" aria-hidden="true" />
        <h1>Abandoned but Not Forgotten</h1>
      </div>
      {error ? (
        <div className="loading-error">
          <p>The archive could not be loaded.</p>
          <code>{error}</code>
          <p className="muted">
            Run <code>npm run data:build</code> to generate <code>public/data/sites.json</code>.
          </p>
        </div>
      ) : (
        <p className="loading-text">Opening the archive…</p>
      )}
    </div>
  );
}
