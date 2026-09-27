# Immutable történeti API-adatok lokális kiszolgálása

## Cél

A webalkalmazás jelenleg minden adatot külső API-ról kér le. Az adatok azonban időben **immutábilisak**: a mai adat új, de egy lezárt múltbeli rekord később már nem változik.

A fejlesztés célja:

- a külső API terhelésének minimálisra csökkentése;
- a már letöltött történeti adatok saját webszerverről történő kiszolgálása;
- a több gigabájtos nyers JSON-adatmennyiség erős tömörítése;
- gyors kliensoldali hozzáférés;
- automatikus API-fallback, ha egy rekord még nincs a lokális archívumban;
- a meglévő alkalmazás adatkezelési logikájának lehető legkisebb módosítása.

---

## 1. Javasolt architektúra

A kliens számára egyetlen egységes adatlekérő függvény legyen látható:

```text
getData(id)
   │
   ├─ 1. Memóriacache találat? ───────────────→ adat
   │
   └─ nem
       │
       ├─ 2. Saját webszerveren van archivált adat?
       │       │
       │       ├─ igen → letöltés → parse → cache → adat
       │       │
       │       └─ nem
       │
       └─ 3. Külső API → cache → adat
```

A történeti adatok elsődleges forrása tehát a saját statikus tárhely, a külső API pedig csak fallback.

---

## 2. Ne ZIP-eket kezeljen közvetlenül a JavaScript

Ha minden tömörített fájl pontosan egy JSON-rekordot tartalmaz, nincs szükség ZIP-konténerre.

A szerveren célszerű a JSON-adatokat **gzip vagy Brotli formában előtömörítve** tárolni, majd megfelelő HTTP `Content-Encoding` fejléccel kiszolgálni.

Például fizikailag:

```text
data/
├── 00000001.json.gz
├── 00000002.json.gz
├── 00000003.json.gz
└── ...
```

A kliensnek azonban ideális esetben továbbra is logikailag ilyen URL-eket kell látnia:

```text
/data/00000001.json
/data/00000002.json
/data/00000003.json
```

A webszerver a `.gz` változatot küldi vissza például ezekkel a fejlécekkel:

```http
Content-Type: application/json
Content-Encoding: gzip
Cache-Control: public, max-age=31536000, immutable
```

A böngésző automatikusan elvégzi a kitömörítést. Az alkalmazásnak nem kell ZIP- vagy gzip-kezelő JavaScript-könyvtár.

A kliensoldali kód ezért egyszerű marad:

```js
const response = await fetch('/data/00000001.json');
const data = await response.json();
```

---

## 3. Miért jobb a HTTP-szintű tömörítés?

A böngésző és a webszerver arra van optimalizálva, hogy a HTTP-tartalomtömörítést automatikusan kezelje.

Előnyei:

- nincs kliensoldali ZIP-könyvtár;
- nincs saját kitömörítési protokoll;
- egyszerű `fetch()` + `response.json()` használható;
- a böngésző streaming módon kezeli a HTTP-választ;
- használható a normál HTTP-cache;
- kisebb alkalmazáskód;
- kevesebb hibalehetőség;
- a tömörítési implementáció később gzipről Brotli-ra cserélhető anélkül, hogy az alkalmazáskód változna.

A tömörítés tehát lehetőleg **infrastrukturális kérdés legyen, ne alkalmazáslogika**.

---

## 4. Fájlcímzés az ID alapján

Ha minden rekordnak egyedi numerikus sorszáma van, az ID közvetlenül képezhető fájlnévvé.

Például:

```js
function localDataURL(id) {
    return `/data/${String(id).padStart(8, '0')}.json`;
}
```

Így:

```text
ID 1      → /data/00000001.json
ID 428    → /data/00000428.json
ID 123456 → /data/00123456.json
```

Ehhez nincs szükség külön adatbázisra vagy indexfájlra, amennyiben az ID → fájl megfeleltetés determinisztikus.

---

