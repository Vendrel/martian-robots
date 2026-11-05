#!/usr/bin/env node

/**
 * Reports which Curiosity raw-image API instruments carry the geometry needed
 * by the panorama renderer. Run with one or more Sols, e.g.:
 *
 *   node tools/curiosity-api-instrument-audit.mjs 1000 2619
 *
 * The raw API exposes browse-ready Mastcam RGB images, but (unlike Navcam,
 * Hazcam and ChemCam) it omits their camera model and attitude. Keeping this
 * distinction explicit prevents a visually plausible, but spatially false,
 * Mastcam panorama layer.
 */

const sols = process.argv.slice(2).map(Number).filter(Number.isInteger);

if (!sols.length) {
  console.error('Usage: node tools/curiosity-api-instrument-audit.mjs <sol> [...]');
  process.exitCode = 2;
} else {
  const api = (sol, page) => {
    const url = new URL('https://mars.nasa.gov/api/v1/raw_image_items/');
    url.search = new URLSearchParams({
      order: 'sol asc,date_taken asc',
      per_page: '100',
      page: String(page),
      condition_1: 'msl:mission',
      condition_2: `${sol}:sol:gte`,
      condition_3: `${sol}:sol:lte`,
      search: '',
      extended: '',
    });
    return url;
  };

  const recordsForSol = async sol => {
    const records = [];
    for (let page = 0; page <= 200; page += 1) {
      const response = await fetch(api(sol, page));
      if (!response.ok) throw new Error(`Sol ${sol}, page ${page}: HTTP ${response.status}`);
      const body = await response.json();
      records.push(...(body.items || []));
      if (!body.more) return records;
    }
    throw new Error(`Sol ${sol}: API page limit exceeded`);
  };

  const classified = record => {
    const instrument = record.instrument || 'UNKNOWN';
    const geometry = Boolean(record.camera_model_component_list && record.camera_vector && record.attitude);
    const colorBrowse = /^MAST_(LEFT|RIGHT)$/.test(instrument) && /(?:I|E)\d{2}_DXXX$/i.test(record.imageid || '');
    return { instrument, geometry, colorBrowse };
  };

  const all = (await Promise.all(sols.map(recordsForSol))).flat();
  const report = [...all.reduce((groups, record) => {
    const { instrument, geometry, colorBrowse } = classified(record);
    const entry = groups.get(instrument) || { instrument, records: 0, geometryRecords: 0, colorBrowseRecords: 0, examples: [] };
    entry.records += 1;
    entry.geometryRecords += Number(geometry);
    entry.colorBrowseRecords += Number(colorBrowse);
    if (entry.examples.length < 3) entry.examples.push(record.imageid);
    groups.set(instrument, entry);
    return groups;
  }, new Map()).values()].sort((a, b) => a.instrument.localeCompare(b.instrument));

  console.log(JSON.stringify({ sols, recordCount: all.length, instruments: report }, null, 2));
}
