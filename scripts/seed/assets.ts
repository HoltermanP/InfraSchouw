/**
 * Demo image catalogue. Every image is a generated, rights-free illustration
 * with a clear "Demo –" label (section 12 of the brief).
 */
export type Scene =
  | "street"
  | "trench"
  | "tree"
  | "crossing"
  | "boring"
  | "pavement"
  | "facade"
  | "station-ext"
  | "station-door"
  | "station-sign"
  | "station-int"
  | "rmu"
  | "rmu-field"
  | "nameplate"
  | "trafo"
  | "lv-board"
  | "cable-cellar"
  | "earthing"
  | "rtu"
  | "safety"
  | "damage"
  | "barrier"
  | "excavator"
  | "terminations"
  | "sketch";

export type DemoAsset = {
  key: string;
  label: string;
  scene: Scene;
  /** Nameplate text lines (for nameplate scenes). */
  plate?: [string, string][];
};

export const DEMO_ASSETS: DemoAsset[] = [
  // Tracéschouw
  { key: "trace-01-start", label: "Demo – beginpunt tracé Frankhuizerallee", scene: "street" },
  { key: "trace-02-bomen", label: "Demo – bomenrij langs tracé", scene: "tree" },
  { key: "trace-03-kruising", label: "Demo – kruising Frankhuizerallee / Werkerlaan", scene: "crossing" },
  { key: "trace-04-klinkers", label: "Demo – klinkerverharding trottoir", scene: "pavement" },
  { key: "trace-05-boorlocatie", label: "Demo – beoogde boorlocatie (intredepunt)", scene: "boring" },
  { key: "trace-06-sloot", label: "Demo – watergang: kruising met gestuurde boring", scene: "boring" },
  { key: "trace-07-sleuf", label: "Demo – proefsleuf met bestaande kabels", scene: "trench" },
  { key: "trace-08-berm", label: "Demo – grasberm tracé", scene: "street" },
  { key: "trace-09-oprit", label: "Demo – inritten woningen (bereikbaarheid)", scene: "pavement" },
  { key: "trace-10-eind", label: "Demo – eindpunt tracé bij station Werkerlaan", scene: "street" },
  // Nulmeting
  { key: "nul-01-gevel", label: "Demo – gevel nr. 112 (vooropname)", scene: "facade" },
  { key: "nul-02-gevel", label: "Demo – gevel nr. 118 met bestaande scheur", scene: "facade" },
  { key: "nul-03-verharding", label: "Demo – verzakking klinkers vóór werk", scene: "pavement" },
  { key: "nul-04-boom", label: "Demo – straatboom (lindeboom) vooropname", scene: "tree" },
  { key: "nul-05-kolk", label: "Demo – kolk en straatmeubilair", scene: "street" },
  { key: "nul-06-gevel", label: "Demo – gevel nr. 124 (geen schade)", scene: "facade" },
  // Stationsoplevering (shotlist 8.2)
  { key: "st-01-overzicht", label: "Demo – overzicht station vanaf straat", scene: "station-ext" },
  { key: "st-02-deuren", label: "Demo – vooraanzicht / deuren station", scene: "station-door" },
  { key: "st-03-zijkant", label: "Demo – zij- en achterkant station", scene: "station-ext" },
  { key: "st-04-naamplaat", label: "Demo – stationsnummer ZWL-STH-4012", scene: "station-sign" },
  { key: "st-05-fundatie", label: "Demo – toegang, fundatie en maaiveld", scene: "pavement" },
  { key: "st-06-kabelinvoer", label: "Demo – kabelinvoer buitenzijde", scene: "cable-cellar" },
  { key: "st-07-ms-ruimte", label: "Demo – overzicht MS-ruimte", scene: "station-int" },
  { key: "st-08-rmu", label: "Demo – MS-installatie (RMU) Eaton Xiria", scene: "rmu" },
  {
    key: "st-09-typeplaat-rmu",
    label: "Demo – typeplaat MS-installatie",
    scene: "nameplate",
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
  { key: "st-10-veld1", label: "Demo – veld 1 kabel richting A", scene: "rmu-field" },
  { key: "st-10-veld2", label: "Demo – veld 2 kabel richting B", scene: "rmu-field" },
  { key: "st-10-veld3", label: "Demo – veld 3 kabel (reserve)", scene: "rmu-field" },
  { key: "st-10-veld4", label: "Demo – veld 4 trafoveld (zekering 40 A)", scene: "rmu-field" },
  { key: "st-11-eindsluitingen", label: "Demo – MS-eindsluitingen (T-plugs)", scene: "terminations" },
  { key: "st-12-trafo", label: "Demo – transformator overzicht", scene: "trafo" },
  {
    key: "st-13-typeplaat-trafo",
    label: "Demo – typeplaat trafo",
    scene: "nameplate",
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
  { key: "st-14-ls-rek", label: "Demo – LS-rek overzicht", scene: "lv-board" },
  { key: "st-15-ls-groepen", label: "Demo – LS-groepen en zekeringen", scene: "lv-board" },
  { key: "st-16-kabelkelder", label: "Demo – kabelkelder en afdichting", scene: "cable-cellar" },
  { key: "st-17-aarding", label: "Demo – aardrail en aansluitingen", scene: "earthing" },
  { key: "st-18-rtu", label: "Demo – RTU / distributieautomatisering", scene: "rtu" },
  { key: "st-19-veiligheid", label: "Demo – veiligheidsbord en blusmiddel", scene: "safety" },
  { key: "st-20-afwerking", label: "Demo – eindafwerking station", scene: "station-ext" },
  // Calamiteit
  { key: "cal-01-overzicht", label: "Demo – graafschade overzicht", scene: "excavator" },
  { key: "cal-02-schade", label: "Demo – beschadigde LS-kabel (detail)", scene: "damage" },
  { key: "cal-03-afzetting", label: "Demo – afzetting en maatregelen", scene: "barrier" },
  { key: "cal-04-kraan", label: "Demo – graafmachine veroorzaker", scene: "excavator" },
  { key: "cal-05-herstel", label: "Demo – noodherstel met mof", scene: "trench" },
  // Inbox (smart glasses)
  { key: "glasses-01", label: "Demo – brilfoto: sleuf met mantelbuis", scene: "trench" },
  { key: "glasses-02", label: "Demo – brilfoto: kabelhaspel", scene: "street" },
];
