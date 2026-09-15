# NASA rover raw-image API: kvóta- és nyilvános használati jelentés

Vizsgálat dátuma: 2026-09-15  
Vizsgált végpontok: Curiosity `https://mars.nasa.gov/api/v1/raw_image_items/`
és Mars 2020 `https://mars.nasa.gov/rss/api/` raw-images feed.

## Rövid válasz

Nem találtam a vizsgált rover raw-image végpontokhoz közzétett **napi kvótát**,
API-kulcsot vagy dokumentált „felhasználónkénti” keretet. Emiatt nem
állítható megalapozottan, hogy minden látogató saját napi kvótát kap, vagy hogy
az összes látogató egy közös napi kvótát használ.

A webapp közvetlenül a látogató böngészőjéből hívja a NASA-végpontokat. Ezért
egy esetleges hálózati/IP-alapú korlát a NASA oldaláról a látogató nyilvános
kimenő IP-jére (gyakran több, azonos vállalati/iskolai NAT mögötti emberre)
vonatkozna, **nem** a GitHub Pages webhelyre mint egyetlen szerverre. Ezt a
NASA ennél az API-nál nem dokumentálta; következtetés, nem ígéret.

## Ellenőrzött tények

- A Curiosity API 2026-09-15-i közvetlen válasza `200 OK`, nyilvános CORS-t és
  `Cache-Control: max-age=120, public` fejlécet adott. Nem volt
  `RateLimit-*`, `X-RateLimit-*`, kvóta- vagy API-kulcs-fejléc.
- A webapp kérésenként legfeljebb 100 rekordot kér, és egy Sol összes oldalát
  lapozza; ezután minden panorámába került képhez külön képfájl-kérés indul.
  A terhelést így inkább a kiválasztott Sol képszáma, nem egy ismert napi
  limit határozza meg.
- A NASA nyilvános Curiosity és Perseverance raw-image oldalai a böngészést és
  többszörös képletöltést maguk is támogatják, de a vizsgált oldalak nem
  közölnek fejlesztői napi request-kvótát.
- A NASA más, különálló API-jain lehet eltérő, akár IP-alapú limit. Példa:
  az InSight Weather API régi dokumentációja óránként 2000 hívást ír elő
  IP-címenként. Ez **nem bizonyíték és nem átvihető limit** a rover
  raw-image API-ra.

## Következmény a publikus webappra

| Kérdés | Válasz |
| --- | --- |
| Minden látogató egy közös app-kvótát használ? | Nem erre utal az architektúra: nincs app-szerver vagy közös API-kulcs; a böngészők közvetlenül hívnak. |
| Minden látogatónak garantált saját kvótája van? | Nem ismert. NASA nem publikált ilyen szerződést vagy számot ehhez a végponthoz. |
| Több ember ugyanarról a hálózatról hathat egymásra? | Igen, ha a NASA később vagy rejtetten IP-alapú korlátot alkalmaz; ezt óvatos feltételezésként kell kezelni. |
| A CDN-cache segít? | Igen: a vizsgált Curiosity API-válasz 120 másodpercig publikus cache-elhetőséget jelez. Ez csökkentheti az origin-terhelést, de nem helyettesít alkalmazásoldali cache-t. |

## Javasolt működési korlátok

- Ne hivatkozzunk „napi NASA-kvótára” konkrét tényként. Az app felirata ezért
  semleges „szolgáltatási korlátok vonatkozhatnak rá” szövegre változott.
- Tartsuk meg a Sol-váltás felhasználói kezdeményezését; ne legyen automatikus
  Sol-pásztázás vagy háttérben futó előtöltés.
- Cache-eljük böngészőoldalon a lekért Sol-rekordokat és képeket, adjunk
  kérés-deduplikációt, valamint exponenciális visszalépést 429/5xx válaszra.
- Nagy forgalom vagy kötegelt archívum-letöltés előtt kérjünk hivatalos NASA/JPL
  kapacitás- vagy API-irányelveket, illetve használjunk erre kijelölt PDS
  tükröt/archívumot a használati feltételek betartásával.

## Források

- [Curiosity raw images](https://mars.nasa.gov/msl/multimedia/raw-images/)
- [Perseverance raw images](https://mars.nasa.gov/mars2020/multimedia/raw-images/)
- [NASA InSight Weather API documentation](https://api.nasa.gov/assets/insight/InSight%20Weather%20API%20Documentation.pdf) — csak a más API-k esetleges IP-alapú korlátának példája
