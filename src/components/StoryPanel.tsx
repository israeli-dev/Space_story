import { useEffect, useMemo, useState } from 'react';
import { useNarration } from '../hooks/useNarration';
import { formatDate, formatLatLon, formatLatLon360, splitSentences } from '../lib/geo';
import type { BodyConfig, CategoryConfig, ImageRef, SiteRecord } from '../lib/types';

interface StoryPanelProps {
  site: SiteRecord;
  body: BodyConfig;
  categories: CategoryConfig[];
  related: SiteRecord[];
  onClose: () => void;
  onSelectRelated: (site: SiteRecord) => void;
}

type TabId = 'story' | 'artifacts' | 'facts' | 'sources';

const TABS: { id: TabId; label: string }[] = [
  { id: 'story', label: 'Story' },
  { id: 'artifacts', label: 'Left behind' },
  { id: 'facts', label: 'Mission data' },
  { id: 'sources', label: 'Sources' },
];

const STATUS_LABEL: Record<string, string> = {
  success: 'Mission achieved',
  partial: 'Partial success',
  failure: 'Failed',
  ongoing: 'Still active',
  unknown: 'Status unclear',
};

function NasaImage({ image }: { image: ImageRef }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  return (
    <figure className={`story-figure story-figure--${state}`}>
      {state !== 'error' && (
        <img
          src={image.url}
          alt={image.title}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setState('ready')}
          onError={() => setState('error')}
        />
      )}
      {state === 'error' && (
        <div className="image-fallback">
          <span>Archive image unavailable offline</span>
          <a href={image.sourceUrl ?? image.url} target="_blank" rel="noreferrer">
            Open the NASA record ↗
          </a>
        </div>
      )}
      <figcaption>
        <span className="figure-title">{image.title}</span>
        {image.caption && <span className="figure-caption">{image.caption}</span>}
        <span className="figure-credit">
          {image.credit}
          {image.sourceUrl && (
            <>
              {' · '}
              <a href={image.sourceUrl} target="_blank" rel="noreferrer">
                source
              </a>
            </>
          )}
        </span>
      </figcaption>
    </figure>
  );
}

