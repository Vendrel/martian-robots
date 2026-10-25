# Martian Robots

An interactive 360° explorer for imagery returned by NASA's Curiosity, Perseverance, Spirit, and Opportunity Mars rovers.

Visit the published app at [vendrel.github.io/martian-robots](https://vendrel.github.io/martian-robots/).

## Features

- Places rover images using their available camera geometry and metadata.
- Supports Curiosity, Perseverance, Spirit, and Opportunity image sources.
- Provides rover-specific image-layer filters, image inspection, circular selection, and a world-coordinate grid.
- Lets you explore panoramas with projection-locked drag navigation.

## Development

This is a static browser application. Serve the `dist` directory with a local HTTP server, then open the displayed URL in a browser.

```bash
python3 -m http.server 4173 --directory dist
```

## Chrome extension

The same `dist` directory is also a Manifest V3 Chrome extension package. No separate build or copy is needed: the web app continues to use relative asset paths, while Chrome uses `manifest.json` and `extension-background.js` only when the directory is loaded as an extension.

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked** and choose the `dist` directory.
4. Click the Martian Robots toolbar icon to open the full explorer in a new tab.

The extension requests access only to the NASA and JPL PDS hosts that the explorer calls for rover metadata and archive products. Local cached metadata, scripts, styles, and images are loaded from the same directory in both modes.

## Research metadata import

Research Mode downloads manifest JSON files to `/Volumes/Zike/Ideiglenes`. Run the importer to place them into the extension cache:

```bash
./dist/mars-data-dump
```

It watches that directory once a minute, validates manifests for Curiosity, Perseverance, Spirit, and Opportunity, compresses them to `.json.gz`, and writes them to the matching `dist/<rover>-metadata/<start>-<end>/` directory. It also refreshes each rover's `latest.json` cache index, which makes the first Curiosity load use a locally available Sol before any live request. The original downloaded JSON is removed only after a successful compressed import. Use `./dist/mars-data-dump --once` for one pass.

The application calculates these 1000-Sol directories directly, so adding new cache files does not require a code build or metadata index update. Reload an unpacked extension after importing; for Chrome Web Store distribution, publish a new package with an incremented extension version.

## Deployment

The GitHub Actions workflow deploys `dist` to GitHub Pages whenever `master` changes. The published project URL is `https://vendrel.github.io/martian-robots/`.

## Data attribution

Rover imagery and associated metadata are sourced from NASA/JPL-Caltech services and archives. This independent project is not affiliated with NASA or JPL.

## License

The project code and original assets are dedicated to the public domain under [CC0 1.0 Universal](LICENSE).
