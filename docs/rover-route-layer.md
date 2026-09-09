# Rover route layer data plan

Use the mission PDS/NAIF SPICE archive as the canonical rover-location source.
For each image timestamp, query the rover surface-position SPK and transform it
with the matching SCLK, FK, IK, CK, PCK and LSK kernels. Store `sol`, `site`,
`drive`, local XYZ, latitude, longitude, elevation, roll, pitch, yaw and the
kernel version.

Curiosity exposes `msl_surf_rover_loc_*` localized surface-path SPKs and
telemetry path SPKs. Prefer the reconstructed/localized version when available.
Perseverance has equivalent Mars 2020 `*_surf_rover_loc_*` SPKs and a PLACES
rover bundle for site/drive associations. Spirit and Opportunity have completed
MER SPICE archives and PDS corrected traverse tables with Sol ranges, raw XYZ,
and corrected easting/northing.

Render the route only after a terrain mesh/DEM is available in the same local
frame: project route and terrain vertices through the identical camera transform
and stereographic projection used by image rays, hide terrain-occluded segments,
and expose clickable Sol markers. A future route must be a separate explicitly
labelled planning data source; it cannot be inferred from observed SPK positions.
Telemetry trajectories may interpolate movement intervals and have metre-scale
error, so preserve an uncertainty field.

Sources: [Mars 2020 SPICE archive](https://naif.jpl.nasa.gov/pub/naif/pds/pds4/mars2020/mars2020_spice/document/spiceds_v002.html), [Mars 2020 PDS mission](https://pds-geosciences.wustl.edu/missions/mars2020/), [MER corrected traverse tables](https://an.rsl.wustl.edu/mera/AN/pages/mer/mer_traverse.htm), and [MSL SPICE kernels](https://naif.jpl.nasa.gov/pub/naif/MSL/kernels/spk/).

## Why the current route layer is empty

The raw-image endpoint supplies image geometry and the individual image's
`site`/`drive`; it is not a mission-wide rover-location service. The current
web app deliberately imports neither a PLACES table nor SPICE kernels, so its
debug message is an implementation-state notice, not a finding that location
data does not exist.

For Curiosity, the most direct web-app input is the PDS MSL PLACES RDR CSV
product. It includes rover position and orientation throughout the mission in
landing-site metres, global map metres, latitude/longitude, and map pixels.
Use the `localized_pos` or `localized_interp` view rather than telemetry when
rendering the path: those views are localization-team refinements registered
to the base map. SPICE is the canonical alternative when timestamps need
interpolation; pair the surface-location SPK with the matching orientation CK
and mission time/frame kernels.

There is strong independent confirmation of this pipeline: Mars Raw Utils,
which runs on macOS, exposes `msl-location -a --csv` and `m20-location -a
--csv`, returning the complete waypoint history including Sol, easting,
northing, elevation, longitude/latitude, roll, pitch, and yaw. It is a useful
implementation reference, but PDS/NAIF remains the app's authoritative source.

The older cross-platform NASA/JPL Maestro software is also a plausible match
for the macOS application described: it was used for Mars rover science
operations and exposed rover/site coordinate frames. It should not be used as
a data dependency; the public PDS and NAIF archives above are reproducible.
