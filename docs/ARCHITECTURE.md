# Architectuur

Dit document beschrijft hoe InfraSchouw is opgebouwd. Keuzes met hun reden en alternatief staan in [DECISIONS.md](DECISIONS.md).

## Overzicht

```
┌──────────────── Browser / PWA ────────────────┐        ┌──────────────── Vercel (Node.js) ─────────────────┐
│ Backend-UI (server components, /projecten …)  │  RSC   │ App Router pagina's + server actions               │
│ Veld-app /veld, /veld/bril (client-only)      │◄──────►│ API-routes (/api/*): sync, upload, media, exports, │
│   Dexie (IndexedDB): schouwen, captures,      │  JSON  │   ingest, jobs, cron, webhooks                     │
│   outbox, blobs, tegels                       │        │ Drizzle ─► Neon Postgres + PostGIS                 │
│ Service worker (Serwist): app-shell, tegels,  │        │ Vercel Blob (private)   Upstash Redis (rate limit) │
│   Background Sync met dezelfde sync-engine    │        │ QStash ─► /api/jobs/run ─► OpenAI                  │
└───────────────────────────────────────────────┘        └────────────────────────────────────────────────────┘
        ▲ Ingest API (device-token)                                ▲ Clerk (auth + Organizations, webhook)
        └── companion-app / simulator                              └── PDOK WMTS (kaarttegels, ook server-side)
```

## Mappenstructuur

```
src/
  app/
    (app)/            backend: dashboard, projecten, schouwen, stations, inbox, instellingen, dev/glasses-simulator
    (field)/veld/     veld-app (/veld) en bril-UI (/veld/bril), volledig client-side
    delen/[token]/    publieke verslagweergave via deellink
    api/              route handlers (zie tabel hieronder)
    demo-login, configuratie, sign-in, sign-up, manifest.ts
  components/         UI per domein (field, map, report-editor, inspections, stations, billing, settings …)
  db/                 schema.ts (Drizzle), client.ts, scope.ts (org-scoping), queries/, migrations/
  lib/
    auth/             sessie (Clerk of demo), rollen, requireSession/requireCtx
    ai/               OpenAI-client, schema's, prompts, jobs (enqueue/dispatch/runner/sweep), processors/
    capture-sources/  adapterlaag: phone-camera, glasses-browser, file-import, glasses-ingest
    offline/          Dexie-database, outbox, uploads, sync-engine, veldstore
    sync/             ops.ts (Zod-schema's per operatie) en apply.ts (server-side toepassen)
    geo/              RD-conversie, PDOK, track-matching, EXIF, weer, KLIC-parser
    station/          installatiebeschrijving-schema, typeplaat-merge, as-built-vergelijking
    report/           verslagdocument (TipTap-JSON), opbouw, versies, diff
    export/           PDF (react-pdf), Word (docx), Excel (exceljs), ZIP, GeoJSON, statische kaart
    billing/, templates/, voice/, media/
  sw/sw.ts            service worker
  proxy.ts            route-bescherming (Next 16-naam voor middleware)
scripts/              migrate, seed (demo), demo-assets, fix-migrations
tests/                unit/, integration/, e2e/, support/
```

## Authenticatie, organisaties en rollen

- **Twee modi.** Met Clerk-sleutels: Clerk + Organizations; de actieve Clerk-organisatie bepaalt de InfraSchouw-organisatie. Zonder Clerk en met `DEMO_MODE=true`: demo-login met een httpOnly-cookie. `src/lib/auth/session.ts` levert in beide gevallen dezelfde `Session { user, org, role }`.
- **Rollen** (`admin > projectleider > schouwer > lezer`) staan in de eigen tabel `memberships`. `requireSession(minRole)` roept `forbidden()` aan (HTTP 403, `app/forbidden.tsx`); API-routes gebruiken `withSession(minRole)` en geven 401/403 als JSON.
- **Proxy** (`src/proxy.ts`) stuurt niet-ingelogde bezoekers van pagina's naar inloggen. API-routes worden niet omgeleid: die controleren zelf de sessie, het device-token, de QStash-handtekening, de share-token of het cron-secret.
- **Clerk-webhook** (`/api/webhooks/clerk`, `verifyWebhook`) houdt users, organisaties en lidmaatschappen synchroon.

## Datamodel en organisatie-isolatie

