# Mars rover image sources and geometry integration notes

Last verified: 2026-09-14

This is the source-of-truth research note for the public image feeds used by
Mars Rover 360.  It distinguishes NASA's **browse/raw-image sites** (useful for
a responsive web gallery) from the Planetary Data System (PDS) **science
archive** (authoritative metadata, calibration, and long-term reproducibility).
The two are complementary; neither should be silently substituted for the
other.

## Rights and attribution

This note previously covered technical provenance only.  The source images are
subject to NASA's media-usage rules; see the project-facing summary in
[`nasa-rover-image-use.md`](nasa-rover-image-use.md).  In brief, factual and
educational use of NASA-provided rover imagery is generally allowed with NASA
acknowledgement, but every selected asset must be checked for a third-party
copyright notice.  Do not add the NASA Insignia, Logotype, Seal, or a statement
that implies NASA endorsement; a NASA identifier already visible in an
unaltered factual image may remain in context.  These rules apply equally to
browse-gallery renditions and PDS-derived products.

## Quick decision table

| Rover | Public browse feed usable in a browser | Authoritative archive | Important implementation consequence |
| --- | --- | --- | --- |
| Curiosity | NASA Mars raw-image gallery and its currently observed JSON feed | PDS3 MSL camera EDR/RDR archive | A browse record can contain usable CAHVOR metadata, but its `camera_vector` is the delivered-image centre ray, not invariably the physical camera optical axis. |
| Perseverance | NASA Mars raw-image gallery and its currently observed JSON feed | PDS4 Mars 2020 camera bundles | JSON supplies image URLs and useful geometry; PDS labels remain the authoritative science record. |
| Spirit | No maintained NASA raw-image JSON gallery identified | PDS3/PDS4 MER archive | A PDS label/image decoder plus an index adapter is required. |
| Opportunity | No maintained NASA raw-image JSON gallery identified | PDS3/PDS4 MER archive | A PDS label/image decoder plus an index adapter is required. |

`MER1` is **Opportunity** and `MER2` is **Spirit**.  Do not reverse these
identifiers in an adapter, URL, cache key, or route-data request.

## 1. Curiosity (MSL): browse metadata and subframe pointing

### Public browse source

The current Curiosity gallery uses the following observed, paginated endpoint:

```text
GET https://mars.nasa.gov/api/v1/raw_image_items/
  ?order=sol%20asc%2Cdate_taken%20asc
  &per_page=100
  &page={p}
  &condition_1=msl%3Amission
  &condition_2={sol}%3Asol%3Agte
  &condition_3={sol}%3Asol%3Alte
  &search=
  &extended=
```

Read `items`, `more`, `page`, and `per_page`; retain every original record.
This is a gallery endpoint, not a versioned science API.  Useful fields are
`imageid`, `spacecraft_clock`, `sol`, `site`, `drive`, `date_taken`,
`instrument`, `camera_vector`, `camera_position`, `camera_model_type`,
`camera_model_component_list`, `attitude`, `subframe_rect`, `scale_factor`,
and `extended.mast_az`/`mast_el`.

The raw gallery URL is a browse rendition.  Resolve geometry-critical products
against the MSL camera EDR/RDR archive and label when a panorama or an export
requires reproducibility:

- MSL Camera & LIBS EDR/RDR SIS:
  <https://planetarydata.jpl.nasa.gov/img/data/msl/MSLMOS_1XXX/DOCUMENT/MSL_CAMERA_SIS.PDF>
- MSL Navcam EDR archive:
  <https://planetarydata.jpl.nasa.gov/w10n/msl/msl_navcam_raw/>
- MSL geometric camera-model description:
  <https://planetarydata.jpl.nasa.gov/img/data/msl/MSLMOS_1XXX/DOCUMENT/GEOMETRIC_CM.TXT>

### Direct lookup by URL or product ID

For an image-inspection UI, the public gallery can resolve a complete Curiosity
`imageid` without scanning Sols.  The observed request is:

```text
GET https://mars.nasa.gov/api/v1/raw_image_items/
  ?condition_1={IMAGEID}:imageid:eq
  &per_page=2&page=0&extended=
```

The response's first exact `items[].imageid` match provides `sol` and the
usual browse geometry.  This was verified on 2026-09-14 with
`FLB_631411016EDR_F0781138FHAZ00341M_`, which resolves to Sol 2635.  A full
legacy browse URL may not expose that modern product ID in its filename, but
its `.../msss/{zero-padded-sol}/...` path segment is a reliable Sol hint; load
that Sol and compare the normalized image URL/filename as a fallback.

Use exact IDs only for this direct endpoint.  A substring in `search` is a
camera/filter expression in the gallery API, not a general product-ID search.
Some valid browse records are intentionally **source-only**: for example,
Curiosity `3454MR1019030291601925C00_DXXX` (Sol 3454) has a valid image URL but
null `camera_vector`, CAHV-family component list, attitude, camera position,
and mast angles.  Such a record can be opened in an information panel, but it
must not be projected into a panorama or used to rotate the camera: the
metadata does not support a truthful placement.

