# InfraSchouw

Webapp + PWA voor schouwen in ondergrondse infraprojecten (kabels & leidingen, MS-netten, MS-stations).
Schouwers leggen in het veld foto's, video, spraak, notities, metingen, schetsen, scans en bevindingen vast — ook volledig offline en met smart glasses. Na afloop stelt AI een schouwverslag voor, dat de projectleider in de backend controleert, bewerkt, definitief maakt, exporteert (PDF, Word, Excel, ZIP, GeoJSON) en deelt via een intrekbare link.

| Document | Inhoud |
|---|---|
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Handleiding voor schouwers en projectleiders |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Opbouw, datastromen, offline-sync, AI-pipeline, beveiliging |
| [docs/SMART_GLASSES.md](docs/SMART_GLASSES.md) | Brillen, Ingest API en voorbeeldrequests voor een companion-app |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Alle keuzes die niet in de opdracht vastlagen |
| [docs/TESTREPORT.md](docs/TESTREPORT.md) | Definition of Done met bewijs per punt |
| [BUILD_PROMPT.md](BUILD_PROMPT.md) | De oorspronkelijke bouwopdracht |

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 5.9 · Tailwind 4 + shadcn/ui · Drizzle ORM op Neon Postgres + PostGIS · Clerk (Organizations) · Vercel Blob (private) · Upstash Redis + QStash · OpenAI (vision, verslag, transcriptie) · MapLibre GL met PDOK-kaarten · TipTap-editor · Serwist (service worker) + Dexie (IndexedDB) · @react-pdf/renderer, docx, exceljs · Vitest + MSW, Playwright.

## Lokaal installeren

Vereisten: Node.js ≥ 20.9, pnpm 9, een Postgres-database met PostGIS (bijv. een gratis Neon-project).

```bash
pnpm install                     # kopieert ook de MapLibre-worker naar public/maplibre
cp .env.example .env.local       # vul minimaal DATABASE_URL in, en DEMO_MODE=true
pnpm db:migrate                  # maakt schema + PostGIS-extensie aan
pnpm db:seed                     # demo-organisatie, gebruikers, project, 4 schouwen (± 10 s)
pnpm dev                         # http://localhost:3000
```

Met `DEMO_MODE=true` en zonder Clerk-sleutels log je in via **/demo-login** door een demogebruiker te kiezen:

| Gebruiker | Rol | Gebruik |
|---|---|---|
| Anne de Vries | admin | instellingen, apparaten, simulator |
| Pieter Jansen | projectleider | projecten, verslagen definitief maken, afrekening |
| Sanne Bakker | schouwer | veld-app (`/veld`), verslag bewerken |
| Lars Visser | lezer | alleen inzien en exporteren |

De veld-app staat op **/veld** (telefoon/tablet, installeerbaar als PWA) en **/veld/bril** (spraakgestuurde bril-UI).

### Overige scripts

