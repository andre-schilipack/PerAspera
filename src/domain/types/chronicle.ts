/** Append-only city intel / historian scrap (Velho Rabiscão). */
export interface ChronicleEntry {
  id: string;
  /** Unix ms when the entry was recorded. */
  at: number;
  text: string;
}
