import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GlobeView from './components/GlobeView';
import StoryPanel from './components/StoryPanel';
import SearchOverlay from './components/SearchOverlay';
import { ExplorePanel, LoadingScreen, PlanetSwitcher, TimelineBar, TopBar } from './components/Chrome';
import { AboutModal, IntroOverlay } from './components/Overlays';
import { sitesByIds, useDataset } from './lib/dataset';
import { yearOf } from './lib/geo';
import type { BodyId, SiteRecord } from './lib/types';

interface FocusTarget {
  lat: number;
  lon: number;
  nonce: number;
}

const DEFAULT_BODY: BodyId = 'moon';

function readHash(): { body?: string; id?: string } {
  const raw = window.location.hash.replace(/^#\/?/, '');
  if (!raw) return {};
  const [body, id] = raw.split('/');
  return { body, id };
}

export default function App() {
  const { dataset, sites, bodies, categories, loading, error } = useDataset();

  const [bodyId, setBodyId] = useState<BodyId>(DEFAULT_BODY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [activeCategories, setActiveCategories] = useState<string[]>([]);
  const [yearRange, setYearRange] = useState<[number, number]>([1900, 2030]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(true);
  const [exploreOpen, setExploreOpen] = useState(false);
  const initialised = useRef(false);

  const body = useMemo(
    () => bodies.find((b) => b.id === bodyId) ?? bodies[0],
    [bodies, bodyId],
  );
  const selectedSite = useMemo(
    () => (selectedId ? sites.find((s) => s.id === selectedId) ?? null : null),
    [selectedId, sites],
  );

  // initial state from dataset + URL hash
  useEffect(() => {
    if (!dataset || initialised.current) return;
    initialised.current = true;
    const stats = dataset.stats;
    setYearRange([stats.yearRange[0], stats.yearRange[1]]);
    setActiveCategories(dataset.categories.map((c) => c.id));

    const hash = readHash();
    const hashBody = dataset.bodies.find((b) => b.id === hash.body);
    const hashSite = hash.id ? dataset.sites.find((s) => s.id === hash.id) : undefined;
    if (hashSite) {
      setBodyId(hashSite.body);
      setSelectedId(hashSite.id);
      setFocusTarget({ lat: hashSite.lat, lon: hashSite.lon, nonce: 1 });
    } else if (hashBody) {
      setBodyId(hashBody.id);
    }
  }, [dataset]);

  // keep the URL shareable
  useEffect(() => {
    if (!initialised.current) return;
    const hash = selectedSite ? `#${selectedSite.body}/${selectedSite.id}` : `#${bodyId}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash);
    }
  }, [selectedSite, bodyId]);

  const selectSite = useCallback(
    (site: SiteRecord | null) => {
      if (!site) {
        setSelectedId(null);
        return;
      }
      if (site.body !== bodyId) setBodyId(site.body);
      setSelectedId(site.id);
      setFocusTarget({ lat: site.lat, lon: site.lon, nonce: Date.now() });
      setExploreOpen(false);
    },
    [bodyId],
  );

  const closeStory = useCallback(() => setSelectedId(null), []);

  const changeBody = useCallback((id: BodyId) => {
    setBodyId(id);
    setSelectedId(null);
    setFocusTarget(null);
    setExploreOpen(false);
  }, []);

  const toggleCategory = useCallback((id: string) => {
    setActiveCategories((current) =>
      current.includes(id) ? current.filter((c) => c !== id) : [...current, id],
    );
  }, []);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if ((event.key === '/' && !typing) || ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k')) {
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key === 'Escape' && !typing) {
        setSearchOpen(false);
        setAboutOpen(false);
        setIntroOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const bodySites = useMemo(() => sites.filter((s) => s.body === bodyId), [sites, bodyId]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const site of bodySites) counts[site.category] = (counts[site.category] ?? 0) + 1;
    return counts;
  }, [bodySites]);

  const visibleSites = useMemo(
    () =>
      bodySites.filter(
        (site) =>
          activeCategories.includes(site.category) &&
          yearOf(site.date) >= yearRange[0] &&
          yearOf(site.date) <= yearRange[1],
      ),
    [bodySites, activeCategories, yearRange],
  );

  const bodyYears = useMemo<[number, number] | null>(() => {
    if (!bodySites.length) return null;
    const years = bodySites.map((site) => yearOf(site.date)).filter((year) => Number.isFinite(year));
    if (!years.length) return null;
    return [Math.min(...years), Math.max(...years)];
  }, [bodySites]);

  const bodySources = useMemo(() => {
    const urls = new Set<string>();
    for (const site of bodySites) for (const source of site.sources ?? []) urls.add(source.url);
    return urls.size;
  }, [bodySites]);

  const featured = useMemo(() => {
    if (!body) return [];
    const explicit = sitesByIds(sites, body.featuredIds);
    if (explicit.length) return explicit.slice(0, 3);
    return bodySites.filter((s) => s.featured).slice(0, 3);
  }, [body, sites, bodySites]);

  const related = useMemo(() => {
    if (!selectedSite) return [];
    const ids = selectedSite.related ?? [];
    const direct = sitesByIds(sites, ids).filter((s) => s.id !== selectedSite.id);
    if (direct.length >= 2) return direct.slice(0, 4);
    const sameMission = sites.filter(
      (s) => s.id !== selectedSite.id && s.mission === selectedSite.mission,
    );
    return [...direct, ...sameMission].slice(0, 4);
  }, [selectedSite, sites]);

  const takeMeSomewhere = useCallback(() => {
    const pool = visibleSites.length ? visibleSites : bodySites;
    if (!pool.length) return;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    selectSite(pick);
  }, [visibleSites, bodySites, selectSite]);

  if (loading || !dataset || !body) return <LoadingScreen error={error} />;

  return (
    <div className={`app${selectedSite ? ' has-selection' : ''}`}>
      <div className="scene">
        <GlobeView
          body={body}
          categories={categories}
          sites={visibleSites}
          allSites={sites}
          selected={selectedSite}
          onSelect={selectSite}
          focusTarget={focusTarget}
        />
        <div className="scene-vignette" aria-hidden="true" />
      </div>

      <TopBar
        onOpenSearch={() => setSearchOpen(true)}
        onOpenAbout={() => setAboutOpen(true)}
        recordCount={dataset.stats.total}
        bodyName={body.name}
      />

      <div className={`left-rail${exploreOpen ? ' is-open' : ''}`}>
        <PlanetSwitcher
          bodies={bodies}
          activeId={bodyId}
          counts={dataset.stats.byBody}
          onChange={changeBody}
        />
        <ExplorePanel
          body={body}
          stats={dataset.stats}
          categories={categories}
          categoryCounts={categoryCounts}
          activeCategories={activeCategories}
          onToggleCategory={toggleCategory}
          featured={featured}
          onSelect={selectSite}
          onRandom={takeMeSomewhere}
          bodySiteCount={bodySites.length}
          bodySources={bodySources}
          bodyYears={bodyYears}
        />
      </div>

      <button
        type="button"
        className="mobile-panel-toggle"
        onClick={() => setExploreOpen((open) => !open)}
        aria-expanded={exploreOpen}
      >
        {exploreOpen ? 'Close' : 'Explore & filter'}
      </button>

      <TimelineBar
        sites={bodySites}
        value={yearRange}
        bounds={dataset.stats.yearRange}
        onChange={setYearRange}
        yearRange={dataset.stats.yearRange}
      />

      {selectedSite && (
        <StoryPanel
          key={selectedSite.id}
          site={selectedSite}
          body={bodies.find((b) => b.id === selectedSite.body) ?? body}
          categories={categories}
          related={related}
          onClose={closeStory}
          onSelectRelated={(site) => selectSite(site)}
        />
      )}

      <div className="status-line">
        <span className="status-dot" aria-hidden="true" />
        <span>
          {visibleSites.length} of {bodySites.length} documented sites shown
        </span>
        <span className="status-sep">·</span>
        <span className="status-muted">dataset v{dataset.meta.version}</span>
      </div>

      <SearchOverlay
        open={searchOpen}
        sites={sites}
        bodies={bodies}
        categories={categories}
        onClose={() => setSearchOpen(false)}
        onSelect={(site) => selectSite(site)}
      />

      <IntroOverlay
        open={introOpen}
        stats={dataset.stats}
        onEnter={() => setIntroOpen(false)}
        onAbout={() => {
          setIntroOpen(false);
          setAboutOpen(true);
        }}
      />

      <AboutModal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        stats={dataset.stats}
        version={dataset.meta.version}
        builtAt={dataset.meta.builtAt}
      />
    </div>
  );
}
