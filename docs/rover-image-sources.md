# Mars rover image sources and geometry integration notes

Last verified: 2026-09-10

This is the source-of-truth research note for the public image feeds used by
Mars Rover 360.  It distinguishes NASA's **browse/raw-image sites** (useful for
a responsive web gallery) from the Planetary Data System (PDS) **science
archive** (authoritative metadata, calibration, and long-term reproducibility).
The two are complementary; neither should be silently substituted for the
other.

## Quick decision table

| Rover | Public browse feed usable in a browser | Authoritative archive | Important implementation consequence |
| --- | --- | --- | --- |
| Perseverance | NASA Mars raw-image gallery and its currently observed JSON feed | PDS4 Mars 2020 camera bundles | JSON supplies image URLs and useful geometry; PDS labels remain the authoritative science record. |
| Spirit | No maintained NASA raw-image JSON gallery identified | PDS3/PDS4 MER archive | A PDS label/image decoder plus an index adapter is required. |
| Opportunity | No maintained NASA raw-image JSON gallery identified | PDS3/PDS4 MER archive | A PDS label/image decoder plus an index adapter is required. |

`MER1` is **Opportunity** and `MER2` is **Spirit**.  Do not reverse these
identifiers in an adapter, URL, cache key, or route-data request.

## 1. Perseverance (Mars 2020)

### Public browse source

- Gallery: <https://mars.nasa.gov/mars2020/multimedia/raw-images/>
- NASA's gallery documents the exposed camera groups and the fact that
  thumbnails and movie frames are separate product types.  Its “raw” images
  are browse products, not necessarily unprocessed science archive files.
- NASA's general explanation of that distinction:
  <https://science.nasa.gov/solar-system/multimedia/what-are-raw-images/>

The gallery itself is JavaScript-driven.  The front end currently uses the
following JSON endpoint; it is public and practical, but **not a published,
versioned API contract**.  Treat it as an adapter behind a small compatibility
layer, not as a permanent stable API.

```text
GET https://mars.nasa.gov/rss/api/?
  feed=raw_images
  &category=mars2020,ingenuity
  &feedtype=json
  &ver=1.2
  &num=100
  &page=0
  &order=sol%20asc
  &condition_1=mars2020%3Amission
  &condition_2={sol}%3Asol%3Agte
  &condition_3={sol}%3Asol%3Alte
```

Paginate until the returned `images` array has fewer than `num` items.  Query
by a product identifier with the same endpoint's `id` parameter when an
individual image is needed.  Preserve the complete JSON record in exports;
NASA may add fields without notice.

### Observed browse-record fields worth normalizing

| Normalized field | Typical RSS record source | Why it matters |
| --- | --- | --- |
| `imageid`, `sol`, `date_taken`, `instrument` | top-level fields | Identity, Sol/date picker, sorting. |
| `image_files.full_res`, `large`, `medium`, `small` | `image_files` | Render/download URLs.  Prefer `full_res`, with an explicit fallback policy. |
| `camera.camera_model_type` | `camera` | Select CAHV, CAHVOR, or CAHVORE projection code. |
| `camera.camera_model_component_list` | `camera` | Camera model components: normally `C; A; H; V; O; R; E; T; P`. |
| `attitude` | top-level field | Rover-frame to local frame quaternion.  Store its component ordering with the source record. |
| `extended.subframeRect` | `extended` | Detector-space crop rectangle. |
| `extended.dimension` | `extended` | Delivered image dimensions. |
| `extended.scaleFactor` | `extended` | Scale between detector coordinates and the delivered image. |
| `extended.mastAz`, `mastEl`, `xyz`, `sclk` | `extended` | Useful browse geometry and diagnostics; do not use as a replacement for camera-model math. |

### Geometry rules

1. Parse `C, A, H, V, O, R, E, T, P`; do not reduce CAHVORE fisheye products
   to a rectangular CSS transform.
2. `subframeRect` is in detector coordinates.  Before using it with `H/V` and
   a downloaded/downsampled browse image, divide it by `scaleFactor` when the
   record says the image is scaled.  Validate that the result agrees with
   `dimension`.
3. Apply the per-product `attitude` transformation consistently to all rays:
   canvas warp, image-centre marker, selection, hover, hit-test, route layer,
   and coverage calculation.  A transformation applied only during rendering
   recreates hitbox drift.
4. CAHVORE types 2 and 3 are fisheye variants.  Their `O/R/E/T/P` terms are
   necessary for accurate wide-angle overlap; a dense mesh only improves the
   approximation, it does not replace lens inversion.

### Authoritative Mars 2020 archive

- Camera archive/bundle specification (SIS):
  <https://pds-imaging.jpl.nasa.gov/documentation/Mars2020_Camera_Bundle_SIS.pdf>
- PDS Mars 2020 mission dictionary:
  <https://pds.nasa.gov/datastandards/dictionaries/index-missions.shtml>
- CAHVORE model definition:
  <https://pds.nasa.gov/datastandards/documents/dd/all/current/ch34s03.html>

The PDS4 label is the source to use when a scientific export needs the
coordinate frame, camera-model transform, sample format, calibration lineage,
or the exact archived product rather than a gallery rendition.

