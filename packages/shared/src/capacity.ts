/** Kapasitas syuting per hari Senin–Jumat dalam slot (PRD §6.7, §13). Jumat ½ hari. */
export const DAY_CAPACITY = [15, 15, 15, 15, 7] as const;
export const DAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'] as const;

export const BOBOT = ['gampang', 'susah'] as const;
export type Bobot = (typeof BOBOT)[number];

/** USULAN (belum dikonfirmasi tim): Gampang=1 slot, Susah=2 slot. */
export const SLOT_PER_BOBOT: Record<Bobot, number> = { gampang: 1, susah: 2 };

export const BOBOT_LABEL: Record<Bobot, string> = { gampang: 'Gampang', susah: 'Susah' };

export const capacityOf = (dayIndex: number): number => DAY_CAPACITY[dayIndex] ?? 0;

/** Kapasitas = jumlah slot, bukan jumlah konten. */
export function slotsUsed(items: readonly { bobot: Bobot }[]): number {
  return items.reduce((sum, item) => sum + SLOT_PER_BOBOT[item.bobot], 0);
}

export function isOverCapacity(dayIndex: number, items: readonly { bobot: Bobot }[]): boolean {
  return slotsUsed(items) > capacityOf(dayIndex);
}
