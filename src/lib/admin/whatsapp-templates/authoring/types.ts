/** Versioned Admin-owned source contract. No provider/DB/React dependencies. */
export const TEMPLATE_AST_VERSION = 1 as const;
export type TemplateFamily = "META_RECOVERY" | "MODA_CONVERSATION_WRAPPER";
export type RecoveryStage = "INITIAL" | "FOLLOW_UP";
export type OfferType = "NO_OFFER" | "CODE_OFFER" | "AUTOMATIC_OFFER";
export type WrapperAudience = "SHARED" | "AI" | "HUMAN";
export type ShopBrandVariable =
  | "shopBrand.brandName" | "shopBrand.logoUrl" | "shopBrand.logoAltText"
  | "shopBrand.logoWidth" | "shopBrand.logoHeight"
  | "shopBrand.squareLogoUrl" | "shopBrand.squareLogoAltText"
  | "shopBrand.coverImageUrl";
export type SemanticVariable = "customer.firstName" | "shop.name" | "checkout.url" | "offer.code" | "offer.description" | ShopBrandVariable;
export type TextNode = { type: "text"; value: string };
export type VariableNode = { type: "variable"; name: SemanticVariable };
export type ResponseNode = { type: "slot"; name: "response.body" };
export type ContentNode = TextNode | VariableNode;
export type WrapperNode = ContentNode | ResponseNode;
export type UrlButton = { type: "url"; label: string; urlPrefix: string; variable?: "checkout.url" };
export type MetaTemplateAst = {
  schemaVersion: 1;
  family: "META_RECOVERY";
  sourceLanguageTag: "en";
  stage: RecoveryStage;
  offerType: OfferType;
  header: ContentNode[];
  body: ContentNode[];
  footer: TextNode[];
  buttons: UrlButton[];
};
export type WrapperTemplateAst = {
  schemaVersion: 1;
  family: "MODA_CONVERSATION_WRAPPER";
  sourceLanguageTag: "en";
  audience: WrapperAudience;
  header: ContentNode[];
  body: WrapperNode[];
  footer: ContentNode[];
  conditionals: Array<{ when: "checkout.available"; nodes: ContentNode[] }>;
};
export type TemplateAst = MetaTemplateAst | WrapperTemplateAst;
export type AuthoringIssue = { path: string; message: string };
export type VariableBinding = { position: number; variable: SemanticVariable };
export type MetaPrepared = {
  schemaVersion: 1;
  family: "META_RECOVERY";
  category: "MARKETING";
  components: Array<Record<string, unknown>>;
  parameterBindings: {
    header?: VariableBinding[]; // legacy saved English projections omitted this field
    body: VariableBinding[];
    buttons: Array<{ index: number; subType: "url"; variable: "checkout.url" }>;
  };
};
export type RuntimeToken = { kind: "text"; value: string } | { kind: "variable"; name: SemanticVariable } | { kind: "responseSlot"; name: "response.body" };
export type WrapperPrepared = {
  schemaVersion: 1;
  family: "MODA_CONVERSATION_WRAPPER";
  header: RuntimeToken[];
  body: RuntimeToken[];
  footer: RuntimeToken[];
  conditionals: Array<{ when: "checkout.available"; tokens: RuntimeToken[] }>;
  responseSlot: "response.body";
};
export type PreparedTemplate = MetaPrepared | WrapperPrepared;
export type ImmutableAuthoringRecord = {
  schemaVersion: 1;
  authoring: TemplateAst;
  prepared: PreparedTemplate;
};
export type TemplateListItem = {
  id: string;
  kind: string;
  purpose: string | null;
  offerType: string | null;
  audience: string | null;
  sourceLanguageTag: string;
  status: string;
  providerTemplateName: string | null;
  createdAt: string;
};
export type TemplateDetail = TemplateListItem & {
  clonedFromDefinitionId: string | null;
  sourceHash: string;
  english: ImmutableAuthoringRecord | null;
};
export type TemplatePreviewDTO = {
  family: TemplateFamily;
  header: string;
  body: string;
  footer: string;
  buttons: Array<{ label: string; url: string }>;
  conditional?: string;
};
