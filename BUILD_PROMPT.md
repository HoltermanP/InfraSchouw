# BOUWOPDRACHT — InfraSchouw
Webapp + PWA voor schouwen in ondergrondse infraprojecten (kabels & leidingen, MS-netten, MS-stations)

> Gebruik: zet dit bestand in de root van een lege repo als `BUILD_PROMPT.md` en start Claude Code met:
> `Lees BUILD_PROMPT.md volledig en bouw de app af volgens de opdracht. Stel geen vragen.`

---

## 0. Werkwijze voor jou (Claude Code) — lees dit eerst

1. **Stel geen vragen.** Waar iets niet is gespecificeerd: maak een verstandige keuze, leg die vast in `docs/DECISIONS.md` (datum, keuze, reden, alternatief) en ga door.
2. **Bouw door tot alles uit sectie 14 (Definition of Done) groen is.** Geen `TODO`, geen stub-functies, geen "dit kun je later toevoegen". Als een externe dienst (bijv. smart glasses SDK) niet beschikbaar is, bouw je de volledige adapter + ingest-API + een werkende simulator.
3. Werk in de fasen uit sectie 13. Houd een takenlijst bij. Na elke fase: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` moet slagen. Commit per fase met een duidelijke message.
4. Controleer bij externe API's (OpenAI, Clerk, Vercel Blob, Upstash, PDOK) de **actuele documentatie** voordat je code schrijft. Gebruik geen verouderde API's.
5. Alle UI-teksten in het **Nederlands**. Code, variabelen en commentaar in het Engels.
6. Maak een werkende **demo-omgeving met seeddata** (sectie 12), zodat de app direct te laten zien is.
7. Schrijf tot slot `README.md` (installatie, env vars, deploy), `docs/ARCHITECTURE.md` en `docs/USER_GUIDE.md` (handleiding voor schouwers en projectleiders).

---

## 1. Doel van de app

Schouwers in het veld leggen een schouw volledig vast met foto's, video, spraak, tekst en locatie — met telefoon, tablet of smart glasses. Na de schouw maakt AI een **voorstel-schouwverslag**. De gebruiker controleert en past dit aan in de backend. Het eindresultaat is een gestructureerd, professioneel verslag met:

- managementsamenvatting en geprioriteerde aandachtspunten;
- foto's op de juiste plek in het verslag;
- een kaart met alle foto's en bevindingen, klikbaar naar de bijbehorende info;
- bij MS-stations: een complete installatiebeschrijving, een as-built-check en **bewijsvoering voor de afrekenstaat**.

Doelgroep: netbeheerders (Liander, Enexis, Stedin), waterbedrijven (Vitens), infra-aannemers, ingenieursbureaus, toezichthouders.

---

## 2. Stack (verplicht)

| Onderdeel | Keuze |
|---|---|
| Framework | Next.js (App Router, laatste stabiele versie), TypeScript strict, React Server Components waar logisch |
| Hosting | Vercel |
| Database | Neon Postgres + **PostGIS** extensie |
| ORM | Drizzle ORM + drizzle-kit migraties |
| Auth | Clerk (met **Organizations** voor multi-tenant) |
| Cache / rate limit / queue | Upstash Redis (`@upstash/ratelimit`) + **Upstash QStash** voor achtergrondjobs |
| Opslag media | Vercel Blob (client-side uploads, ook grote video) |
| AI | OpenAI API: vision, transcriptie, structured outputs. Modelnamen via env vars (zie sectie 11) |
| UI | Tailwind CSS + shadcn/ui, lucide-react iconen |
| Kaart | MapLibre GL JS met **PDOK**-achtergrondkaarten (BRT-Achtergrondkaart, Luchtfoto), marker clustering |
| Coördinaten | WGS84 opslag + berekende RD New (EPSG:28992) via `proj4` |
| Offline | PWA met Serwist (service worker) + Dexie (IndexedDB) als lokale capture-queue |
| Editor verslag | TipTap (rich text) met eigen nodes voor foto's, fotoreeksen, kaart en tabellen |
| Export | PDF via `@react-pdf/renderer`, Word via `docx`, Excel via `exceljs` |
| Validatie | Zod (gedeelde schema's client/server) |
| Tests | Vitest (unit), Playwright (e2e), MSW voor OpenAI-mocks |
| CI/CD | GitHub Actions: typecheck, lint, test, build op elke PR. Branches `main` (productie) en `develop` (staging/preview) |

---

## 3. Kernbegrippen

- **Project** — een infraproject (bijv. netverzwaring, tracé, stationsvervanging). Heeft opdrachtgever, projectnummer, contractvorm (UAV-GC, RAW, UAV 2012), gebied (polygoon), fase, team en een lijst **afrekenposten**.
- **Schouw** — één schouwmoment. Kan **los** bestaan of **gekoppeld aan een project** zijn. Een losse schouw kan later aan een project worden gekoppeld.
- **Schouwtype** (template) — bepaalt doel, checklist, verplichte foto's en verslagopbouw.
- **Capture** — één vastgelegd item: foto, video, audio, tekstnotitie, schets, meting.
- **Bevinding** — een inhoudelijk punt (bijv. "kabel onvoldoende diep", "trafo type wijkt af") met locatie, categorie, prioriteit, gekoppelde captures.
- **Actiepunt** — wie doet wat voor wanneer, afgeleid uit bevindingen.
- **Station** — een MS-station als object, met historie van schouwen en asset-register.
- **Afrekenpost** — bestek-/contractpost (code, omschrijving, eenheid, eenheidsprijs, geplande hoeveelheid) waaraan bewijs uit schouwen wordt gekoppeld.
- **Verslag** — AI-voorstel + menselijke bewerkingen, met versiebeheer en status.

---

## 4. Schouwtypen (seed als standaardtemplates, door beheerder aanpasbaar)

| Type | Fase | Doel |
|---|---|---|
| Initiatief-/haalbaarheidsschouw | Initiatief | Globale beoordeling gebied, obstakels, kansen |
| Tracéschouw | Ontwerp | Tracé beoordelen: obstakels, bomen, kruisingen, verharding, bereikbaarheid, boorlocaties, vergunningspunten |
| Stationslocatieschouw | Ontwerp | Geschikte locatie nieuw MS-station: ruimte, bereikbaarheid, omgeving, kabelinvoer |
| Nulmeting / vooropname | Voor uitvoering | Staat van omgeving vastleggen (schade-vooropname, verharding, gevels, groen) |
| Uitvoeringsschouw / toezicht | Uitvoering | Controle kwaliteit, diepte, ligging, veiligheid, BLVC, KLIC-naleving |
| Stationsschouw (bestaand) | Alle | Inventarisatie bestaande installatie |
| Stationsopleveringsschouw | Oplevering | As-built vastleggen, check tegen ontwerp, bewijs voor afrekening |
| Opleveringsschouw tracé | Oplevering | Herstel verharding, afwerking, restpunten |
| Afrekenschouw | Afronding | Hoeveelheden aantoonbaar maken voor afrekenstaat |
| Nazorg-/garantieschouw | Nazorg | Verzakkingen, schade, restpunten |
| Calamiteit-/storingsschouw | Ad hoc | Snelle vastlegging schade/storing, tijdlijn |

Elke template bevat: naam, beschrijving, doel-tekst voor het verslag, checklist (vraag, type antwoord: ja/nee/nvt, keuze, getal, tekst, foto verplicht ja/nee), **verplichte fotoshots** (shotlist), standaard verslagsecties, en specifieke AI-instructies.

---

## 5. Functionaliteit veld (mobiel / PWA / smart glasses)

### 5.1 Schouw starten
- **Losse schouw**: knop "Nieuwe schouw" → kies type → titel (auto: type + adres + datum) → start.
- **Vanuit project**: projectpagina → "Schouw starten" → type → (optioneel) station kiezen of nieuw station aanmaken.
- Deelnemers toevoegen (naam, organisatie, rol) — ook externen zonder account.
- Automatisch vastgelegd: starttijd, schouwer, apparaat, **weer** (Open-Meteo API, geen key nodig), startlocatie + adres (PDOK Locatieserver reverse geocoding).

### 5.2 Vastleggen
Grote, handschoen-vriendelijke knoppen onderin het scherm:

- **Foto** — camera via `getUserMedia` (achtercamera, hoogste resolutie) én fallback `<input capture>`. Per foto: GPS (lat/lon, nauwkeurigheid), kompasrichting (DeviceOrientation, als beschikbaar), tijdstempel, optioneel shotlist-item, snelle tag, korte notitie of spraaknotitie direct aan de foto.
- **Fotoreeks / serie-modus** — elke X meter of tik automatisch een foto langs het tracé.
- **Video** — MediaRecorder, max. duur instelbaar (standaard 3 min), GPS-track tijdens opname. Client extraheert keyframes (canvas, elke N seconden) voor AI-analyse.
- **Spraak** — push-to-talk én doorlopende opname. Audio wordt server-side getranscribeerd (Nederlands). Transcriptsegmenten krijgen tijdstempels en worden gekoppeld aan captures die in hetzelfde tijdvenster zijn gemaakt.
- **Tekstnotitie** — vrij veld, tijdens of na de schouw.
- **Schets / annotatie** — teken op een foto (pijlen, cirkels, tekst, maatlijn) met canvas; origineel blijft bewaard.
- **Meting** — handmatige invoer met eenheid (diepte in cm, lengte in m, aantal), gekoppeld aan locatie en foto (bijv. "diepte kabel 72 cm" bij een foto met duimstok).
- **Bevinding snel toevoegen** — categorie + prioriteit + omschrijving + gekoppelde laatste foto('s).
- **QR/barcode scannen** — (BarcodeDetector API met fallback `@zxing/browser`) voor stationsnummers, assetlabels, kabelhaspels.
- **Checklist** — van de template, afvinkbaar tijdens de schouw; shotlist toont welke verplichte foto's nog ontbreken.
- **GPS-track** — tijdens de schouw wordt elke 5 s (instelbaar) een punt gelogd; zichtbaar als lijn op de kaart.
- **Handsfree-modus** — spraakcommando's via Web Speech API (`nl-NL`): "foto", "start video", "stop video", "notitie …", "bevinding hoog …", "volgende shot". Grote visuele bevestiging + trilfeedback.

### 5.3 Locatie
- Nauwkeurigheid tonen; waarschuwing bij > 15 m.
- Handmatig corrigeren: marker verslepen op de kaart.
- Opslag WGS84 (PostGIS `geography(Point,4326)`), weergave ook in RD (x, y).
- Adres en dichtstbijzijnde BAG-adres via PDOK Locatieserver.
- Bij geïmporteerde foto's: GPS uit EXIF (`exifr`); zonder EXIF-GPS → locatie bepalen door **tijdstempel te matchen met de GPS-track** van de schouw.

### 5.4 Offline
- Alles werkt offline. Captures gaan eerst naar IndexedDB (Dexie), met status `pending → uploading → uploaded → processed`.
- Automatische sync als er verbinding is (Background Sync waar beschikbaar, anders bij online-event en app-focus). Hervatbare uploads, retry met backoff.
- Kaarttegels van het schouwgebied vooraf cachen (knop "Gebied offline beschikbaar maken").
- Duidelijke sync-indicator: aantal items wachtend, laatste sync.

### 5.5 Schouw afronden
- Controle: ontbrekende verplichte shots en open checklistvragen worden getoond (kan bewust overgeslagen worden met reden).
- Handtekening deelnemers (optioneel, canvas).
- "Afronden" → status `afgerond` → start AI-verwerking → verslagvoorstel.

---

## 6. Smart glasses

Bouw een **adapterlaag** zodat bronnen uitwisselbaar zijn: `CaptureSource` interface met implementaties `phone-camera`, `file-import`, `glasses-ingest`, `glasses-browser`.

1. **Android-brillen die een browser draaien (RealWear, Vuzix e.d.)** — de PWA werkt direct op het apparaat. Maak een compacte **Glasses-UI** (`/veld/bril`): groot, hoog contrast, volledig spraakgestuurd (handsfree-modus uit 5.2), geen touch nodig.
2. **Camerabrillen die via de telefoon koppelen (bijv. Meta Ray-Ban via companion-app/SDK)** — bouw een **Ingest API**:
   - `POST /api/ingest/glasses` met device-token (per apparaat aangemaakt in instellingen, gehasht opgeslagen, intrekbaar).
   - Accepteert foto/video/audio + optionele metadata (tijd, GPS, heading, device-id).
   - Wordt automatisch gekoppeld aan de **actieve schouw** van de gebruiker aan wie het apparaat is gekoppeld; zonder actieve schouw → inbox "Niet-toegewezen captures".
   - Locatie ontbreekt? Match op tijd met de GPS-track van de telefoon.
3. **Bulk-import vanuit galerij / brilgeheugen** — drag & drop of bestandskiezer, meerdere bestanden, EXIF + tijdmatching, preview voor bevestigen.
4. **Simulator** — `/dev/glasses-simulator` (alleen voor admins) die de ingest-API aanroept met testmedia, zodat de keten aantoonbaar werkt.
5. Documenteer in `docs/SMART_GLASSES.md` hoe een native companion-app (iOS/Android) de Ingest API aanroept, inclusief voorbeeldrequest.

---

## 7. AI-verwerking

Alle AI-stappen draaien **asynchroon** via QStash-jobs (`ai_jobs` tabel met status, pogingen, fout, kosten-schatting). Idempotent. Resultaten altijd als **structured output** (Zod-schema → JSON schema). Nooit AI-tekst direct als eindtekst tonen zonder dat de gebruiker hem kan wijzigen.

### 7.1 Per capture
- **Foto** → vision-analyse:
  - `caption` (1 zin), `description` (uitgebreid), `tags[]`, `detected_objects[]`;
  - `possible_findings[]` (categorie, omschrijving, prioriteit, zekerheid 0-1);
  - `ocr_text` en **`nameplate`** (typeplaat-extractie: merk, type, serienummer, bouwjaar, spanning, vermogen, stroom, norm) indien zichtbaar;
  - `station_component` indien stationsfoto (zie 8);
  - `privacy_flags` (personen herkenbaar, kentekens zichtbaar).
- **Video** → keyframes door vision; audiospoor transcriberen (splits in chunks onder de API-limiet).
- **Audio** → transcriptie (Nederlands, met vaktermen als prompt/context: MS, LS, RMU, trafo, eindsluiting, mof, mantelbuis, gestuurde boring, KLIC, VIAG, etc.) → segmenten met tijden → koppeling aan captures in hetzelfde tijdvenster → extractie van bevindingen, metingen en acties uit de gesproken tekst.
- **Tekstnotities** → worden ongewijzigd meegenomen als bron.

### 7.2 Verslag-synthese
Eén job die alles combineert: template-doel, checklistantwoorden, captures + analyses, transcripties, notities, metingen, bevindingen, GPS-track, projectcontext, (bij stations) verwachte configuratie, (bij afrekening) afrekenposten.

Output (Zod-schema, strikt):
```
ReportDraft {
  title, summary (managementsamenvatting, max ~200 woorden),
  key_points[] { title, description, priority: hoog|midden|laag,
                 category: veiligheid|kwaliteit|planning|kosten|omgeving|vergunning|contract|techniek,
                 finding_ids[], capture_ids[] },
  sections[] { key, title, blocks[] (paragraph | photo {capture_id, caption} |
               photo_grid {capture_ids[]} | table {...} | map {bbox?} | checklist | finding_ref) },
  findings[] { id?, title, description, location {lat, lon}?, priority, category,
               capture_ids[], recommendation },
  actions[] { description, owner_suggestion, due_suggestion, finding_ids[] },
  station? { ...StationDescription (zie 8) },
  quantities? [ { post_code, found_quantity, unit, capture_ids[], confidence, remark } ],
  open_questions[] (dingen die AI niet zeker weet → gebruiker moet bevestigen)
}
```
Regels voor het model (in systeemprompt vastleggen):
- Alleen beweren wat uit bronnen blijkt; onzeker → in `open_questions` of lage `confidence`.
- Elke bewering over de installatie of hoeveelheden verwijst naar minstens één `capture_id`.
- Foto's worden geplaatst in de sectie waar ze inhoudelijk horen, niet als losse bijlage.
- Zakelijk, kort, Nederlands, geen marketingtaal.

### 7.3 Kwaliteitsbewaking
- Validatie van output tegen schema; bij fout → één retry met foutmelding als context.
- Controle dat alle `capture_ids` bestaan; onbekende IDs worden verwijderd en gelogd.
- Kosten- en tokenlog per job; rate limiting per organisatie (Upstash).
- AI-uitkomsten zijn zichtbaar gemarkeerd als "AI-voorstel" tot een gebruiker ze accepteert.

---

## 8. Module MS-stations

### 8.1 Stationobject
Velden: stationsnummer/-naam (netbeheerder-ID), adres, locatie, eigenaar (netbeheerder), stationstype (compact/prefab, inloopstation, maasstation, klantstation, wijkstation, schakelstation), behuizing (beton, kunststof, metselwerk, inpandig), bouwjaar, status (bestaand, nieuw, vervangen, gesaneerd). Historie van alle schouwen per station.

### 8.2 Begeleide shotlist stationsschouw (standaard, aanpasbaar)
Buitenkant:
1. Overzicht vanaf straat (met omgeving)
2. Vooraanzicht / deuren
3. Zij- en achterkant
4. Stationsnummer / naamplaat / waarschuwingsborden
5. Toegang, fundatie, afwerking maaiveld, beplanting
6. Kabelinvoer buitenzijde / kabelkelder-luik

Binnenkant:
7. Overzicht MS-ruimte
8. MS-installatie (RMU) totaaloverzicht
9. Typeplaat MS-installatie
10. Per veld: frontfoto (veldfunctie, aanduiding, beveiliging)
11. Kabelaansluitingen / eindsluitingen MS
12. Transformator overzicht
13. Typeplaat transformator
14. LS-rek / LS-verdeler overzicht
15. LS-groepen / zekeringen / aanduidingen
16. Kabelkelder / kabelinvoer binnenzijde / afdichting
17. Aarding (aardrail, aansluitingen)
18. Meet- en telecomvoorzieningen (RTU/distributieautomatisering, meters, KVK/koppeling)
19. Veiligheid (bord, blusmiddel, bedieningsmiddelen, schema aan de wand)
20. Eindafwerking / opgeruimd

### 8.3 Installatiebeschrijving (AI + handmatige correctie)
```
StationDescription {
  exterior { type, behuizing, staat, bereikbaarheid, opmerkingen, capture_ids[] },
  mv_switchgear { fabrikant, type, bouwjaar, serienummer, nominale_spanning_kv,
                  isolatiemedium (SF6/lucht/vast/olie), aantal_velden,
                  velden[] { positie, functie: kabel|trafo|koppel|meet|reserve,
                             aanduiding, beveiliging, kabel_aangesloten, capture_ids[] },
                  capture_ids[] },
  transformers[] { fabrikant, type, vermogen_kva, primair_kv, secundair_v,
                   schakelgroep, koeling, bouwjaar, serienummer, capture_ids[] },
  lv_board { type, aantal_groepen, groepen[] { nr, zekering_a, aanduiding }, capture_ids[] },
  cables { mv_eindsluitingen[], lv_kabels[], invoer_afdichting, capture_ids[] },
  earthing { beschrijving, capture_ids[] },
  automation { rtu, meters, communicatie, capture_ids[] },
  safety { aanwezig[], ontbrekend[], capture_ids[] },
  overall_condition: goed|redelijk|matig|slecht, remarks
}
```
Elk veld heeft een `source` (ai | handmatig | geïmporteerd) en `confidence`. Handmatige wijzigingen overschrijven AI en worden niet door een nieuwe AI-run overschreven.

### 8.4 As-built-check
- Per station kan een **verwachte configuratie** worden vastgelegd (uit ontwerp; handmatig of import CSV/JSON): verwacht type RMU, aantal/functie velden, trafovermogen, LS-groepen, etc.
- Vergelijking verwacht ↔ aangetroffen → tabel met `conform / afwijkend / niet vastgesteld`, met bewijsfoto per regel.
- Afwijkingen worden automatisch bevindingen (categorie `contract` of `techniek`).

### 8.5 Afrekenonderbouwing
- Project heeft afrekenposten (import uit Excel/CSV: postcode, omschrijving, eenheid, eenheidsprijs, geplande hoeveelheid; ook handmatig).
- AI stelt per schouw per post een **aangetroffen hoeveelheid** voor met bewijsfoto's (bijv. "1 st. RMU 3K+1T geplaatst", "3 st. MS-eindsluitingen", "1 st. trafo 630 kVA").
- Gebruiker bevestigt/wijzigt per regel → status `voorgesteld / bevestigd / afgewezen`.
- Overzicht per project: gepland vs. aangetoond vs. verschil, totaalbedragen.
- Export **Excel afrekenonderbouwing**: per post de hoeveelheden, bedragen, verwijzing naar fotonummers en schouwdatum; plus PDF-bijlage met de bewijsfoto's per post.

---

## 9. Backend (web) — schermen

1. **Dashboard** — recente schouwen, openstaande verslagen (status), open actiepunten, kaart met alle schouwen van de organisatie.
2. **Projecten** — lijst, filter, zoek. Projectpagina met tabs: Overzicht (kaart met projectgebied + alle schouwen), Schouwen, Stations, Bevindingen, Acties, Afrekenposten, Documenten (KLIC-import), Team, Instellingen.
3. **Schouwen** — lijst met filters (type, status, project, periode, schouwer, los/gekoppeld). Losse schouw koppelen aan project.
4. **Schouwdetail** met tabs:
   - **Kaart** — alle captures als markers (icoon per type), GPS-track als lijn, bevindingen als gekleurde markers (prioriteit), clustering. Klik marker → zijpaneel met foto (groot, swipebaar), tijd, RD- en WGS84-coördinaten, kijkrichting, AI-beschrijving, transcriptfragment, notities, gekoppelde bevindingen, link "toon in verslag". Omgekeerd: klik in verslag op foto → spring naar kaart.
   - **Tijdlijn** — alle captures en transcriptsegmenten chronologisch, afspeelbare audio/video.
   - **Media** — grid, filter op type/tag/shotlist, bulkacties (tag, koppel aan bevinding, verberg uit verslag), annotatie-editor.
   - **Bevindingen** — tabel + bewerken, prioriteit, categorie, status (open/in behandeling/opgelost), gekoppelde foto's.
   - **Acties** — eigenaar, deadline, status.
   - **Checklist** — antwoorden.
   - **Station** (indien van toepassing) — installatiebeschrijving (formulier, bewerkbaar), as-built-check.
   - **Afrekening** (indien van toepassing).
   - **Verslag** — zie 10.
5. **Stations** — lijst + kaart, stationspagina met historie en laatste installatiebeschrijving.
6. **Inbox niet-toegewezen captures** (smart glasses / import).
7. **Instellingen** — organisatie, gebruikers & rollen, schouwtemplates (editor), verslaghuisstijl (logo, kleuren, voettekst), apparaten (smart glasses tokens), AI-instellingen (aan/uit per stap), exportinstellingen.

### Rollen (Clerk Organizations + eigen rolveld)
- `admin` — alles, instellingen, templates, gebruikers.
- `projectleider` — projecten, verslagen goedkeuren, afrekening bevestigen.
- `schouwer` — schouwen uitvoeren en concept-verslag bewerken.
- `lezer` — alleen lezen; kan gedeelde verslagen bekijken.
- **Externe deellink** — alleen-lezen link naar een definitief verslag (token, verloopdatum, intrekbaar).

---

## 10. Verslag

### 10.1 Statusflow
`concept (AI-voorstel)` → `in bewerking` → `ter review` → `definitief` → (optioneel) `herzien` (nieuwe versie). Elke opslag = versie met auteur en tijd; verschillen tussen versies tonen; teruggaan naar vorige versie mogelijk. Definitief = vergrendeld, PDF gearchiveerd met hash.

### 10.2 Standaardopbouw
1. **Voorblad** — logo, titel, projectnaam/-nummer, opdrachtgever, schouwtype, datum/tijd, locatie/adres, schouwer(s), deelnemers, weer, versie, status.
2. **Samenvatting** — managementsamenvatting + tabel **belangrijkste aandachtspunten** (prioriteit-kleur, categorie, korte omschrijving, verwijzing naar bevinding en foto).
3. **Doel en scope** — uit template + aanvullingen.
4. **Overzichtskaart** — statische kaartafbeelding met genummerde fotolocaties, track en bevindingen (snapshot uit MapLibre, opgeslagen bij genereren).
5. **Bevindingen** — per locatie/tracédeel of per thema (instelbaar): tekst + foto's inline met fotonummer, bijschrift, coördinaten.
6. **Stationsbeschrijving** (indien station) — buitenkant, binnenkant, MS-installatie, trafo, LS, kabels, aarding, automatisering, veiligheid; met typeplaatfoto's en tabellen; as-built-check.
7. **Afrekenonderbouwing** (indien van toepassing).
8. **Actiepunten** — tabel wie/wat/wanneer.
9. **Checklist** — resultaten.
10. **Bijlagen** — fotoregister (alle foto's: nr, tijd, RD x/y, WGS84, richting, bijschrift), transcriptie (opvouwbaar in web, als bijlage in PDF), metingen, deelnemers + handtekeningen.

### 10.3 Editor
- TipTap met eigen nodes: `photo`, `photoGrid`, `mapSnapshot`, `findingRef`, `table`.
- Zijpaneel met alle foto's van de schouw: sleep foto's naar de juiste plek; verwijderen uit verslag ≠ verwijderen uit schouw.
- Per sectie "Opnieuw genereren met AI" (met optionele extra instructie), zonder handmatig bewerkte secties te overschrijven tenzij expliciet gekozen.
- Aandachtspunten-tabel is bewerkbaar (volgorde slepen, prioriteit wijzigen).
- Open vragen van AI worden bovenaan getoond als te-beantwoorden checklist.
- Live preview van de PDF.

### 10.4 Export
- PDF (huisstijl, paginanummers, inhoudsopgave, kop-/voettekst, fotonummering, kaart).
- Word (.docx) met dezelfde structuur.
- Excel: bevindingen, acties, fotoregister, afrekenonderbouwing.
- ZIP: alle originele media + metadata-JSON + PDF.
- GeoJSON-export van captures, track en bevindingen (voor GIS).

---

## 11. Datamodel en techniek

### 11.1 Tabellen (Drizzle, alle met `org_id`, `created_at`, `updated_at`, `created_by`)
- `organizations` (gesynchroniseerd met Clerk via webhook), `users`, `memberships` (rol)
- `projects` (nummer, naam, opdrachtgever, contractvorm, fase, gebied `geography(Polygon)`, status)
- `project_members`
- `inspection_templates`, `template_checklist_items`, `template_shots`, `template_sections`
- `inspections` (project_id nullable, template_id, station_id nullable, titel, status, start/eind, weer JSON, adres, startlocatie, device-info)
- `inspection_participants` (naam, organisatie, rol, handtekening-blob)
- `captures` (inspection_id nullable voor inbox, type, blob_url, thumb_url, mime, size, duur, `location geography(Point)`, accuracy, heading, rd_x, rd_y, captured_at, source, shot_id, tags[], note, sort, hidden_in_report, exif JSON, device_id)
- `capture_annotations` (JSON-tekening, gerenderde blob)
- `capture_analyses` (capture_id, model, JSON-resultaat, versie)
- `transcripts`, `transcript_segments` (start, eind, tekst, gekoppelde capture_ids)
- `gps_tracks` (inspection_id, `geography(LineString)`), `gps_points` (ruwe punten)
- `measurements`
- `checklist_answers`
- `findings` (+ `finding_captures`)
- `actions`
- `stations`, `station_descriptions` (per inspectie, JSON + veldbronnen), `station_expected_configs`, `asbuilt_checks`
- `billing_items` (afrekenposten per project), `billing_evidence` (post, inspectie, hoeveelheid, capture_ids, status, bevestigd_door)
- `reports`, `report_versions` (TipTap-JSON, auteur, status), `report_exports` (type, blob, hash)
- `share_links`
- `devices` (smart glasses, token-hash, gekoppelde gebruiker, laatst gezien)
- `ai_jobs` (type, status, pogingen, input-ref, output-ref, fout, tokens, kosten)
- `klic_imports` (optioneel: geüploade KLIC-levering, geparste leidingen als GeoJSON-laag op de kaart)
- `audit_log` (wie deed wat, wanneer, op welk object)

Indexen: GIST op alle geografievelden, btree op `org_id` + foreign keys.

### 11.2 Beveiliging & privacy
- Elke query scoped op `org_id` via een centrale helper; tests die bewijzen dat organisatie A geen data van B ziet.
- Middleware Clerk op alle app-routes; publieke routes alleen: deellinks, ingest (token), webhooks (signature check), QStash-callbacks (signature check).
- Blob-URL's niet raadbaar; media van definitieve verslagen via deellink alleen via server-proxy of signed URL.
- Rate limiting op uploads, AI en ingest.
- AVG: privacy-flags van AI zichtbaar; handmatige blur-tool (rechthoek vervagen) in de annotatie-editor; bewaartermijn per organisatie instelbaar; verwijderverzoek per schouw volledig uitvoerbaar.
- Audit-log op wijzigingen aan verslagen, afrekening en stationsdata.

### 11.3 Environment variables (`.env.example` volledig invullen met uitleg)
```
DATABASE_URL=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_WEBHOOK_SECRET=
BLOB_READ_WRITE_TOKEN=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
OPENAI_API_KEY=
OPENAI_MODEL_VISION=        # nieuwste model met vision + structured outputs (check docs)
OPENAI_MODEL_REPORT=        # nieuwste sterke redeneermodel met structured outputs
OPENAI_MODEL_TRANSCRIBE=    # nieuwste transcriptiemodel met goede NL-ondersteuning
APP_URL=
DEMO_MODE=false
```
Als `OPENAI_API_KEY` ontbreekt: app blijft werken, AI-stappen gaan naar status `overgeslagen` met duidelijke melding. In tests worden OpenAI-calls gemockt.

### 11.4 Mapstructuur (richtlijn)
```
src/
  app/(app)/...        backend-schermen
  app/(field)/veld/... mobiele veld-UI + /veld/bril
  app/api/...          route handlers (upload, ingest, jobs, export, webhooks)
  components/          ui, map, capture, report-editor
  db/                  schema, migrations, queries (org-scoped)
  lib/ai/              prompts, schemas, pipelines
  lib/geo/             proj4, pdok, exif, track-matching
  lib/export/          pdf, docx, xlsx, zip, geojson
  lib/offline/         dexie, sync-engine
  lib/capture-sources/ adapters (phone, import, glasses)