export default function StoryPanel({
  site,
  body,
  categories,
  related,
  onClose,
  onSelectRelated,
}: StoryPanelProps) {
  const [tab, setTab] = useState<TabId>('story');
  const [showVoice, setShowVoice] = useState(false);
  const [copied, setCopied] = useState(false);
  const category = categories.find((c) => c.id === site.category);
  const narration = useNarration(site.narrative, site.id);

  useEffect(() => {
    setTab('story');
    setCopied(false);
  }, [site.id]);

  const sentenceIndex = useMemo(() => {
    let counter = 0;
    return site.narrative.map((paragraph) =>
      splitSentences(paragraph).map((sentence) => ({ text: sentence, index: counter++ })),
    );
  }, [site.narrative]);

  const copyCoordinates = async () => {
    const text = `${site.name} — ${formatLatLon(site.lat, site.lon, 5)} (${site.coordSystem})`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  const playLabel =
    narration.status === 'playing' ? 'Pause' : narration.status === 'paused' ? 'Resume' : 'Listen';

  return (
    <aside className="story-panel" aria-label={`${site.name} story`}>
      <div className="story-scroll">
        <header className="story-header">
          <div className="story-eyebrow">
            <span className="cat-dot" style={{ background: category?.color }} />
            <span>{category?.label ?? site.category}</span>
            <span className="dot-sep">·</span>
            <span>{body.name}</span>
            {site.categoryDetail && (
              <>
                <span className="dot-sep">·</span>
                <span className="story-type">{site.categoryDetail}</span>
              </>
            )}
          </div>
          <button className="icon-button story-close" onClick={onClose} aria-label="Close story">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </svg>
          </button>
          <h1>{site.name}</h1>
          {site.siteName && <p className="story-site">{site.siteName}</p>}
          <div className="story-badges">
            <span className="badge">{site.mission}</span>
            <span className="badge badge--muted">{formatDate(site.date)}</span>
            <span className={`badge badge--status badge--${site.statusKind}`}>
              {STATUS_LABEL[site.statusKind] ?? site.statusKind}
            </span>
            <span className="badge badge--muted">{site.agency}</span>
          </div>
        </header>

        {site.images?.[0] ? (
          <NasaImage image={site.images[0]} />
        ) : (
          <div className="figure-absent">
            <span className="figure-absent-label">No verified photograph held</span>
            <p>
              This entry is built from the written record only. A NASA image will be attached here when one is
              confirmed against the agency's image library — nothing is substituted in the meantime.
            </p>
          </div>
        )}

        <p className="story-summary">{site.summary}</p>

        <nav className="story-tabs" role="tablist" aria-label="Story sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={`story-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setTab(t.id)}
              type="button"
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab === 'story' && (
          <div className="story-tab-panel" role="tabpanel">
            {sentenceIndex.map((sentences, pIndex) => (
              <p key={pIndex} className="story-paragraph">
                {sentences.map(({ text, index }) => (
                  <span
                    key={index}
                    className={
                      narration.activeIndex === index && narration.status !== 'idle'
                        ? 'sentence is-speaking'
                        : 'sentence'
                    }
                  >
                    {text}{' '}
                  </span>
                ))}
              </p>
            ))}

            {site.coordNote && (
              <div className="callout">
                <span className="callout-label">On the coordinates</span>
                <p>{site.coordNote}</p>
              </div>
            )}

            {related.length > 0 && (
              <div className="related-block">
                <span className="section-label">Nearby in the archive</span>
                <div className="related-list">
                  {related.map((r) => (
                    <button key={r.id} type="button" className="related-chip" onClick={() => onSelectRelated(r)}>
                      <span
                        className="cat-dot"
                        style={{ background: categories.find((c) => c.id === r.category)?.color }}
                      />
                      <span>{r.name}</span>
                      <span className="related-date">{r.date.slice(0, 4)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'artifacts' && (
          <div className="story-tab-panel" role="tabpanel">
            <p className="tab-intro">
              What was left on the surface — hardware that is still there, still identifiable, and in some cases
              still working.
            </p>
            {site.artifacts?.length ? (
              <ul className="artifact-list">
                {site.artifacts.map((artifact, i) => (
                  <li key={`${artifact.name}-${i}`}>
                    <span className="artifact-index">{String(i + 1).padStart(2, '0')}</span>
                    <div>
                      <div className="artifact-name">{artifact.name}</div>
                      {artifact.status && <div className="artifact-status">{artifact.status}</div>}
                      {artifact.note && <div className="artifact-note">{artifact.note}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="empty-state">
                <p>
                  No equipment inventory is documented for this site in the archive yet. The physical record may
                  still exist — {site.name} is listed because the location itself is the artefact.
                </p>
              </div>
            )}
            <div className="callout">
              <span className="callout-label">Mission outcome</span>
              <p>{site.status}</p>
            </div>
          </div>
        )}

        {tab === 'facts' && (
          <div className="story-tab-panel" role="tabpanel">
            <dl className="fact-grid">
              {(site.facts ?? []).map((fact) => (
                <div key={fact.label} className="fact-row">
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
              <div className="fact-row">
                <dt>Coordinates</dt>
                <dd>
                  {formatLatLon(site.lat, site.lon, 5)}
                  <button type="button" className="copy-button" onClick={copyCoordinates}>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </dd>
              </div>
              <div className="fact-row">
                <dt>Reference frame</dt>
                <dd>
                  {site.coordSystem}
                  <span className={`accuracy accuracy--${site.coordAccuracy}`}>
                    {site.coordAccuracy} position
                  </span>
                </dd>
              </div>
              <div className="fact-row">
                <dt>East longitude form</dt>
                <dd>{formatLatLon360(site.lat, site.lon, 4)}</dd>
              </div>
              {site.program && (
                <div className="fact-row">
                  <dt>Programme</dt>
                  <dd>{site.program}</dd>
                </div>
              )}
              <div className="fact-row">
                <dt>Event date</dt>
                <dd>
                  {formatDate(site.date)}
                  {site.dateNote && <span className="fact-note">{site.dateNote}</span>}
                </dd>
              </div>
            </dl>
            {site.coordNote && (
              <div className="callout">
                <span className="callout-label">Position note</span>
                <p>{site.coordNote}</p>
              </div>
            )}
          </div>
        )}

        {tab === 'sources' && (
          <div className="story-tab-panel" role="tabpanel">
            <span className="section-label">Primary records</span>
            <ul className="source-list">
              {site.sources.map((source) => (
                <li key={source.url}>
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.title}
                  </a>
                  <span className="source-meta">
                    {source.publisher}
                    {source.accessed ? ` · accessed ${source.accessed}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            {site.verification && (
              <div className="callout">
                <span className="callout-label">Coordinate verification</span>
                <p>
                  This position was cross-checked at build time against the machine-readable snapshot of the NASA
                  source table <code>{site.verification.dataset}</code> (row “{site.verification.match}”) stored in
                  the repository. Any mismatch would have failed the build.
                </p>
              </div>
            )}
            {site.coordNote && (
              <div className="callout">
                <span className="callout-label">Coordinate note</span>
                <p>{site.coordNote}</p>
              </div>
            )}
            <div className="callout callout--muted">
              <span className="callout-label">Narration</span>
              <p>
                The audio narration is generated from this text by your browser's speech engine. Nothing is
                dramatised: if a detail is not in the sourced narrative above, it is not in the narration either.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="narrator" data-status={narration.status}>
        <div className="narrator-main">
          <button
            type="button"
            className="narrator-play"
            onClick={narration.toggle}
            disabled={!narration.supported}
            aria-label={playLabel}
          >
            {narration.status === 'playing' ? (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
                <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M8 5l11 7-11 7z" fill="currentColor" />
              </svg>
            )}
          </button>
          <div className="narrator-info">
            <div className="narrator-title">
              <span>{narration.supported ? 'Audio tour' : 'Audio unavailable'}</span>
              <span className="narrator-state">
                {narration.status === 'playing'
                  ? `Reading ${Math.min(narration.activeIndex + 1, narration.sentences.length)} / ${narration.sentences.length}`
                  : narration.status === 'paused'
                    ? 'Paused'
                    : narration.status === 'ended'
                      ? 'Finished'
                      : narration.supported
                        ? 'Narrated from the sourced text'
                        : 'This browser has no speech engine'}
              </span>
            </div>
            <div
              className="narrator-progress"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(narration.progress * 100)}
            >
              <div style={{ width: `${Math.round(narration.progress * 100)}%` }} />
            </div>
          </div>
          <button
            type="button"
            className="icon-button narrator-settings"
            aria-label="Narration settings"
            aria-expanded={showVoice}
            onClick={() => setShowVoice((v) => !v)}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path
                d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6"
                stroke="currentColor"
                strokeWidth="1.5"
                fill="none"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="icon-button narrator-stop"
            onClick={narration.stop}
            aria-label="Stop narration"
            disabled={narration.status === 'idle'}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />
            </svg>
          </button>
        </div>
        {showVoice && (
          <div className="narrator-settings-row">
            <label>
              <span>Voice</span>
              <select value={narration.voiceName} onChange={(event) => narration.setVoiceName(event.target.value)}>
                {narration.voices.length === 0 && <option value="">System default</option>}
                {narration.voices.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Speed</span>
              <select value={narration.rate} onChange={(event) => narration.setRate(Number(event.target.value))}>
                <option value={0.85}>0.85×</option>
                <option value={0.98}>1×</option>
                <option value={1.15}>1.15×</option>
                <option value={1.3}>1.3×</option>
              </select>
            </label>
          </div>
        )}
      </div>
    </aside>
  );
}