## 5. Egységes adatlekérő réteg

A webapp többi része lehetőleg ne tudja, hogy az adat lokális archívumból vagy API-ról érkezett.

Például:

```js
async function getData(id) {
    // adatforrás kiválasztása
}
```

A UI és az üzleti logika kizárólag ezt használja:

```js
const data = await getData(12345);
```

Ne legyen szétszórva az alkalmazásban ilyen logika:

```js
if (historical) {
    // local
} else {
    // API
}
```

Az adatforrás eldöntése maradjon egyetlen absztrakciós rétegben.

---

## 6. Első cache-réteg: JavaScript memória

Az aktuális böngésző-session alatt érdemes a már parse-olt rekordokat memóriában tartani.

Egyszerű változat:

```js
const memoryCache = new Map();
```

Lekérés:

```js
async function getData(id) {
    if (memoryCache.has(id)) {
        return memoryCache.get(id);
    }

    const data = await loadData(id);
    memoryCache.set(id, data);

    return data;
}
```

Így ugyanazt a rekordot egy session alatt nem kell újra letölteni és JSON-ná parse-olni.

### Fontos: ne legyen korlátlan cache

A tömörített fájl kis mérete félrevezető lehet.

Például:

```text
600 KB gzip
    ↓
10 MB JSON
    ↓
JavaScript objektumok
    ↓
akár 10 MB-nál lényegesen nagyobb RAM-használat
```

Ezért nagy adathalmaz esetén célszerű korlátozott LRU-cache-t használni, például az utolsó 100–500 rekord számára.

A cache-ből kieső rekord nem vész el: szükség esetén a böngésző újra betöltheti a HTTP-cache-ből.

---

## 7. Második cache-réteg: böngésző HTTP-cache

A történeti adatok immutábilisak, ezért nagyon agresszíven cache-elhetők.

Javasolt fejléc:

```http
Cache-Control: public, max-age=31536000, immutable
```

Ez azt közli a böngészővel, hogy az erőforrás hosszú ideig érvényes és nem fog megváltozni.

A két cache más célt szolgál:

```text
JavaScript RAM cache
        │
        │ miss
        ▼
Browser HTTP cache
        │
        │ miss
        ▼
Saját webszerver
```

A RAM-cache a már parse-olt JavaScript objektumot tárolja.

A HTTP-cache a hálózati erőforrást tárolja, ezért egy RAM-cache-ből kiesett rekord újbóli lekérése sem feltétlenül jelent tényleges hálózati adatforgalmat.

---

## 8. Lokális archívum → API fallback

Alapváltozatban megpróbálható először a statikus fájl:

```js
async function loadData(id) {
    const localURL = localDataURL(id);

    const response = await fetch(localURL);

    if (response.ok) {
        return response.json();
    }

    if (response.status === 404) {
        return loadFromAPI(id);
    }

    throw new Error(`Local data error: HTTP ${response.status}`);
}
```

Az API-függvény ettől külön marad:

```js
async function loadFromAPI(id) {
    const response = await fetch(makeAPIURL(id));

    if (!response.ok) {
        throw new Error(`API error: HTTP ${response.status}`);
    }

    return response.json();
}
```

### Fontos különbség

Nem minden lokális hiba indokol API-fallbacket.

Például:

- `404` → a rekord nincs archiválva → API-fallback indokolt;
- saját szerver `500` → infrastruktúrahiba → nem feltétlenül jó automatikusan megterhelni helyette a külső API-t;
- hálózati hiba → alkalmazásspecifikus döntés szükséges.

Ez védi az API-t attól, hogy a saját szerver hibája hirtelen nagy API-terhelést okozzon.

---

## 9. Még jobb: ne generáljunk szükségtelen 404-eket

Ha pontosan ismert, hogy meddig teljes az archívum, érdemes ezt metadata formájában megadni.

Például:

```json
{
    "archiveVersion": 1,
    "completeThroughId": 184253,
    "updated": "2026-09-20"
}
```

