/** Fictional cross-app BG017/Admin012 golden vector. These are deliberately distinct RAW hashes. */
export const NBSP_EXPECTED_RAW_HASH =
  "e17121a73dfea9c4202119663c50d123ff20f30f0b9d0d8158464c18d5741c77";
export const NBSP_OBSERVED_RAW_HASH =
  "f6ee4fc0dc11c3ce77ca934eeb477841aa498dd00858a85d371e64219c8841cd";
export const NBSP_NORMALIZATION_KIND = "U+00A0_TO_U+0020_TEXT_ONLY";
export const nbspExpectedComponents = () => [
  { type: "HEADER", format: "IMAGE" },
  { type: "BODY", text: "Boutique\u00a0: Exemple\nPanier\u00a0: {{1}}" },
];
export const nbspObservedComponents = () => [
  { type: "HEADER", format: "IMAGE" },
  { type: "BODY", text: "Boutique : Exemple\nPanier : {{1}}" },
];
