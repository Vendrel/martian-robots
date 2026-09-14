# Curiosity camera-geometry correction plan

## Decision from the Sol 2619 location-1 manifest

The manifest contains 24 Curiosity records.  Its normalized `model.H` and
`model.V` components and `cameraGeometry.subframe` use the **same pixel
coordinate system**.  The CAHV inverse projection of the crop centre agrees
with `camera_vector` for every usable record when evaluated at:

```text
u = subframe.l   + (subframe.w - 1) / 2
v = subframe.top + (subframe.h - 1) / 2
```

With the CAHV-only diagnostic approximation, all 24 residuals are at most
0.1332 degrees (median about 0.0334 degrees).  The three `S` products fail by
about 11.884 degrees if the crop origin is omitted.  The two downsampled `D`
products fail by about 60 degrees if `scale_factor=4` is applied to a model
whose `H/V` have already been reduced to roughly 330 pixels.  Full `F`
products cannot expose either bug, because their crop starts at `(1,1)` and
has `scale_factor=1`.

This is evidence for a renderer-coordinate bug, not a class of bad NASA
direction metadata.  Do not filter `S`, `F`, `D`, Navcam-left, or Navcam-right
products as intrinsically bad.

## Required normalization contract

Normalize an image into one explicit geometry domain before any renderer code
runs.  Do not let the renderer consult both raw browse fields and normalized
fields.

```ts
type GeometryDomain = {
  // Pixel coordinates used by H and V.
  pixelDomain: 'normalized-delivered' | 'raw-detector';
  model: { C: Vec3; A: Vec3; H: Vec3; V: Vec3; O?: Vec3; R?: Vec3 };
  subframe: { left: number; top: number; width: number; height: number };
  delivered: { width: number; height: number };
  sourceScaleFactor: number; // retained for audit only after normalization
};
```

For the exported manifest's `model` / `cameraGeometry` fields, set
`pixelDomain: 'normalized-delivered'`; preserve its `subframe` exactly and do
**not** multiply it, the centre pixel, `H`, or `V` by `scale_factor` again.

For a raw NASA browse record that has not yet been normalized, transform all
pixel quantities together.  If the delivered rendition is downsampled by `s`:

```text
H' = H / s
V' = V / s
subframe' = subframe / s
delivered' = delivered pixels
```

Choose and document the source's one-based versus zero-based convention once;
then convert all terms together.  A one-pixel difference is acceptable only at
the boundary, never as an ad-hoc per-image correction.

## Renderer algorithm

1. Reject automatic panorama placement when `C/A/H/V`, subframe, dimensions,
   or coordinate-domain provenance is absent.  The image can still appear in a
   normal gallery.
2. For every delivered pixel `(x, y)`, first map it into the model domain:

   ```text
   u = subframe.left + x
   v = subframe.top  + y
   ```

   Then compute the ray using CAHVOR inverse projection.  `O/R` must be used
   for the production warp; CAHV is only sufficient for the diagnostic
   centre-ray check.
3. Rotate the ray exactly once using the image's attitude/quaternion and its
   declared frame convention.  Apply that same transform to render, coverage,
   selection, and hit-testing.
4. Use `camera_vector` only as a validation signal for the delivered centre
   ray.  Never use it as an additional rotation or substitute it for the
   per-pixel CAHVOR projection.
5. Calculate the angular residual between `camera_vector` and the CAHVOR ray
   at the delivered image centre.  Initially quarantine (do not delete) records
   above 0.25 degrees, retain the raw record, and resolve them against a PDS
   label.  Recalibrate this threshold from CAHVOR—not CAHV—residuals after a
   representative mission sample is collected.

## Regression fixtures and acceptance checks

Keep the supplied manifest as a fixture and add these assertions to the future
renderer test suite:

- every valid manifest record has centre-ray residual below 0.25 degrees;
- `NRB_630080359EDR_S0781002NCAM00594M_` and its two sibling `S` records use
  the crop origin and do not receive a second crop translation;
- `NLB_629906004EDR_D0781002TRAV00832M_` and
  `NRB_629906004EDR_D0781002TRAV00832M_` do not apply `scale_factor` a second
  time;
- full `F` frames stay correct after the refactor, but are not the sole test
  coverage;
- rendering, camera-centre marker, coverage, picking, and hover agree on the
  same projected ray.

## Renderer implementation

Implemented in `dist/app.js`:

- Curiosity records are tagged `geometryPixelDomain: 'normalized-delivered'`.
  `bounds()` therefore uses their normalized crop once and never reapplies the
  raw browse `scale_factor`.
- The panorama-product builder omits Curiosity instruments whose normalized
  camera name contains `RIGHT` (for example `NAV_RIGHT_B`).  This is a visual
  layer decision only.
- Shift-Drag still tests `s.images`, the complete location set.  Downloaded
  URL lists, images, and JSON manifests use the same complete selected set,
  rather than the reduced `s.panoramaImages` render set.
- The exported `cameraGeometry` now records `pixelDomain` and
  `sourceScaleFactor`, so a later importer can preserve the coordinate-domain
  decision instead of guessing from product names.

## Diagnostic tool

Open `tools/curiosity-geometry-diagnostic.html` through a local web server.
It accepts these URL parameters:

```text
?manifest=../mars-rover-360-curiosity-sol-2619-location-1-manifest.json&threshold=0.25
```

The tool returns a visible table and copyable JSON.  It compares these plans:

1. `cropOnce`: normalized crop origin applied once — expected winner.
2. `cropOmitted`: crop origin ignored — detects the repeated `S` offset.
3. `scaleAppliedTwice`: `scale_factor` reapplied — detects the repeated `D`
   offset.

For a new API sample, serve the HTML and JSON from the same origin or provide
a CORS-enabled manifest URL.  A plan is confirmed only when it is the only
plan that keeps every valid record within the configured threshold.  Do not
require it to have the smallest residual for every full-frame record: a
documented one-pixel origin convention can make competing plans nearly tied
there, while mixed subframe/downsampled fixtures remain decisive.
