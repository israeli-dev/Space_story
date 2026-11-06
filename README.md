# Abandoned but Not Forgotten

An interactive NASA exploration and historical storytelling experience. You orbit a real,
textured globe — Earth, the Moon, Mars, Venus — and every marker on it is a documented place
where something happened or something was left behind: a launch pad, a landing site, a
retroreflector still bouncing laser pulses back, a spent booster that was deliberately
crashed into the Moon.

Built for the NASA Space Apps Challenge. The rule that shapes everything below: **nothing on
the globe is invented.** Coordinates, dates and histories come from published NASA (and other
space-agency) sources; where the record is uncertain the product says so rather than
guessing.

```
 99 records · 4 bodies · 88 unique source pages · 1917–2025
```

---

## What you can do

- **Turn the world.** Drag to rotate, scroll or pinch to zoom. The planet stays still and the
  camera moves, like Radio Garden, so a marker never drifts off its real coordinate.
- **Switch bodies.** Earth, the Moon, Mars and Venus, each with its own texture, atmosphere
  and site inventory.
- **Read the markers by kind.** Launch · facility · crewed landing · robotic landing · rover ·
  impact · left-behind artefact. Each category has its own colour and shape language, and the
  legend doubles as a filter.
- **Open a site.** The panel gives the mission, the date, the coordinates in both −180…180 and
  0…360°E form, the reference frame and its accuracy class, the historical narrative, the
  equipment inventory, mission status, and the primary sources for every claim.
- **Listen.** "Listen" reads the sourced narrative aloud sentence by sentence with the browser's
  speech engine, highlighting each sentence as it is spoken. Play, pause, resume, stop, change
  voice or speed. Nothing is dramatised or added: the narration *is* the verified text.
- **Filter and search.** Category toggles, a dual-range year slider with a live histogram of the
  body's sites, era presets, and a keyboard search (`/` or `Ctrl/⌘K`) across names, missions,
  summaries and keywords.
- **Share a place.** The URL hash carries the body and the site (`#moon/moon-apollo-11`), so a
  link opens the same view.

Keyboard: `/` or `Ctrl/⌘ K` search · `↑`/`↓` move through results · `Enter` open · `Esc` close.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build (rebuilds the dataset, type-checks, bundles):

```bash
npm run build
npm run preview
```

Other scripts:

