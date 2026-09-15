# NASA API-korlátok: felhasználói élmény és működési specifikáció

Állapot: megvalósítva a jelenlegi app kérési útvonalain  
Kapcsolódó háttér: [`nasa-rover-api-quota-report.md`](nasa-rover-api-quota-report.md)

## Cél

A felhasználó mindig értse:

1. milyen NASA-adatkérés zajlik;
2. az alkalmazás miért lassít, vár vagy áll meg;
3. mikor próbálkozik legközelebb, és mit tehet közben.

Az alkalmazás nem állíthat nem publikált „napi kvótát”, nem mutathat fiktív
90%-os fogyást, és nem ígérhet pontos helyreállási időt, ha azt az API nem
közli. A visszaszámláló kizárólag tényleges `Retry-After` értékből vagy a
kliens saját, dokumentált visszalépési időzítőjéből származhat.

## Alapelv: állapotot mutatunk, nem feltételezett kvótát

| Helyzet | Amit a felhasználó lát | Időinformáció |
| --- | --- | --- |
| Normál kérés | „NASA-képadatok betöltése – Sol 1234” | Animált folyamatjelzés; nincs kvótaérték. |
| Saját tempókorlát / Sol-szkenner sorban áll | „Kíméljük a NASA-adatforrást. Következő lekérés: 00:12.” | Natív másodperc-visszaszámláló a következő kliensoldali kérésig. |
| HTTP 429 + `Retry-After` | „A NASA átmenetileg késlelteti a kéréseket. Újrapróbálás: 01:43 múlva.” | Az API `Retry-After` értékéből számolt, másodpercenként frissülő visszaszámláló. |
| HTTP 429 `Retry-After` nélkül vagy átmeneti 5xx/hálózati hiba | „A NASA-adatforrás átmenetileg nem elérhető. Automatikus újrapróbálás: 00:30 múlva.” | A kliens exponenciális visszalépéséből számolt visszaszámláló; a szöveg egyértelműen mondja ki, hogy ez az app következő próbálkozása, nem NASA által ígért helyreállási idő. |
| Végleg hibás kérés (4xx, kivéve 429) | „Ez a Sol vagy lekérési feltétel nem tölthető be.” | Nincs automatikus visszaszámlálás; legyen Újrapróbálás gomb. |

## Kliensoldali kérésvezérlő

Egy központi `nasaRequestScheduler` kezelje a Curiosity, Mars 2020 és MER
kéréseket. A komponensek ne hívjanak közvetlenül `fetch()`-et.

- **Deduplication:** azonos URL-ből egyszerre csak egy aktív kérés lehet; az
  összes fogyasztó ugyanazt a Promise-t kapja.
- **Cache:** a Sol-metaadat és képek memóriában legyenek cache-elve; ugyanazon
  Sol vagy már letöltött kép újramegnyitása ne indítson új kérést.
- **Pacing:** alaphelyzetben legfeljebb egy metaadatkérés fusson roverenént és
  legfeljebb két képletöltés párhuzamosan. Sol-szkennerben az új Sol-kérések
  között legyen minimális, konfigurált késleltetés (indulásként 1 másodperc).
- **Backoff:** 429 esetén a `Retry-After` az elsődleges. Hiányában, továbbá
  átmeneti hálózati/5xx hibánál 30, 60, 120, 240, majd legfeljebb 300 másodperc
  várakozás következzen, véletlen jitterrel. Sikeres válasz nullázza a számlálót.
- **Leállítás:** új felhasználói Sol-választás törölje az elavult, még nem indult
  szkennerfeladatokat; az aktuális, már kiküldött kérés válaszát ignorálja, ha
  az már nem az aktív nézethez tartozik.
- **Nincs rejtett pörgetés:** automatikus Sol-pásztázás, háttér-előtöltés és
  végtelen retry tilos. A szkenner csak felhasználói indításra haladhat tovább.

## Látható felületek és pontos üzenetek

Ugyanaz a központi állapot kerüljön minden aktív nézetbe. Az üzenet tartalma és
visszaszámlálója azonos legyen, ne csak a színe.

| Felület | Kötelező viselkedés |
| --- | --- |
| Normál HTML nézet | A meglévő `#statusText` kapja a teljes állapotmondatot. Legyen mellette `aria-live="polite"` időérték és egyértelmű, nem csak forgó ikonból álló folyamatjelzés. |
| Sol-léptető és betöltő gomb | Várakozás alatt legyenek tiltva; tooltip/segédszöveg jelezze: „Következő NASA-kérés: 00:12.” A felhasználó választhasson más, már cache-elt Solt. |
| Sol-szkenner folyamat | Mutasson „12 / 40 Sol ellenőrizve · következő kérés: 00:12” sort, valamint Látható Szünet, Folytatás és Leállítás vezérlőt. A folyamatban ne szerepeljen „kvóta” vagy százalék. |
| Panoráma | Megmarad a korábban betöltött panoráma; fölé nem kerül zavaró kredit vagy teljes képernyős blokkoló réteg. Kis, szöveges állapotjelzés jelzi, hogy az új Sol késleltetett. |
| Fullscreen canvas | A meglévő `#panoramaStatusIndicator` jelenjen meg hiba/várakozás esetén is, ugyanazzal a teljes mondattal és élő `MM:SS` visszaszámlálóval. Maradjon olvasható, de ne fogja el a navigációt. |
| Információs panel, galéria, Crossview | Ne ígérjen „hamarosan” vagy ne mutasson örök töltőt. A gomb legyen tiltott, és a panelen jelenjen meg a közös várakozási mondat/visszaszámláló. |

