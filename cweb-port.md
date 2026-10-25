# Cweb-port: önfrissítő Curiosity metadata-cache

## Cél

A webalkalmazás a Curiosity panorámák metadataját elsődlegesen a saját tárhelyen tárolt, Solonkénti manifestekből olvassa. Ha egy Solhoz még nincs helyi manifest, a Cweben futó szerveroldali végpont egyszer, szabályozottan lekéri a NASA metadataját, elmenti a manifestet, és ezt adja vissza. A panorámaképek továbbra is közvetlenül a NASA kép-URL-jeiről töltődnek le.

Ez csökkenti a NASA metadata API terhelését, és nem teszi lehetővé, hogy a böngésző közvetlenül írjon a tárhelyre.

## Kiinduló állapot

- A tömörített dump jelenleg körülbelül 262 MB és 4 579 manifestet tartalmaz.
- A manifestek útvonala `curiosity-metadata/<kezdet>-<vég>/mars-rover-360-curiosity-sol-<sol>-research-manifest.json.gz`.
- A webapp már képes `.json.gz` manifestet `DecompressionStream('gzip')` segítségével memóriában kibontani és a session végéig `Map` cache-ben tartani.
- Az `invalid-sols/curiosity.js` ismert, használhatatlan Sol-számokat tartalmaz. Ezekhez sem helyi, sem NASA metadata-kérést nem szabad indítani.

## Kötelező kliensoldali korrekciók

### 1. Ezres mappák általános kezelése

Az `app.js` jelenlegi `5013`-as helyi maximuma csak pillanatnyi adatállapot, nem mappanév-szabály. Ezt el kell távolítani az útvonalképzésből.

Minden pozitív Solhoz az alábbi képlet a helyes:

```js
const start = Math.floor((sol - 1) / 1000) * 1000 + 1;
const end = start + 999;
```

Példák:

| Sol | Könyvtár |
|---:|---|
| 1 | `1-1000` |
| 1001 | `1001-2000` |
| 5001 | `5001-6000` |
| 6001 | `6001-7000` |

Az útvonalképzőnek nem szabad az utolsó jelenleg feltöltött Solhoz igazítania a könyvtár végét. A 6001. Solnál a szerveroldali kód hozza létre a `6001-7000` alkönyvtárat, ha még nem létezik.

### 2. A lokális lefedettség indexe

Az alkalmazás ne a kódban tárolja a Curiosity legfrissebb helyi Solját. Legyen egy kis, a szerver által frissített index, például:

```json
{
  "format": "mars360-curiosity-metadata-index/v1",
  "latestKnownSol": 5013,
  "latestCachedSol": 5013,
  "invalidSols": [3, 4, 5],
  "updatedAt": "2026-09-27T12:00:00Z"
}
```

Az indexet a webapp induláskor tölti be. Sikertelen indexbetöltéskor használhat beépített, konzervatív alapértéket, hogy az oldal továbbra is működjön.

Az `invalid-sols/curiosity.js` rövid távon megtartható induló listának. Hosszú távon az index legyen az elsődleges forrás, hogy új érvénytelen Soloknál ne kelljen JavaScript-fájlt publikálni.

### 3. Metadata-betöltési sorrend

Curiosity esetén a sorrend legyen:

```text
invalid Sol?
  igen → helyi „nincs panorámaadat” üzenet, hálózati kérés nélkül
  nem  → session Map cache?
           igen → cache-ből épül a panoráma
           nem  → helyi .json.gz manifest?
                    igen → kibontás, Map cache, panoráma
                    nem  → saját PHP metadata-végpont
```

A PHP-végpont végezze el a NASA-fallbacket. Cwebes telepítésben a böngésző ne hívja közvetlenül a NASA metadata API-t, mert akkor a cache feltöltése és a kéréskorlátozás nem központilag történik.

Az `Image` elemek `https_url`/`url` alapján továbbra is a NASA képforrásaira mutathatnak. Nem kell a képeket a Cweb tárhelyre másolni.

### 4. Felhasználói visszajelzés

- Ismert invalid Sol: „Ehhez a Solhoz nem tartozik panorámaadat.”
- Helyi manifest: rövid „Panorámaadatok betöltése…” állapot.
- Első, szerveroldali cache-miss: „Metadata archiválása, ez néhány másodpercet igénybe vehet…”
- NASA- vagy szerverhiba: a meglévő hibaüzenet, automatikus többszöri kliensoldali újrapróbálás nélkül.

## Javasolt Cwebes szerveroldali kialakítás

### Könyvtárszerkezet

Az alkalmazás publikus gyökérkönyvtárában:

```text
public_html/
  index.html
  app.js
  curiosity-metadata/
    index.json
    5001-6000/
      mars-rover-360-curiosity-sol-5001-research-manifest.json.gz
  api/
    curiosity-metadata.php
  private/
    locks/
```

A Cweb tényleges webroot neve eltérhet; ezt a cPanelben kell ellenőrizni. A `private/` könyvtár ne legyen weben elérhető. Ha ez nem megoldható, a lock fájlokat a webrooton kívül kell tartani.