| script | what it does |
| --- | --- |
| `npm run data:build` | curated + ingested sources → `public/data/sites.json` + `manifest.json` |
| `npm run data:validate` | schema + integrity checks over the curated records |
| `npm run data:stats` | print the dataset inventory |
| `npm run ingest` | refresh the NASA source snapshots (network), see [Ingestion](#ingestion) |
| `npm run data:images` | verify every NASA image ID against the NASA Image Library |

Requires Node 18+ (built and tested on Node 22). No API keys, no backend, no analytics.

---

## How the data is built

```
data/taxonomy.json          bodies, categories, colours, intro copy
data/curated/*.json         99 hand-curated records (4 files)
data/ingested/*.json        machine-readable NASA source tables (snapshots)
        │
        ├─ scripts/validate-dataset.mjs   schema + duplicate + coordinate checks
        └─ scripts/build-dataset.mjs      normalise → stats → emit
                │
                ▼
public/data/sites.json      runtime dataset (meta, bodies, categories, stats, sites)
public/data/manifest.json   small manifest for the loading screen and the About panel
```

The front end never hard-codes a location, a date or a story. It fetches `/data/sites.json` at
runtime and renders whatever is in it — the globe, the filters, the timeline and the search
index are all derived from the file. Adding a record is a matter of adding an object to a
curated file and rebuilding; adding a body is a matter of extending `data/taxonomy.json`.

### Record shape

| field | notes |
| --- | --- |
| `id` | stable, kebab-case, body-prefixed (`moon-apollo-11`, `earth-lc39a`) |
| `body` | `earth` · `moon` · `mars` · `venus` |
| `name`, `siteName`, `mission`, `program`, `agency` | what it is and who did it |
| `category` | `launch` · `facility` · `crewed-landing` · `robotic-landing` · `rover` · `impact` · `artifact` |
| `categoryDetail` | free-text refinement ("Saturn V pad", "LM ascent stage impact") |
| `date`, `dateNote` | ISO date (or year) and any precision caveat |
| `status`, `statusKind` | plain-language outcome · `success`/`partial`/`failure`/`ongoing`/`unknown` |
| `lat`, `lon` | degrees, north/east positive, longitude in −180…180 |
| `coordSystem`, `coordAccuracy`, `coordNote` | reference frame, `surveyed`/`mapped`/`approximate`/`uncertain`, and why |
| `verification` | optional `{ dataset, match }` — the row this coordinate was checked against at build time |
| `summary`, `narrative[]` | a one-line hook and 3–4 sourced paragraphs |
| `artifacts[]` | what is still there, with condition where known |
| `facts[]` | labelled numbers (EVA hours, samples, impact velocity …) |
| `images[]` | `url`, `title`, `credit`, `caption`, `sourceUrl` |
| `keywords[]`, `sources[]`, `related[]`, `featured` | discovery, provenance and cross-links |

### Coordinates

- Longitude is **degrees east, −180…180**; latitude is north-positive. The original published
  string is preserved in the ingested snapshots, and the panel also shows the 0…360°E form used
  by NSSDCA tables.
- The Moon uses the planetocentric **Mean Earth/Polar Axis** frame (DE421), the frame NSSDCA
  publishes its Apollo site table in.
- Mars and Venus coordinates are planetocentric east longitude as published by the source.
- `coordAccuracy` is visible in the UI. `surveyed` means the hardware has been located on the
  surface in imagery (usually LROC); `approximate` and `uncertain` mean the literature is not
  settled, and the panel prints the note explaining why. Examples: Luna 2 (impact point known
  only to a ~2° box), Luna 9 (the 1966 Pravda position was not matched in LROC imagery),
  Ranger 4 (far-side impact, never imaged).

### Images

Images are referenced from the NASA Image and Video Library by NASA ID and are never bundled or
re-hosted; each carries its title, credit line and a link back to the NASA record. Only
**verified** images are attached — an entry with no confirmed photograph says so in the panel
instead of borrowing an unrelated picture. `npm run data:images` re-checks every ID against the
library and fails loudly if one disappears.

---

## Ingestion

The build reproduces from committed snapshots, so it works offline. Refreshing those snapshots
is a separate, explicit step:

```bash
npm run ingest                        # fetch NSSDCA + GISS pages
npm run ingest -- --from=data/raw     # or parse HTML you saved yourself
npm run ingest -- --check             # parse and report, write nothing
npm run data:build                    # rebuild the runtime dataset
```

- `scripts/ingest/nssdca-moon.mjs` — Apollo landing-site coordinates and the NSSDCA "Table of
  Anthropogenic Impacts and Spacecraft on the Moon".
- `scripts/ingest/giss-mars24.mjs` — the GISS Mars24 lander catalogue.
- `scripts/ingest/lib/html.mjs` — table extraction, coordinate parsing (`"3.0098 S, 23.4249 W"`,
  `"312.05 E, 22.27 N"`, `"77.45E, 18.44N"`), date normalisation.

Every parsed row keeps its `raw` coordinate string. A cell that cannot be read becomes `null`
and is reported — it is never filled in. If a page cannot be fetched the script exits non-zero
and leaves the committed snapshot untouched.

Curated records are written by hand from published sources and cross-checked at build time: a
record that declares `verification: { dataset: "nssdca-apollo-sites", match: "Apollo 11 LM" }`
must agree with that row in the snapshot (to within 0.01°) or `npm run data:build` fails.

---

## Honesty rules

The product makes a few promises and keeps them in code:

1. **No invented coordinates.** Every record has a source. Uncertain positions are labelled.
2. **No invented history.** Narratives are written from the cited sources; the source list is
   attached to each record and shown in the panel.
3. **No filler imagery.** Only NASA-library-verified photographs are attached; otherwise the
   panel states that no verified photograph is held.
4. **Narration is the text.** The speech engine reads the same verified narrative you can read,
   with sentence-level highlighting. Nothing is paraphrased for audio.
5. **Loss is visible.** Missing images, unverified positions, unknown mission outcomes and
   failed sources are surfaced in the UI rather than hidden.

---

## Accessibility, performance, responsiveness

- Full keyboard operation: markers are real buttons, search is fully keyboard-driven, the
  story panel is a labelled landmark, tabs use `role="tablist"`, the narrator exposes a
  `progressbar` and live status text.
- `prefers-reduced-motion` switches off camera flights, idle rotation, marker pulses and
  transitions.
- One WebGL canvas with the planet, one atmosphere shell, one star field and ~100 DOM markers
  projected per frame (clustered in screen space when zoomed out). Textures are ~5 MB total and
  are swapped lazily when the body changes; a texture failure falls back to a generated surface
  rather than an empty scene.
- Layout is designed at 1440 px and steps down through 1240 / 1080 / 900 / 560 px: the left rail
  becomes a toggleable sheet on phones, the timeline shortens, the story panel becomes a
  bottom sheet.

---

## Sources

Primary, as published by the agencies:

- NASA NSSDCA — [Apollo landing site coordinates](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html)
- NASA NSSDCA — [Table of anthropogenic impacts and spacecraft on the Moon](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html)
- NASA NSSDCA — [Apollo lunar surface journal data: EVAs, traverses, samples](https://nssdc.gsfc.nasa.gov/planetary/lunar/apolloland.html)
- NASA NSSDCA — [Apollo and lunar impact records](https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_impact.html)
- NASA NSSDCA — [Pioneer Venus probe descriptions](https://nssdc.gsfc.nasa.gov/planetary/pvprobes.html)
- NASA GISS — [Mars24 lander catalogue](https://www.giss.nasa.gov/tools/mars24/help/landers.html)
- NASA Image and Video Library — [images.nasa.gov](https://images.nasa.gov)

Plus, per record, the specific mission pages, LROC posts, NSSDCA spacecraft catalogues and
agency histories that each narrative was written from — all listed in the record's `sources[]`
and in the site panel.

---

## Credits

- **Imagery** — NASA and its centres, via the NASA Image and Video Library. NASA material is
  generally not copyrighted; individual credit lines are reproduced with each image.
- **Planet textures** — Solar System Scope (CC BY 4.0), distributed for three.js by the
  `threex.planets` and `3D-web-solarsystem` projects. Local copies live in `public/textures/`.
- **Rendering** — [three.js](https://threejs.org) (MIT).
- **Interface** — React 18, TypeScript, Vite. System font stacks, no webfont downloads.
- **Narration** — the Web Speech API in your browser. No audio is recorded, uploaded or stored.

## Licence

Code: MIT. Curated narratives: CC BY 4.0, attribute "Abandoned but Not Forgotten". Underlying
data remains subject to its publishers' terms; source links are provided for every record.
