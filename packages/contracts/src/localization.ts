import { z } from "zod";

/**
 * Localization foundation — no translation workflows in Phase 1.
 * English, Arabic, Turkish supported as metadata from day one.
 */
export const LanguageCodeSchema = z.enum(["en", "ar", "tr"]);
export type LanguageCode = z.infer<typeof LanguageCodeSchema>;

export const LocaleSchema = z.string().min(2); // e.g. en-AE, ar-AE, tr-TR
export type Locale = z.infer<typeof LocaleSchema>;

export const LocalizedContentSchema = z.object({
  content_id: z.string().uuid(),
  source_language: LanguageCodeSchema,
  target_language: LanguageCodeSchema,
  locale: LocaleSchema,
  body: z.string().min(1),
  is_translation: z.boolean().default(false),
  translation_status: z
    .enum(["SOURCE", "DRAFT_TRANSLATION", "HUMAN_REVIEWED", "APPROVED"])
    .default("SOURCE"),
});
export type LocalizedContent = z.infer<typeof LocalizedContentSchema>;
