/**
 * Weather at inspection start via Open-Meteo (no API key required).
 * https://open-meteo.com/en/docs — `current` parameter returns the current
 * conditions for the given coordinate.
 */
export type Weather = {
  temperatureC: number | null;
  precipitationMm: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
  humidity: number | null;
  weatherCode: number | null;
  description: string;
  observedAt: string;
  source: "open-meteo" | "handmatig";
};

const WMO_DESCRIPTIONS: Record<number, string> = {
  0: "Onbewolkt",
  1: "Overwegend helder",
  2: "Half bewolkt",
  3: "Bewolkt",
  45: "Mist",
  48: "Rijpmist",
  51: "Lichte motregen",
  53: "Motregen",
  55: "Dichte motregen",
  56: "Lichte ijzel",
  57: "IJzel",
  61: "Lichte regen",
  63: "Regen",
  65: "Zware regen",
  66: "Lichte onderkoelde regen",
  67: "Onderkoelde regen",
  71: "Lichte sneeuw",
  73: "Sneeuw",
  75: "Zware sneeuw",
  77: "Motsneeuw",
  80: "Lichte buien",
  81: "Buien",
  82: "Zware buien",
  85: "Lichte sneeuwbuien",
  86: "Sneeuwbuien",
  95: "Onweer",
  96: "Onweer met lichte hagel",
  99: "Onweer met hagel",
};

export function describeWeatherCode(code: number | null | undefined): string {
  if (code === null || code === undefined) return "Onbekend";
  return WMO_DESCRIPTIONS[code] ?? `Weercode ${code}`;
}

export function windDirectionLabel(deg: number | null | undefined): string {
  if (deg === null || deg === undefined) return "";
  const dirs = ["N", "NO", "O", "ZO", "Z", "ZW", "W", "NW"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 45) % 8]!;
}

export function formatWeather(w: Weather | null | undefined): string {
  if (!w) return "Niet vastgelegd";
  const parts = [w.description];
  if (w.temperatureC !== null) parts.push(`${Math.round(w.temperatureC)} °C`);
  if (w.windSpeedKmh !== null) parts.push(`wind ${windDirectionLabel(w.windDirectionDeg)} ${Math.round(w.windSpeedKmh)} km/u`.replace("  ", " "));
  if (w.precipitationMm !== null && w.precipitationMm > 0) parts.push(`${w.precipitationMm} mm neerslag`);
  return parts.join(", ");
}

export async function fetchWeather(lat: number, lon: number, fetchImpl: typeof fetch = fetch): Promise<Weather | null> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", lat.toFixed(5));
  url.searchParams.set("longitude", lon.toFixed(5));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
  );
  url.searchParams.set("timezone", "GMT");
  try {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      current?: {
        time?: string;
        temperature_2m?: number;
        relative_humidity_2m?: number;
        precipitation?: number;
        weather_code?: number;
        wind_speed_10m?: number;
        wind_direction_10m?: number;
      };
    };
    const c = data.current;
    if (!c) return null;
    return {
      temperatureC: c.temperature_2m ?? null,
      precipitationMm: c.precipitation ?? null,
      windSpeedKmh: c.wind_speed_10m ?? null,
      windDirectionDeg: c.wind_direction_10m ?? null,
      humidity: c.relative_humidity_2m ?? null,
      weatherCode: c.weather_code ?? null,
      description: describeWeatherCode(c.weather_code),
      observedAt: c.time ? new Date(`${c.time}Z`).toISOString() : new Date().toISOString(),
      source: "open-meteo",
    };
  } catch {
    return null;
  }
}