tests/                 unit + e2e
docs/
```

---

## 12. Seed- en demodata

`pnpm db:seed` maakt:
- Organisatie "Demo Infra BV" met 4 gebruikers (één per rol).
- Project "Netverzwaring Demo – 10 kV ring" met projectgebied rond Zwolle, afrekenposten (±15 posten: MS-kabel per m, gestuurde boring per m, mof, eindsluiting, RMU, trafo 400/630 kVA, LS-rek, herstel klinkers per m², etc.).
- Twee MS-stations met verwachte configuratie.
- Vier schouwen: tracéschouw (gekoppeld), stationsopleveringsschouw (gekoppeld), nulmeting (gekoppeld) en een losse calamiteitenschouw.
- Per schouw realistische captures met GPS langs een tracé (gebruik rechtenvrije placeholderafbeeldingen die je zelf genereert, bijv. SVG/PNG met label "Demo – typeplaat trafo"), transcripties, bevindingen, acties en een **uitgewerkt verslag** (definitief én een concept).
- Zo is elke functie zonder echte API-key te demonstreren.

---

## 13. Bouwfasen

1. **Fundament** — Next.js, Tailwind/shadcn, Clerk + organisaties, Drizzle + Neon + PostGIS, basislayout, CI (GitHub Actions), `.env.example`, `DECISIONS.md`.
2. **Datamodel + projecten + templates** — alle tabellen/migraties, org-scoping helper + tests, CRUD projecten, template-editor, seed templates uit sectie 4.
3. **Veld-app** — schouw starten (los/project), foto/video/audio/notitie/meting/schets/QR, GPS + track, checklist + shotlist, handsfree spraakcommando's, afronden.
4. **Offline & upload** — Dexie-queue, sync-engine, Vercel Blob client uploads (hervatbaar), PWA-installatie, tegelcache.
5. **Kaart** — MapLibre + PDOK, markers, clustering, track, zijpaneel, RD-coördinaten, projectgebied, KLIC-laag.
6. **AI-pipeline** — QStash-jobs, capture-analyse, transcriptie + koppeling, verslag-synthese, validatie, kostenlog.
7. **Verslag** — editor, versies, statusflow, secties hergenereren, open vragen, aandachtspunten.
8. **MS-stations** — stationobject, shotlist, installatiebeschrijving, as-built-check.
9. **Afrekening** — posten-import, bewijs koppelen, bevestigen, overzicht, export.
10. **Export & delen** — PDF, Word, Excel, ZIP, GeoJSON, deellinks.
11. **Smart glasses** — adapters, ingest-API, devices, inbox, bril-UI, simulator, docs.
12. **Afwerking** — dashboard, audit-log, AVG-functies, toegankelijkheid, performance (thumbnails, lazy loading), seed/demodata, documentatie, volledige e2e-testset.

---

## 14. Definition of Done

Alles hieronder moet aantoonbaar werken (e2e-test of handmatig gedocumenteerd in `docs/TESTREPORT.md`):

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm build` slagen; CI groen.
- [ ] Losse schouw starten, vastleggen, afronden, later aan project koppelen.
- [ ] Schouw vanuit project starten; verschijnt op projectkaart.
- [ ] Foto, video, audio, notitie, meting, schets en QR-scan leggen allemaal een capture vast met locatie en tijd.
- [ ] Volledige schouw offline uitvoerbaar; na online komen synchroniseert alles zonder dataverlies.
- [ ] Transcriptie wordt gekoppeld aan foto's uit hetzelfde tijdvenster.
- [ ] AI maakt een verslagvoorstel volgens schema, met foto's in de juiste secties en een samenvatting met aandachtspunten.
- [ ] Verslag bewerkbaar, foto's verslepen, secties hergenereren zonder handwerk te verliezen, versies terugzetten, statusflow tot definitief.
- [ ] Kaart toont alle foto's; klik opent info; vanuit verslag naar kaart en terug.
- [ ] Stationsschouw met begeleide shotlist, typeplaat-extractie, bewerkbare installatiebeschrijving en as-built-check.
- [ ] Afrekenposten importeren, bewijs uit schouw koppelen, bevestigen, Excel + PDF onderbouwing exporteren.
- [ ] PDF, Word, Excel, ZIP en GeoJSON export werken met de demodata.
- [ ] Smart glasses: ingest via token werkt (simulator), captures landen in actieve schouw of inbox, bril-UI volledig met spraak te bedienen.
- [ ] Organisatie-isolatie getest; rollen afgedwongen; deellink werkt en is intrekbaar.
- [ ] App werkt zonder OpenAI-key (AI overgeslagen, rest werkt).
- [ ] Demodata laat alle functies zien.
- [ ] README, ARCHITECTURE, USER_GUIDE, SMART_GLASSES, DECISIONS en TESTREPORT zijn compleet.

Pas als alle vinkjes staan, ben je klaar. Rapporteer dan kort: wat gebouwd is, welke keuzes je hebt gemaakt, en welke env vars ik moet invullen om naar productie te gaan.
