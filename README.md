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

## Deployment

The GitHub Actions workflow deploys `dist` to GitHub Pages whenever `master` changes. The published project URL is `https://vendrel.github.io/martian-robots/`.

## Data attribution

Rover imagery and associated metadata are sourced from NASA/JPL-Caltech services and archives. This independent project is not affiliated with NASA or JPL.

## License

The project code and original assets are dedicated to the public domain under [CC0 1.0 Universal](LICENSE).
