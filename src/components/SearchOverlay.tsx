import { useEffect, useMemo, useRef, useState } from 'react';
import { searchSites } from '../lib/dataset';
import { formatDate } from '../lib/geo';
import type { BodyConfig, CategoryConfig, SiteRecord } from '../lib/types';

export default function SearchOverlay({
  sites,
  bodies,
  categories,
  open,
  onClose,
  onSelect,
}: {
  sites: SiteRecord[];
  bodies: BodyConfig[];
  categories: CategoryConfig[];
  open: boolean;
  onClose: () => void;
  onSelect: (site: SiteRecord) => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyMap = useMemo(() => new Map(bodies.map((b) => [b.id, b])), [bodies]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      return sites
        .filter((s) => s.featured)
        .slice(0, 8)
        .map((site) => ({ site, score: 0 }));
    }
    return searchSites(sites, trimmed, 18);
  }, [query, sites]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  const commit = (site: SiteRecord | undefined) => {
    if (!site) return;
    onSelect(site);
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commit(results[active]?.site);
    } else if (event.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="overlay search-overlay" role="dialog" aria-modal="true" aria-label="Search the archive">
      <div className="search-modal" onKeyDown={onKeyDown}>
        <div className="search-field">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle cx="11" cy="11" r="6.4" stroke="currentColor" strokeWidth="1.6" fill="none" />
            <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search missions, spacecraft, sites, years…"
            aria-label="Search"
            spellCheck={false}
          />
          <button type="button" className="ghost-button" onClick={onClose}>
            Esc
          </button>
        </div>

        <div className="search-hints">
          {['Apollo 11', 'Lunokhod', 'Viking', 'water ice', 'crashed', '1969', 'Jezero', 'Surveyor'].map((hint) => (
            <button key={hint} type="button" className="hint-chip" onClick={() => setQuery(hint)}>
              {hint}
            </button>
          ))}
        </div>

        <ul className="search-results">
          {results.length === 0 && (
            <li className="search-empty">
              No locations match “{query}”. Try a mission name, a spacecraft, a place or a year.
            </li>
          )}
          {results.map((result, index) => {
            const site = result.site;
            const category = categoryMap.get(site.category);
            return (
              <li key={site.id}>
                <button
                  type="button"
                  className={`search-result${index === active ? ' is-active' : ''}`}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => commit(site)}
                >
                  <span className="result-dot" style={{ background: category?.color }} />
                  <span className="result-main">
                    <span className="result-name">{site.name}</span>
                    <span className="result-meta">
                      {site.mission} · {bodyMap.get(site.body)?.name} · {formatDate(site.date)}
                    </span>
                  </span>
                  <span className="result-tag">{category?.short}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="search-footer">
          <span>{results.length} results</span>
          <span>↑ ↓ to move · ↵ to open</span>
        </div>
      </div>
    </div>
  );
}
