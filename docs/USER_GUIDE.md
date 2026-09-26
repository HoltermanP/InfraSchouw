# Handleiding InfraSchouw

Voor **schouwers** (veld) en **projectleiders** (backend). Beheerders vinden hun taken in hoofdstuk 6.

## 1. Rollen

| Rol | Mag |
|---|---|
| **Lezer** | alles inzien en exporteren, deellinks openen |
| **Schouwer** | schouwen uitvoeren, captures en bevindingen bewerken, verslag bewerken en ter review aanbieden |
| **Projectleider** | daarnaast projecten, stations en afrekenposten beheren, verslagen definitief maken, deellinks maken en intrekken, afrekenbewijs bevestigen |
| **Admin** | daarnaast organisatie-instellingen, gebruikers en rollen, templates, huisstijl, apparaten, AI, privacy en audit |

Per project kun je teamleden een projectrol geven (projectleider, toezichthouder, adviseur, aannemer); die bepaalt wie op het project staat, niet wat iemand mag.

---

## 2. Schouwen in het veld (telefoon of tablet)

### 2.1 Installeren en voorbereiden

1. Open **`/veld`** in Chrome (Android) of Safari (iOS) en log in.
2. Kies *Toevoegen aan startscherm*. De app werkt daarna ook zonder netwerk.
3. Geef toestemming voor camera, microfoon en locatie.
4. Ga je naar een plek zonder bereik? Kies op het beginscherm **Gebied offline beschikbaar maken** en selecteer het project. De kaart van dat gebied wordt vooraf gedownload.

Bovenin zie je altijd de **sync-status**: *online* of *offline*, en hoeveel items nog wachten. Je hoeft niets te doen: zodra er verbinding is, synchroniseert alles automatisch, ook als de app op de achtergrond staat.

### 2.2 Een schouw starten

Kies **Nieuwe schouw** en het schouwtype (bijv. Tracéschouw, Stationsopleveringsschouw, Calamiteit-/storingsschouw).

- **Vanuit een project:** kies het project. Open je de schouw vanuit de backend (*Project → Schouw starten*), dan is het project al ingevuld.
- **Los (zonder project):** laat het project leeg. Je koppelt de schouw later in de backend aan een project.
- **Stationsschouw:** kies het MS-station, of voer een nieuw station in (nummer, naam, type).

De app legt automatisch de starttijd, GPS-locatie, het adres (PDOK) en het weer vast. Tijdens de schouw wordt je route (GPS-track) bijgehouden.

### 2.3 Vastleggen

De onderste balk op het tabblad **Vastleggen**:

| Knop | Wat |
|---|---|
| **Foto** | camera met locatie, kijkrichting en snelle tags. Na de foto kun je tekenen: pijl, cirkel, rechthoek, tekst, maatlijn, vervagen (AVG) |
| **Fotoreeks** (onder *Meer*) | meerdere foto's achter elkaar, of automatisch elke *x* meter lopen |
| **Video** | video-opname; de route tijdens de opname wordt meegenomen |
| **Spraak** | doorlopend opnemen terwijl je loopt en praat. De transcriptie wordt later automatisch gekoppeld aan de foto's die je op dat moment maakte |
| **Notitie** | korte tekst, met dicteren via het toetsenbord |
| **Meting** | diepte, lengte, breedte, hoogte of aantal, met eenheid, gekoppeld aan de laatste foto |
| **Bevinding** | titel, omschrijving, prioriteit (hoog/midden/laag) en categorie, met gekoppelde foto's |
| **Scan** | QR- of barcode (bijv. kabelmof, materiaal), of de code handmatig invoeren |
| **Schets** (onder *Meer*) | tekenen op een leeg vlak, of over een bestaande foto |
| **Importeren** (onder *Meer*) | foto's en video's uit de galerij of het brilgeheugen; locatie via EXIF of via de tijd op je route |

Elke opname krijgt een tijdstempel, locatie (met nauwkeurigheid) en volgnummer.

