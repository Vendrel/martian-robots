const PDS_ORIGIN = 'https://planetarydata.jpl.nasa.gov/*';
const SOL_ROOT = 'https://planetarydata.jpl.nasa.gov/img/data/mars2020/mars2020_navcam_ops_mesh/data/sol/';
const status = document.querySelector('#status');
const results = document.querySelector('#results');
const summary = document.querySelector('#summary');
const solList = document.querySelector('#solList');
const loadIndex = document.querySelector('#loadIndex');
const scanRange = document.querySelector('#scanRange');

function meshDirectory(sol) {
  return new URL(`${String(sol).padStart(5, '0')}/ids/rdr/mesh/`, SOL_ROOT).href;
}

async function requestPdsPermission() {
  if (!globalThis.chrome?.permissions) return;
  if (await chrome.permissions.contains({ origins: [PDS_ORIGIN] })) return;
  if (!await chrome.permissions.request({ origins: [PDS_ORIGIN] })) throw Error('A PDS-hozzáférést nem hagytad jóvá.');
}

function setBusy(button, value) {
  button.disabled = value;
  loadIndex.disabled = value;
  scanRange.disabled = value;
}

function renderSols(sols, source, productCounts = new Map()) {
  const ordered = [...new Set(sols)].sort((a, b) => a - b);
  results.hidden = false;
  summary.textContent = `${ordered.length} Sol · forrás: ${source}${ordered.length ? ` · tartomány: ${ordered[0]}–${ordered.at(-1)}` : ''}`;
  solList.replaceChildren(...ordered.map(sol => {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = meshDirectory(sol);
    link.target = '_blank';
    link.rel = 'noreferrer';
    const count = productCounts.get(sol);
    link.textContent = count === undefined ? `Sol ${sol}` : `Sol ${sol} (${count} OBJ)`;
    item.append(link);
    return item;
  }));
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw Error(`HTTP ${response.status}: ${url}`);
  return { text: await response.text(), finalUrl: response.url };
}

function solsFromIndex(html) {
  return [...new Set([...html.matchAll(/href=["'](\d{5})\/["']/gi)].map(match => Number(match[1])))];
}

async function queryIndex() {
  setBusy(loadIndex, true);
  status.textContent = 'PDS Sol-index lekérése…';
  try {
    await requestPdsPermission();
    const { text, finalUrl } = await fetchText(SOL_ROOT);
    if (!finalUrl.startsWith(SOL_ROOT)) throw Error('A PDS nem a mesh Sol-indexet adta vissza.');
    const sols = solsFromIndex(text);
    if (!sols.length) throw Error('A PDS Sol-index nem tartalmazott érvényes Sol-mappát.');
    renderSols(sols, 'PDS könyvtárindex');
    status.textContent = 'Kész. A felsorolt Sol-mappák a Navcam mesh-termékek PDS-gyűjteményéhez tartoznak.';
  } catch (error) {
    status.textContent = `Az indexlekérdezés nem sikerült: ${error.message}. Használd a tartományos ellenőrzést.`;
  } finally {
    setBusy(loadIndex, false);
  }
}

async function hasMeshProduct(sol) {
  const url = meshDirectory(sol);
  const { text, finalUrl } = await fetchText(url);
  if (!finalUrl.startsWith(url)) return null;
  return [...text.matchAll(/href=["'][^"']+\.obj["']/gi)].length;
}

async function scan() {
  const first = Math.max(0, Number(document.querySelector('#firstSol').value) || 0);
  const last = Math.max(first, Number(document.querySelector('#lastSol').value) || first);
  if (last - first > 1000) {
    status.textContent = 'Legfeljebb 1001 Sol ellenőrizhető egy futtatásban.';
    return;
  }
  setBusy(scanRange, true);
  const found = [];
  const counts = new Map();
  let next = first;
  let checked = 0;
  status.textContent = 'PDS mesh-könyvtárak ellenőrzése…';
  try {
    await requestPdsPermission();
    const worker = async () => {
      while (next <= last) {
        const sol = next++;
        try {
          const count = await hasMeshProduct(sol);
          if (count) { found.push(sol); counts.set(sol, count); }
        } catch { /* A hiányzó Sol-mappa normális eredmény a szkennelésben. */ }
        checked += 1;
        status.textContent = `Ellenőrzés: ${checked}/${last - first + 1} · találat: ${found.length}`;
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker));
    renderSols(found, 'közvetlen PDS mesh-könyvtár ellenőrzés', counts);
    status.textContent = `Kész: ${checked} Sol ellenőrizve, ${found.length} meshterméket tartalmazó Sol.`;
  } catch (error) {
    status.textContent = `A szkennelés megszakadt: ${error.message}`;
  } finally {
    setBusy(scanRange, false);
  }
}

loadIndex.addEventListener('click', queryIndex);
scanRange.addEventListener('click', scan);
