import type { DatasetStats } from '../lib/types';

export function IntroOverlay({
  open,
  stats,
  onEnter,
  onAbout,
}: {
  open: boolean;
  stats: DatasetStats | null;
  onEnter: () => void;
  onAbout: () => void;
}) {
  if (!open) return null;
  return (
    <div className="overlay intro-overlay" role="dialog" aria-modal="true" aria-label="Welcome">
      <div className="intro-card">
        <span className="intro-eyebrow">An interactive archive of human exploration</span>
        <h1>
          Abandoned
          <span> but not forgotten</span>
        </h1>
        <p className="intro-lede">
          Every machine we sent to another world had a place it ended up. This is a map of those places: launch
          pads, landing sites, crash craters, and the equipment still sitting in the dust.
        </p>
        <div className="intro-steps">
          <div>
            <span className="step-number">01</span>
            <span className="step-title">Rotate a world</span>
            <p>Drag to turn the globe, scroll or pinch to zoom. Switch between Earth, the Moon, Mars and Venus.</p>
          </div>
          <div>
            <span className="step-number">02</span>
            <span className="step-title">Pick a marker</span>
            <p>
              Each dot is a documented site. Colour tells you what happened there: a launch, a landing, an impact,
              or something left behind.
            </p>
          </div>
          <div>
            <span className="step-number">03</span>
            <span className="step-title">Read or listen</span>
            <p>
              Every story is sourced and can be narrated aloud. The words on screen are the narration — nothing is
              invented for effect.
            </p>
          </div>
        </div>
        <div className="intro-actions">
          <button type="button" className="primary-button" onClick={onEnter}>
            Enter the archive
          </button>
          <button type="button" className="ghost-button" onClick={onAbout}>
            How the data works
          </button>
        </div>
        <p className="intro-foot">
          {stats?.total ?? '—'} documented sites · {stats?.uniqueSources ?? '—'} source pages · coordinates
          cross-checked against NASA tables · imagery from NASA and its partners
        </p>
      </div>
    </div>
  );
}

export function AboutModal({
  open,
  onClose,
  stats,
  version,
  builtAt,
}: {
  open: boolean;
  onClose: () => void;
  stats: DatasetStats | null;
  version: string;
  builtAt: string;
}) {
  if (!open) return null;
  return (
    <div className="overlay about-overlay" role="dialog" aria-modal="true" aria-label="About the data">
      <div className="about-modal">
        <button type="button" className="icon-button about-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </svg>
        </button>
        <span className="section-label">About the archive</span>
        <h2>Where every marker comes from</h2>
        <p>
          This archive is built from published NASA records and a small number of institutional or peer-reviewed
          sources. Nothing on the globe is illustrative: each record has a named source, a coordinate reference
          frame, and an accuracy statement.
        </p>

        <h3>Data pipeline</h3>
        <p>
          Records live as JSON files in <code>data/curated</code>, one file per theme. NASA source tables are stored
          as machine-readable snapshots in <code>data/ingested</code> and referenced by each record's{' '}
          <code>verification</code> field. A build step validates the schema, cross-checks every verifiable
          coordinate against its snapshot (failing the build on a mismatch) and writes{' '}
          <code>public/data/sites.json</code>, which is the only thing the interface reads. Adding a new site means
          adding a record — no front-end changes.
        </p>
        <div className="about-stats">
          <span>
            <strong>{stats?.total ?? 0}</strong> records
          </span>
          <span>
            <strong>{stats?.withVerification ?? 0}</strong> coordinate-verified
          </span>
          <span>
            <strong>{stats?.withImages ?? 0}</strong> with archival imagery
          </span>
          <span>
            <strong>{stats?.uniqueSources ?? 0}</strong> source pages
          </span>
        </div>

        <h3>Primary sources</h3>
        <ul className="about-links">
          <li>
            <a href="https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html" target="_blank" rel="noreferrer">
              NSSDCA — Apollo Landing Site Coordinates
            </a>
          </li>
          <li>
            <a
              href="https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html"
              target="_blank"
              rel="noreferrer"
            >
              NSSDCA — Table of Anthropogenic Impacts and Spacecraft on the Moon
            </a>
          </li>
          <li>
            <a href="https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_impact.html" target="_blank" rel="noreferrer">
              NSSDCA — Impact sites of Apollo LM and S-IVB stages
            </a>
          </li>
          <li>
            <a href="https://nssdc.gsfc.nasa.gov/planetary/pvprobes.html" target="_blank" rel="noreferrer">
              NSSDCA — Pioneer Venus probe entry and impact data
            </a>
          </li>
          <li>
            <a href="https://www.giss.nasa.gov/tools/mars24/help/landers.html" target="_blank" rel="noreferrer">
              NASA GISS — Mars24 lander catalogue
            </a>
          </li>
          <li>
            <a href="https://lroc.im-ldi.com/" target="_blank" rel="noreferrer">
              LROC — Lunar Reconnaissance Orbiter Camera
            </a>
          </li>
          <li>
            <a href="https://images.nasa.gov/" target="_blank" rel="noreferrer">
              NASA Image and Video Library
            </a>
          </li>
        </ul>

        <h3>Accuracy and honesty</h3>
        <p>
          Each record states whether its position is surveyed, mapped, approximate or uncertain, and some sites
          have no confirmed position at all — those notes are displayed rather than hidden. Where a mission's
          landing point is published only as a region (for example Luna 9 and Luna 2), the marker shows the
          region centre and the story explains that the exact spot is unknown.
        </p>

        <h3>Imagery and audio</h3>
        <p>
          Historical photographs are requested from NASA's image library at runtime and credited to the originating
          center. Planetary textures are derived from NASA imagery via Solar System Scope texture sets (CC BY 4.0),
          processed for use on a sphere. Narration is produced by the browser's speech synthesiser reading the
          sourced text; no audio is pre-recorded, invented, or dramatised.
        </p>

        <h3>Built with</h3>
        <p>
          React, TypeScript and three.js. Dataset version {version} · built {new Date(builtAt).toLocaleString()}.
          Created for the NASA Space Apps Challenge theme “Abandoned but Not Forgotten”.
        </p>

        <div className="about-foot">
          <button type="button" className="primary-button" onClick={onClose}>
            Back to the globe
          </button>
        </div>
      </div>
    </div>
  );
}