### Do not confuse a centre ray with an optical axis

For a CAHVOR record, `A` from `camera_model_component_list` is the camera
optical axis.  `camera_vector` is useful as a check on the *delivered image's
centre ray*.  They are not interchangeable when the delivered pixels are a
subframe.  The principal point of the full detector is approximately
`(dot(H, A), dot(V, A))`; calculate every delivered-pixel ray using the
complete `C, A, H, V, O, R` model and the actual crop/scale relationship.

This distinction explains the diagnostic pair in
`edr-offset-diagnostic.json`:

| Product | Delivered pixels | `angle(camera_vector, A)` | Interpretation |
| --- | --- | ---: | --- |
| `NRB_630080684EDR_S0781002NCAM00594M` | `subframe_rect=(1,257,1024,512)` | 11.62° | The delivered image centre is far from the full-detector optical axis; this is expected for this crop. |
| `NLB_629906331EDR_F0781002NCAM00257M` | `subframe_rect=(1,1,1024,1024)` | 0.50° | A nearly full frame; centre ray and optical axis nearly coincide. |

The two records have the same site/drive (`78/1002`) and `xyz`, and their
attitudes differ by only about 0.0013°.  They nevertheless have distinct
pointing metadata: the centre rays are 11.47° apart, mast azimuth differs by
12.01°, and mast elevation by -13.71°.  The report therefore does **not** show
evidence that NASA assigned a random attitude to the `F` product.  It shows a
crop-sensitive centre-ray/optical-axis difference.  Similar-looking Navcam
images can overlap strongly despite that real pointing difference.

As a consistency check, the CAHV inverse projection (before the small CAHVOR
lens-distortion refinement) of each record's delivered-pixel centre is only
0.0334° and 0.0336°, respectively, from its stored `camera_vector`.  Thus the
two browse records are internally coherent.  In particular, the `S` image's
crop begins at line 257 and is 512 lines high, so both products' centre maps to
about detector line 512.5; the large `A` difference is not a bad direction
coordinate.

### Panorama quality gate for apparent uniform direction errors

Do not discard all `S` products or all `F` products: those letters describe
the filename/product variant, not a trustworthy bad-geometry class.  Instead,
flag a record for PDS-label resolution or omit it from automatic placement when
any of these tests fail:

1. `camera_model_type`, all required CAHVOR components, `subframe_rect`, or
   `scale_factor` is missing or unparsable.
2. The crop transformed into delivered pixels is inconsistent with the image
   dimensions (allow a documented one-pixel origin convention only).
3. The stored `camera_vector` differs materially from the ray computed at the
   delivered image centre.  This detects a metadata/image pairing error while
   allowing the expected large difference from `A` for off-axis subframes.
4. The renderer uses `camera_vector` as the image orientation **and** applies
   a subframe translation to `H/V`, or uses `A` without applying the
   translation.  Both are deterministic, crop-dependent double/no correction
   bugs and produce the repeated uniform offsets seen in a panorama.

For diagnosis, log: product ID, SCLK, instrument, site/drive, image dimensions,
raw and scaled crop, `dot(H,A)`, `dot(V,A)`, the modelled delivered-centre ray,
`camera_vector`, and their angular residual.  Cluster outliers by normalized
crop rectangle and camera string; that finds a rendering-rule defect without
mistaking valid subframes for falsely localized photos.

Use the CAHVOR inverse model for the production residual.  Until an
instrument-specific distribution has been measured, treat a residual above
0.25° as a *quarantine/re-resolve* signal, not as proof that the image is bad;
the two healthy diagnostic records are approximately 0.034° even with a
CAHV-only check.  Never use `angle(camera_vector, A)` itself as the rejection
criterion.

## 2. Perseverance (Mars 2020)

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

For lookup, an exact Mars 2020 product ID can be requested directly:

```text
GET https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020,ingenuity
  &feedtype=json&id={IMAGEID}
```

Validate the returned `images[].imageid` exactly before trusting its `sol`.
When a complete Mars 2020 browse URL is supplied, its
`.../surface/sol/{zero-padded-sol}/...` segment is also a useful fallback.
These are observed public gallery interfaces rather than stable versioned
contracts, so the application should retain both the direct-ID and URL/Sol
fallback paths.

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

## 3. Spirit and Opportunity (Mars Exploration Rover / MER)

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

## 4. App-facing normalized contract

Every rover adapter should return this shape before rendering:

```js
{
  rover: 'curiosity' | 'perseverance' | 'spirit' | 'opportunity',
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

## 5. Implementation status and next work

- **Perseverance:** browser browse-feed adapter available; validate every
  `scaleFactor`/`subframeRect` relationship and prefer PDS labels for research
  exports.
- **Spirit / Opportunity:** discovery and decoding are separate tasks.  Do not
  claim support until a PDS3 label/image decoder and a Sol-index adapter have
  been tested against both MER1 and MER2.
- **Curiosity:** use the raw browse feed only behind an adapter.  Place
  subframes from the CAHVOR model, not from a bare `camera_vector` or `A`;
  validate centre-ray residuals and resolve flagged products against PDS.
