/**
 * Demo image catalogue. Every image is a real, freely licensed photo from
 * Wikimedia Commons (CC0 / public domain / CC BY / CC BY-SA), cropped to 4:3 and
 * marked "Demo" with its attribution (see public/demo/CREDITS.md).
 * Nameplates and the station number sign are rendered onto a real photo so the
 * text matches the seeded OCR/nameplate values.
 */
export type Crop = {
  /** Fractions (0–1) of the source image to keep before resizing to 4:3. */
  left: number;
  top: number;
  width: number;
  height: number;
};

export type DemoPhoto = {
  /** Commons file title without the "File:" prefix. */
  file: string;
  crop?: Crop;
};

export type DemoAsset = {
  key: string;
  label: string;
  photo: DemoPhoto;
  /** Nameplate text lines, rendered as a metal plate on top of the (blurred) photo. */
  plate?: [string, string][];
  /** Station number sign, rendered on top of the (blurred) photo. */
  sign?: { code: string; lines: string[] };
};

const STATION = "Montaż stacji transformatorowej.jpg";
const STATION_DOOR = "Distribution substation - Stedin 882 - Veerhaven 7 - Scheepvaartkwartier - Centrum - Rotterdam - 2017.jpg";
const MV_PANEL = "Medium voltage panel.jpg";
const MV_FIELDS = "Netzstation Schaltanlage.jpg";
const TRAFO = "Regelbarer Ortsnetztrafo in Schwabmünchen.JPG";
const STEDIN_3158_FRONT = "Distribution substation - BAG 0599100000755411 - Stedin 3158 - Pieter Rosemondweg 37 - Schiebroek - Hillegersberg-Schiebroek - Rotterdam - 2024 - pic2.jpg";
const STEDIN_3158_SIDE = "Distribution substation - BAG 0599100000755411 - Stedin 3158 - Pieter Rosemondweg 37 - Schiebroek - Hillegersberg-Schiebroek - Rotterdam - 2024 - pic1.jpg";
const MV_GIS = "Schaltanlage Hochspannung 3.jpg";
const TRAFO_400 = "Netzstation Trafo.jpg";
const LV_BOARD = "FS-TrafoSt.JPG";
const TILIA = "Zwarte linde (Tilia x europaea 'Pallida') - Ingenhouszstraat, Majoor Bosshardtplantsoen, Utrecht - 13 juni 2022.jpg";

