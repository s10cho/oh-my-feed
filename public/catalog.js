const compareCodePoints = (left, right) => left < right ? -1 : left > right ? 1 : 0;

const sorters = {
  popular: (left, right) => right.stars - left.stars || compareCodePoints(left.fullName, right.fullName),
  newest: (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || compareCodePoints(left.fullName, right.fullName),
};

export function sortCatalog(items, sortBy) {
  const compare = sorters[sortBy];
  if (!compare) throw new Error(`Unsupported sort: ${sortBy}`);
  return [...items].sort(compare);
}

export function validateCatalogSnapshot(snapshot) {
  const errors = [];
  const makers = new Set(snapshot.makers?.map(({ id }) => id) ?? []);

  for (const [index, tool] of (snapshot.tools ?? []).entries()) {
    if (!makers.has(tool.makerId)) {
      errors.push(`tools[${index}].makerId references missing maker: ${tool.makerId}`);
    }
    if (Object.hasOwn(tool, "clicks")) {
      errors.push(`tools[${index}].clicks must be absent until collection exists`);
    }
  }

  return errors;
}
