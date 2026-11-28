/** Application-owned admission for the platform router before tenant selection.
 * Static copy is reviewed by admins; runtime identity-leak checks belong to Background.
 */
export function neutralRouterProjectionError(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return "Router projection must be an object.";
  const value = raw as Record<string, unknown>;
  if (
    Object.keys(value).some(
      (key) =>
        ![
          "schemaVersion",
          "family",
          "responseSlot",
          "header",
          "body",
          "footer",
          "conditionals",
        ].includes(key),
    ) ||
    value.schemaVersion !== 1 ||
    value.family !== "MODA_CONVERSATION_WRAPPER" ||
    value.responseSlot !== "response.body"
  ) {
    return "Router projections cannot contain media, composite layouts or unknown fields.";
  }
  if (!Array.isArray(value.conditionals) || value.conditionals.length)
    return "Router projections cannot contain checkout conditionals.";
  let slots = 0;
  for (const section of ["header", "body", "footer"]) {
    const tokens = value[section];
    if (!Array.isArray(tokens))
      return "Router projection sections must be token arrays.";
    for (const token of tokens) {
      if (!token || typeof token !== "object" || Array.isArray(token))
        return "Invalid router token.";
      const item = token as Record<string, unknown>;
      if (
        item.kind === "text" &&
        typeof item.value === "string" &&
        Object.keys(item).every((key) => ["kind", "value"].includes(key))
      )
        continue;
      if (
        section === "body" &&
        item.kind === "responseSlot" &&
        item.name === "response.body" &&
        Object.keys(item).every((key) => ["kind", "name"].includes(key))
      ) {
        slots++;
        continue;
      }
      return "Router templates allow only neutral text and one body response slot; tenant, customer and checkout bindings are forbidden.";
    }
  }
  return slots === 1
    ? null
    : "Router templates require exactly one body response slot.";
}
