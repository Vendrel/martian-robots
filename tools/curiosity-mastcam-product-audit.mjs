#!/usr/bin/env node

/**
 * Reports Mastcam thumbnail-to-full-resolution product families for one or
 * more Curiosity Sols. It deliberately derives the pairing from actual NASA
 * API records instead of guessing URLs from an I-thumbnail identifier.
 *
 * Usage: node tools/curiosity-mastcam-product-audit.mjs 3454 3456
 */

const sols = process.argv.slice(2).map(Number).filter(Number.isInteger);

if (!sols.length) {
  console.error('Usage: node tools/curiosity-mastcam-product-audit.mjs <sol> [...]');
  process.exitCode = 2;
} else {
  const product = id => String(id || '').match(/^(.*?)([A-Z])(\d\d)_DXXX$/i);
  const family = id => product(id)?.[1] || null;
  const productType = id => product(id)?.[2]?.toUpperCase() || null;

  async function recordsForSol(sol) {
    const records = [];
    for (let page = 0; page <= 200; page += 1) {
      const params = new URLSearchParams({
        order: 'sol asc,date_taken asc', per_page: '100', page: String(page),
        condition_1: 'msl:mission', condition_2: `${sol}:sol:gte`,
        condition_3: `${sol}:sol:lte`, search: '', extended: '',
      });
      const response = await fetch(`https://mars.nasa.gov/api/v1/raw_image_items/?${params}`);
      if (!response.ok) throw new Error(`Sol ${sol}, page ${page}: HTTP ${response.status}`);
      const body = await response.json();
      records.push(...(body.items || []));
      if (!body.more) return records;
    }
    throw new Error(`Sol ${sol}: API page limit exceeded`);
  }

  const reports = await Promise.all(sols.map(async sol => {
    const mastcam = (await recordsForSol(sol)).filter(record => /^MAST_(LEFT|RIGHT)$/.test(record.instrument || ''));
    const families = new Map();
    for (const record of mastcam) {
      const key = family(record.imageid);
      if (!key) continue;
      const entry = families.get(key) || [];
      entry.push(record);
      families.set(key, entry);
    }
    const thumbnails = [...families.values()].filter(records => records.some(record => productType(record.imageid) === 'I'));
    const variants = { fullColor: 0, bayerRaw: 0, grayscale: 0, noFullSizePartner: 0 };
    for (const records of thumbnails) {
      const types = new Set(records.map(record => productType(record.imageid)));
      if (types.has('F') || types.has('E')) variants.fullColor += 1;
      else if (types.has('C') || types.has('B') || types.has('A')) variants.bayerRaw += 1;
      else if (types.has('D')) variants.grayscale += 1;
      else variants.noFullSizePartner += 1;
    }
    return { sol, mastcamRecords: mastcam.length, thumbnailFamilies: thumbnails.length, variants };
  }));

  console.log(JSON.stringify({
    notes: {
      fullColor: 'E/F are full-size color JPEG product types.',
      bayerRaw: 'A/B/C are full-size raw raster/lossless products; color reconstruction requires demosaicing.',
      grayscale: 'D is full-size grayscale JPEG and is not a color replacement.',
    },
    reports,
  }, null, 2));
}