export const DEMO_ASSETS: DemoAsset[] = [
  // Tracéschouw
  { key: "trace-01-start", label: "beginpunt tracé Frankhuizerallee", photo: { file: "Zwolle Stadshagen railway station 2019 3.jpg" } },
  { key: "trace-02-bomen", label: "bomenrij langs tracé", photo: { file: TILIA } },
  { key: "trace-03-kruising", label: "kruising Frankhuizerallee / Werkerlaan", photo: { file: "Johannes Poststraat.jpg" } },
  { key: "trace-04-klinkers", label: "klinkerverharding trottoir", photo: { file: "HasleKlinker Arendalsgade.jpg" } },
  { key: "trace-05-boorlocatie", label: "beoogde boorlocatie (intredepunt)", photo: { file: 'Grundodrill 18ACS "Black Mole" Limited Edition.jpg' } },
  { key: "trace-06-sloot", label: "watergang: kruising met gestuurde boring", photo: { file: "Vinex locatie - Zwolle - 20387657 - RCE.jpg" } },
  { key: "trace-07-sleuf", label: "proefsleuf met bestaande kabels", photo: { file: "20201012 SpeedPipes HorizontalDirectionalDrilling DSC04955 PtrQs.jpg" } },
  { key: "trace-08-berm", label: "grasberm tracé", photo: { file: "Long grass on the verge, Huddersfield Road, Brighouse - geograph.org.uk - 6876578.jpg" } },
  { key: "trace-09-oprit", label: "inritten woningen (bereikbaarheid)", photo: { file: "RijtjeshuizenHattem.jpg" } },
  { key: "trace-10-eind", label: "eindpunt tracé bij station Werkerlaan", photo: { file: "Oliemolen 7-14, straat in Hoorn.jpg" } },
  // Nulmeting
  { key: "nul-01-gevel", label: "gevel nr. 112 (vooropname)", photo: { file: "Drieboomlaan 274-280, Hoorn rechts.jpg" } },
  { key: "nul-02-gevel", label: "gevel nr. 118 met bestaande scheur", photo: { file: "Great Serpentine Wall Cracks.jpg" } },
  { key: "nul-03-verharding", label: "verzakking klinkers vóór werk", photo: { file: "Een soortenrijke vorm van het Bryo-Saginetum tussen klinkers.jpg" } },
  { key: "nul-04-boom", label: "straatboom (linde) vooropname", photo: { file: "Zwarte linde (Tilia x europaea 'Pallida') 2 - Ingenhouszstraat, Majoor Bosshardtplantsoen, Utrecht - 13 juni 2023.jpg", crop: { left: 0, top: 0, width: 1, height: 0.56 } } },
  { key: "nul-05-kolk", label: "kolk en straatmeubilair", photo: { file: "Stormwater drain in Hamilton Central, featuring a kōkopu symbol.jpg" } },
  { key: "nul-06-gevel", label: "gevel nr. 124 (geen schade)", photo: { file: "Drieboomlaan 234-248, Hoorn links.jpg" } },
  // Stationsoplevering (shotlist 8.2)
  { key: "st-01-overzicht", label: "overzicht station vanaf straat", photo: { file: STATION } },
  { key: "st-02-deuren", label: "vooraanzicht / deuren station", photo: { file: STATION, crop: { left: 0, top: 0.12, width: 0.55, height: 0.8 } } },
  { key: "st-03-zijkant", label: "zij- en achterkant station", photo: { file: STATION, crop: { left: 0.4, top: 0.12, width: 0.6, height: 0.8 } } },
  {
    key: "st-04-naamplaat",
    label: "stationsnummer ZWL-STH-4012",
    photo: { file: STATION_DOOR, crop: { left: 0.15, top: 0.3, width: 0.7, height: 0.4 } },
    sign: { code: "ZWL-STH-4012", lines: ["Enexis Netbeheer", "10 kV"] },
  },
  { key: "st-05-fundatie", label: "toegang, fundatie en maaiveld", photo: { file: STATION, crop: { left: 0.2, top: 0.5, width: 0.6, height: 0.45 } } },
  { key: "st-06-kabelinvoer", label: "kabelinvoer buitenzijde", photo: { file: "ATEX Ex approved Roxtec seals.JPG" } },
  { key: "st-07-ms-ruimte", label: "overzicht MS-ruimte", photo: { file: "Umspannwerk Wienerberg 09.JPG" } },
  { key: "st-08-rmu", label: "MS-installatie (RMU)", photo: { file: MV_PANEL } },
  {
    key: "st-09-typeplaat-rmu",
    label: "typeplaat MS-installatie",
    photo: { file: MV_PANEL },
    plate: [
      ["Fabrikant", "Eaton"],
      ["Type", "Xiria 3K+1T"],
      ["Serienr.", "XR-2026-118834"],
      ["Bouwjaar", "2026"],
      ["Ur", "12 kV"],
      ["Ir", "630 A"],
      ["Isolatie", "Vast (SF6-vrij)"],
      ["Norm", "IEC 62271-200"],
    ],
  },
  { key: "st-10-veld1", label: "veld 1 kabel richting A", photo: { file: MV_FIELDS, crop: { left: 0, top: 0.2, width: 0.6, height: 0.6 } } },
  { key: "st-10-veld2", label: "veld 2 kabel richting B", photo: { file: MV_FIELDS, crop: { left: 0.2, top: 0.2, width: 0.6, height: 0.6 } } },
  { key: "st-10-veld3", label: "veld 3 kabel (reserve)", photo: { file: MV_FIELDS, crop: { left: 0.4, top: 0.2, width: 0.6, height: 0.6 } } },
  { key: "st-10-veld4", label: "veld 4 trafoveld (zekering 40 A)", photo: { file: "LeistSch20.JPG" } },
  { key: "st-11-eindsluitingen", label: "MS-eindsluitingen (T-plugs)", photo: { file: "Endverschluss.jpg" } },
  { key: "st-12-trafo", label: "transformator overzicht", photo: { file: TRAFO } },
  {
    key: "st-13-typeplaat-trafo",
    label: "typeplaat trafo",
    photo: { file: TRAFO },
    plate: [
      ["Fabrikant", "SGB-SMIT"],
      ["Type", "DOTE 630/10"],
      ["Serienr.", "T-5561207"],
      ["Bouwjaar", "2026"],
      ["Vermogen", "630 kVA"],
      ["Spanning", "10,5 kV / 420 V"],
      ["Schakelgroep", "Dyn5"],
      ["Koeling", "ONAN"],
    ],
  },
  { key: "st-14-ls-rek", label: "LS-rek overzicht", photo: { file: "Sicherungs-Lastschaltleiste.jpg" } },
  { key: "st-15-ls-groepen", label: "LS-groepen en zekeringen", photo: { file: "NH Sicherung.jpg" } },
  { key: "st-16-kabelkelder", label: "kabelkelder en afdichting", photo: { file: "Roxtec solution.jpg" } },
  { key: "st-17-aarding", label: "aardrail en aansluitingen", photo: { file: "Dornbirn-modern main earthing busbar (copper)-01ASD - Kopie.jpg" } },
  { key: "st-18-rtu", label: "RTU / distributieautomatisering", photo: { file: "Remote terminal unit of the regional controller.jpg" } },
  { key: "st-19-veiligheid", label: "veiligheidsbord en blusmiddel", photo: { file: "High voltage warning sign (pictogram) on fuse box in German shop.jpg" } },
  { key: "st-20-afwerking", label: "eindafwerking station", photo: { file: STATION, crop: { left: 0.25, top: 0.05, width: 0.75, height: 0.9 } } },
  // Tracéschouw Hasselterweg en opleveringsschouw tracé (showcase)
  { key: "tr2-01-start", label: "beginpunt tracé aan de Hasselterweg", photo: { file: "Kekerdom Duffeltdijk - Kekerdomse Ward PM22-07.jpg" } },
  { key: "tr2-02-sloot", label: "sloot langs de Hasselterweg", photo: { file: "De Smalle Themaat in Vleuten, de weg zal zijn genoemd naar het naburige buurtschap Themaat.jpg", crop: { left: 0, top: 0, width: 0.93, height: 1 } } },
  { key: "tr2-03-duiker", label: "duiker onder perceeltoegang", photo: { file: "Termietergouw, duiker.jpg", crop: { left: 0, top: 0, width: 0.75, height: 1 } } },
  { key: "tr2-04-erfafrit", label: "erfafrit agrarisch bedrijf nr. 112", photo: { file: "Overzicht omgeving van de boerderij, oprit - Lichtenvoorde - 20380837 - RCE.jpg", crop: { left: 0.05, top: 0, width: 0.883, height: 1 } } },
  { key: "tr2-05-bomen", label: "knotwilgen langs het tracé", photo: { file: "Ballingbuer bij Goingarijp. (actm) 01.jpg", crop: { left: 0.05, top: 0, width: 0.828, height: 1 } } },
  { key: "tr2-06-kruising", label: "kruising Hasselterweg (N331)", photo: { file: "Provinciale weg 247 richting Broek in Waterland, Het Schouw.jpg", crop: { left: 0.05, top: 0, width: 0.889, height: 1 } } },
  { key: "tr2-07-boorstelling", label: "boorstelling in de berm", photo: { file: "Ditch Witch, Gebr van Leeuwen Boringen BV pic3.jpg" } },
  { key: "tr2-08-gasleiding", label: "markeerpaal gastransportleiding", photo: { file: "Gasunie paal, Stadskanaal (2019) 05.jpg", crop: { left: 0.15, top: 0, width: 0.75, height: 1 } } },
  { key: "tr2-09-hoogspanning", label: "kruising 110 kV-hoogspanningslijn", photo: { file: "Electricity pylons 110 kV Enschede NL 2017.jpg", crop: { left: 0.05, top: 0, width: 0.833, height: 1 } } },
  { key: "tr2-10-grondwater", label: "proefsleuf met grondwater", photo: { file: "Archaeologists excavating a waterlogged trench at Wadhurst, New Road, Little Burstead, Billericay, Essex, July-September 2023.jpg", crop: { left: 0, top: 0, width: 0.889, height: 1 } } },
  { key: "tr2-11-zonnepark", label: "zonnepark Hasselterweg (eindpunt)", photo: { file: "Solar plant in Ameland.jpg", crop: { left: 0, top: 0, width: 0.75, height: 1 } } },
  { key: "tr2-12-kabelhaspel", label: "kabelhaspel MS-kabel", photo: { file: "Kabeltrommel Anhänger mit Zugmaschine.jpg" } },
  { key: "opl-01-klinkers", label: "herstraten trottoir", photo: { file: "Sidewalk construction 2.JPG", crop: { left: 0.05, top: 0, width: 0.89, height: 1 } } },
  { key: "opl-02-asfalt", label: "asfaltherstel kruising", photo: { file: "Recent patching work on Bellwell Lane - geograph.org.uk - 4381910.jpg" } },
  { key: "opl-03-berm", label: "berm hersteld en ingezaaid", photo: { file: "Reseeded roadside verge - geograph.org.uk - 6461937.jpg", crop: { left: 0, top: 0, width: 0.889, height: 1 } } },
  { key: "opl-04-aanvulling", label: "aanvulling verdichten met trilplaat", photo: { file: "Rüttelplatte Ammann.JPG", crop: { left: 0, top: 0, width: 0.892, height: 1 } } },
  { key: "opl-05-markeerlint", label: "afdekplaten boven de kabel", photo: { file: "Cable protection tiles.JPG" } },
  { key: "opl-06-uittrede", label: "boorkop in uittredeput", photo: { file: "GRUNDOMAT.jpg", crop: { left: 0.03, top: 0, width: 0.967, height: 1 } } },
  { key: "opl-07-mof", label: "verbindingsmof in de sleuf", photo: { file: "Kabelverlegung-Tiefbau.JPG" } },
  { key: "opl-08-opgeruimd", label: "straat opgeleverd", photo: { file: "Bemmel - Parksingel (a street in the residential area of Klaverkamp).jpg" } },
  { key: "opl-09-verzakking", label: "verzakking bestrating inrit nr. 23", photo: { file: "A trip hazard on Philip Lane, Haringey, London 01.jpg" } },
  { key: "opl-10-kabelmarkering", label: "kabelmarkering in de bestrating", photo: { file: "Berlin Wannsee Kabelmarkierung.jpg" } },
  // Stationsoplevering ZWL-STH-4013 (showcase)
  { key: "st2-01-overzicht", label: "overzicht station vanaf de Werkerlaan", photo: { file: STEDIN_3158_FRONT, crop: { left: 0.055, top: 0, width: 0.889, height: 1 } } },
  { key: "st2-02-deuren", label: "voorzijde met toegangsdeuren", photo: { file: STEDIN_3158_FRONT, crop: { left: 0.25, top: 0.12, width: 0.5, height: 0.5625 } } },
  { key: "st2-03-zijkant", label: "zijgevel met graffiti", photo: { file: STEDIN_3158_SIDE, crop: { left: 0.2, top: 0.12, width: 0.35, height: 0.39375 } } },
  {
    key: "st2-04-naamplaat",
    label: "stationsnummer ZWL-STH-4013",
    photo: { file: STEDIN_3158_FRONT, crop: { left: 0.6, top: 0.33, width: 0.16, height: 0.18 } },
    sign: { code: "ZWL-STH-4013", lines: ["Enexis Netbeheer", "10 kV"] },
  },
  { key: "st2-05-fundatie", label: "plint en aansluiting maaiveld", photo: { file: STEDIN_3158_FRONT, crop: { left: 0.22, top: 0.55, width: 0.4, height: 0.45 } } },
  { key: "st2-06-kabelinvoer", label: "kabelinvoer onder de fundering", photo: { file: "2021-04-08 Mürztal Kabeltrasse Strom.jpg", crop: { left: 0.15, top: 0.3, width: 0.7, height: 0.7 } } },
  { key: "st2-07-ms-ruimte", label: "MS-ruimte met installatie en trafo", photo: { file: "11-Transformateur électrique et cellules de 20 kV.jpg" } },
  { key: "st2-08-rmu", label: "MS-installatie (vooraanzicht)", photo: { file: MV_GIS, crop: { left: 0, top: 0.06, width: 0.68, height: 0.752 } } },
  {
    key: "st2-09-typeplaat-rmu",
    label: "typeplaat MS-installatie",
    photo: { file: MV_GIS, crop: { left: 0.08, top: 0.04, width: 0.42, height: 0.4645 } },
    plate: [
      ["Fabrikant", "Eaton"],
      ["Type", "Xiria 3K+1T"],
      ["Serienr.", "XR-2026-119207"],
      ["Bouwjaar", "2026"],
      ["Ur", "12 kV"],
      ["Ir", "630 A"],
      ["Isolatie", "Vast (SF6-vrij)"],
      ["Norm", "IEC 62271-200"],
    ],
  },
  { key: "st2-10-veld1", label: "veld K1 richting Frankhuizerallee", photo: { file: MV_GIS, crop: { left: 0.07, top: 0.3, width: 0.2, height: 0.45 } } },
  { key: "st2-10-veld2", label: "veld K2 zonnepark (nog blind)", photo: { file: MV_GIS, crop: { left: 0.17, top: 0.3, width: 0.2, height: 0.45 } } },
  { key: "st2-10-veld3", label: "veld K3 richting Werkerlaan-Noord", photo: { file: MV_GIS, crop: { left: 0.27, top: 0.3, width: 0.2, height: 0.45 } } },
  { key: "st2-10-veld4", label: "veld T1 trafoveld (zekering 40 A)", photo: { file: MV_GIS, crop: { left: 0.31, top: 0.42, width: 0.2, height: 0.4 } } },
  { key: "st2-11-eindsluitingen", label: "MS-eindsluitingen (insteek)", photo: { file: TRAFO_400, crop: { left: 0.25, top: 0.36, width: 0.5, height: 0.28125 } } },
  { key: "st2-12-trafo", label: "distributietransformator 400 kVA", photo: { file: TRAFO_400, crop: { left: 0, top: 0.41, width: 1, height: 0.5625 } } },
  {
    key: "st2-13-typeplaat-trafo",
    label: "typeplaat trafo",
    photo: { file: TRAFO_400, crop: { left: 0.2, top: 0.62, width: 0.6, height: 0.3375 } },
    plate: [
      ["Fabrikant", "SGB-SMIT"],
      ["Type", "DOTE 400/10"],
      ["Serienr.", "T-5561388"],
      ["Bouwjaar", "2026"],
      ["Vermogen", "400 kVA"],
      ["Spanning", "10,5 kV / 420 V"],
      ["Schakelgroep", "Dyn5"],
      ["Koeling", "ONAN"],
    ],
  },
  { key: "st2-14-ls-rek", label: "LS-rek in het station", photo: { file: LV_BOARD } },
  { key: "st2-15-ls-groepen", label: "LS-groepen met NH-zekeringen", photo: { file: LV_BOARD, crop: { left: 0.38, top: 0.12, width: 0.5, height: 0.5 } } },
  { key: "st2-16-kabelkelder", label: "kabelkelder met MS-kabels", photo: { file: "Medium voltage cables (32304014141).jpg" } },
  { key: "st2-17-aarding", label: "aardrail met aardverbindingen", photo: { file: LV_BOARD, crop: { left: 0.7, top: 0.55, width: 0.3, height: 0.3 } } },
  { key: "st2-18-veiligheid", label: "waarschuwingsbord op de deur", photo: { file: STEDIN_3158_FRONT, crop: { left: 0.42, top: 0.14, width: 0.24, height: 0.27 } } },
  { key: "st2-19-afwerking", label: "afgewerkt station in de omgeving", photo: { file: STEDIN_3158_SIDE, crop: { left: 0.1, top: 0.05, width: 0.8, height: 0.9 } } },
  // Calamiteit
  { key: "cal-01-overzicht", label: "graafschade overzicht", photo: { file: "Caterpillar M315C excavator.JPG" } },
  { key: "cal-02-schade", label: "beschadigde LS-kabel (detail)", photo: { file: "Pfingststurm-Ela-2014 Volksgarten-Dortmund-Luetgendortmund Buche-gestuerzt.JPG" } },
  { key: "cal-03-afzetting", label: "afzetting en maatregelen", photo: { file: "Roadworks on Wakefield Road - geograph.org.uk - 6135612.jpg" } },
  { key: "cal-04-kraan", label: "graafmachine veroorzaker", photo: { file: "Wacker Neuson 6503 excavator in Rotterdam, 2019.jpg" } },
  { key: "cal-05-herstel", label: "noodherstel met mof", photo: { file: "Underground cable in trench (50855598013).jpg" } },
  // Inbox (smart glasses)
  { key: "glasses-01", label: "brilfoto: sleuf met mantelbuis", photo: { file: "Backfilling and compacting of soil near manhole in the future LIRR Mid-day Storage Yard. (CQ033, 4-9-2018) (39620888960).jpg" } },
  { key: "glasses-02", label: "brilfoto: kabelhaspel", photo: { file: "Oosterscheldestraat 2014.03.21 (07).JPG" } },
];