## Lokalizáció

Minden üzenet külön fordítási kulcs legyen az angol és magyar locale fájlban.
Az időt ne fordított, kézzel összeállított mondatban tároljuk; a fordítás
`{remaining}` helyőrzőt kapjon, amelyet a formázó `MM:SS` formában ad át.

Kötelező minták:

| Kulcs | English | Magyar |
| --- | --- | --- |
| `nasaRequestLoading` | `Loading NASA image data — Sol {sol}` | `NASA-képadatok betöltése – Sol {sol}` |
| `nasaRequestPaced` | `Respecting the NASA data service. Next request in {remaining}.` | `Kíméljük a NASA-adatforrást. Következő lekérés: {remaining}.` |
| `nasaRequestRetryAfter` | `NASA is temporarily delaying requests. Retrying in {remaining}.` | `A NASA átmenetileg késlelteti a kéréseket. Újrapróbálás: {remaining} múlva.` |
| `nasaRequestBackoff` | `NASA data is temporarily unavailable. This app will retry in {remaining}.` | `A NASA-adatforrás átmenetileg nem elérhető. Az alkalmazás {remaining} múlva próbálja újra.` |
| `nasaScannerProgress` | `{completed} / {total} Sols checked · next request in {remaining}` | `{completed} / {total} Sol ellenőrizve · következő lekérés: {remaining}` |

## Hozzáférhetőség és hibabiztonság

- A visszaszámláló `aria-live="polite"` régióban legfeljebb 10 másodpercenként
  mondja be az új értéket; a vizuális kijelző ettől még másodpercenként frissül.
- Soha ne legyen kizárólag színre, ikonra vagy animációra épülő állapot.
- A „Leállítás” azonnal megszakítja a még nem indult feladatokat, az „Újrapróbálás
  most” gomb viszont csak akkor aktív, ha a `Retry-After` lejárt vagy nem volt
  ilyen fejléc.
- A hibaüzenet mondja ki, ha a korábbi panoráma marad látható: „Az előző Sol
  továbbra is megtekinthető.”

## Elfogadási feltételek

1. Egy aktív Solhoz legfeljebb egy azonos metaadatkérés és két párhuzamos
   képletöltés indítható.
2. 429 + `Retry-After: 75` esetén a normál és fullscreen nézet egyaránt
   `01:15`-ről visszaszámol, és 75 másodperc előtt nem indít új kérést.
3. 429 fejléc nélkül a felület kimondja, hogy az alkalmazás saját
   újrapróbálásáról van szó; nem tulajdonít helyreállítási ígéretet a NASA-nak.
4. A Sol-szkenner szüneteltethető, leállítható, mutatja az előrehaladást és a
   következő kérés idejét minden aktív nézetben.
5. A nyelvváltás közben is azonos hátralévő idő és helyes nyelvű szöveg látszik.
6. A korábbi panoráma a várakozás alatt használható marad.

## Megvalósítási megjegyzés (2026-09-15)

- A `dist/app.js` központi `nasaRequestScheduler`-e ütemezi a NASA Mars és PDS
  kéréseket, deduplikálja az aktív azonos kéréseket, és 120 másodpercig őrzi a
  sikeres válaszokat kliensoldali memóriában.
- A scheduler egyesével indítja a metaadat-/PDS-kéréseket, legalább egy
  másodperces kérésközzel; ez a specifikációban megengedett párhuzamossági
  felső határnál szigorúbb védelem.
- 429 esetén a `Retry-After` az elsődleges; hiányában, illetve átmeneti
  hálózati/5xx hibánál a 30–300 másodperces exponenciális visszalépés lép életbe.
- A normál státuszsor és a fullscreen állapotjelző ugyanazt a lokalizált,
  másodpercenként frissülő várakozási üzenetet mutatja. A Sol-vezérlők a
  várakozás alatt letiltottak.
- Külön Sol-szkenner UI jelenleg nincs a webappban; ha ilyen funkció bekerül,
  annak a fenti schedulerre kell épülnie, és a specifikáció szerinti
  Szünet/Folytatás/Leállítás jelzéseket kell megkapnia.
