# Testrapport

**Datum:** 2026-09-27 · **Commit:** zie `git log` (branch `main`, gespiegeld naar `develop`)
**Omgeving:** macOS, Node 20.19, Chromium (Playwright). Database: Neon Postgres 18 + PostGIS 3.6 (eu-central-1).
**Configuratie:** `DEMO_MODE=true`, **zonder** Clerk, OpenAI, Vercel Blob, Upstash en QStash. Alle tests draaien daarmee op de terugvalpaden (demo-login, AI overgeslagen, lokale opslag, in-memory rate limit, `after()`). De AI-pipeline zelf is getest met een MSW-mock van de OpenAI API.

## Resultaat van de volledige keten

```
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e && pnpm build   → exit 0
```

| Stap | Resultaat |
|---|---|
| `pnpm typecheck` | 0 fouten (incl. gegenereerde route-types) |
| `pnpm lint` | 0 fouten, 0 waarschuwingen |
| `pnpm test` | 10 bestanden, **68 tests geslaagd** (unit + integratie tegen Neon) |
| `pnpm test:e2e` | **18 geslaagd**, 1 overgeslagen (`screens.spec.ts`: alleen screenshots maken, met `SCREENSHOT_DIR`) · 1,1 min |
| `pnpm build` | geslaagd |

## Definition of Done (§14)

