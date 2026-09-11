# Azonos marsi célpontot bemutató, több-Sol-os slideshow

**Állapot:** tervezési specifikáció — implementáció még nincs.  
**Hatókör:** Curiosity (MSL) és Perseverance (Mars 2020) csak.  
**Cél:** egy kiválasztott referencia-nézethez a központi Sol előtti és utáni
legfeljebb öt Sol képtermékei közül geometriailag indokolt, ugyanarra a
felszíni célpontra néző képeket választani, majd ezekből slideshow-t készíteni.

Ez nem időbeli változást állító funkció. A slideshow jelentése:

> „Ezek a felvételek nagy valószínűséggel ugyanazt a térbeli célpontot vagy
> annak átfedő környezetét mutatják különböző roverpozíciókból és időkből.”

Ha a célpontot nem lehet geometriailag lokalizálni, a rendszer csak
**irányegyezést** ajánlhat fel, de azt nem nevezheti „ugyanannak a helynek”.

## 1. A lényegi matematikai különbség

Egy kép középsugarának világirányát összevetni könnyű, de eltérő roverhelyzet
esetén félrevezető. Legyen két kamera centruma `O₁`, `O₂`, és középsugaraik
egységvektorai `d₁`, `d₂`. Az `angle(d₁, d₂)` kis értéke csak azt jelenti,
hogy a kamerák közel azonos **világirányba** néznek. Egy 5–20 méteres
elmozdulás esetén ettől még teljesen más közeli sziklát, dűnét vagy talajfoltot
láthatnak.

A helyes objektum a közös felszíni pont:

```text
X = O_ref + ρ · d_ref,  ρ > 0
```

ahol `X` a referencia-kép kiválasztott pixeléből induló sugár és a Mars
terepmodelljének metszéspontja. Ezután minden jelölt képnél azt kérdezzük:

```text
X a jelölt kamera látómezejében van-e, és ha igen, hová vetül?
```

Tehát a módszer lényege nem „azonos szög”, hanem **célpont-visszavetítés**.
Az irányegyezés csak olcsó, első körös szűrő.

## 2. Adatforrások és szolgáltatói határok

A böngészős NASA-képfolyam gyors megjelenítésre való. A kamera-geometria és a
roverpóz tudományos, reprodukálható alapja a PDS/NAIF rekord. A két réteget
nem szabad összecserélni.

| Réteg | Curiosity | Perseverance | Kötelező használat |
| --- | --- | --- | --- |
| Böngészhető képlista | `https://mars.nasa.gov/api/v1/raw_image_items/` | `https://mars.nasa.gov/rss/api/` | Sol-ablak gyors felderítése és végső kép-URL |
| Képgeometria | PDS-termékcímke; CAHV/CAHVOR/CAHVORE, ha rendelkezésre áll | RSS-rekord geometriája, majd PDS4-címke a hitelesítéshez | sugárképzés és visszavetítés |
| Roverpozíció/póz | MSL PLACES RDR vagy lokalizált `msl_surf_rover_loc_*` SPK | Mars 2020 PLACES, illetve lokalizált `m2020_surf_rover_loc_*` SPK | közös térbeli koordináta-rendszer |
| Terep | azonos lokális koordináta-rendszerű DEM/mesh | azonos lokális koordináta-rendszerű DEM/mesh | referencia-sugár és felszín metszése |

