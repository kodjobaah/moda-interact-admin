import { COMPOSITE_PROFILE_DEFAULTS } from "../../src/lib/admin/whatsapp-templates/authoring/composite-profile";
export const leftCompositeProfile = { ...COMPOSITE_PROFILE_DEFAULTS };
export const topCompositeProfile = { ...leftCompositeProfile, headerOnlyHeight: 500, withProductHeight: 1200,
  logoLeft: 472, logoTop: 24, textLeft: 48, textTop: 230, textWidth: 1029, textHeight: 246,
  fontSize: 36, textLineSpacingPt: 40, productTop: 540, productHeight: 660 };
