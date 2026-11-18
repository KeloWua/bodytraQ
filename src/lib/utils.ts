export function uuid(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Fecha superior del timeline. Cuando hay registros de años diferentes, añade
// el año corto (26/27/19); si todos comparten año, lo omite para no repetirlo.
export function fmtDate(iso: string, showShortYear = false): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(showShortYear ? { year: "2-digit" as const } : {}),
  });
}

export function spansMultipleYears(dates: string[]): boolean {
  const years = new Set(dates.map((iso) => iso.slice(0, 4)));
  return years.size > 1;
}

// Medidas corporales opcionales (cm) registrables en cada check-in.
export const MEASUREMENT_FIELDS = [
  { key: "neck_cm", label: "Cuello" },
  { key: "shoulders_cm", label: "Hombros" },
  { key: "chest_cm", label: "Pecho" },
  { key: "arm_cm", label: "Brazo" },
  { key: "waist_cm", label: "Cintura" },
  { key: "hips_cm", label: "Cadera" },
  { key: "thigh_cm", label: "Muslo" },
  { key: "calf_cm", label: "Pantorrilla" },
] as const;
export type MeasurementKey = (typeof MEASUREMENT_FIELDS)[number]["key"];
export type CheckInMeasurements = Partial<Record<MeasurementKey, number | null>>;

export function kgToLb(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

export function lbToKg(lb: number): number {
  return Math.round((lb / 2.20462) * 100) / 100;
}

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