Hivatkozások: a projekt saját [képforrás-jegyzete](./rover-image-sources.md),
[útvonalréteg-terve](./rover-route-layer.md), a
[PDS Search API](https://nasa-pds.github.io/pds-api/guides/search/quickstart.html),
az [MSL SPK-archívum](https://naif.jpl.nasa.gov/pub/naif/MSL/kernels/spk/) és a
[Mars 2020 SPICE-archívum](https://naif.jpl.nasa.gov/pub/naif/pds/pds4/mars2020/mars2020_spice/document/spiceds_v003.html).

### 2.1 Curiosity: tényleges böngésző API-kérés

Egy Sol `s` képlistája a jelenlegi alkalmazásban is használt, lapozható
végpontról kérhető le:

```text
GET https://mars.nasa.gov/api/v1/raw_image_items/
  ?order=sol%20asc%2Cdate_taken%20asc
  &per_page=100
  &page={p}
  &condition_1=msl%3Amission
  &condition_2={s}%3Asol%3Agte
  &condition_3={s}%3Asol%3Alte
  &search=
  &extended=
```

A válasz `items`, `more`, `page`, `per_page` mezőit kell kezelni. Hasznos
mezők: `imageid`, `sol`, `date_taken`, `instrument`, `https_url`,
`camera_vector`, `camera_position`, `camera_model_type`,
`camera_model_component_list`, `attitude`, `site`, `drive`, `xyz`,
`subframe_rect`, `scale_factor`, `extended`.

E mezők egy része sok Curiosity browse-rekordban `null`; az ilyen rekord nem
elegendő a geometriai egyezés kijelentéséhez. A terméket ilyenkor PDS-címkével
kell feloldani, vagy a jelöltlistából ki kell zárni. A `is_thumbnail` és a
thumbnail/transfer termékazonosítók kizárandók.

### 2.2 Perseverance: tényleges böngésző API-kérés

Az alkalmazásban dokumentált, jelenleg megfigyelt JSON-feed:

```text
GET https://mars.nasa.gov/rss/api/
  ?feed=raw_images
  &category=mars2020,ingenuity
  &feedtype=json
  &ver=1.2
  &num=100
  &page={p}
  &order=sol%20asc
  &condition_1=mars2020%3Amission
  &condition_2={s}%3Asol%3Agte
  &condition_3={s}%3Asol%3Alte
```

Az `images` tömböt addig kell lapozni, amíg a hossza 100 alá nem esik. A
normalizáláshoz megőrzendő: `imageid`, `sol`, `date_taken`, `instrument`,
`image_files`, `camera.camera_model_type`,
`camera.camera_model_component_list`, `attitude`, valamint
`extended.subframeRect`, `extended.dimension`, `extended.scaleFactor`,
`extended.mastAz`, `extended.mastEl`, `extended.xyz`, `extended.sclk`.

Ez a feed nem verziózott, hivatalos, tartós szerződés. Adapter mögött kell
tartani, a teljes eredeti rekordot pedig cache-be és exportba menteni. A
`mars2020:mission` feltétel kötelező: az `ingenuity` kategória neve ellenére
nem kerülhetnek helikoptertermékek a roveres slideshow-ba.

## 3. Normalizált belső rekord

Minden képből a következő, verziózott rekord készül. A `sourceRecord` változatlan
NASA-válasz, nem helyettesíti azt a normalizált mezőkkel.

```ts
type Observation = {
  rover: 'curiosity' | 'perseverance';
  sourceId: string;
  sol: number;
  capturedAtUtc: string | null;
  instrument: string;
  image: { previewUrl: string | null; fullUrl: string | null };
  width: number | null;
  height: number | null;
  subframe: { left: number; top: number; width: number; height: number; scale: number } | null;
  camera: {
    model: 'CAHV' | 'CAHVOR' | 'CAHVORE';
    C: [number, number, number]; A: [number, number, number];
    H: [number, number, number]; V: [number, number, number];
    O?: [number, number, number]; R?: number[]; E?: number[]; T?: number; P?: number;
    sourceFrame: string;
  } | null;
  attitude: { q: [number, number, number, number]; order: 'wxyz'; from: string; to: string } | null;
  pose: { position: [number, number, number]; rotation: number[][]; frame: string; sigmaMeters: number } | null;
  provenance: { browseUrl: string; pdsLidvid?: string; poseSource?: string; kernelVersion?: string };
  sourceRecord: unknown;
};
```

**Belépési feltétel a `confirmed` slideshow-hoz:** teljes képméret és
subframe-skála, érvényes kamera-modell, azonosítható kamera-koordinátarendszer,
időben illeszthető roverpóz és közös lokális térbeli frame. Bármelyik hiányában
az elem legfeljebb `directional-only` jelölt lehet.

## 4. Koordináta-rendszerek: a legfontosabb tiltás

Tilos közvetlenül összehasonlítani két `A` vektort, ha nem bizonyított, hogy
ugyanabban a frame-ben vannak. Egy képre vezessük be:

- `R_CR`: kamera-/termék-frame → rover-frame forgatás;
- `R_RM`: rover-frame → kiválasztott lokális Mars-map frame forgatás;
- `P_R`: rover referencia-pontjának pozíciója a map frame-ben;
- `C`: kamera centruma a kamera-/termék-frame-ben.

Ekkor a kamera centruma és egy képpont világsugara:

```text
O = P_R + R_RM · R_CR · C
d_map(u, v) = normalize(R_RM · R_CR · d_cam(u, v))
```

Ha egy termék `C`-je nem használható vagy a kamera extrinszikus transzformáció
nem teljes, átmenetileg `O = P_R` használható, de a kamera–rover távolságból
származó hibát hozzá kell adni `sigmaMeters` értékéhez. Ez távoli tájképnél
gyakran elég, közeli fúrási célpontnál nem.

Az MSL és Mars 2020 saját lokális frame-jeit nem szabad egymással keverni; a
funkció roveren belül működik, nem küldetések között.

## 5. Kamera-matematika

### 5.1 Pixelből sugár

CAHV modellben a nyers `(u, v)` pixelhez a projekt jelenlegi renderelőjével
összhangban:

```text
h = H - u·A
v' = V - v·A
d_cam(u, v) = normalize(h × v')
```

Az előjelét úgy kell választani, hogy `dot(d_cam, A) > 0` legyen. CAHVOR és
CAHVORE esetben ez csak a kiindulópont: az `O/R/E/T/P` lencseparaméterekkel
végzett inverz torzítás kötelező. Különösen a CAHVORE 2-es és 3-as fisheye
termékeket tilos sík perspektívaképként kezelni. A már meglévő
`ray(image, x, y)` logika felhasználható sugárképzésre, de a slideshow-hoz ki
kell egészíteni dokumentált, termékszintű frame-transzformációval.

### 5.2 Világpontból pixel

CAHV-nál, `x = X - O` és `α = A·x > 0` mellett:

```text
u = (H·x) / α
v = (V·x) / α
```

CAHVOR/CAHVORE esetben az előreirányú lencseprojektálást az archív modell
definíciójának megfelelően kell használni; praktikus megoldás a numerikus
inverz: olyan `(u, v)` keresése, amelyre `d_map(u,v)` és
`normalize(X-O)` szöge minimális. A keresést Web Workerben, a képközépre
indított Newton/Levenberg–Marquardt iterációval kell futtatni. A megoldás csak
akkor fogadható el, ha a maradék szöghiba a kamera mintavételi szögénél kisebb.

Egy visszavetítés érvényes, ha a projektált pixel a ténylegesen letöltött,
skálázott subframe-ben van, a peremtől legalább `m` pixelre:

```text
m ≤ u - left < width - m
m ≤ v - top  < height - m
```

Mielőtt a NASA browse-kép koordinátáival dolgozunk, a
`subframeRect / scaleFactor` átszámítást el kell végezni, és a kapott méretet
össze kell vetni a `dimension` illetve a letöltött kép méretével.

## 6. A referencia-célpont meghatározása

A felhasználó vagy egy konkrét képre kattint, vagy a jelenlegi panorámában
jelöl ki egy kör alakú területet. A rendszer ebből referencia-sugarat készít.

### Elsődleges mód: DEM-metszés

1. A kattintott pixelből számítsd `O_ref`, `d_ref` értékét.
2. Raycasteld a sugarat az azonos map frame-ben lévő helyi DEM/mesh ellen.
3. Az első pozitív metszés legyen `X`.
4. Tárold a metszési távolságot `ρ`, a mesh-cella felbontását és a pózhibát.

Ez az egyetlen mód, amely egyetlen referencia-képből is valódi térbeli
célpontot adhat.

### Másodlagos mód: többnézetes trianguláció

DEM hiányában legalább két, képi tartalom alapján egymásnak megfeleltetett
sugarat kell használni. A két egyenes legközelebbi pontjaihoz legyen
`r = O₁ - O₂`, `a = d₁·d₂`, `b = d₁·r`, `c = d₂·r`:

```text
s = (a·c - b) / (1 - a²)
t = (c - a·b) / (1 - a²)
Q₁ = O₁ + s·d₁
Q₂ = O₂ + t·d₂
X  = (Q₁ + Q₂) / 2
g  = ||Q₁ - Q₂||
```

Elfogadás csak akkor lehetséges, ha `s > 0`, `t > 0`, a háromszögelési szög
`acos(|a|)` elég nagy, és `g` belefér a póz- és pixelhibából vezetett
hibakeretbe. Közel párhuzamos sugaraknál (`1-a²` kicsi) a mélység instabil;
ezeknél a rendszer nem becsülhet pontot.

Három vagy több képnél a kezdeti `X` után robusztus kötegszintezés szükséges:

```text
min_X Σᵢ ρ( || πᵢ(X) - pᵢ ||² / σpx,i² )
```

ahol `ρ` Huber-veszteség, hogy egy rossz képi megfeleltetés ne húzza el a
megoldást.

### Harmadlagos mód: csak irány

Ha nincs DEM és nincs igazolt képi megfeleltetés, a referencia középsugara
vagy kiválasztott sugara legfeljebb jelölt-generátor. A slideshow címkéje ekkor
kötelezően: **„hasonló világirány; helyazonosság nem igazolt”**.

## 7. Az ±5 Sol jelöltválasztó folyamata

### 7.1 Lekérdezési terv

Legyen a referencia Sol `s₀`. A lekérdezett halmaz:

```text
S = { max(0, s₀-5), …, s₀, …, min(latestSol, s₀+5) }
```

1. Először csak a 11 Sol metaadatait töltsd le a fenti mission-specifikus
   browse API-król, legfeljebb két párhuzamos kéréssel.
2. Lapozz `more=true` (Curiosity), illetve 100 elemnyi oldal (Perseverance)
   szerint; ne kérj képpixelt ebben a fázisban.
3. Írd IndexedDB-be a teljes választ `rover + sol + endpoint-séma-verzió`
   kulccsal és letöltési idővel.
4. Normalizálás után csak geometriaképes termékek maradjanak. Curiositynél a
   browse-rekordból hiányzó geometriát egy lokális PDS-geometry index oldja
   fel; ennek hiányában kizárás következik.
5. A roverpózt lokálisan cache-elt, verziózott PLACES/SPICE előfeldolgozásból
   keresd ki `capturedAtUtc`, illetve `site/drive` szerint. Ne tölts SPICE
   kernelt a slideshow indításakor.

### 7.2 Olcsó metadata-szűrés

A teljes visszavetítés előtt maradjon legfeljebb 20–40 jelölt:

- kizárás: thumbnail, movie frame, hibás dimenzió, ismeretlen modell/frame/póz;
- elsőbbség: a referenciával azonos kameraoldal és optikai család (Navcam ↔
  Navcam, Mastcam ↔ Mastcam, Perseverance NLG ↔ NLG vagy NLF ↔ NLF);
- a jelölt középsugarának, illetve látómező-gömbjének durva metszése a
  referencia célpontja körüli bizonytalansági kúppal;
- ésszerű távolság: a pozíciók közti baseline és a feltételezett célponttáv
  aránya ne tegye értelmetlenné a parallaxist;
- ugyanazon Sol képei is jelöltek maradhatnak, de időben azonosként legyenek
  címkézve.

### 7.3 Döntő geometriai teszt

Minden megmaradt jelölt `i` esetén vetítsd `X`-et a kamera modelljébe:

```text
pᵢ = πᵢ(X)
visibleᵢ = inDeliveredSubframe(pᵢ) ∧ dot(dᵢ(pᵢ), X - Oᵢ) > 0
```

Ezután számítsd ki:

- `e_angle`: a projektált pixel visszaalakított sugara és `X-Oᵢ` közötti szög;
- `e_margin`: a célpont távolsága a képszéltől;
- `σ_X`: DEM-felbontásból, referencia pixelhibából és referencia-pózhibából;
- `σ_i`: a jelölt pózából, kamera-modelljéből és subframe-skálájából;
- `e_reproj`: ha képi validáció futott, a célpont körüli feature-ek robusztus
  reprojekciós hibája.

Példa pontszám:

```text
scoreᵢ = Vᵢ · Ccameraᵢ · exp(-e_angle² / (2σ_angle²))
         · sigmoid(e_margin / m)
         · exp(-e_reproj² / (2σ_reproj²))
```

ahol `Vᵢ` a láthatóság 0/1 értéke, `Ccameraᵢ` a kamera-kompatibilitási súly.
Képi validáció nélkül az utolsó tényező `1`, de a bizalmi fokozat nem lehet a
legerősebb.

## 8. Képi validáció — csak a metadata utáni, kis jelölthalmazra

A geometria megmondja, hogy `X` a képen lehet. Nem garantálja, hogy a
felhasználó által érdekesnek tartott konkrét kőzet, nem pedig egy előtte lévő
takaró objektum látszik. Emiatt a legjobb 10–20 jelölt kis felbontású képét
kell csak letölteni, lusta betöltéssel.

1. A visszavetített `pᵢ` körül vágj ki skála- és nézetirány-normalizált patch-et.
2. A referencia patch-csel készíts lokális feature-megfeleltetést.
3. Ismert relatív kamera-póz esetén az epipoláris korlát:

   ```text
   x₂ᵀ E x₁ ≈ 0,  ahol E = [t]× R
   ```

   RANSAC-kal becsüld a hibás megfeleltetések arányát.
4. Közel sík talajfoltnál homográfia, erősen térbeli sziklánál többnézetes
   reprojekciós hiba alapján fogadj el megfelelést.

Az itt használt képi hasonlóság csak megerősítés. Nem írhatja felül a rossz
frame-et, a nem érvényes CAHVORE-inverziót vagy a hiányzó roverpózt.

## 9. Bizalmi szintek és felhasználói kommunikáció

| Szint | Feltétel | A felület szövege |
| --- | --- | --- |
| `confirmed-geometry-and-visual` | DEM/multiview célpont, érvényes projektálás, jó képi validáció | „Azonos célpont: geometria és képi egyezés megerősítve.” |
| `confirmed-geometry` | a célpont minden szükséges geometriai ellenőrzésen átment, képi validáció nincs | „Azonos célpont: geometriailag megerősítve.” |
| `geometry-candidate` | célpont és projektálás megvan, de nagy a hibabecslés vagy kicsi a képszéli tartalék | „Lehetséges átfedő célpont.” |
| `directional-only` | csak sugár- vagy kameraorientációs közelség | „Hasonló irány, helyazonosság nincs igazolva.” |

Minden slide információs paneljén jelenjen meg: Sol, UTC, kamera, forrás-ID,
roverpozíció forrása és verziója, célpont távolsága, vetített pixel,
bizalmi szint, valamint a kizárás/elfogadás indoka. A bizonytalanság nem
diagnosztikai melléklet, hanem a funkció része.

## 10. A slideshow kimenete

Ne az eltérő teljes képkockákat villogtassa egymás után. Minden elfogadott
forrásképből a `X` köré komponált, azonos virtuális nézőirányú és közel azonos
szögmezőjű kivágást készítsen. Így a célpont stabil marad, a rover pozíciójából
eredő parallaxist pedig opcionális overlay jelzi.

Javasolt rendezés: `Sol`, azon belül `capturedAtUtc`; egy Solon belül a
legmagasabb pontszámú nézet legyen az alapértelmezett. A felhasználó kérhessen
„csak megerősített” és „jelöltek is” nézetet.

## 11. Terhelés- és cache-szabályok

- A Sol-ablak fixen legfeljebb 11 Sol; ne legyen automatikus korlátlan történeti
  keresés.
- Metadata előbb, képpixel csak a rangsorolt shortlisthez.
- Kérések párhuzamossága legfeljebb 2, sikertelen kérésnél exponenciális
  visszalépés jitterrel; felhasználói megszakításkor `AbortController`.
- Cache-eld külön a NASA browse-választ, a PDS-ből feloldott geometriát, a
  pozíciót és a DEM-csempét. Minden cache-elemhez forrásverzió és időbélyeg
  tartozzon.
- A slideshow navigációja csak a következő/előző slide képét töltse elő.
- A rendszer ne próbálja a régebbi MER rovereket ugyanebbe a munkafolyamatba
  bevonni; ez a specifikáció tudatosan csak MSL és Mars 2020.

## 12. Implementációs sorrend és ellenőrzés

1. Készíts külön `observation-adapter` modult a két browse API-hoz; ennek
   kimenete kizárólag a normalizált rekord.
2. Készíts offline/építéskori `pose-index` generátort a PLACES/SPICE
   forrásokból, verzió- és frame-megőrzéssel.
3. Implementáld és teszteld a CAHV, CAHVOR, CAHVORE `pixel → ray` és
   `world point → pixel` párt. A meglévő panoráma sugárképzése legyen az egyik
   regressziós referencia.
4. Először csak DEM-es referencia-célponttal engedd a `confirmed-geometry`
   slideshow-t.
5. Ezután jöhet a metadata shortlist, a késleltetett képi validáció és a
   háromszögeléses fallback.

Kötelező tesztek:

- szintetikus kamerák ismert `X` ponttal: a projektált pixel hiba legyen a
  választott küszöb alatt;
- ismert, ugyanazon panoráma átfedő képei: a rendszer találja meg őket;
- azonos világirány, de eltolt roverpozíció és eltérő közeli célpont: a
  rendszer utasítsa el őket;
- közel párhuzamos sugarak: ne adjon instabil mélységből `confirmed` eredményt;
- hiányos Curiosity browse-geometria: PDS-feloldás nélkül csak kizárás vagy
  `directional-only` lehet;
- CAHVORE fisheye és skálázott `subframeRect`: a képszélekre is maradjon
  helyes visszavetítés;
- kérésszámláló: egy indítás legfeljebb a 11 Sol metadataoldalait és a
  konfigurált shortlist képeit érje el.

## 13. Mit szabad állítani a funkció eredményéről?

Szabad: „Ezek a képek egy közös térbeli célpontra vetülnek vissza a tárolt
kamera- és pózmodellek alapján.”

Nem szabad: „Ez egy teljes idősor erről a helyszínről”, illetve „a különbség
biztosan felszíni változás.” Az utóbbihoz a célpont-egyezésen túl regisztráció,
fotometriai korrekció és változásdetektálás külön specifikációja szükséges.

## 14. Megosztható Crossview-állapot az URL-ben

A megosztott cím `cv` paramétere **nem** tárolja a lejátszás pillanatnyi
diáját. Csak azt a reprodukálható kutatási eredményt őrzi meg, hogy mely
slideshow-k, milyen sorrendben, mely NASA-forrásképekből állnak, valamint
hogy mely képeket hagyta ki kézzel a felhasználó.

Az érték verziózott, URL-biztos Base64URL-sorozat:

```text
cv=v1g.<gzip-UTF8-JSON-base64url>
```

Ha a böngészőben nincs `CompressionStream`, a funkció egy ugyanilyen,
explicit visszaolvasható tartalékot használ:

```text
cv=v1j.<UTF8-JSON-base64url>
```

A JSON tudatosan mezőnév nélküli, pozicionális séma, hogy rövid maradjon:

```text
[
  1,
  [solAblak, szögTűrésFok, diákCsoportonként],
  [[sol, sourceId], ...],
  [[geometriaiE, célpontVagyNull, [képIndex, ...], aktívBitek], ...],
  referenciaKépIndex
]
```

- A képtábla deduplikált: egy `[Sol, sourceId]` pár csak egyszer szerepel,
  akkor is, ha több slideshow része.
- Egy csoport képsorrendje a képtábla indexeit tartalmazza; így a sorrend
  és a csoporthatár veszteség nélkül megmarad.
- Az `aktívBitek` Base64URL-enkódolt bitmezője képenként egy bit. `1` a
  kijelölt ✓, `0` a felhasználó által kihagyott kép. Emiatt a teljes
  matematikai sorozat és a belőle készült vizuális vágat is visszaállítható.
- `geometriaiE` értéke `1` a célpontbecsléses, `0` a csak irányalapú
  csoportnál. A célpont három koordinátája három tizedesre kerekítve kerül
  bele; ez megőrzi a magyarázó geometriát, de nem fújja fel a linket.

Visszatöltéskor az alkalmazás kizárólag az URL-ben szereplő, deduplikált
Sol-okat kéri le a Curiosity vagy Perseverance meglévő NASA-adapterén;
`sourceId` alapján visszakeresi a képeket, majd az URL-sorrendből építi fel a
panelek és a pipák állapotát. Nem futtatja újra a klaszterezést, tehát a
megosztott eredmény stabil marad akkor is, ha az API egy későbbi válasza más
sorrendű. Hiányzó archív rekordnál részleges visszaállítás jelzi az eltérést.

A pipa törlése azonnal eltávolítja a képet a látható csúszkából, a lejátszás
és az MP4 ugyanebből az aktív részhalmazból készül. Az eredeti teljes lista
változatlan marad a memóriában és az `aktívBitek` mezőben, ezért a Reset
Slideshow veszteség nélkül visszaállíthatja. Az URL-frissítés 500 ms-os
debounce után történik.
