# NASA rover metadata cache – alkalmazhatósági döntés

Vizsgálat: 2026-09-15.

## Döntés

Igen: a már jogszerűen lekért nyilvános metaadatok helyi, tartós cache-e
alkalmazható, és csökkenti az ismételt lekéréseket. Ez nem teszi indokolttá a
teljes, négy roveres browse-archívum automatizált letükrözését. A Curiosity és
Perseverance gallery-feedei élő, nem verziózott browse-feeds; a történeti
rekordok is javulhatnak. Spirit és Opportunity küldetése lezárt, PDS
Sol-katalógusuk különösen jó statikus cache-jelölt.

## Javasolt határ

- Felhasználói gombnyomásra, egyetlen soros ütemezéssel kérjük le a négy rover
  katalógusát és csak előre megnevezett, korlátozott számú Sol metaadatait.
- A cache forrása és `createdAt` időbélyege része legyen az exportnak.
- A cache csak azonos rover/Sol esetén használható; hiány esetén marad a
  lassított élő lekérés.
- A Curiosity és Perseverance snapshot történeti gyorsítótár, nem élő állapot.

## Nem javasolt

- A teljes Curiosity- vagy Perseverance-archívum végigpásztázása a
  dokumentálatlan gallery-végpontokon.
- Automatikus háttérfrissítés vagy minden látogatónál lefutó előtöltés.

## Megvalósítás

`dump/nasa-metadata-cache-builder.html` a négy roverhez készít
`mars360-static-metadata-cache/v1` formátumú JavaScript-fájlt. A kérések
legalább 1,2 másodpercre vannak egymástól, roverenként legfeljebb 25 megadott
Sol kérhető. A kimenet a `dist/static-metadata-cache.js` helyére tehető. A
webapp ebből hálózat nélkül használja a cache-elt Curiosity/Perseverance
Sol-rekordokat és a MER Sol-katalógust.

## Források

- [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)
- [NASA Science Data Licenses](https://science.data.nasa.gov/about/license)
- [Curiosity raw images](https://mars.nasa.gov/msl/multimedia/raw-images/)
- [Perseverance raw images](https://mars.nasa.gov/mars2020/multimedia/raw-images/)