| Script | Doel |
|---|---|
| `pnpm typecheck` / `pnpm lint` | Typecontrole (incl. route-types) en ESLint |
| `pnpm test` | Unit- en integratietests (Vitest). Integratietests draaien tegen `DATABASE_URL` en maken eigen testorganisaties aan; zonder database worden ze overgeslagen |
| `pnpm test:e2e` | Playwright tegen `pnpm start` op poort 3200; seedt eerst de demodata. Draai `pnpm build` vooraf |
| `pnpm build` | Productiebuild |
| `pnpm db:generate` | Nieuwe migratie uit `src/db/schema.ts` (+ PostGIS-correctie) |
| `pnpm demo:assets` | Hergenereert de demomedia in `public/demo` (foto's van Wikimedia Commons, bronvermelding in `public/demo/CREDITS.md`) |

## Omgevingsvariabelen

Alle variabelen staan met uitleg in [.env.example](.env.example). Alleen `DATABASE_URL` is strikt verplicht; elke andere integratie heeft een nette terugval.

| Variabele | Productie | Zonder deze variabele |
|---|---|---|
| `DATABASE_URL` | **verplicht** — Neon *pooled* URL, `sslmode=verify-full` | app start niet |
| `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | **verplicht** | alleen demo-modus mogelijk |
| `CLERK_WEBHOOK_SECRET` | **verplicht** — endpoint `/api/webhooks/clerk` | gebruikers/orgs worden alleen bij eerste login aangemaakt |
| `BLOB_READ_WRITE_TOKEN` | **verplicht** — *private* Blob store | opslag op lokale schijf (`.data/uploads`), niet geschikt voor Vercel |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | aanbevolen | rate limiting in geheugen per instantie |
| `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` | aanbevolen | AI-jobs draaien via `after()` na de response; de cron-sweep vangt achterblijvers op |
| `OPENAI_API_KEY` | aanbevolen | AI-stappen krijgen status "overgeslagen"; er wordt een basisverslag uit de schouwgegevens gemaakt |
| `OPENAI_MODEL_VISION`, `OPENAI_MODEL_REPORT`, `OPENAI_MODEL_TRANSCRIBE` | optioneel | standaard `gpt-6-luna`, `gpt-6-astra`, `gpt-4o-transcribe-diarize` |
| `APP_URL` | **verplicht** — publieke URL, bijv. `https://schouw.example.nl` | QStash-callbacks en lokale upload-URL's kloppen niet |
| `CRON_SECRET` | **verplicht** | cron-routes weigeren elk verzoek |
| `DEMO_MODE` | **`false`** | — |
| `DATABASE_POOL_MAX` | optioneel (standaard 5) | — |

## Deploy naar Vercel

1. **Database** — Neon-project in `eu-central-1`, kopieer de *pooled* connection string. Draai eenmalig lokaal of in CI: `DATABASE_URL=… pnpm db:migrate`. Seed **niet** in productie (de seed maakt een demo-organisatie).
2. **Clerk** — maak een applicatie, zet **Organizations** aan, zet de sleutels in Vercel. Voeg een webhook toe naar `https://<domein>/api/webhooks/clerk` met de events `user.*`, `organization.*` en `organizationMembership.*`, en zet het signing secret in `CLERK_WEBHOOK_SECRET`. De eerste gebruiker met Clerk-rol `org:admin` wordt admin in InfraSchouw en wijst daarna rollen toe onder *Instellingen → Gebruikers*.
3. **Vercel Blob** — Storage → Blob → *private* store koppelen (zet `BLOB_READ_WRITE_TOKEN`).
4. **Upstash** — Redis-database en QStash koppelen via de Vercel Marketplace (zet de vijf variabelen).
5. **OpenAI** — API-sleutel met toegang tot de gekozen modellen.
6. Zet `APP_URL`, `CRON_SECRET` (willekeurige string van 32+ tekens) en `DEMO_MODE=false`.
7. Deploy. `vercel.json` registreert twee crons: `/api/cron/ai-sweep` (elke 10 min: vastgelopen AI-jobs opnieuw) en `/api/cron/retention` (dagelijks: schouwen verwijderen waarvan de bewaartermijn uit *Instellingen → Privacy* is verstreken).
8. Controleer `/configuratie`: die pagina toont per integratie of die actief is.

Na een schemawijziging: `pnpm db:generate`, commit de migratie in `src/db/migrations`, en draai `pnpm db:migrate` tegen productie vóór of tijdens de deploy.

## CI

`.github/workflows/ci.yml` draait typecheck, lint, unit/integratietests en build op elke push en PR. De e2e-job draait alleen als het repository-secret `DATABASE_URL_TEST` is ingesteld (een aparte Neon-branch), omdat de tests de demodata opnieuw seeden.

## Licentie en data

De demodata (Zwolle-Stadshagen) is fictief. Kaartmateriaal: © Kadaster / PDOK (BRT-Achtergrondkaart, Luchtfoto), CC BY 4.0.
