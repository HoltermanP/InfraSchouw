import type { ChecklistAnswerType, TemplatePhase } from "../domain";

export type StandardChecklistItem = {
  question: string;
  answerType?: ChecklistAnswerType;
  options?: string[];
  photoRequired?: boolean;
  required?: boolean;
};
export type StandardShot = {
  group: string;
  title: string;
  description?: string;
  required?: boolean;
  stationComponent?: string;
};
export type StandardSection = { key: string; title: string; aiHint?: string };
export type StandardTemplate = {
  key: string;
  name: string;
  phase: TemplatePhase;
  description: string;
  purposeText: string;
  aiInstructions: string;
  isStation?: boolean;
  isBilling?: boolean;
  /** Tracéschouw: route loggen. */
  tracksRoute?: boolean;
  checklist: StandardChecklistItem[];
  shots: StandardShot[];
  sections: StandardSection[];
};

const BASE_SECTIONS: StandardSection[] = [
  { key: "samenvatting", title: "Samenvatting", aiHint: "Managementsamenvatting en belangrijkste aandachtspunten." },
  { key: "doel_scope", title: "Doel en scope", aiHint: "Doel uit template, aangevuld met projectcontext." },
  { key: "overzichtskaart", title: "Overzichtskaart" },
  { key: "bevindingen", title: "Bevindingen", aiHint: "Bevindingen met foto's inline op de plek waar ze horen." },
  { key: "actiepunten", title: "Actiepunten" },
  { key: "checklist", title: "Checklist" },
  { key: "bijlagen", title: "Bijlagen" },
];

const withStation = (sections: StandardSection[]): StandardSection[] => [
  ...sections.slice(0, 4),
  {
    key: "station",
    title: "Stationsbeschrijving",
    aiHint: "Buitenkant, binnenkant, MS-installatie, trafo, LS, kabels, aarding, automatisering, veiligheid; typeplaatfoto's bij de juiste component.",
  },
  ...sections.slice(4),
];

const withBilling = (sections: StandardSection[]): StandardSection[] => {
  const idx = sections.findIndex((s) => s.key === "actiepunten");
  return [
    ...sections.slice(0, idx),
    { key: "afrekening", title: "Afrekenonderbouwing", aiHint: "Aangetroffen hoeveelheden per afrekenpost met bewijsfoto's." },
    ...sections.slice(idx),
  ];
};

/** Standard station shot list (section 8.2). */
export const STATION_SHOTS: StandardShot[] = [
  { group: "Buitenkant", title: "Overzicht vanaf straat (met omgeving)", stationComponent: "buitenkant" },
  { group: "Buitenkant", title: "Vooraanzicht / deuren", stationComponent: "buitenkant" },
  { group: "Buitenkant", title: "Zij- en achterkant", stationComponent: "buitenkant" },
  { group: "Buitenkant", title: "Stationsnummer / naamplaat / waarschuwingsborden", stationComponent: "naamplaat" },
  { group: "Buitenkant", title: "Toegang, fundatie, afwerking maaiveld, beplanting", stationComponent: "toegang_fundatie" },
  { group: "Buitenkant", title: "Kabelinvoer buitenzijde / kabelkelder-luik", stationComponent: "kabelinvoer_buiten" },
  { group: "Binnenkant", title: "Overzicht MS-ruimte", stationComponent: "ms_ruimte" },
  { group: "Binnenkant", title: "MS-installatie (RMU) totaaloverzicht", stationComponent: "ms_installatie" },
  { group: "Binnenkant", title: "Typeplaat MS-installatie", stationComponent: "ms_typeplaat" },
  {
    group: "Binnenkant",
    title: "Per veld: frontfoto (veldfunctie, aanduiding, beveiliging)",
    description: "Maak één foto per veld; herhaal dit shot voor elk veld.",
    stationComponent: "ms_veld",
  },
  { group: "Binnenkant", title: "Kabelaansluitingen / eindsluitingen MS", stationComponent: "ms_eindsluitingen" },
  { group: "Binnenkant", title: "Transformator overzicht", stationComponent: "transformator" },
  { group: "Binnenkant", title: "Typeplaat transformator", stationComponent: "trafo_typeplaat" },
  { group: "Binnenkant", title: "LS-rek / LS-verdeler overzicht", stationComponent: "ls_rek" },
  { group: "Binnenkant", title: "LS-groepen / zekeringen / aanduidingen", stationComponent: "ls_groepen" },
  { group: "Binnenkant", title: "Kabelkelder / kabelinvoer binnenzijde / afdichting", stationComponent: "kabelkelder" },
  { group: "Binnenkant", title: "Aarding (aardrail, aansluitingen)", stationComponent: "aarding" },
  {
    group: "Binnenkant",
    title: "Meet- en telecomvoorzieningen (RTU/distributieautomatisering, meters, KVK/koppeling)",
    stationComponent: "automatisering",
    required: false,
  },
  {
    group: "Binnenkant",
    title: "Veiligheid (bord, blusmiddel, bedieningsmiddelen, schema aan de wand)",
    stationComponent: "veiligheid",
  },
  { group: "Binnenkant", title: "Eindafwerking / opgeruimd", stationComponent: "afwerking" },
];

