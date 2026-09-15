# Webapp NASA-kép- és márkahasználati audit

Vizsgálat dátuma: 2026-09-15  
Vizsgált kiadás: `dist/` statikus webapp; a publikus belépési pont
`dist/index.html`.  Ez technikai megfelelőségi audit, nem jogi tanács.

## Rövid eredmény

A webapp jelen formájában **nem mutat nyilvánvaló NASA-logó- vagy
jóváhagyás-állítási jogsértést**, de a NASA-képek látható kreditje és a
harmadik félhez tartozó jogok kezelése **nem elégséges**.  A kiadás előtt a P1
jelű tételeket rendezni kell.

## Megfelelő elemek

| Állapot | Megfigyelés | Értékelés |
| --- | --- | --- |
| Megfelel | A név `Martian Robots`; a NASA-ra a cím, metaadatok és feliratok tényszerűen, a rover-képek forrásaként utalnak. Nincs „official NASA”, „NASA approved” vagy támogatásra utaló szöveg. | Nem kelt jóváhagyási/partnerségi látszatot. |
| Megfelel | Nem találtam NASA Insignia/Meatball, Worm logót vagy Seal-t a webapp HTML/JS/CSS szövegében. A fejlécben használt `brand-mark.png` rover-sziluett, nem NASA-azonosító. | A projekt brandje elkülönül a NASA márkajelzésétől. |
| Megfelel, de csak a tárolt exportban | Az API-rekordot a manifest-export a képadatokkal együtt őrzi meg; a vizsgált Curiosity-rekordokban szerepel az `image_credit: "NASA/JPL-Caltech"` mező. | Ez segíti a visszakövethetőséget, de nem helyettesíti a felületen megjelenő kreditet. |
| Részben megfelel | Az Információs panel „Open original image” hivatkozása az eredeti NASA-forrásra mutat. | Jó forráshivatkozás, de nem forrásmegjelölés. |

## Hiányosságok és kockázatok

| Prioritás | Megállapítás | Miért probléma | Javítandó állapot |
| --- | --- | --- | --- |
| P1 | A képenkénti kredit nincs a felületen. A panel metadata-soraiból kimarad az `image_credit`, a galéria és a Crossview-dia sem jeleníti meg. | A NASA kéri a forrás elismerését; a puszta eredeti-kép link ezt nem adja meg. | Minden megjelenített képhez és exporthoz jelenjen meg a rekord pontos kreditje; ha nincs, legalább `NASA/JPL-Caltech` csak akkor, ha a rekord/forrás ezt igazolja. |
| P1 | A `martian-robots-og-image.png` helyben tárolt, láthatóan roverfelvételekből összeállított közösségi megosztókép; nincs mellette kredit vagy forrásazonosító. Az OG/Twitter metaadatok ezt megosztásokban promóciós kártyaként használják. | A NASA szerint a rövid közösségi tartalom általában promóciós; promóciós használatnál különösen fontos a jogok és a látható NASA-azonosítók ellenőrzése. | Állapítsátok meg az összes beépített képkocka pontos product ID-ját és kreditjét; adjatok feltűnő `NASA/JPL-Caltech` (vagy pontosabb) kreditet és forráshivatkozást. Ha promóciós kampányban használjátok, kérjetek NASA útmutatást/clearance-t. |
| P1 | Nincs futásidejű ellenőrzés vagy tiltás a harmadik fél szerzői jogával jelölt rekordokra. A rekordot az app változtatás nélkül megjeleníti, a kiválasztott képeket pedig közvetlenül is letölthetővé teszi. | NASA harmadik fél anyagára nem ad továbbfelhasználási jogot. | A normalizáláskor olvassátok ki a copyright/credit mezőket; harmadik fél jelölése esetén blokkoljatok vagy külön engedély- és kreditjelzéssel kezeljetek. |
| P2 | Egyedi kép-letöltéskor a JPEG mellett nincs kreditoldal vagy sidecar. A JSON-manifest megőrzi a rekordot, de a felhasználó közvetlen képfájlt is kap. | A kredit leválik a képről, könnyű később forrás nélkül továbbadni. | Egyedi és tömeges letöltéshez adjatok `CREDITS.txt`/JSON sidecart, képenként URL-lel, product ID-val és pontos kredittel. |
| P2 | A README-ben lévő függetlenségi nyilatkozat (`not affiliated with NASA or JPL`) nem jelenik meg a publikus appban vagy a megosztási metaadatokban. | A tényszerű NASA-említés rendben van, de a diszklémer csökkenti az összetéveszthetőséget. | Tegyetek látható About/Credits linket vagy láblécet: „Independent project. Not affiliated with or endorsed by NASA or JPL.” |
| P2 | A projekt CC0-licence „original assets”-re vonatkozó állítása nem azonosítja, hogy a helyi OG-kép NASA-forrású lehet. Emellett a tárolt `curiosity_rover/` modell saját CC-BY 4.0 kreditet tartalmaz. | Nem szabad NASA-anyagot saját CC0-ként vagy harmadik fél CC-BY anyagát kredit nélkül továbblicencelni. | Készítsetek asset inventory-t: eredet, product ID/URL, kredit, licenc, beépítve van-e a `dist/` kiadásba. A LICENSE/README mondja ki, hogy a CC0 kizárólag a saját kódra és ténylegesen saját assetekre vonatkozik. |

## Bizonyítékok

- [index.html](../dist/index.html) a NASA-t leíróan használja a címben és
  megosztási metaadatokban, a helyi OG-képre hivatkozik, de nem tartalmaz
  kredit- vagy függetlenségi nyilatkozatot.
- [app.js](../dist/app.js) `panel()` függvénye csak rover-, kamera- és
  geometriamezőket renderel; a rekord `image_credit` mezőjét nem. Ugyanez a
  fájl közvetlenül tölti le a képet, míg a JSON-exportba az eredeti rekord
  bekerül.
- [README.md](../README.md) tartalmazza az independent/non-affiliated
  nyilatkozatot, de ez nem része a `dist/` felületnek.
- [curiosity_rover/license.txt](../curiosity_rover/license.txt) CC-BY 4.0
  szerzői kreditkötelezettséget rögzít. A modell vizsgált `dist/` belépési
  pontja nem hivatkozza, de kiadás előtt ezt gépileg is ellenőrizni kell.

## Következtetés

A NASA-képek tényszerű, oktatási jellegű panoráma-megjelenítése alapvetően
összeegyeztethető a NASA irányelveivel. A kiadás jogi kockázata nem a
NASA-név leíró használata, hanem a kredit hiánya, a beépített megosztókép
ismeretlen pontos eredete és a harmadik fél tartalom automatikus
továbbadásának lehetősége.

## Irányadó NASA-források

- [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)
- [NASA Brand Guidelines](https://www.nasa.gov/nasa-brand-center/brand-guidelines/)
- [NASA Brand Center: Restrictions](https://www.nasa.gov/nasa-brand-center/)
- [NASA Advertising Guidelines](https://www.nasa.gov/nasa-brand-center/advertising-guidelines/)
