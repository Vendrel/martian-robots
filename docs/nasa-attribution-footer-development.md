# NASA forrásmegjelölés: fejlesztési specifikáció

Állapot: részben megvalósítva  
Kapcsolódó audit: [`webapp-nasa-usage-audit.md`](webapp-nasa-usage-audit.md)

## Cél és döntés

Az alkalmazás minden képre közös, jól látható NASA-forrásmegjelölést és
függetlenségi nyilatkozatot kap. **A panorámára, a galériaelemekre és a
Crossview-diákra nem kerül képenkénti felirat vagy vízjel**, hogy a vizuális
élmény változatlan maradjon.

A képenkénti visszakövethetőséget továbbra is a meglévő forráslink,
a letölthető JSON-manifest eredeti rekordja, valamint a fejlesztendő export
kreditmelléklet biztosítja.

## Kötelező felületi módosítás

### Állandó lábléc

- A `dist/index.html` `main.app-shell` elemének végére kerüljön egy szemantikusan
  jelölt `<footer>`.
- A lábléc legyen minden nyelven megjelenő, billentyűzettel elérhető, és ne
  takarja ki a panoráma vezérlőit vagy a teljes képernyős nézetet.
- Normál nézetben a teljes szöveg legyen olvasható. Keskeny kijelzőn több sorba
  törhet, de nem rövidíthető le úgy, hogy a függetlenségi nyilatkozat vagy a
  `NASA/JPL-Caltech` kredit eltűnjön.
- A lábléc nem használhat NASA Insignia/Meatball, Worm vagy Seal logót.
- A lábléc szövege csak leíró jelleggel említheti a NASA-t; ne legyen benne
  „official”, „approved”, „partner”, „sponsored by” vagy hasonló állítás.

### Lokalizált szövegek

Új fordítási kulcs: `nasaAttributionDisclaimer`.

| Nyelv | Kötelező szöveg |
| --- | --- |
| English (`dist/locales/en.js`) | `This project uses publicly available data and imagery provided by NASA. This project is not affiliated with, endorsed by, or sponsored by NASA. Mars rover imagery/data: NASA/JPL-Caltech` |
| Magyar (`dist/locales/hu.js`) | `Ez a projekt a NASA által nyilvánosan hozzáférhetővé tett adatokat és képeket használ. A projekt nem áll kapcsolatban a NASA-val, azt a NASA nem támogatja és nem szponzorálja. Mars-járó képek és adatok: NASA/JPL-Caltech` |

A fordításokat a meglévő `data-i18n` mechanizmus alkalmazza; nyelvváltáskor a
lábléc szövege azonnal frissüljön.

## Letöltési és forrásadat-követelmények

- A jelenlegi JSON-manifest őrizze meg változatlanul a teljes NASA/PDS rekordot,
  ezen belül az `image_credit`, forrás-URL és product ID mezőket.
- Az egyedi kép- és a tömeges kép-export mellé készüljön `CREDITS.txt` vagy
  `credits.json`. Minden képhez tartalmazza a fájlnevet, product ID-t,
  eredeti URL-t és a rekord pontos kreditjét.
- Ha egy rekord harmadik fél szerzői jogi jelölését tartalmazza, a letöltés előtt
  figyelmeztetés jelenjen meg; az asset csak a megfelelő jogosultság igazolása
  után exportálható.
- A `martian-robots-og-image.png` minden forrásképkockájához dokumentálni kell
  a product ID-t, URL-t és pontos kreditet. A közösségi kampányok előtt a
  promóciós felhasználásra vonatkozó NASA-irányelv szerinti felülvizsgálat
  szükséges.

## Elfogadási feltételek

1. Angol nyelven betöltve a lábléc pontosan az előírt angol szöveget mutatja.
2. Magyar nyelvre váltva a lábléc pontosan az előírt magyar szöveget mutatja.
3. A panorámavásznon, a képkockákon és a Crossview-diákon nem jelenik meg új
   kreditfelirat vagy vízjel.
4. A láblécben nincs NASA-logó, és nem sugall NASA-jóváhagyást vagy támogatást.
5. Képletöltéskor a képhez kapcsolható a pontos kredit és eredeti forrás.
6. Mobil nézetben a lábléc olvasható, és nem akadályozza a panoráma kezelőit.

## Érintett fájlok

- `dist/index.html` — a lábléc markupja.
- `dist/styles.css` — reszponzív, nem tolakodó elrendezés.
- `dist/locales/en.js` és `dist/locales/hu.js` — a `nasaAttributionDisclaimer`
  fordítások.
- `dist/app.js` — csak akkor szükséges módosítani, ha a meglévő lokalizációs
  inicializálás nem frissíti automatikusan az új `data-i18n` elemet.
- exportot kezelő kód — kreditmelléklet és harmadik félre vonatkozó ellenőrzés.

## Megvalósítási állapot (2026-09-15)

- Kész: lokalizált, állandó lábléc; nincs panorámára rajzolt kreditfelirat.
- Kész: `CREDITS.txt` készül a ZIP-exportban és a különálló letöltési
  folyamatban; a manifest továbbra is tartalmazza az eredeti rekordot.
- Kész: egyértelműen harmadik félhez kötött szerzői jogi mezővel rendelkező
  rekordot az export kihagy, amíg nem igazolt a felhasználási engedély.
- Nyitott: a megosztókép forrásképkockáinak product ID- és kreditjegyzéke.
