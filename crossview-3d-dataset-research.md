# Crossview – Mars felszíni 3D nézet: adatkészlet-kutatás

## Rövid következtetés

A két roverhez a legjobb közvetlen alapréteg nem nyers műholdkép, hanem a NASA/USGS által már **ortorektifikált, georeferált GeoTIFF** mozaik és az ahhoz igazított digitális felszínmodell (DEM/DTM). Ezek pixelenként térbeli referenciát visznek magukkal, ezért a képernyőn kijelölt pont egyértelműen visszaalakítható Mars-koordinátává, és a DEM-re textúrázva valódi 3D madártávlati nézet készíthető belőlük.

Ajánlott alapkonvenció mindkét helyszínre:

- Mars, equirectangular (equidistant cylindrical) vetület
- planetocentrikus szélesség; pozitív keleti hosszúság; -180…180° hosszúsági tartomány
- gömbsugár: 3 396 190 m
- magasság: méter, MOLA-hoz igazítva

Ez a választás azért fontos, mert a rover- és térképadatok csak akkor fedik egymást pontosan, ha ugyanazt a bolygótestet, hosszúsági irányt és koordinátakonvenciót használják. A raszterek GeoTIFF-metaadatait (különösen a geotransformot, CRS-t és NoData-értéket) meg kell őrizni; böngészős használatra célszerű belőlük külön COG/csempék és egy kisebb, előnézeti DEM készítése.

## Curiosity / Gale-kráter

- Referencia leszállóhely (Bradbury Landing): **4.5895° S, 137.4417° E**.
- Elsődleges ortofotó: `MSL_Gale_Orthophoto_Mosaic_25cm_v3.tif` — 25 cm/pixel, 23 GB, 8 bites szürkeárnyalatos GeoTIFF. HiRISE, CTX és HRSC ortofotókból készült, MOLA-kontrollhoz igazítva. Lefedettség: 5.249525° S…4.068583° S, 137.094719° E…137.853896° E.
- Elsődleges felszínmodell: `MSL_Gale_DEM_Mosaic_1m_v3.tif` — 1 m/pixel, 3.6 GB, 32 bites DEM GeoTIFF. Lefedettség: 5.098652° S…4.129605° S, 137.124167° E…137.680559° E.
- Kiegészítő, vizuális opció: 2025-ös, ~1 GB-os színes HiRISE LRGB COG. Ez gyorsabb streaminget adhat, de a 25 cm-es eredeti szürke mozaik a referencia-geometria elsődleges rétege maradjon.
- A Curiosity pillanatnyi/sol-alapú pályájához a PDS `localized_interp.csv` lokalizációs táblát kell az alaptérképre vetíteni. A táblában lévő easting/northing mezők illeszkednek a Gale alaptérkép méteres equirectangular koordinátáihoz.

## Perseverance / Jezero-kráter

- Referencia leszállóhely (Octavia E. Butler Landing): **18.44463° N, 77.45088° E**.
- Elsődleges ortofotó: `JEZ_hirise_soc_007_orthoMosaic_25cm_Ortho_blend120.tif` — 25 cm/pixel, 3.2 GB LZW-tömörített GeoTIFF, JPL felszíni műveletekre finomított (seamline/120 pixeles blend) mozaik. Az elérhető azonos, elsődleges TRN-mozaik: `JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif`.
- Elsődleges felszínmodell: `JEZ_hirise_soc_006_DTM_MOLAtopography_DeltaGeoid_1m_Eqc_latTs0_lon0_blend40.tif` — 1 m/pixel GeoTIFF DTM. A HiRISE mozaik és a DTM közös termékcsalád, így ez az első választás a textúrázott terephez.
- Kráter-szintű kiegészítés: `M20_JezeroCrater_CTXortho_mosaic_5m.tif` (5 m/pixel) és `M20_JezeroCrater_CTXDEM_20m.tif` (20 m/pixel). Ez nagyobb területi kontextust ad, ha a HiRISE 25 cm-es területén kívül kell nézni.
- A Mars 2020 TRN-adatkészlet kifejezetten az EDL/veszélytérképezési feladathoz készült. A HiRISE 25 cm-es ortoképek és 1 m-es DTM-ek ugyanabba a közös vetületbe kerültek; ez erős alap egy precíz, kétirányú (képpont ↔ térkoordináta) célzófelülethez.

## Javasolt későbbi megvalósítási irány (nem implementáció)

1. A fenti teljes GeoTIFF-eket archivált, változatlan forrásként kezelni; nem a webappba tölteni.
2. Területenként előállítani egy COG/XYZ vagy quantized-mesh kiszolgálási réteget. A 25 cm-es kép nagy zoomon, a CTX-réteg alacsony zoomon működjön.
3. A DTM-et az ortofotóval azonos CRS-ben használni; a webes renderelőben a pixel geotransformja alapján generálni az XY pozíciót, a DTM értékéből a Z-t.
4. A célkereszt kattintási pontját a helyi projektált X/Y mellett lat/lonra is konvertálni és eltárolni: `body=Mars`, `lat_type=planetocentric`, `lon_direction=positive_east`, `elevation_reference=MOLA`.
5. A "pontos" nem jelent centiméteres abszolút helymeghatározást: a Gale mozaik MOLA/HRSC-kontrolljának publikált vízszintes pontossága nagyjából 100 m, miközben a lokális relatív részlet 25 cm / 1 m. Crossview célzáshoz ezért a közös kontrollhálóhoz igazított rover-póz és a rétegek relatív egyezése a kritikus.

## Elsődleges források és ellenőrzés

- USGS Astropedia – [Gale 25 cm ortofotó](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm): felbontás, méret, lefedettség, CRS és közvetlen fájl.
- USGS Astropedia – [Gale 1 m DEM](https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m): DEM-metaadatok és közvetlen fájl.
- USGS Astropedia – [Jezero CTX DTM / TRN termékleírás](https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_ctx_dtm_mosaic): vetület, MOLA-kontroll, vertikális/horizontális minőség és a HiRISE kapcsolt termékek.
- USGS/PDS – [Jezero HiRISE termékkönyvtár](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/index.html): közvetlen GeoTIFF-ek és XML/PDS címkék.
- USGS/PDS – [Jezero CTX termékkönyvtár](https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/CTX/index.html): kráter-szintű CTX mozaik és DEM.
- NASA NTRS – [Curiosity leszállási koordinátája](https://ntrs.nasa.gov/api/citations/20130010129/downloads/20130010129.pdf) és [Perseverance leszállási koordinátája](https://ntrs.nasa.gov/citations/20210024644).

Letöltési linkek gyors, roverenkénti listáját a `crossview-dataset-downloads.html` tartalmazza.