| # | Eis | Status | Bewijs |
|---|---|---|---|
| 1 | typecheck, lint, test, test:e2e en build slagen; CI groen | ✅ lokaal · ⚠️ CI | Zie hierboven. `.github/workflows/ci.yml` staat klaar, maar de repository heeft nog geen GitHub-remote, dus CI heeft nog niet gedraaid. Zet na het pushen het secret `DATABASE_URL_TEST` (aparte Neon-branch) voor integratie- en e2e-tests. |
| 2 | Losse schouw starten, vastleggen, afronden, later aan project koppelen | ✅ | e2e `field-offline.spec.ts` › *losse schouw volledig offline vastleggen, afronden, synchroniseren en later aan project koppelen* |
| 3 | Schouw vanuit project starten; verschijnt op projectkaart | ✅ | e2e `project-inspection.spec.ts` (knop *Schouw starten* → veld-app met project → foto → sync → staat in projecttab *Schouwen* en als marker op de projectkaart) |
| 4 | Foto, video, audio, notitie, meting, schets en QR-scan leggen elk een capture vast met locatie en tijd | ✅ | e2e `field-offline.spec.ts` legt alle zeven types vast (nep-camera/microfoon, geolocatie Zwolle) en controleert na sync ≥ 8 media op de server; integratie `sync.test.ts` controleert opslag van locatie, RD en tijd |
| 5 | Volledige schouw offline uitvoerbaar; na online synchroniseert alles zonder dataverlies | ✅ | e2e `field-offline.spec.ts` (`context.setOffline(true)` vanaf de start, wachten tot `data-pending="0"`); unit `sync-engine.test.ts` (volgorde, offline vasthouden, geen duplicaten, retry, backoff); integratie `sync.test.ts` (replay idempotent) |
| 6 | Transcriptie gekoppeld aan foto's uit hetzelfde tijdvenster | ✅ | integratie `ai-pipeline.test.ts` (transcriptsegmenten ↔ capture-id's); unit `geo.test.ts` › *links captures to transcript windows with padding*; e2e `map-report.spec.ts` › *tijdlijn … gekoppeld aan foto's* |
| 7 | AI maakt verslagvoorstel volgens schema, foto's in de juiste secties, samenvatting met aandachtspunten | ✅ (mock) | integratie `ai-pipeline.test.ts` › *analyseert foto's, transcribeert, koppelt aan foto's en maakt een verslagvoorstel volgens schema* (MSW-mock met structured output; onbekende capture-id's worden weggefilterd); unit `report.test.ts` › *builds from an AI draft …* |
| 8 | Verslag bewerkbaar, foto's verslepen, secties hergenereren zonder handwerk te verliezen, versies terugzetten, statusflow tot definitief | ✅ | e2e `report-workflow.spec.ts` › *foto slepen, opslaan als versie, versie terugzetten* en › *statusflow tot definitief …*; unit `report.test.ts` › *regeneration keeps manually edited sections unless forced* |
| 9 | Kaart toont alle foto's; klik opent info; vanuit verslag naar kaart en terug | ✅ | e2e `map-report.spec.ts` › *kaart toont alle foto's; klik opent info; van kaart naar verslag en terug* (15 op kaart, zijpaneel met RD/WGS84/kijkrichting, *Toon in verslag*, foto → kaart) |
| 10 | Stationsschouw met begeleide shotlist, typeplaat-extractie, bewerkbare installatiebeschrijving en as-built-check | ✅ | e2e `station-billing.spec.ts` › *stationsschouw …* (shotlist met ontbrekende verplichte foto's, typeplaat overnemen, as-built → afwijking wordt bevinding); unit `station.test.ts` (merge zonder handwerk te overschrijven, as-built, import verwachte configuratie). De typeplaat-*extractie* door AI is getest met de mock; de demo bevat vooraf ingevulde extractieresultaten. |
| 11 | Afrekenposten importeren, bewijs koppelen, bevestigen, Excel + PDF exporteren | ✅ | e2e `station-billing.spec.ts` › *afrekenposten importeren, bewijs koppelen, bevestigen en exporteren*; unit `billing.test.ts` |
| 12 | PDF, Word, Excel, ZIP en GeoJSON export met de demodata | ✅ | e2e `exports-glasses-security.spec.ts` › *PDF, Word, Excel, ZIP en GeoJSON export met de demodata* (content-type, grootte, `%PDF-`, ≥ 10 GeoJSON-features). Visueel gecontroleerd: PDF met inhoudsopgave en paginanummers per hoofdstuk, kaart, fotonummers. |
| 13 | Smart glasses: ingest via token (simulator), captures in actieve schouw of inbox, bril-UI volledig met spraak | ✅ | e2e › *smart glasses: simulator stuurt via token naar de ingest-API …* (201, inbox, toewijzen); › *ingest-API weigert ongeldig of ingetrokken token* (401); › *bril-UI is volledig met spraak te bedienen: schouw starten, vastleggen, afronden* (Web Speech API vervangen door een nep-herkenner die zinnen aflevert). Toewijzing aan een lopende schouw: `activeInspectionFor`, zichtbaar via de simulator-knop *Status*. |
| 14 | Organisatie-isolatie getest; rollen afgedwongen; deellink werkt en is intrekbaar | ✅ | integratie `org-isolation.test.ts` (8 tests) en `sync.test.ts` › *weigert … van een andere organisatie*, › *lezers kunnen niets synchroniseren*; e2e › *rollen worden afgedwongen* (lezer: 403 op instellingen en sync, 401 zonder sessie) en `projects.spec.ts` › *lezer kan geen project aanmaken*; e2e *statusflow …* opent de deellink anoniem, downloadt de PDF, trekt de link in en krijgt daarna 404 |
| 15 | App werkt zonder OpenAI-key | ✅ | De hele e2e-suite draait zonder OpenAI-sleutel. Integratie › *werkt zonder OpenAI-sleutel: stappen overgeslagen, basisverslag gemaakt*; e2e › *zonder OpenAI-sleutel: geen hergenereerknop, verslag en PDF-export werken* |
| 16 | Demodata laat alle functies zien | ✅ | e2e `demo-data.spec.ts` › *demodata laat alle functies zien* (4 schouwen in alle verslagstatussen, definitief verslag met deellink, kaart, station met as-built, afrekening met bewijs, stations, KLIC, inbox, brilapparaat). `pnpm db:seed` duurt ± 8 s. |
| 17 | README, ARCHITECTURE, USER_GUIDE, SMART_GLASSES, DECISIONS en TESTREPORT compleet | ✅ | `README.md`, `docs/ARCHITECTURE.md`, `docs/USER_GUIDE.md`, `docs/SMART_GLASSES.md`, `docs/DECISIONS.md`, dit document |

## Wat niet automatisch getest is (handmatig te doen bij livegang)

| Onderwerp | Waarom niet | Wat te controleren |
|---|---|---|
| Echte OpenAI-aanroepen | geen API-sleutel in deze omgeving | Zet `OPENAI_API_KEY` en rond de demo-nulmeting opnieuw af (*AI-stappen opnieuw*). Controleer kwaliteit en kosten onder *Instellingen → AI*. Beschikbaarheid van de standaardmodellen voor je account: zie DECISIONS #17. |
| Clerk-login en webhook | geen Clerk-sleutels | Inloggen, organisatie wisselen, eerste admin, webhook-events (user/org/membership) |
| Vercel Blob, QStash, Upstash | geen accounts; terugvalpaden wél getest | Upload van een grote video (client-upload + presigned bril-upload), QStash-callback `/api/jobs/run`, rate limiting over instanties |
| Echte spraakherkenning | Web Speech API is in headless Chromium niet beschikbaar; getest met een nep-herkenner | Handsfree op Android (Chrome) en op een RealWear/Vuzix; Nederlandse herkenning van getallen en eenheden |
| iOS Safari / geïnstalleerde PWA | alleen Chromium in e2e | Camera, Background Sync (iOS kent geen Background Sync: sync gebeurt dan bij het openen van de app), installatie |
| Fysieke Meta Ray-Ban + companion-app | geen hardware | Voorbeeldrequests in SMART_GLASSES.md |
| Vercel-deploy en cron | geen deploy uitgevoerd | `/configuratie` na deploy; cron-logs van `ai-sweep` en `retention` |

## Bekende meldingen

- `[WebServer] ⨯ Error: The destination stream closed early` in de e2e-log: dit gebeurt wanneer de browser een lopende media-stream afbreekt (bijv. navigeren tijdens het laden van een video met Range-requests). Onschadelijk.
- De e2e-tests draaien tegen de productiebuild (`pnpm start`, poort 3200). Draai dus `pnpm build` vóór `pnpm test:e2e`. De globalSetup seedt de demodata opnieuw.
