import { definitionFixture, ACTOR_ID } from "./arch047-publication.fixture";

/** Reviewed and reconciled source matching the real immutable publication contract. */
export function recoveryDefaultFixture(suffix = "a", image = false) {
  const fixture = definitionFixture(false, image);
  const id = `wtdef_${suffix.repeat(64)}`;
  const providerTemplateName = `moda_initial_no_offer_default_${suffix}`;
  const reviewedAt = new Date("2026-11-14T10:00:00Z");
  return { ...fixture, id, providerTemplateName, status: "TRANSLATION_QUEUED", publishedAt: null as Date | null, locales: fixture.locales.map((locale, index) => ({
    ...locale, id: `${suffix}_locale_${index}`, definitionId: id, status: "REVIEWED",
    reviewedAt, reviewedByAdminId: ACTOR_ID, metaRegistrations: locale.metaRegistrations.map(reg => ({
      ...reg, id: `${suffix}_registration_${index}`, localeId: `${suffix}_locale_${index}`,
      providerTemplateName, providerTemplateId: `${suffix.charCodeAt(0)}${1000 + index}`,
      lastReconciledAt: reviewedAt as Date | null,
    })),
  })) };
}