const GENERAL_AI =
  "Schrijf zakelijk en kort in het Nederlands. Verwijs bij elke bewering naar capture_ids. Twijfel → open vraag.";

export const STANDARD_TEMPLATES: StandardTemplate[] = [
  {
    key: "initiatief",
    name: "Initiatief-/haalbaarheidsschouw",
    phase: "initiatief",
    description: "Globale beoordeling van het gebied: obstakels en kansen.",
    purposeText:
      "Deze schouw geeft een eerste, globale beoordeling van het projectgebied om de haalbaarheid van het initiatief in te schatten. Obstakels, risico's en kansen worden in beeld gebracht.",
    aiInstructions: `${GENERAL_AI} Benoem per deelgebied de belangrijkste obstakels en kansen. Geef een indicatieve haalbaarheidsinschatting zonder harde conclusies.`,
    checklist: [
      { question: "Is het gebied goed bereikbaar voor materieel?" },
      { question: "Zijn er grote obstakels (spoor, water, hoofdwegen)?", photoRequired: true },
      { question: "Zijn er zichtbare bestaande kabels/leidingen of objecten van derden?" },
      { question: "Beschermde natuur of monumentale bomen aanwezig?" },
      { question: "Globale verhardingssoort", answerType: "choice", options: ["Klinkers", "Tegels", "Asfalt", "Onverhard", "Gemengd"] },
      { question: "Opmerkingen over omgeving/bewoners", answerType: "text", required: false },
    ],
    shots: [
      { group: "Gebied", title: "Overzicht startpunt gebied" },
      { group: "Gebied", title: "Belangrijkste obstakel(s)" },
      { group: "Gebied", title: "Overzicht eindpunt gebied", required: false },
    ],
    sections: BASE_SECTIONS,
  },
  {
    key: "trace",
    name: "Tracéschouw",
    phase: "ontwerp",
    tracksRoute: true,
    description: "Tracé beoordelen: obstakels, bomen, kruisingen, verharding, bereikbaarheid, boorlocaties, vergunningspunten.",
    purposeText:
      "Doel van deze tracéschouw is het beoordelen van het voorgenomen kabeltracé op obstakels, bomen, kruisingen, verharding, bereikbaarheid, mogelijke boorlocaties en vergunningspunten, als input voor het definitief ontwerp.",
    aiInstructions: `${GENERAL_AI} Deel bevindingen in per tracédeel (van begin naar eind, op basis van GPS-volgorde). Benoem kruisingen, boomwortelzones (kroonprojectie), verhardingstype en geschikte boorlocaties expliciet. Vergunningspunten → categorie vergunning.`,
    checklist: [
      { question: "Tracé volledig gelopen?" },
      { question: "Aantal kruisingen (weg/water/spoor)", answerType: "number" },
      { question: "Bomen binnen 2 m van het tracé?", photoRequired: true },
      { question: "Geschikte locaties voor gestuurde boring aanwezig?" },
      { question: "Overheersende verharding", answerType: "choice", options: ["Klinkers", "Tegels", "Asfalt", "Onverhard", "Gemengd"] },
      { question: "Werkruimte voldoende (min. 1,5 m)?" },
      { question: "Vergunning(en) nodig van derden (waterschap, RWS, ProRail, gemeente)?" },
      { question: "KLIC-melding gecontroleerd tegen situatie ter plaatse?" },
      { question: "Toelichting knelpunten", answerType: "text", required: false },
    ],
    shots: [
      { group: "Tracé", title: "Beginpunt tracé" },
      { group: "Tracé", title: "Kruising(en)", description: "Foto van elke kruising met weg, water of spoor." },
      { group: "Tracé", title: "Bomen/groen langs tracé" },
      { group: "Tracé", title: "Mogelijke boorlocatie (in- en uittredepunt)", required: false },
      { group: "Tracé", title: "Eindpunt tracé" },
    ],
    sections: BASE_SECTIONS,
  },
  {
    key: "stationslocatie",
    name: "Stationslocatieschouw",
    phase: "ontwerp",
    description: "Geschikte locatie voor een nieuw MS-station: ruimte, bereikbaarheid, omgeving, kabelinvoer.",
    purposeText:
      "Deze schouw beoordeelt de geschiktheid van een beoogde locatie voor een nieuw MS-station op ruimte, bereikbaarheid voor plaatsing en onderhoud, omgeving en kabelinvoer.",
    aiInstructions: `${GENERAL_AI} Beoordeel expliciet: beschikbare ruimte (m²), afstand tot gevels, bereikbaarheid kraan/vrachtwagen, ondergrond, kabelinvoerroute en draagvlak omgeving. Sluit af met een advies geschikt / voorwaardelijk geschikt / ongeschikt.`,
    checklist: [
      { question: "Beschikbare ruimte (m²)", answerType: "number" },
      { question: "Bereikbaar voor kraan/vrachtwagen?", photoRequired: true },
      { question: "Afstand tot dichtstbijzijnde gevel (m)", answerType: "number" },
      { question: "Kabelinvoer vrij van obstakels?" },
      { question: "Ondergrond/fundatie-inschatting", answerType: "choice", options: ["Goed", "Matig", "Slecht", "Onbekend"] },
      { question: "Eigendom grond bekend?" },
    ],
    shots: [
      { group: "Locatie", title: "Overzicht beoogde locatie" },
      { group: "Locatie", title: "Aanrijroute" },
      { group: "Locatie", title: "Omgeving / gevels in de buurt" },
      { group: "Locatie", title: "Kabelinvoerzijde" },
    ],
    sections: BASE_SECTIONS,
  },
  {
    key: "nulmeting",
    name: "Nulmeting / vooropname",
    phase: "voor_uitvoering",
    description: "Staat van de omgeving vastleggen vóór uitvoering (schade-vooropname).",
    purposeText:
      "Met deze vooropname wordt de staat van de omgeving (verharding, gevels, groen, straatmeubilair) vóór aanvang van de werkzaamheden vastgelegd, zodat eventuele schade achteraf objectief kan worden beoordeeld.",
    aiInstructions: `${GENERAL_AI} Beschrijf per foto nauwkeurig de bestaande staat en bestaande schade (scheuren, verzakkingen, ontbrekende elementen). Geen oordeel over oorzaak. Bestaande schade krijgt categorie omgeving, prioriteit laag tenzij veiligheid in het geding is.`,
    checklist: [
      { question: "Alle gevels langs het werkgebied gefotografeerd?", photoRequired: true },
      { question: "Bestaande schade aan verharding aangetroffen?" },
      { question: "Bestaande schade aan gevels/opstallen aangetroffen?" },
      { question: "Bomen/groen vastgelegd?" },
      { question: "Straatmeubilair/kolken vastgelegd?" },
      { question: "Bewoners geïnformeerd over vooropname?", required: false },
    ],
    shots: [
      { group: "Omgeving", title: "Overzicht straat (per straatdeel)" },
      { group: "Omgeving", title: "Gevels" },
      { group: "Omgeving", title: "Verharding" },
      { group: "Omgeving", title: "Groen en bomen" },
      { group: "Omgeving", title: "Bestaande schade (detail)", required: false },
    ],
    sections: BASE_SECTIONS,
  },
  {
    key: "uitvoering",
    name: "Uitvoeringsschouw / toezicht",
    phase: "uitvoering",
    description: "Controle kwaliteit, diepte, ligging, veiligheid, BLVC en KLIC-naleving.",
    purposeText:
      "Deze toezichtsschouw controleert de uitvoering op kwaliteit, ligging en diepte van kabels/leidingen, veiligheid op de werkplek, naleving van het BLVC-plan en de KLIC-regels (WIBON).",
    aiInstructions: `${GENERAL_AI} Toets gemeten dieptes aan de norm (MS-kabel minimaal 80 cm onder maaiveld tenzij anders vermeld, LS 60 cm). Onvoldoende diepte → kwaliteit/hoog. Onveilige situaties → veiligheid/hoog met directe actie.`,
    checklist: [
      { question: "KLIC-melding aanwezig op het werk en actueel?" },
      { question: "Proefsleuven gegraven waar nodig?" },
      { question: "Kabeldiepte conform bestek?", photoRequired: true },
      { question: "Gemeten diepte MS-kabel (cm)", answerType: "number" },
      { question: "Afstand tot andere kabels/leidingen voldoende?" },
      { question: "Werkvak afgezet conform BLVC-plan?", photoRequired: true },
      { question: "PBM's correct gebruikt?" },
      { question: "Verkeersmaatregelen conform plan?" },
      { question: "Opmerkingen uitvoerder", answerType: "text", required: false },
    ],
    shots: [
      { group: "Uitvoering", title: "Overzicht werkvak" },
      { group: "Uitvoering", title: "Kabel in sleuf met duimstok (diepte)" },
      { group: "Uitvoering", title: "Afzetting / verkeersmaatregelen" },
      { group: "Uitvoering", title: "Moflocatie", required: false },
    ],
    sections: BASE_SECTIONS,
  },
  {
    key: "station_bestaand",
    name: "Stationsschouw (bestaand)",
    phase: "alle",
    description: "Inventarisatie van een bestaande MS-installatie.",
    purposeText:
      "Deze stationsschouw inventariseert de bestaande installatie van het MS-station (bouwkundig en elektrotechnisch) en legt de staat vast als basis voor onderhoud, vervanging of uitbreiding.",
    aiInstructions: `${GENERAL_AI} Vul de StationDescription zo volledig mogelijk op basis van foto's, typeplaten (OCR) en gesproken tekst. Geef per veld de functie en aanduiding. Beoordeel de algemene staat (goed/redelijk/matig/slecht) en onderbouw dat.`,
    isStation: true,
    checklist: [
      { question: "Station vrij toegankelijk?" },
      { question: "Stationsnummer leesbaar aanwezig?", photoRequired: true },
      { question: "Staat behuizing", answerType: "choice", options: ["Goed", "Redelijk", "Matig", "Slecht"] },
      { question: "Lekkage of vocht in station?" },
      { question: "Aanwezigheid bedieningsmiddelen en schema?" },
      { question: "Blusmiddel aanwezig en gekeurd?" },
    ],
    shots: STATION_SHOTS,
    sections: withStation(BASE_SECTIONS),
  },
  {
    key: "station_oplevering",
    name: "Stationsopleveringsschouw",
    phase: "oplevering",
    description: "As-built vastleggen, check tegen ontwerp, bewijs voor afrekening.",
    purposeText:
      "Deze opleveringsschouw legt de gerealiseerde installatie van het MS-station vast (as-built), toetst deze aan het ontwerp (verwachte configuratie) en levert het bewijs voor de afrekening van de bijbehorende bestekposten.",
    aiInstructions: `${GENERAL_AI} Vul de StationDescription op basis van foto's en typeplaten. Stel voor elke relevante afrekenpost een aangetroffen hoeveelheid voor met bewijsfoto's (bijv. 1 st RMU, aantal MS-eindsluitingen, 1 st trafo met vermogen). Afwijkingen van de verwachte configuratie → bevinding categorie contract of techniek.`,
    isStation: true,
    isBilling: true,
    checklist: [
      { question: "Installatie volledig gemonteerd en afgewerkt?" },
      { question: "Eindsluitingen correct gemonteerd en gelabeld?", photoRequired: true },
      { question: "Kabelinvoeren waterdicht afgedicht?", photoRequired: true },
      { question: "Aardingsmeting uitgevoerd (Ω)", answerType: "number", required: false },
      { question: "Schema en bedieningsmiddelen aanwezig?" },
      { question: "Terrein opgeruimd en maaiveld hersteld?" },
      { question: "Revisietekening aanwezig?", required: false },
    ],
    shots: STATION_SHOTS,
    sections: withBilling(withStation(BASE_SECTIONS)),
  },
  {
    key: "oplevering_trace",
    name: "Opleveringsschouw tracé",
    phase: "oplevering",
    tracksRoute: true,
    description: "Herstel verharding, afwerking, restpunten.",
    purposeText:
      "Deze opleveringsschouw beoordeelt het herstel van verharding en groen langs het tracé, de afwerking en eventuele restpunten voordat het werk wordt opgeleverd.",
    aiInstructions: `${GENERAL_AI} Vergelijk waar mogelijk met de nulmeting. Restpunten krijgen elk een actie met voorgestelde eigenaar (aannemer) en termijn.`,
    isBilling: true,
    checklist: [
      { question: "Verharding vlak en conform hersteld?", photoRequired: true },
      { question: "Groen/bermen hersteld?" },
      { question: "Straatmeubilair en kolken teruggeplaatst?" },
      { question: "Tijdelijke voorzieningen verwijderd?" },
      { question: "Aantal restpunten", answerType: "number" },
    ],
    shots: [
      { group: "Oplevering", title: "Herstelde verharding (per tracédeel)" },
      { group: "Oplevering", title: "Restpunt (detail)", required: false },
      { group: "Oplevering", title: "Overzicht na oplevering" },
    ],
    sections: withBilling(BASE_SECTIONS),
  },
  {
    key: "afreken",
    name: "Afrekenschouw",
    phase: "afronding",
    description: "Hoeveelheden aantoonbaar maken voor de afrekenstaat.",
    purposeText:
      "Deze afrekenschouw maakt de gerealiseerde hoeveelheden aantoonbaar per afrekenpost, als onderbouwing van de afrekenstaat.",
    aiInstructions: `${GENERAL_AI} Stel per afrekenpost een aangetroffen hoeveelheid voor, uitsluitend op basis van metingen, foto's en gesproken tekst. Noem onzekerheden in remark en lage confidence.`,
    isBilling: true,
    checklist: [
      { question: "Alle afrekenposten langsgelopen?" },
      { question: "Lengtes gemeten of uit revisie overgenomen?", answerType: "choice", options: ["Gemeten", "Revisie", "Beide"] },
      { question: "Meerwerk aangetroffen?" },
      { question: "Toelichting meerwerk", answerType: "text", required: false },
    ],
    shots: [
      { group: "Afrekening", title: "Bewijsfoto per post" },
      { group: "Afrekening", title: "Meting (met meetlint/duimstok)", required: false },
    ],
    sections: withBilling(BASE_SECTIONS),
  },
  {
    key: "nazorg",
    name: "Nazorg-/garantieschouw",
    phase: "nazorg",
    description: "Verzakkingen, schade en restpunten in de garantieperiode.",
    purposeText:
      "Deze nazorgschouw controleert het tracé en de stations in de garantieperiode op verzakkingen, schade en openstaande restpunten.",
    aiInstructions: `${GENERAL_AI} Verzakkingen van verharding → kwaliteit, prioriteit afhankelijk van veiligheid voor verkeer. Koppel waar mogelijk aan eerdere restpunten.`,
    checklist: [
      { question: "Verzakkingen aangetroffen?", photoRequired: true },
      { question: "Schade aan verharding of groen?" },
      { question: "Eerdere restpunten afgehandeld?" },
      { question: "Klachten van omwonenden bekend?", required: false },
    ],
    shots: [
      { group: "Nazorg", title: "Overzicht tracédeel" },
      { group: "Nazorg", title: "Verzakking/schade (detail)", required: false },
    ],
    sections: BASE_SECTIONS,
  },
  {
    key: "calamiteit",
    name: "Calamiteit-/storingsschouw",
    phase: "ad_hoc",
    description: "Snelle vastlegging van schade/storing met tijdlijn.",
    purposeText:
      "Deze schouw legt een calamiteit of storing snel en feitelijk vast: situatie ter plaatse, schade, genomen maatregelen en tijdlijn.",
    aiInstructions: `${GENERAL_AI} Maak in de sectie Bevindingen een chronologische tijdlijn op basis van tijdstempels van captures en gesproken tekst. Veiligheid en directe maatregelen eerst. Geen speculatie over schuld of oorzaak.`,
    checklist: [
      { question: "Situatie veilig gesteld?", photoRequired: true },
      { question: "Netbeheerder / meldkamer geïnformeerd?" },
      { question: "Aantal getroffen aansluitingen (schatting)", answerType: "number", required: false },
      { question: "Graafschade door derden?" },
      { question: "Gegevens veroorzaker vastgelegd?", required: false },
      { question: "Genomen maatregelen", answerType: "text" },
    ],
    shots: [
      { group: "Calamiteit", title: "Overzicht situatie" },
      { group: "Calamiteit", title: "Schade (detail)" },
      { group: "Calamiteit", title: "Genomen maatregelen / afzetting" },
    ],
    sections: BASE_SECTIONS,
  },
];