**Handsfree:** met de knop *Handsfree* bovenin (of *Meer → Handsfree aan*) bedien je de app met je stem ("foto", "notitie …", "bevinding hoog …", "meting diepte 72 centimeter", "volgende shot", "afronden"). Zeg "help" voor alle commando's. De bevestiging verschijnt in beeld.

### 2.4 Checklist en shotlist

- **Checklist**: de vragen van het schouwtype (ja/nee/n.v.t., keuze, getal, tekst), eventueel met verplichte foto.
- **Shotlist** (vooral stationsschouwen): een begeleide lijst met foto's die gemaakt moeten worden, zoals "Typeplaat transformator" of "RMU-velden frontaal". Het actieve shot staat in beeld tijdens het fotograferen; de teller toont hoeveel verplichte foto's nog ontbreken.

### 2.5 Afronden

Kies **Afronden**:

1. Ontbreken er verplichte foto's of checklistantwoorden, dan vul je per punt een **reden** in om het over te slaan (bijv. "ruimte afgesloten").
2. Voeg **deelnemers** toe (naam, organisatie, rol), eventueel met **handtekening**.
3. Schrijf een **slotopmerking** en bevestig.

Na synchronisatie start de AI-verwerking automatisch en krijg je een verslagvoorstel.

### 2.6 Met een bril

Zie [SMART_GLASSES.md](SMART_GLASSES.md). Kort samengevat: RealWear/Vuzix openen **`/veld/bril`** en worden volledig met spraak bediend, van "nieuwe schouw tracé" tot "afronden". Opnames van een Meta Ray-Ban komen via de companion-app automatisch in je lopende schouw, of in de inbox.

---

## 3. De backend (projectleider)

### 3.1 Projecten

**Projecten → Nieuw project**: nummer, naam, opdrachtgever, contractvorm, fase en omschrijving. Het projectgebied teken je op de kaart van het project. Tabbladen per project:

- **Overzicht**: kaart met gebied, schouwen, stations en KLIC-lagen, plus kengetallen.
- **Schouwen**, **Stations**, **Bevindingen**, **Acties**: alle items van het project, filterbaar.
- **Afrekenposten**: zie 3.6.
- **Documenten**: KLIC-leveringen (GML/ZIP), die als kaartlaag verschijnen.
- **Team**: teamleden en hun projectrol.
- **Instellingen**: projectgegevens, status en fase.

Met **Schouw starten** open je de veld-app met dit project al ingevuld.

### 3.2 Een schouw bekijken

**Schouwen** toont alle schouwen, met filters op project, type, status en *los* (zonder project). Open een schouw voor de tabbladen:

| Tabblad | Inhoud |
|---|---|
| **Kaart** | alle foto's als genummerde markers met kijkrichting, de route, bevindingen en KLIC. Klik een marker voor het zijpaneel met foto, tijd, RD- en WGS84-coördinaten, kijkrichting, AI-beschrijving en transcriptfragment. *Toon in verslag* springt naar die foto in het verslag; *Locatie corrigeren* laat je de marker verslepen. *Kaartbeeld voor verslag vastleggen* zet de huidige kaartweergave als overzichtskaart in het verslag |
| **Tijdlijn** | alle opnames en transcriptsegmenten op tijd, met de koppeling "gekoppeld aan foto 2" |
| **Media** | galerij; bewerken van onderschrift en tags, annoteren, verwijderen, importeren |
| **Bevindingen**, **Acties** | bewerken, prioriteit, status, verantwoordelijke en deadline; een actie aanmaken vanuit een bevinding |
| **Checklist** | antwoorden en overgeslagen punten met reden |
| **Station** | installatiebeschrijving en as-built-check (zie 3.5) |
| **Afrekening** | bewijsregels voor afrekenposten (zie 3.6) |
| **Verslag** | de verslageditor (zie 3.4) |

Een **losse schouw** koppel je met **Koppel aan project** in de kop van de schouw. Met het AI-pictogram voer je alle AI-stappen opnieuw uit.