vagy dátumalapú adatoknál:

```json
{
    "completeThroughDate": "2026-09-19"
}
```

Ekkor a kliens eleve tudhatja:

```text
id <= completeThroughId
        ↓
   saját archívum

id > completeThroughId
        ↓
     külső API
```

Ez jobb, mint minden friss rekordnál először egy garantált 404-et generálni.

---

## 10. Javasolt végleges lekérési sorrend

```text
                    getData(id)
                        │
                        ▼
                ┌───────────────┐
                │ RAM/LRU cache │
                └───────┬───────┘
                        │ miss
                        ▼
              archivált tartomány?
                 │             │
                igen          nem
                 │             │
                 ▼             ▼
          saját statikus      külső
             szerver            API
                 │             │
                 └──────┬──────┘
                        ▼
                    JSON adat
                        │
                        ▼
                   RAM cache
                        │
                        ▼
                    alkalmazás
```

A saját statikus szerver mögött további, automatikus rétegként működik a böngésző HTTP-cache.

---

## 11. Nagyon sok fájl esetén könyvtárakra bontás

Ha több százezer vagy több millió JSON-fájl keletkezik, nem feltétlenül célszerű valamennyit egyetlen könyvtárban tartani.

Az ID alapján determinisztikusan almappákra oszthatók.

Például 1000-es blokkok:

```text
/data/000000/
/data/001000/
/data/002000/
...
```

vagy:

```text
/data/000/00000001.json
/data/000/00000002.json
...
/data/001/00001000.json
```

A lényeg, hogy a kliens algoritmikusan elő tudja állítani az útvonalat, ezért továbbra sincs szükség adatbázis-indexre.

Például:

```js
function localDataURL(id) {
    const block = Math.floor(id / 1000) * 1000;
    const dir = String(block).padStart(8, '0');
    const file = String(id).padStart(8, '0');

    return `/data/${dir}/${file}.json`;
}
```

---

## 12. Ne csomagoljunk túl sok rekordot egyetlen ZIP-be

Elsőre vonzó lehet például 10 000 JSON-t egyetlen nagy ZIP-be tenni, de interaktív webalkalmazásnál ennek hátrányai vannak:

- bonyolultabb kliensoldali indexelés;
- ZIP-kezelő kód/könyvtár szükséges;
- egyetlen rekordhoz nagyobb konténert kell kezelni;
- rosszabb HTTP-cache granularitás;
- nehezebb egyetlen rekordot cserélni vagy újragenerálni;
- nagyobb memóriaigény keletkezhet.

Ha a rekordok önmagukban nem extrém aprók, az **egy rekord = egy HTTP-erőforrás** modell egyszerű és robusztus.

Ha viszont több millió, egyenként csak néhány száz bájtos rekord van, akkor érdemes később blokkosított tárolást tervezni. Ez külön optimalizációs lépés legyen, ne az első implementáció része.

---

## 13. Brotli vs. gzip

Mindkettő megfelelő.

### gzip

Előnyei:

- rendkívül széles támogatás;
- egyszerű előállítás;
- gyors kitömörítés;
- JSON-nál általában nagyon jó tömörítés.

### Brotli

Statikus szöveges tartalomnál gyakran még kisebb fájlokat eredményez.

Mivel az archívumot csak egyszer kell tömöríteni, a lassabb, magasabb tömörítési szint is elfogadható lehet.

Ideális esetben a szerver akár mindkettőt tárolhatja:

```text
00000001.json.gz
00000001.json.br
```

és a kliens `Accept-Encoding` fejléce alapján a webszerver választ.

Ez azonban optimalizáció; első implementációhoz a gzip teljesen megfelelő.

---

## 14. Az archívum frissítése

Mivel a múltbeli adatok nem változnak, az archiválás append-only folyamat lehet.

Például naponta:

```text
külső API
    ↓
lekérjük az újonnan véglegessé vált rekordokat
    ↓
validáljuk
    ↓
JSON mentés
    ↓
gzip/Brotli tömörítés
    ↓
feltöltés a statikus tárhelyre
    ↓
archive metadata frissítése
```

