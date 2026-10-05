export function parseShopifyTaxonomyText(text, expectedVersion, sourceUrl) {
  const fail = (message) => {
    throw new Error(`Shopify taxonomy preparation failed: ${message}`);
  };
  if (typeof text !== "string" || !text.trim()) fail("distribution is missing content");

  const lines = text.trim().split(/\r?\n/);
  const versionPrefix = "# Shopify Product Taxonomy - Categories:";
  const versionLine = lines.find((line) => line.startsWith(versionPrefix));
  if (!versionLine) fail("distribution is missing the version header");

  const version = versionLine.slice(versionPrefix.length).trim();
  if (version !== expectedVersion) {
    fail(`expected version ${expectedVersion} but received ${version}`);
  }

  const records = [];
  const ids = new Set();
  const fullNameToId = new Map();

  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf(" : ");
    if (separatorIndex < 1) fail("distribution contains an invalid category row");

    const id = line.slice(0, separatorIndex).trim();
    const fullName = line.slice(separatorIndex + 3).trim();
    if (!id.startsWith("gid://shopify/TaxonomyCategory/")) {
      fail(`distribution contains an invalid category id ${id}`);
    }
    if (!fullName) fail(`distribution contains an empty category name for ${id}`);
    if (ids.has(id)) fail(`distribution contains duplicate category id ${id}`);
    if (fullNameToId.has(fullName)) {
      fail(`distribution contains duplicate category path ${fullName}`);
    }

    ids.add(id);
    fullNameToId.set(fullName, id);
    records.push({ id, fullName });
  }

  if (records.length === 0) fail("distribution contains no categories");

  const categories = records.map(({ id, fullName }) => {
    const segments = fullName.split(" > ").map((part) => part.trim());
    if (segments.some((segment) => !segment)) {
      fail(`distribution contains an invalid category path for ${id}`);
    }

    const parentFullName =
      segments.length > 1 ? segments.slice(0, -1).join(" > ") : null;
    const parentId = parentFullName ? fullNameToId.get(parentFullName) : null;
    if (parentFullName && !parentId) {
      fail(`distribution is missing parent ${parentFullName} for ${id}`);
    }

    const ancestors = [];
    for (let depth = 1; depth < segments.length; depth += 1) {
      const ancestorFullName = segments.slice(0, depth).join(" > ");
      const ancestorId = fullNameToId.get(ancestorFullName);
      if (!ancestorId) {
        fail(`distribution is missing ancestor ${ancestorFullName} for ${id}`);
      }
      ancestors.push({ id: ancestorId, name: segments[depth - 1] });
    }

    return {
      id,
      level: segments.length - 1,
      name: segments.at(-1),
      fullName,
      parentId: parentId ?? null,
      hasChildren: false,
      ancestors,
    };
  });

  const parentsWithChildren = new Set(
    categories.map((category) => category.parentId).filter(Boolean),
  );
  for (const category of categories) {
    category.hasChildren = parentsWithChildren.has(category.id);
  }

  categories.sort((left, right) => left.fullName.localeCompare(right.fullName));

  return {
    version,
    sourceUrl,
    categories,
  };
}