### 3.3 Inbox

**Inbox** bevat captures die niet aan een schouw konden worden gekoppeld: brilopnames zonder lopende schouw, of backend-imports zonder gekozen schouw. Selecteer opnames, kies de schouw en klik **Toewijzen aan schouw**.

### 3.4 Het verslag

De AI maakt een **voorstel** volgens de secties van het schouwtype: samenvatting met belangrijkste aandachtspunten, doel en scope, overzichtskaart, bevindingen met foto's, actiepunten, checklist en bijlagen. Tekst van de AI is gemarkeerd tot je die accepteert.

- **Bewerken:** typ direct in het document. Opmaak, tabellen en koppen werken zoals in een tekstverwerker.
- **Foto's:** sleep een foto uit het zijpaneel **Foto's** naar de juiste plek. Klik op een foto in het verslag om naar de kaart te gaan. Een foto uit het verslag verwijderen verwijdert haar niet uit de schouw.
- **Aandachtspunten:** accepteer, bewerk of verwijder de punten die de AI voorstelt. Open vragen van de AI vink je af wanneer ze beantwoord zijn.
- **Sectie hergenereren:** met *Opnieuw genereren met AI* bij een sectie laat je de AI één sectie opnieuw schrijven, eventueel met een instructie ("korter", "meer nadruk op veiligheid"). Heb je de sectie zelf bewerkt, dan vraagt de app eerst om bevestiging: je handwerk gaat nooit ongemerkt verloren. Zonder AI-configuratie is deze knop verborgen.
- **Opslaan** maakt een nieuwe **versie**. In het zijpaneel **Versies** zie je alle versies, vergelijk je per sectie (*Verschil t.o.v. vorige*), download je de PDF van een oude versie of **zet je een versie terug** (dat wordt zelf weer een nieuwe versie).
- **PDF-voorbeeld** toont live hoe de PDF eruitziet.

**Statusflow:** *Concept (AI-voorstel)* → *In bewerking* → *Ter review* → *Definitief*. Een schouwer biedt het verslag ter review aan; een projectleider maakt het definitief. **Definitief** vergrendelt het verslag en archiveert de PDF met een controlecode (hash). Moet er toch iets veranderen, dan zet een projectleider het terug naar bewerking; de definitieve versie blijft bewaard.

**Deellink:** in het zijpaneel **Delen** maak je een link met een geldigheid (7 dagen tot 1 jaar) en een label. De ontvanger ziet het verslag en kan de PDF downloaden, zonder account. **Intrekken** maakt de link direct onbruikbaar.

### 3.5 MS-stations

**Stations** bevat alle MS-stations met nummer, type, adres en status. Per station zie je de verwachte configuratie (uit het ontwerp; te importeren als JSON of als CSV met `kenmerk;waarde`) en alle schouwen.

Bij een stationsschouw (tabblad **Station**):

1. De AI leest **typeplaten** van de foto's (fabrikant, type, vermogen, bouwjaar, serienummer). Controleer de waarden en kies **Overnemen als transformator** of **Overnemen als MS-installatie** om ze in de installatiebeschrijving te zetten.
2. De **installatiebeschrijving** (behuizing, RMU-velden, transformator, LS-rek, aarding, RTU, eindsluitingen) is volledig bewerkbaar.
3. **As-built-check** vergelijkt de beschrijving met de verwachte configuratie: *Conform*, *Afwijkend* of *Niet vastgesteld* per onderdeel. Afwijkingen worden automatisch bevindingen.

### 3.6 Afrekening