## 2. Spirit and Opportunity (Mars Exploration Rover / MER)

### Archive identity

- MER documentation collection:
  <https://pds.nasa.gov/ds-view/pds/viewCollection.jsp?identifier=urn%3Anasa%3Apds%3Amer_documentation%3Adocument&version=1.1>
- MER camera EDR/RDR SIS:
  <https://pds-imaging.jpl.nasa.gov/documentation/MER_camsis_v4_9-25-07.pdf>
- PDS collection/search discovery page:
  <https://pds.nasa.gov/services/search/index.jsp>

The historic MER camera archive is not equivalent to the modern NASA raw-image
gallery.  It includes PDS3 products (commonly a detached `.LBL` label and
binary `.IMG` image) and PDS4 collections that retain PDS3 indexes.  A browser
`Image` element cannot decode the binary PDS image product directly.

Examples of mission-specific holdings:

- Opportunity (MER1) Pancam EDR data set:
  <https://pds.nasa.gov/datasearch/subscription-service/data_product_information.cfm?dsid=MER1-M-PANCAM-2-EDR-OPS-V1.0&releaseid=0058>
- Opportunity (MER1) Navcam calibrated-radiance collections and Spirit (MER2)
  counterparts are discoverable through the MER PDS search results:
  <https://pds.nasa.gov/services/search/search?fq=facet_investigation%3A%221%2Cmars+exploration+rover%22>

### PDS Search API

The current documented PDS Registry Search API is:

```text
GET https://pds.nasa.gov/api/search/1/products?limit={n}
Accept: application/json
```

- Quickstart: <https://nasa-pds.github.io/pds-api/guides/search/quickstart.html>
- Endpoint/OpenAPI reference:
  <https://nasa-pds.github.io/pds-api/specifications/search-v1.5.0-redoc.html>

Use it first to locate bundles, collections, product LIDs/LIDVIDs, labels, and
file URLs.  The PDS documentation warns that the service may not yet contain
every data set, so the app must retain a collection/index-file fallback and
must not infer “no images” from an empty API response alone.

### Required MER adapter pipeline

1. **Discover** the correct MER1/MER2 collection, instrument, and Sol through
   the PDS Search API and/or its archived PDS3 index table.
2. **Fetch the label before the pixels.** Parse `PRODUCT_ID`, time/Sol,
   instrument, `SITE`/`DRIVE` or Rover Motion Counter data, image dimensions,
   sample encoding, `^IMAGE` pointer, and `GEOMETRIC_CAMERA_MODEL`.
3. **Decode `.IMG` by label.** The decoder must honor byte order, record/image
   offset, sample type/bits, line/pixel count, and any compression declared in
   the label.  Return an `ImageBitmap`/canvas-safe RGBA buffer; never assume
   JPEG or PNG.
4. **Normalize camera geometry.** MER labels use CAHVOR/CAHVORE camera model
   fields, including `C, A, H, V, O, R, E, T, P`.  Preserve the label's
   reference coordinate frame and transformation metadata with each image.
5. **Cache source identity.** Cache by PDS LIDVID or label checksum/version,
   not merely by filename or Sol.

### MER location and route data

Rover position must be treated as a separate data stream, not derived from a
camera centre vector.  MER PDS holdings include Rover Motion Counter (RMC)
and IMU-related collections.  A route adapter should join location samples to
image Sols through rover identity plus site/drive/RMC and preserve the original
frame.  It must never mix MER1 and MER2 coordinates.

## 3. App-facing normalized contract

Every rover adapter should return this shape before rendering:

```js
{
  rover: 'perseverance' | 'spirit' | 'opportunity',
  source: 'nasa-browse' | 'pds',
  sourceId: 'stable image id or PDS LIDVID',
  sol: Number,
  capturedAtUtc: String | null,
  instrument: String,
  image: { url: String | null, mimeType: String | null, bitmap: ImageBitmap | null },
  dimensions: { width: Number, height: Number },
  subframe: { left: Number, top: Number, width: Number, height: Number, scale: Number },
  model: { type: 'CAHV' | 'CAHVOR' | 'CAHVORE', C: [], A: [], H: [], V: [], O: [], R: [], E: [], T: Number, P: Number },
  attitude: { quaternion: [], convention: String, sourceFrame: String, targetFrame: String } | null,
  roverPose: { position: [], orientation: [], frame: String } | null,
  originalRecord: Object
}
```

Reject a record from panorama placement when its model, coordinate frame, or
image-scale relationship is unknown.  It may still appear in a conventional
gallery and be available for download.  This is safer than producing a
convincing-looking but geometrically false panorama.

## 4. Implementation status and next work

- **Perseverance:** browser browse-feed adapter available; validate every
  `scaleFactor`/`subframeRect` relationship and prefer PDS labels for research
  exports.
- **Spirit / Opportunity:** discovery and decoding are separate tasks.  Do not
  claim support until a PDS3 label/image decoder and a Sol-index adapter have
  been tested against both MER1 and MER2.
- **Curiosity:** it has its own NASA raw browse feed and PDS archive; do not
  reuse its endpoint, product naming rules, offsets, route data, or camera
  assumptions for the other three rovers.
