import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GlobeScene } from '../lib/globe/GlobeScene';
import { latLonToVector3, formatDate } from '../lib/geo';
import type { BodyConfig, CategoryConfig, SiteRecord } from '../lib/types';

interface GlobeViewProps {
  body: BodyConfig;
  categories: CategoryConfig[];
  sites: SiteRecord[];
  allSites: SiteRecord[];
  selected: SiteRecord | null;
  onSelect: (site: SiteRecord | null) => void;
  focusTarget: { lat: number; lon: number; nonce: number } | null;
  onZoomChange?: (distance: number) => void;
}

interface MarkerStyleCache {
  x: number;
  y: number;
  visible: boolean;
  count: number;
  score: number;
}

export default function GlobeView({
  body,
  categories,
  sites,
  allSites,
  selected,
  onSelect,
  focusTarget,
}: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GlobeScene | null>(null);
  const markerRefs = useRef(new Map<string, HTMLButtonElement>());
  const cacheRef = useRef(new Map<string, MarkerStyleCache>());
  const selectedIdRef = useRef<string | null>(selected?.id ?? null);
  selectedIdRef.current = selected?.id ?? null;
  const [ready, setReady] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const siteMap = useMemo(() => new Map(allSites.map((s) => [s.id, s])), [allSites]);

  // ---- scene lifecycle -----------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new GlobeScene(containerRef.current);
    sceneRef.current = scene;
    setReady(true);
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    setReady(false);
    scene.setBody(body, { resetCamera: !focusTarget }).then(() => setReady(true));
  }, [body]);

  // ---- camera flights ------------------------------------------------------
  useEffect(() => {
    if (!focusTarget || !sceneRef.current) return;
    const dist = Math.max(1.55, Math.min(2.3, sceneRef.current.cameraDistance() * 0.72));
    sceneRef.current.flyTo(focusTarget.lat, focusTarget.lon, dist);
    sceneRef.current.setAutoRotate(false);
    const timeout = window.setTimeout(() => sceneRef.current?.resetIdleTimer(), 1600);
    return () => window.clearTimeout(timeout);
  }, [focusTarget]);

  useEffect(() => {
    sceneRef.current?.setAutoRotate(!selected);
  }, [selected]);

  // ---- marker projection loop ---------------------------------------------
  useEffect(() => {
    const scene = sceneRef.current;
    const overlay = overlayRef.current;
    if (!scene || !overlay) return;

    const vectors = new Map<string, THREE.Vector3>();
    for (const site of sites) vectors.set(site.id, latLonToVector3(site.lat, site.lon, 1.003));

    let frame = 0;
    let raf = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      frame += 1;
      const dist = scene.cameraDistance();

      // cluster cell in screen pixels grows as the camera pulls back
      const cell = Math.min(78, Math.max(24, dist * 14));
      const groups = new Map<string, { ids: string[]; x: number; y: number; score: number }>();

      for (const site of sites) {
        const vec = vectors.get(site.id);
        if (!vec) continue;
        const projected = scene.projectVector(vec);
        const el = markerRefs.current.get(site.id);
        if (!el) continue;
        if (!projected.visible) {
          const cached = cacheRef.current.get(site.id);
          if (!cached || cached.visible) {
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
            cacheRef.current.set(site.id, {
              x: projected.x,
              y: projected.y,
              visible: false,
              count: 0,
              score: projected.facing,
            });
          }
          continue;
        }
        const key = `${Math.round(projected.x / cell)}:${Math.round(projected.y / cell)}`;
        const group = groups.get(key);
        if (group) {
          group.ids.push(site.id);
          group.x = (group.x * (group.ids.length - 1) + projected.x) / group.ids.length;
          group.y = (group.y * (group.ids.length - 1) + projected.y) / group.ids.length;
          group.score = Math.max(group.score, projected.depth);
        } else {
          groups.set(key, { ids: [site.id], x: projected.x, y: projected.y, score: projected.depth });
        }
        el.dataset.screenX = String(projected.x);
        el.dataset.screenY = String(projected.y);
      }

      const visibleIds = new Set<string>();
      for (const group of groups.values()) {
        const sorted = [...group.ids].sort((a, b) => {
          const selectedId = selectedIdRef.current;
          if (a === selectedId) return -1;
          if (b === selectedId) return 1;
          const sa = siteMap.get(a);
          const sb = siteMap.get(b);
          return (sb?.featured ? 1 : 0) - (sa?.featured ? 1 : 0) || a.localeCompare(b);
        });
        const leaderId = sorted[0];
        const leader = markerRefs.current.get(leaderId);
        if (!leader) continue;
        const count = group.ids.length;
        const cached = cacheRef.current.get(leaderId);
        const moveNeeded = !cached || cached.x !== group.x || cached.y !== group.y || !cached.visible;
        const countNeeded = !cached || cached.count !== count;
        if (moveNeeded) {
          leader.style.transform = `translate3d(${group.x.toFixed(1)}px, ${group.y.toFixed(1)}px, 0)`;
          // markers close to the limb fade, so the globe reads as a sphere
          leader.style.opacity = String(0.42 + 0.58 * group.score);
          leader.style.pointerEvents = 'auto';
        }
        if (countNeeded) {
          leader.dataset.clusterCount = String(count);
          leader.dataset.clusterIds = sorted.join(',');
          leader.classList.toggle('is-cluster', count > 1);
          const badge = leader.querySelector<HTMLElement>('[data-cluster-badge]');
          if (badge) badge.textContent = count > 1 ? String(count) : '';
        }
        cacheRef.current.set(leaderId, {
          x: group.x,
          y: group.y,
          visible: true,
          count,
          score: group.score,
        });
        visibleIds.add(leaderId);
        for (const id of sorted.slice(1)) {
          const el = markerRefs.current.get(id);
          if (!el) continue;
          const c = cacheRef.current.get(id);
          if (!c || c.visible) {
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
            cacheRef.current.set(id, { x: 0, y: 0, visible: false, count: 0, score: 0 });
          }
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [sites, body, siteMap]);

  // ---- interactions --------------------------------------------------------
  const handleMarkerClick = (event: React.MouseEvent<HTMLButtonElement>, site: SiteRecord) => {
    event.stopPropagation();
    const scene = sceneRef.current;
    if (!scene) return;
    const el = event.currentTarget;
    const count = Number(el.dataset.clusterCount ?? '1');
    const ids = (el.dataset.clusterIds ?? site.id).split(',');
    if (count > 1 && scene.cameraDistance() > 1.85) {
      let lat = 0;
      let lon = 0;
      let n = 0;
      for (const id of ids) {
        const s = siteMap.get(id);
        if (!s) continue;
        lat += s.lat;
        lon += s.lon;
        n += 1;
      }
      if (n > 0) {
        scene.flyTo(lat / n, lon / n, Math.max(1.4, scene.cameraDistance() * 0.45));
      }
      return;
    }
    onSelect(site);
  };

  const handleBackgroundClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target === event.currentTarget || target.tagName === 'CANVAS') onSelect(null);
  };

  return (
    <div className="globe-view" aria-label={`Interactive globe of ${body.name}`}>
      <div ref={containerRef} className="globe-canvas" onClick={handleBackgroundClick} />
      <div ref={overlayRef} className="marker-overlay" role="presentation">
        {sites.map((site) => {
          const category = categoryMap.get(site.category);
          const color = category?.color ?? '#9ad9ff';
          const isSelected = selected?.id === site.id;
          const isHovered = hovered === site.id;
          return (
            <button
              key={site.id}
              ref={(el) => {
                if (el) markerRefs.current.set(site.id, el);
                else markerRefs.current.delete(site.id);
              }}
              type="button"
              className={`marker${isSelected ? ' is-selected' : ''}${isHovered ? ' is-hovered' : ''} marker--${site.category}`}
              style={{ ['--marker-color' as string]: color }}
              aria-label={`${site.name} — ${site.mission}, ${formatDate(site.date)}`}
              onMouseEnter={() => setHovered(site.id)}
              onMouseLeave={() => setHovered((h) => (h === site.id ? null : h))}
              onFocus={() => setHovered(site.id)}
              onBlur={() => setHovered((h) => (h === site.id ? null : h))}
              onClick={(event) => handleMarkerClick(event, site)}
            >
              <span className="marker-dot" aria-hidden="true" />
              <span className="marker-ring" aria-hidden="true" />
              <span className="cluster-badge" data-cluster-badge aria-hidden="true" />
              <span className="marker-tip" aria-hidden="true">
                <span className="marker-tip-cat" style={{ color }}>
                  {category?.short ?? site.category}
                </span>
                <span className="marker-tip-name">{site.name}</span>
                <span className="marker-tip-meta">
                  {site.mission} · {formatDate(site.date)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <div className={`globe-loading${ready ? ' is-hidden' : ''}`} aria-hidden={ready}>
        <span className="spinner" />
        <span>Rendering {body.name}</span>
      </div>
      <div className="globe-scale" aria-hidden="true">
        <span>{body.radiusKm.toLocaleString()} km radius</span>
        <span className="globe-zoom">markers at true coordinates</span>
      </div>
    </div>
  );
}
