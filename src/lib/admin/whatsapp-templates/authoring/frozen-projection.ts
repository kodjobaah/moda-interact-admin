// Server-only hash verification of saved immutable records; never a save/admission compiler.
import { templateHash } from "./identifiers";
import { commonMetaBody, historicalCommonMetaBody } from "./common-layout";
import { prepareValidatedTemplateProjection } from "./projection";
import { validateTemplateStructure } from "./validation";
import type { ImmutableAuthoringRecord, PreparedTemplate } from "./types";

export class FrozenProjectionMismatchError extends Error {}

export function verifyFrozenTemplateProjection(record: ImmutableAuthoringRecord, expectedContentHash: string | null): PreparedTemplate {
  const checked = validateTemplateStructure(record.authoring);
  if (record.schemaVersion !== 1 || !checked.ok || !record.prepared ||
      !expectedContentHash || !/^[a-f0-9]{64}$/.test(expectedContentHash) || templateHash(record.prepared) !== expectedContentHash) {
    throw new Error("Saved immutable projection failed its content or authoring integrity checks.");
  }
  const draft = checked.value;
  const projections = [prepareValidatedTemplateProjection(draft, draft.family === "META_RECOVERY" ? commonMetaBody(draft) : [])];
  if (draft.family === "META_RECOVERY" && draft.commonLayout) {
    projections.push(prepareValidatedTemplateProjection(draft, historicalCommonMetaBody(draft)));
  }
  // Earlier TEXT snapshots omitted the optional empty header-binding array.
  // This is a known exact historical shape, never a normalization of stored bytes.
  for (const prepared of [...projections]) {
    if (prepared.family === "META_RECOVERY" && !prepared.parameterBindings.headerMediaRole &&
        prepared.parameterBindings.header?.length === 0) {
      const bindings = { ...prepared.parameterBindings };
      delete bindings.header;
      projections.push({ ...prepared, parameterBindings: bindings });
    }
  }
  if (!projections.some(prepared => {
    if (prepared.family === "META_RECOVERY") {
      const body = prepared.components.find(component => component.type === "BODY");
      if (typeof body?.text !== "string" || body.text.length > 1024 || prepared.parameterBindings.body.length > 10) return false;
    }
    return templateHash(prepared) === expectedContentHash;
  })) {
    throw new FrozenProjectionMismatchError("Saved component/variable mapping differs from its immutable authoring.");
  }
  return record.prepared;
}