Alle tabellen uit de opdracht (§11.1) staan in `src/db/schema.ts`. Elke tabel behalve `users` heeft `org_id`. Geografische kolommen (`geography(Point|LineString|MultiPolygon, 4326)`) zijn *generated columns* uit `lat`/`lon` of GeoJSON, met GIST-indexen. RD-coördinaten (EPSG:28992) worden bij het opslaan berekend.

Isolatie is op twee niveaus afgedwongen:

1. **Query-niveau.** Alle toegang loopt via `orgWhere(table, ctx)` en `scoped(ctx)` (`src/db/scope.ts`). Die voegen `org_id = ctx.orgId` toe aan elke select/update/delete en zetten `org_id` bij insert. Verwijzingen naar records van een andere organisatie leveren `ForbiddenError`/`NotFoundError` op.
2. **Opslag-niveau.** Blob-paden beginnen met `orgs/<orgId>/`. Media worden alleen geserveerd via `/api/media/[id]` en `/api/files?u=`, die controleren of het pad bij de organisatie van de sessie of de deellink hoort (`belongsToOrg`).

`tests/integration/org-isolation.test.ts` toont aan dat organisatie B niets van A kan lezen, wijzigen, koppelen of synchroniseren.

## Veld-app en offline

De veld-app (`/veld`) rendert volledig in de browser vanuit IndexedDB (Dexie, `src/lib/offline/db.ts`) en navigeert via de History API. Na één online bezoek werkt ze ook na een herstart zonder netwerk.

- **Bootstrap.** `/api/field/bootstrap` levert templates, projecten, stations en verwachte configuraties. Die worden lokaal opgeslagen en bij elke online start ververst.
- **Vastleggen.** Elke actie (schouw starten, capture, bevinding, meting, checklistantwoord, GPS-punten, afronden) schrijft eerst naar IndexedDB en zet een **operatie in de outbox**. Media-bestanden gaan als Blob in IndexedDB. Thumbnails, videokeyframes en de eerste compressie gebeuren client-side.
- **Operaties** (`src/lib/sync/ops.ts`) zijn idempotent: client-UUID's als primaire sleutel, upserts op de server, en per operatie een Zod-schema.
- **Sync-engine** (`src/lib/offline/sync-engine.ts`) verwerkt de outbox strikt FIFO onder een Web Lock. Media upload hij eerst: in Blob-modus rechtstreeks naar Vercel Blob via een client-token (`/api/upload`), in lokale modus via `/api/upload/local`. Daarna volgt de operatie naar `/api/sync`. Bij een netwerk- of tijdelijke serverfout stopt hij en probeert later opnieuw met exponentiële backoff (de volgorde blijft intact). Een permanente fout, bijvoorbeeld een validatiefout, markeert de operatie als *mislukt* en toont die in de UI, zodat de wachtrij niet vastloopt. Dezelfde engine draait in de service worker via **Background Sync**, zodat uploads doorgaan als de app gesloten is.
- **Service worker** (`src/sw/sw.ts`, Serwist): precache van de app-shell, network-first voor `/veld*`, cache-first voor PDOK-tegels. Via *Gebied offline beschikbaar maken* haalt de app tegels voor het projectgebied vooraf op: BRT op zoom 12–18 (max. 3000 tegels) en luchtfoto op zoom 14–17 (max. 1500).
- **Server** (`src/lib/sync/apply.ts`) past elke operatie in een transactie toe, controleert org en rechten, berekent RD-coördinaten, koppelt captures zonder GPS op tijd aan de GPS-track (`track-matching.ts`) en start na upload de AI-verwerking.

## Capture-bronnen (adapterlaag)

`src/lib/capture-sources/types.ts` definieert `CaptureSource`. Implementaties:

| Bron | Waar | Werking |
|---|---|---|
| `phone-camera` | client | `getUserMedia` / file-input fallback, EXIF, GPS en kompas |
| `glasses-browser` | client | dezelfde camera-API op Android-brillen, spraakbediening |
| `file-import` | client + server | bulk-import met EXIF en tijdmatching op de track, preview vóór bevestigen |
| `glasses-ingest` | server | Ingest API met device-token (zie [SMART_GLASSES.md](SMART_GLASSES.md)) |

Alle bronnen komen samen in `persist.ts#upsertCapture`, zodat nummering, RD-coördinaten, track-matching en AI-enqueue overal gelijk zijn.

