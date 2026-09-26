# Smart glasses

InfraSchouw ondersteunt drie soorten brillen via één adapterlaag (`src/lib/capture-sources/`). Welk soort bril je ook gebruikt, elke opname komt uiteindelijk terecht in `upsertCapture`, met dezelfde nummering, RD-coördinaten, koppeling aan de GPS-track en AI-verwerking als een telefoonfoto.

| Type bril | Voorbeelden | Route | Adapter |
|---|---|---|---|
| Android-bril met browser | RealWear Navigator, Vuzix M400/Z100 | PWA op het apparaat: **`/veld/bril`** | `glasses-browser` |
| Camerabril gekoppeld aan telefoon | Meta Ray-Ban (companion-app / SDK) | **Ingest API** met device-token | `glasses-ingest` |
| Brilgeheugen / galerij achteraf | elke bril of camera | bulk-import in veld-app of backend | `file-import` |

---

## 1. Bril-UI (`/veld/bril`)

Een compacte interface voor brillen met een eigen browser: groot, zwart/geel voor hoog contrast, en volledig spraakgestuurd (Web Speech API, `nl-NL`, continu luisteren). Aanraken is niet nodig. Het scherm gebruikt dezelfde offline-opslag en sync als de telefoon-app, dus ook op de bril kun je volledig offline schouwen.

**Beginscherm**

| Zeg | Actie |
|---|---|
| "nieuwe schouw tracé" (of een ander type, bijv. "nieuwe schouw calamiteit") | start een losse schouw met GPS-locatie, adres en weer |
| "open schouw 1" / "schouw twee" | opent een lopende schouw uit de lijst |
| "help" | toont de commando's |

**Tijdens de schouw**