A régi rekordokat nem kell újragenerálni.

Ez lehetővé teszi, hogy az API idővel gyakorlatilag csak az aktuális/friss adatok forrása legyen.

---

## 15. Cache-verziózás és hibajavítás

Az `immutable` cache miatt gondolni kell arra az esetre is, ha egy archivált fájlról később kiderül, hogy hibás.

Ezért célszerű verziózható URL-struktúrát használni, például:

```text
/data/v1/00000001.json
```

Nagyobb archívumkorrekció esetén:

```text
/data/v2/00000001.json
```

vagy az archive metadata tartalmazhat verziót, amelyből az URL előállítható.

Így megmaradhat az agresszív:

```http
Cache-Control: public, max-age=31536000, immutable
```

anélkül, hogy egy hibásan cache-elt fájl URL-jét később felül kellene írni.

---

## 16. Ajánlott implementációs sorrend

1. **Az API-hozzáférést absztrahálni** egyetlen `getData(id)` réteg mögé.
2. Elkészíteni az **ID → lokális URL** determinisztikus leképezést.
3. A meglévő történeti JSON-okat statikus webszerverre helyezni.
4. Beállítani az előtömörített **gzip/Brotli HTTP-kiszolgálást**.
5. Beállítani az immutábilis történeti fájlokra a hosszú HTTP-cache-t.
6. A `getData()` függvénybe beépíteni a **lokális archívum elsőbbségét**.
7. A külső API-t fallbackként megtartani.
8. Bevezetni az `archive metadata` fájlt, hogy a kliens tudja, meddig teljes az archívum.
9. Bevezetni egy **korlátozott RAM/LRU cache-t** a parse-olt rekordok számára.
10. Nagyon nagy fájlszám esetén az adatokat determinisztikus almappákra bontani.
11. Később automatizálni az új, véglegessé vált API-adatok archiválását.

---

## 17. Célarhitektúra

```text
                         WEBAPP
                           │
                           ▼
                     getData(id)
                           │
                 ┌─────────┴─────────┐
                 │                   │
             RAM cache             MISS
                 │                   │
                 │                   ▼
                 │          archive metadata
                 │                   │
                 │         ┌─────────┴─────────┐
                 │         │                   │
                 │    történeti             friss
                 │         │                   │
                 │         ▼                   ▼
                 │   SAJÁT WEBSZERVER      KÜLSŐ API
                 │         │
                 │    HTTP cache
                 │         │
                 │   gzip / Brotli
                 │         │
                 │         ▼
                 │      JSON.parse
                 │         │
                 └─────────┴──────────────┐
                                         ▼
                                    RAM/LRU cache
                                         │
                                         ▼
                                    alkalmazás
```

---

## Összefoglaló döntés

A javasolt megoldás **nem kliensoldali ZIP-archívumkezelés**, hanem szabványos webes tartalomkiszolgálás:

- egy rekordhoz determinisztikusan tartozik egy statikus JSON URL;
- a JSON fizikailag gzip/Brotli formában lehet tárolva;
- a webszerver megfelelő `Content-Encoding` fejléccel szolgálja ki;
- a böngésző automatikusan kitömöríti;
- az alkalmazás normál `fetch()` + `response.json()` hívást használ;
- az immutábilis múltbeli adatok agresszíven HTTP-cache-elhetők;
- a parse-olt, gyakran használt rekordok korlátozott RAM-cache-be kerülnek;
- az archive metadata alapján eldönthető, hogy saját tárhely vagy külső API legyen a forrás;
- a külső API csak a még nem archivált/friss adatokhoz szükséges.

Ez egyszerű, szabványos, jól skálázható, és az alkalmazáskódot nagyrészt függetleníti attól, hogy a háttérben az adat tömörítve van-e és pontosan milyen tömörítési algoritmust használ a szerver.
