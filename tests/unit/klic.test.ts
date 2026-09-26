import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { parseImklXml, parseKlicDelivery, parsePosList } from "@/lib/geo/klic";

const GML = `<?xml version="1.0" encoding="UTF-8"?>
<gml:FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:imkl="http://www.geostandaarden.nl/imkl/wibon" xmlns:us-net-common="http://inspire.ec.europa.eu/schemas/us-net-common/4.0" xmlns:us-net-el="http://inspire.ec.europa.eu/schemas/us-net-el/4.0" xmlns:net="http://inspire.ec.europa.eu/schemas/net/4.0" xmlns:xlink="http://www.w3.org/1999/xlink">
  <gml:featureMember>
    <imkl:Utiliteitsnet gml:id="nl.imkl-KL1234.net1">
      <imkl:thema xlink:href="http://definities.geostandaarden.nl/imkl2015/id/waarde/Thema/middenspanning"/>
      <us-net-common:authorityRole>Enexis</us-net-common:authorityRole>
    </imkl:Utiliteitsnet>
  </gml:featureMember>
  <gml:featureMember>
    <us-net-common:UtilityLink gml:id="nl.imkl-KL1234.link1">
      <net:centrelineGeometry>
        <gml:LineString gml:id="ls1" srsName="urn:ogc:def:crs:EPSG::28992">
          <gml:posList>203000 502000 203100 502050 203200 502080</gml:posList>
        </gml:LineString>
      </net:centrelineGeometry>
    </us-net-common:UtilityLink>
  </gml:featureMember>
  <gml:featureMember>
    <us-net-el:ElectricityCable gml:id="nl.imkl-KL1234.cable1">
      <net:link xlink:href="nl.imkl-KL1234.link1"/>
      <net:inNetwork xlink:href="nl.imkl-KL1234.net1"/>
    </us-net-el:ElectricityCable>
  </gml:featureMember>
</gml:FeatureCollection>`;

describe("KLIC/IMKL parser", () => {
  it("converts RD posLists to WGS84", () => {
    const coords = parsePosList("203000 502000 203100 502050");
    expect(coords).toHaveLength(2);
    expect(coords[0]![0]).toBeGreaterThan(6);
    expect(coords[0]![1]).toBeGreaterThan(52.4);
  });

  it("resolves cables to their links and themes", () => {
    const fc = parseImklXml(GML);
    expect(fc.features).toHaveLength(1);
    const f = fc.features[0]!;
    expect(f.properties.thema).toBe("middenspanning");
    expect(f.properties.netbeheerder).toBe("Enexis");
    expect(f.properties.elementType).toBe("ElectricityCable");
    expect(f.geometry.type).toBe("LineString");
  });

  it("reads a zipped delivery", async () => {
    const zip = new JSZip();
    zip.file("GI_gebiedsinformatielevering_26O0123456_1.xml", GML);
    const data = await zip.generateAsync({ type: "uint8array" });
    const { collection, meldingnummer } = await parseKlicDelivery(data, "Levering_26O0123456.zip");
    expect(collection.features).toHaveLength(1);
    expect(meldingnummer).toBe("26O0123456");
  });
});
