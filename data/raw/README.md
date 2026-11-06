# Raw source pages (optional)

`npm run ingest` fetches the NASA source pages directly. If you are offline, or a
publisher blocks scripted requests, save the page from your browser and drop it
here, then run:

```bash
npm run ingest -- --from=data/raw
```

Expected filenames:

| file | source page |
| --- | --- |
| `lunar_sites.html` | https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html |
| `lunar_artifact_impacts.html` | https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html |
| `landers.html` | https://www.giss.nasa.gov/tools/mars24/help/landers.html |

The files themselves are not committed (see `.gitignore`) — only the normalised
snapshots in `data/ingested/`, which the build reads.
