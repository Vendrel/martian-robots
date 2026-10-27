# Martian Robots

Martian Robots is an interactive 360° explorer for imagery returned by NASA's Curiosity, Perseverance, Spirit, and Opportunity Mars rovers.

Try the web edition at [vendrel.github.io/martian-robots](https://vendrel.github.io/martian-robots/). A Chrome extension edition uses the same explorer and is prepared for Chrome Web Store distribution.

## Features

- Places rover images from their available camera geometry and metadata.
- Supports Curiosity, Perseverance, Spirit, and Opportunity image sources.
- Provides rover-specific image filters, image inspection, circular selection, and a world-coordinate grid.
- Supports projection-locked drag navigation, fullscreen viewing, and gamepad controls.
- Uses packaged metadata where available and falls back to public NASA and JPL PDS services for other Sols.

## Run locally

This is a static browser application. Serve the `dist` directory with any static HTTP server, then open its URL in a browser. For example:

```bash
python3 -m http.server 4173 --directory dist
```

## Chrome extension

The `dist` directory is also a Manifest V3 Chrome extension package. It uses the same relative asset paths as the web edition; `manifest.json` and `extension-background.js` are used only by Chrome.

For local extension development:

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the `dist` directory.
4. Use the Martian Robots toolbar icon to open the explorer.

The extension requests access only to NASA and JPL PDS hosts used to retrieve rover metadata and archive products.

## Data attribution

Rover imagery and associated metadata are sourced from NASA/JPL-Caltech services and archives. This independent project is not affiliated with NASA or JPL.

## License

The project code and original assets are dedicated to the public domain under [CC0 1.0 Universal](LICENSE).