### PHP-végpont szerződése

`GET /api/curiosity-metadata.php?sol=5014`

Lehetséges válaszok:

```json
{ "state": "available", "manifest": { "format": "mars-rover-360-export/v1", "rover": "curiosity", "sol": 5014, "images": [] } }
```

```json
{ "state": "invalid", "sol": 5014 }
```

```json
{ "state": "unavailable", "sol": 5014 }
```

Az `available` válasz lehet a frissen lekért adat vagy a meglévő gzip-manifest kibontott JSON-ja. A kliens mindkettőt a már létező session `Map` cache-be menti.

### A végpont kötelező működése

1. Csak egész, megengedett Curiosity Sol-számot fogadjon el.
2. Ellenőrizze az invalid indexet; találatkor azonnal `invalid` választ adjon.
3. Számolja ki az ezres mappát a fenti képlettel.
4. Ha a `.json.gz` létezik, olvassa és szolgálja ki; NASA-kérés ne legyen.
5. Cache-missnél Solonként `flock` zárral akadályozza meg, hogy több látogató ugyanazt a NASA-lekérést indítsa.
6. A NASA URL-je kizárólag a szerveroldali kódban legyen összeállítva. A kliens sem URL-t, sem hostnevet, sem fájlútvonalat ne adhasson át.
7. Lapozva kérje le a NASA rekordokat, korlátozott oldalszámmal és időtúllépéssel.
8. Validálja az API-választ és állítsa elő a meglévő manifestformátumot.
9. Ideiglenes fájlba írjon, majd `rename()`-mal atomikusan helyezze a végleges helyére. Így a kliens nem olvashat félkész gzip-fájlt.
10. Frissítse atomikusan az `index.json`-t is.
11. NASA-hiba esetén ne hozzon létre üres vagy hibás manifestet; adjon 502/503 választ rövid `Retry-After` fejléc mellett.

## Cron feladat

Az igény szerinti végpont mellé ajánlott egy ritka, például óránkénti cron.

Feladata:

1. Lekéri vagy kiszámítja a legújabb Curiosity Solt.
2. A még nem cache-elt, közelmúltbeli Solokat egymás után feldolgozza.
3. Betart egy alacsony NASA-kérési sebességet.
4. Frissíti az indexet és hibánál naplóz.

Így a látogató által kiváltott első cache-miss ritka kivétel marad. A cron ne töröljön metadata-fájlt automatikusan.

## Biztonság és terhelés

- Ne legyen publikus, tetszőleges URL-t letöltő proxy.
- A Sol paramétert szigorúan egész számmá kell alakítani és tartományra ellenőrizni.
- Legyen Solonkénti lock és rövid, IP-alapú rate limit a cache-miss végponton.
- A NASA válasz méretét és lapjainak számát korlátozni kell.
- A PHP `curl` kapcsolaton legyen connect- és teljes időtúllépés.
- A gzip, az index és az invalid lista írása csak atomikus cserével történjen.
- A PHP hibaüzenetei ne kerüljenek a kliensre vagy a publikus logba API-tokenekkel együtt.

## Cweb felé ellenőrzendő feltételek

Mielőtt a megoldás készül, igazolni kell:

1. Futtatható-e PHP 8.1+ saját fájlokból, és milyen `memory_limit`/`max_execution_time` vonatkozik rá?
2. Használható-e a `curl`, `zlib`/`gzencode`, `gzdecode`, `flock`, `mkdir` és `rename` PHP-ből?
3. Van-e cron a 2 GB-os cPanel csomagban? Mi a legkisebb gyakoriság és a futási korlát?
4. Futtatható-e PHP CLI cronból, vagy HTTP-alapú cron-hívás szükséges?
5. Engedélyezett-e a NASA felé kimenő HTTPS kérés a PHP folyamatból?
6. A saját account által írt fájlok azonnal kiszolgálhatók-e statikusan a webrootból?
7. Mekkora a fájlméret-, inode- és CPU/I/O-korlát? A 2 GB tartalmazza-e a levelezést és adatbázist is?
8. Van-e WAF-szabály vagy kéréslimit, amely blokkolhatja a JSON-választ vagy a NASA URL-eket?

## Elfogadási ellenőrzőlista

1. Sol 5001 a `5001-6000` könyvtárból töltődik, nem `5001-5013`-ból.
2. Sol 6001 első lekérése létrehozza a `6001-7000` könyvtárat és a manifestet.
3. Második lekérés nem hívja a NASA metadata API-t.
4. Két párhuzamos lekérés ugyanarra az új Solra csak egy NASA-folyamatot indít.
5. Ismert invalid Sol nem indít hálózati kérést.
6. Sérült vagy félkész gzip-fájl nem kerül ki a klienshez.
7. NASA hiba után nincs hibásan cache-elt manifest.
8. A közvetlen NASA képbetöltés és a panorámaépítés változatlanul működik.