| Zeg | Actie |
|---|---|
| "foto" | foto met GPS, kompasrichting en tijd; telt voor het actieve shot uit de shotlist |
| "start video" / "stop video" | video-opname, met GPS-track tijdens de opname |
| "start opname" / "stop opname" | doorlopende spraakopname (transcriptie + koppeling aan foto's) |
| "notitie …" | tekstnotitie |
| "bevinding hoog/midden/laag …" | bevinding, gekoppeld aan de laatste foto |
| "meting diepte 72 centimeter" | meting (diepte, lengte, breedte, hoogte, aantal), gekoppeld aan de laatste foto |
| "volgende shot" / "vorige shot" | bladeren door de begeleide shotlist |
| "afronden" | rondt af; staan er verplichte shots of checklistvragen open, dan toont de bril die eerst |
| "reden …" | (na "afronden") slaat alle open punten over met deze reden en rondt af |
| "annuleer" | (na "afronden") terug naar schouwen |
| "terug" | terug naar het beginscherm; de schouw blijft lopen |
| "help" | toont alle commando's |

Elk commando geeft een grote bevestiging op het scherm en een korte trilling. Wat de bril heeft verstaan, staat onderaan ("Gehoord: …"). Deelnemers en handtekeningen leg je na afloop vast op de telefoon of in de backend.

**Installeren op het apparaat:** open `https://<domein>/veld/bril` in Chrome op de bril, log in, en kies *Toevoegen aan startscherm*. Geef toestemming voor camera, microfoon en locatie. Op RealWear werkt de ingebouwde spraakbesturing van het apparaat naast die van InfraSchouw; gebruik de InfraSchouw-commando's zoals hierboven.

---

## 2. Ingest API (camerabrillen via companion-app)

Brillen zoals de Meta Ray-Ban draaien geen browser. Een companion-app op de telefoon (iOS/Android) haalt de media via de SDK van de fabrikant van de bril en stuurt ze naar InfraSchouw.

### Apparaat koppelen

1. Een admin gaat naar **Instellingen → Apparaten → Apparaat toevoegen**, kiest het type en de gebruiker aan wie de bril wordt gekoppeld.
2. Het token (`isg_<prefix>_<geheim>`) wordt **eenmalig** getoond. Zet het in de companion-app (bijv. via een QR-code of plakken). InfraSchouw bewaart alleen een SHA-256-hash.
3. *Intrekken* maakt het token direct ongeldig (401). *Laatst gezien* wordt bij elk verzoek bijgewerkt.

### Waar komt een opname terecht?

- Heeft de gekoppelde gebruiker een **lopende schouw** (status *lopend*, gestart vóór het opnametijdstip + 5 min), dan gaat de opname naar de meest recente daarvan.
- Anders komt ze in de **inbox "Niet-toegewezen captures"**, waar een schouwer of projectleider haar aan een schouw toewijst.
- Met het veld `inspectionId` kan de app een schouw expliciet kiezen (die moet dan van dezelfde organisatie zijn).

### Locatie

1. `lat`/`lon` uit het verzoek (GPS van de telefoon op het opnamemoment) → bron `gps`.
2. Anders de EXIF-GPS van de foto → bron `exif`.
3. Anders **tijdmatching** met de GPS-track die de telefoon tijdens de schouw vastlegde (interpolatie; maximaal 5 minuten verschil) → bron `track-match`.
4. Anders zonder locatie; de gebruiker kan haar later op de kaart plaatsen.

### Authenticatie

Elk verzoek: `Authorization: Bearer isg_…`. Limiet: 240 verzoeken per minuut per apparaat (429 bij overschrijding).

### `GET /api/ingest/glasses` — status

Laat zien waar nieuwe opnames heen gaan (handig om in de companion-app te tonen).

```bash
curl https://schouw.example.nl/api/ingest/glasses \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "device": { "id": "7c0f…", "name": "Ray-Ban Sanne", "kind": "meta-rayban" },
  "activeInspection": { "id": "b1e2…", "title": "Graafschade LS-kabel Assendorperstraat", "startedAt": "2026-09-26T08:12:00.000Z" },
  "target": "inspection"
}
```

### `POST /api/ingest/glasses` — direct uploaden (multipart, ≤ 50 MB)

Velden (allemaal optioneel behalve `file`):

| Veld | Type | Toelichting |
|---|---|---|
| `file` | bestand | `image/*`, `video/*` of `audio/*` |
| `clientId` | UUID | idempotentiesleutel: hetzelfde `clientId` opnieuw sturen maakt geen duplicaat (antwoord 200 i.p.v. 201) |
| `type` | `photo` \| `video` \| `audio` | anders afgeleid uit het MIME-type |
| `capturedAt` | ISO 8601 met tijdzone | opnametijd op de bril; anders EXIF, anders ontvangsttijd |
| `lat`, `lon`, `accuracy` | getal | WGS84, nauwkeurigheid in meters |
| `heading` | 0–360 | kijkrichting in graden t.o.v. het noorden |
| `durationMs` | geheel getal | voor video/audio |
| `deviceId` | tekst | serienummer/ID van de bril zelf (voor naslag) |
| `note` | tekst ≤ 2000 | notitie bij de opname |
| `inspectionId` | UUID | expliciete schouw (optioneel) |

```bash
curl -X POST https://schouw.example.nl/api/ingest/glasses \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@IMG_0042.jpg;type=image/jpeg" \
  -F "clientId=3f7a2c1e-9d4b-4e7a-8c61-0b2f5d9e1a44" \
  -F "capturedAt=2026-09-26T10:42:13+02:00" \
  -F "lat=52.52241" -F "lon=6.05889" -F "accuracy=6" -F "heading=118" \
  -F "deviceId=RB-META-00A1F3"
```

Antwoord `201 Created`:

```json
{
  "captureId": "3f7a2c1e-9d4b-4e7a-8c61-0b2f5d9e1a44",
  "created": true,
  "status": "assigned",
  "inspectionId": "b1e2…",
  "inspectionTitle": "Graafschade LS-kabel Assendorperstraat",
  "location": { "lat": 52.52241, "lon": 6.05889, "source": "gps" }
}
```

`status` is `"assigned"` (in een schouw) of `"inbox"`.

### Grote bestanden (video): presigned upload in twee stappen

**Stap 1** — vraag een upload-URL aan:

```bash
curl -X POST https://schouw.example.nl/api/ingest/glasses/uploads \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"fileName":"VID_0007.mp4","contentType":"video/mp4","size":187654321}'
```

```json
{
  "method": "PUT",
  "uploadUrl": "https://…blob.vercel-storage.com/…?…",
  "headers": { "content-type": "video/mp4" },
  "pathname": "orgs/…/ingest/<deviceId>/<uuid>.mp4",
  "expiresAt": "2026-09-26T11:12:13.000Z",
  "finalize": "PUT-response JSON bevat `url`; stuur die als fileUrl naar POST /api/ingest/glasses"
}
```

Met Vercel Blob is `uploadUrl` een presigned URL: het bestand gaat rechtstreeks naar de opslag en niet via de app (maximaal 2 GB, 30 minuten geldig). Zonder Blob (lokale ontwikkeling) wijst de URL naar `/api/ingest/glasses/uploads/local`; stuur dan ook de `authorization`-header mee die in `headers` staat.

**Upload:**

```bash
curl -X PUT "$UPLOAD_URL" -H "content-type: video/mp4" --data-binary @VID_0007.mp4
# → { "url": "…", "pathname": "…" }
```

**Stap 2** — registreer de opname met JSON:

```bash
curl -X POST https://schouw.example.nl/api/ingest/glasses \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
        "fileUrl": "<url uit de PUT-response>",
        "contentType": "video/mp4",
        "clientId": "a0c3…",
        "type": "video",
        "capturedAt": "2026-09-26T10:45:00+02:00",
        "durationMs": 64000,
        "lat": 52.5224, "lon": 6.0589
      }'
```

De server controleert dat `fileUrl` binnen de eigen organisatie valt.

### Foutcodes

| Code | Betekenis |
|---|---|
| 400 | ontbrekend `file`/`fileUrl`, of ongeldige metadata (details in `error`) |
| 401 | geen, ongeldig of ingetrokken token |
| 403 | uploadpad of `fileUrl` hoort niet bij dit apparaat of deze organisatie |
| 413 | multipart-bestand > 50 MB: gebruik de presigned upload |
| 429 | te veel verzoeken; probeer het later opnieuw (header `Retry-After`) |

### Aanbevolen gedrag van de companion-app

- Genereer per opname één `clientId` (UUID v4) en bewaar die, zodat een retry na een netwerkfout geen duplicaat oplevert.
- Stuur `capturedAt` met tijdzone uit de metadata van de bril, niet het tijdstip van uploaden.
- Stuur de telefoonlocatie van het opnamemoment mee. Is die er niet, dan koppelt InfraSchouw via de GPS-track van de veld-app.
- Upload in de achtergrond met een wachtrij (WorkManager op Android, `BGProcessingTask` op iOS) en exponentiële backoff bij 5xx/429.
- Toon via `GET /api/ingest/glasses` naar welke schouw de opnames gaan.

**Voorbeeld (Kotlin, OkHttp):**

```kotlin
val body = MultipartBody.Builder().setType(MultipartBody.FORM)
    .addFormDataPart("file", file.name, file.asRequestBody("image/jpeg".toMediaType()))
    .addFormDataPart("clientId", capture.clientId)
    .addFormDataPart("capturedAt", capture.takenAt.toString()) // ISO 8601 met offset
    .addFormDataPart("lat", loc.latitude.toString())
    .addFormDataPart("lon", loc.longitude.toString())
    .build()
val req = Request.Builder().url("$baseUrl/api/ingest/glasses")
    .header("Authorization", "Bearer $deviceToken").post(body).build()
client.newCall(req).execute().use { res -> check(res.code == 201 || res.code == 200) }
```

**Voorbeeld (Swift, URLSession):**

```swift
var req = URLRequest(url: baseURL.appendingPathComponent("api/ingest/glasses"))
req.httpMethod = "POST"
req.setValue("Bearer \(deviceToken)", forHTTPHeaderField: "Authorization")
let boundary = UUID().uuidString
req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
var data = Data()
func field(_ name: String, _ value: String) {
  data.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".data(using: .utf8)!)
}
field("clientId", capture.clientId.uuidString)
field("capturedAt", ISO8601DateFormatter().string(from: capture.takenAt))
data.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
data.append(jpegData)
data.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
let (_, response) = try await URLSession.shared.upload(for: req, from: data)
```

---

## 3. Bulk-import (brilgeheugen of galerij)

In de veld-app (*Importeren*) en in de backend (schouw → *Media* → *Importeren*, of de *Inbox*): sleep bestanden of kies ze. InfraSchouw leest EXIF (tijd, GPS, richting) en koppelt bestanden zonder GPS op tijd aan de GPS-track. Je ziet eerst een preview met de gevonden locatie per bestand; pas na bevestigen worden ze opgeslagen. Een import in de backend zonder gekozen schouw gaat naar de inbox.

## 4. Simulator (`/dev/glasses-simulator`)

Alleen voor admins. De simulator maakt (of hergebruikt) een testapparaat en roept de echte Ingest API aan met testmedia: een foto (multipart), een video via de presigned twee-stappen-flow, en een statusverzoek. De responses verschijnen in een log. Zo toon je de hele keten aan zonder fysieke bril: token → ingest → schouw of inbox → AI-verwerking. De e2e-test `tests/e2e/exports-glasses-security.spec.ts` gebruikt deze simulator.