## AI-pipeline

```
capture geüpload ─► capture_analysis (vision: beschrijving, objecten, typeplaat-OCR, meterstanden)
audio geüpload   ─► transcription (chunks via ffmpeg, segmenten met tijd, koppeling aan captures binnen het segment ±15 s)
schouw afgerond  ─► report_synthesis (wacht op openstaande capture-jobs; verslag volgens schema)
gebruiker        ─► section_regeneration (één sectie, met optionele instructie)
```

- **Jobs** staan in `ai_jobs` met een unieke `idempotency_key`, status, pogingen, tokens en kosten. `dispatchJob` gebruikt QStash (ondertekende callback naar `/api/jobs/run`, 3 retries) als dat is geconfigureerd, anders Next.js `after()`, en buiten een request inline. De cron `/api/cron/ai-sweep` pakt vastgelopen of wachtende jobs opnieuw op.
- **Structured outputs.** Elke aanroep gebruikt de Responses API met `zodTextFormat`. Het antwoord wordt opnieuw met Zod gevalideerd; bij een fout volgt één herkansing met de validatiefout in de prompt (`structured.ts`). Onbekende capture- of bevinding-ID's die het model noemt, worden weggefilterd, zodat het verslag nooit naar niet-bestaande foto's verwijst.
- **Verslag-synthese** krijgt de template-secties, bevindingen, metingen, checklist, transcriptsegmenten, stationsgegevens en per foto een compacte beschrijving plus (tot een limiet) de afbeelding zelf. De uitkomst wordt omgezet naar een TipTap-document met eigen nodes: `reportSection`, `photo`, `photoGrid`, `mapSnapshot`, `findingRef` en `dataBlock`. AI-inhoud krijgt een markering tot de gebruiker die accepteert.
- **Handwerk beschermen.** Per sectie wordt een hash van de AI-versie bewaard (`meta.sections[key].aiHash`). Wijkt de huidige inhoud af, dan is de sectie handmatig bewerkt: automatisch hergenereren slaat haar over, en handmatig hergenereren vraagt eerst om bevestiging.
- **Zonder OpenAI-sleutel** krijgen jobs status *overgeslagen*. `ensureBaselineReport` bouwt dan een verslag uit de ruwe schouwgegevens (secties, foto's per bevinding, tabellen), zodat de rest van de keten blijft werken.
- **Kosten** worden per job berekend uit tokengebruik (`cost.ts`) en zijn zichtbaar onder *Instellingen → AI*, waar je elke stap ook per organisatie aan of uit zet.

## Verslag, versies en status

- `reports` bevat de actuele status. Elke opslag maakt een nieuwe rij in `report_versions` met het volledige document, de meta, de auteur en een notitie. Terugzetten maakt een nieuwe versie met de oude inhoud, dus de geschiedenis blijft compleet. `diff.ts` vergelijkt versies per sectie.
- Statusflow: `concept → in_bewerking → ter_review → definitief`, met terugweg naar bewerking (`REPORT_TRANSITIONS` in `domain.ts`). Rechten per overgang: een schouwer mag tot *ter review*; alleen projectleider en admin maken definitief.
- **Definitief** vergrendelt het verslag. De PDF wordt gegenereerd, in Blob gearchiveerd met een SHA-256-hash (`report_exports`) en geauditeerd. Latere exports van die versie leveren exact het gearchiveerde bestand.
- **Deellinks.** Een willekeurig token, waarvan alleen de SHA-256-hash is opgeslagen, met een vervaldatum; intrekbaar. `/delen/[token]` toont de HTML-weergave, en media en PDF gaan via `/api/share/[token]/…`. Een ingetrokken of verlopen link geeft 404.

## Kaart

MapLibre GL met PDOK WMTS (BRT-Achtergrondkaart en Luchtfoto) en een eigen RD-coördinaatweergave. Markers zijn HTML-elementen, met supercluster voor clustering en de kijkrichting als pijl. Verder: lagen voor GPS-track, bevindingen, stations, projectgebied en KLIC (GML-import, `geo/klic.ts`). De MapLibre-worker wordt als statisch bestand vanaf `/maplibre/` geladen (`setWorkerUrl`); de gebundelde blob-worker laadde niet onder Turbopack.

Voor PDF en Word stelt `export/static-map.ts` server-side een statische kaart samen uit dezelfde PDOK-tegels (sharp), met track, genummerde fotolocaties en bevindingen.

## Exports

| Formaat | Module | Inhoud |
|---|---|---|
| PDF | `export/pdf.tsx`, `report-pdf.ts` | huisstijl, voorblad, inhoudsopgave met paginanummers (twee render-passes), hoofdstukken, foto's met nummer/tijd/RD, kaart, tabellen, bijlagen |
| Word | `export/docx.ts` | zelfde structuur, bewerkbaar |
| Excel | `export/xlsx.ts` | tabbladen captures, bevindingen, acties, metingen, checklist, afrekenposten |
| ZIP | `export/zip.ts` | originele media met leesbare namen + `metadata.csv` + PDF |
| GeoJSON | `export/geojson.ts` | captures, bevindingen, track, stations met alle eigenschappen |
| Afrekening | `export/billing.ts` | Excel + PDF-onderbouwing per post met bewijsfoto's |

Exports draaien in route handlers (`/api/exports/…`) met `maxDuration` en worden geauditeerd.

## API-routes

| Route | Auth | Doel |
|---|---|---|
| `POST /api/sync`, `GET /api/sync/status` | sessie (schouwer+) | outbox-operaties toepassen |
| `GET /api/field/bootstrap` | sessie | templates/projecten/stations voor de veld-app |
| `POST /api/upload`, `/api/upload/local`, `GET /api/upload/config` | sessie | client-uploads naar Blob of lokaal |
| `GET /api/media/[id]`, `GET /api/files` | sessie of share-token | geautoriseerde media, met Range-support voor video |
| `POST /api/import` | sessie | bulk-import in de backend (naar schouw of inbox) |
| `/api/reports/[id]/{state,preview,snapshot,static-map}` | sessie | editorstatus, live PDF-voorbeeld, kaartsnapshot |
| `GET /api/exports/inspections/[id]/[format]`, `/api/exports/projects/[id]/[format]` | sessie | exports |
| `POST/GET /api/ingest/glasses`, `/uploads`, `/uploads/local` | device-token | smart-glasses-ingest |
| `GET /api/share/[token]/{pdf,map}` | share-token | publieke verslagbestanden |
| `POST /api/jobs/run` | QStash-handtekening | AI-job uitvoeren |
| `GET /api/cron/{ai-sweep,retention}` | `CRON_SECRET` | onderhoud |
| `POST /api/webhooks/clerk` | Svix-handtekening | Clerk-sync |

## Beveiliging

- Autorisatie per request (rol + org) en per record (org-scoping). Server actions gebruiken `safeAction` met `requireCtx(minRole)` en Zod-validatie.
- **Rate limiting** (Upstash of in-memory) op sync, upload, media, ingest, import, exports, PDF-voorbeeld en deellink-bestanden.
- **Tokens** (device, deellink) zijn willekeurig, alleen gehasht opgeslagen, intrekbaar en worden eenmalig getoond.
- **Uploads**: MIME-allowlist, maximale grootte, veilige padnamen (`isSafePathname`), private Blob.
- **Headers** (`next.config.ts`): `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` en `Permissions-Policy` (camera, microfoon en geolocatie alleen op eigen origin). HSTS wordt door Vercel gezet.
- **Audit log** voor aanmaken, wijzigen, verwijderen, statusovergangen, exports, deellinks, apparaten en rolwijzigingen (*Instellingen → Audit*).
- **Privacy (AVG)**: configureerbare bewaartermijn (dagelijkse cron), volledig verwijderen van een schouw inclusief bestanden, en gezichten/kentekens vervagen in de annotatie-editor.

## Tests

| Laag | Tool | Wat |
|---|---|---|
| Unit | Vitest | RD-conversie, tegels, track-matching, EXIF, KLIC-parser, typeplaat-merge, as-built, spraakcommando's, afrekenimport, verslagopbouw/diff, sync-engine (fake-indexeddb) |
| Integratie | Vitest + echte Postgres | org-isolatie, sync-apply (idempotentie, volgorde), AI-pipeline met MSW-mock van OpenAI (structured outputs, retry, pruning, overslaan zonder sleutel) |
| E2E | Playwright (Chromium, nep-camera/microfoon, geolocatie Zwolle) | alle DoD-scenario's, zie [TESTREPORT.md](TESTREPORT.md) |
