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