1. **Project → Afrekenposten → Importeren**: CSV of Excel met postcode, omschrijving, eenheid, eenheidsprijs en (geplande) hoeveelheid. Komma's als decimaalteken en puntjes als duizendtal worden herkend.
2. Per schouw (gekoppeld aan het project), tabblad **Afrekening → Bewijs toevoegen**: kies de post, de hoeveelheid en de foto's die het aantonen. Bij een afrekenschouw stelt de AI zelf bewijsregels voor (status *voorgesteld*, met betrouwbaarheid).
3. Een projectleider **bevestigt** of **wijst af** per regel.
4. Het overzicht per project toont gepland, aangetoond en bevestigd per post. Exporteer als **Excel** of als **PDF-onderbouwing**, met de bewijsfoto's per post.

### 3.7 Exports

Via **Exporteren** in een schouw:

| Formaat | Voor |
|---|---|
| **PDF** | het verslag in huisstijl, met inhoudsopgave, kaart, foto's met nummer, tijd en RD-coördinaten |
| **Word** | een bewerkbare versie van hetzelfde verslag |
| **Excel** | tabellen: captures, bevindingen, acties, metingen, checklist |
| **ZIP** | alle originele foto's, video's en audio met leesbare namen, plus metadata (CSV) en de PDF |
| **GeoJSON** | captures, bevindingen, route en stations voor GIS (QGIS, ArcGIS) |

---

## 4. Veelgestelde vragen

**Mijn foto's staan niet op de kaart.** Controleer of locatie aan stond. Opnames zonder GPS worden op tijd gekoppeld aan je route. Staat een foto op de verkeerde plek, kies dan in het zijpaneel van de kaart *Locatie corrigeren*.

**Er staat "X wachtend" in de sync-status.** Die items zijn veilig opgeslagen op je toestel en worden verstuurd zodra er verbinding is. Verwijder de app niet en wis de sitegegevens niet voordat alles verstuurd is.

**Er staat een fout bij een item in de sync-status.** De server heeft het item geweigerd, bijvoorbeeld omdat de schouw intussen in de backend is verwijderd. De overige items worden gewoon verstuurd. De foutmelding staat bij het item.

**De AI-status blijft op "In wachtrij".** Onder de schouw staat de voortgang. Je kunt ondertussen gewoon werken. Mislukte stappen start je opnieuw met het AI-pictogram in de kop van de schouw.

**Zonder AI?** Werkt alles behalve de automatische beschrijvingen, transcripties en het verslagvoorstel. Je krijgt dan een verslag dat is opgebouwd uit je eigen gegevens, dat je zelf aanvult.

---

## 5. Privacy

- Vervaag gezichten en kentekens met het gereedschap **Vervagen (AVG)** in de annotatie-editor.
- Een schouw met alle bestanden verwijderen: kop van de schouw → prullenbakpictogram. Typ ter bevestiging de titel.
- Na de bewaartermijn (*Instellingen → Privacy*, standaard 84 maanden) worden schouwen automatisch verwijderd.

## 6. Beheer (admin)

| Instelling | Wat |
|---|---|
| **Organisatie** | naam; veld-app: GPS-trackinterval, maximale videoduur, keyframe-interval en waarschuwingsgrens voor GPS-nauwkeurigheid |
| **Gebruikers** | rol per lid wijzigen (je eigen rol niet) |
| **Templates** | schouwtypes: secties, checklistvragen, shotlist en verslagstructuur. Kopieer een standaardtemplate om aan te passen |
| **Huisstijl** | logo, bedrijfsnaam, hoofd- en accentkleur en voettekst voor PDF en Word, met voorbeeld |
| **Apparaten** | smart-glasses-tokens aanmaken, aan een gebruiker koppelen en intrekken |
| **AI** | per stap aan/uit (foto-analyse, transcriptie, verslag), extra instructies voor de verslag-AI, en een overzicht van jobs, tokens en geschatte kosten |
| **Export** | bevindingen groeperen op thema of locatie, transcript en fotoregister wel/niet opnemen, papierformaat |
| **Privacy** | bewaartermijn van schouwgegevens (maanden) |
| **Audit** | wie wat wanneer deed, met zoeken en filteren op type |

De **Bril-simulator** (menu, alleen admins) test de brilkoppeling zonder fysieke bril.
