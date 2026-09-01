import { isSafeUrl } from "./url-safety.js";

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

export function canonicalizeGitHubRepositoryUrl(repositoryUrl) {
  let url;
  try {
    url = new URL(repositoryUrl);
  } catch {
    throw new Error("Invalid GitHub repository URL");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  const [rawOwner, rawRepository] = segments;
  const repository = rawRepository?.replace(/\.git$/i, "");
  const safeOwner = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
  const safeRepository = /^(?!\.{1,2}$)[a-z\d._-]{1,100}$/i;
  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    segments.length !== 2 ||
    !safeOwner.test(rawOwner ?? "") ||
    !safeRepository.test(repository ?? "")
  ) {
    throw new Error("Invalid GitHub repository URL");
  }

  const owner = rawOwner.toLowerCase();
  const repo = repository.toLowerCase();
  const id = `${owner}/${repo}`;
  return {
    owner,
    repo,
    id,
    repositoryUrl: `https://github.com/${id}`,
  };
}

const metricKeysByNamespace = new Map([
  ["github.repository", ["stars", "forks"]],
  ["geeknews", ["points", "comments"]],
  ["hackernews", ["points", "comments"]],
  ["producthunt", ["points", "comments"]],
  ["ohmyfeed", ["clicks"]],
]);

const metricEntityTypeByNamespace = new Map([
  ["github.repository", "tool"],
  ["geeknews", "sourceMention"],
  ["hackernews", "sourceMention"],
  ["producthunt", "sourceMention"],
  ["ohmyfeed", "tool"],
]);

const sourceMentionNamespaces = new Set([
  "ohmyfeed.editorial",
  "geeknews",
  "hackernews",
  "producthunt",
]);

const sourceUrlUsageByNamespace = new Map([
  ["github.repository", "github.repositoryApi"],
  ["geeknews", "geeknews.item"],
  ["hackernews", "hackernews.item"],
  ["producthunt", "producthunt.item"],
  ["ohmyfeed", "ohmyfeed.item"],
]);

function requireValidCatalogSnapshot(snapshot) {
  const errors = validateCatalogSnapshot(snapshot);
  if (errors.length > 0) throw new Error(`Invalid catalog snapshot: ${errors.join("; ")}`);
  return snapshot;
}

export function migrateCatalogSnapshot(snapshot) {
  if (snapshot.schemaVersion === 2) return requireValidCatalogSnapshot(structuredClone(snapshot));
  if (snapshot.schemaVersion !== 1) {
    throw new Error(`Unsupported catalog schema version: ${snapshot.schemaVersion}`);
  }

  const toolIds = new Map();
  const tools = (snapshot.tools ?? []).map((legacyTool) => {
    const {
      makerId: _makerId,
      stars: _stars,
      forks: _forks,
      sourceMentions: _sourceMentions,
      ...tool
    } = legacyTool;
    const canonical = canonicalizeGitHubRepositoryUrl(tool.repositoryUrl);
    toolIds.set(legacyTool.id, canonical.id);
    return { ...tool, id: canonical.id, repositoryUrl: canonical.repositoryUrl };
  });
  const makers = (snapshot.makers ?? []).map(({ toolIds: _toolIds, ...maker }) => maker);
  const toolMakerRelations = (snapshot.tools ?? []).map((tool) => ({
    id: `github.owner:${toolIds.get(tool.id)}:${tool.makerId}`,
    toolId: toolIds.get(tool.id),
    makerId: tool.makerId,
    kind: "owner",
    sourceNamespace: "github",
    evidenceUrl: canonicalizeGitHubRepositoryUrl(tool.repositoryUrl).repositoryUrl,
    observedAt: snapshot.collectedAt,
  }));
  const sourceMentions = (snapshot.tools ?? []).flatMap((tool) =>
    (tool.sourceMentions ?? []).map((mention) => ({
      id: `ohmyfeed.editorial:${mention.sourceId}:${toolIds.get(tool.id)}`,
      toolId: toolIds.get(tool.id),
      sourceNamespace: "ohmyfeed.editorial",
      sourceItemId: mention.sourceId,
      url: null,
      observedAt: mention.observedAt,
    })),
  );
  const metricSnapshots = (snapshot.tools ?? []).map((tool) => ({
    id: `github.repository:${toolIds.get(tool.id)}:${snapshot.collectedAt}`,
    entityType: "tool",
    entityId: toolIds.get(tool.id),
    namespace: "github.repository",
    metrics: { stars: tool.stars, forks: tool.forks },
    fetchedAt: snapshot.collectedAt,
    sourceUrl: tool.sourceUrl,
  }));

  return requireValidCatalogSnapshot({
    ...structuredClone(snapshot),
    schemaVersion: 2,
    tools,
    makers,
    toolMakerRelations,
    sourceMentions,
    metricSnapshots,
  });
}

export function createCatalogView(snapshot) {
  const contract = migrateCatalogSnapshot(snapshot);
  const ownerByTool = new Map(
    contract.toolMakerRelations
      .filter(({ kind }) => kind === "owner")
      .map((relation) => [relation.toolId, relation]),
  );
  const githubMetricByTool = new Map(
    contract.metricSnapshots
      .filter(({ entityType, namespace }) => entityType === "tool" && namespace === "github.repository")
      .sort((left, right) =>
        Date.parse(left.fetchedAt) - Date.parse(right.fetchedAt) || compareCodePoints(left.id, right.id),
      )
      .map((metric) => [metric.entityId, metric]),
  );
  const toolIdsByMaker = Map.groupBy(
    contract.toolMakerRelations.filter(({ kind }) => kind === "owner"),
    ({ makerId }) => makerId,
  );

  return {
    ...contract,
    tools: contract.tools.map((tool) => {
      const relation = ownerByTool.get(tool.id);
      const metric = githubMetricByTool.get(tool.id);
      return {
        ...tool,
        makerId: relation?.makerId,
        stars: metric?.metrics.stars,
        forks: metric?.metrics.forks,
      };
    }),
    makers: contract.makers.map((maker) => ({
      ...maker,
      toolIds: (toolIdsByMaker.get(maker.id) ?? []).map(({ toolId }) => toolId).sort(compareCodePoints),
    })),
  };
}

function appendDuplicateIdErrors(errors, collectionName, entries) {
  const seen = new Set();
  for (const [index, entry] of (entries ?? []).entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${collectionName}[${index}] must be an object`);
      continue;
    }
    if (seen.has(entry.id)) errors.push(`${collectionName} has duplicate id: ${entry.id}`);
    seen.add(entry.id);
  }
}

function appendDuplicateFieldErrors(errors, collectionName, entries, field) {
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry[field])) {
      errors.push(`${collectionName} has duplicate ${field}: ${entry[field]}`);
    }
    seen.add(entry[field]);
  }
}

function appendRequiredFieldErrors(errors, collectionName, index, entry, fields) {
  for (const field of fields) {
    const value = entry?.[field];
    if (value === undefined || value === null || value === "") {
      errors.push(`${collectionName}[${index}].${field} is required`);
    }
  }
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isIsoTimestamp(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    && Number.isFinite(Date.parse(value));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function appendStringFieldErrors(errors, collectionName, index, entry, fields) {
  for (const field of fields) {
    if (typeof entry[field] !== "string" || entry[field].length === 0) {
      errors.push(`${collectionName}[${index}].${field} must be a non-empty string`);
    }
  }
}

export function validateCatalogSnapshot(snapshot) {
  const errors = [];
  if (!isRecord(snapshot)) return ["catalog snapshot must be an object"];
  if (![1, 2].includes(snapshot.schemaVersion)) {
    return [`Unsupported catalog schema version: ${snapshot.schemaVersion}`];
  }

  const toolEntries = Array.isArray(snapshot.tools) ? snapshot.tools : [];
  const makerEntries = Array.isArray(snapshot.makers) ? snapshot.makers : [];
  let makers = new Set();

  if (snapshot.schemaVersion === 2) {
    const collectionNames = [
      "categories",
      "productFamilies",
      "tools",
      "makers",
      "toolMakerRelations",
      "sourceMentions",
      "metricSnapshots",
    ];
    for (const collectionName of collectionNames) {
      if (!Array.isArray(snapshot[collectionName])) {
        errors.push(`${collectionName} must be an array in schema v2`);
      }
    }
    if (!isRecord(snapshot.source)) errors.push("source must be an object in schema v2");
    if (!isCanonicalIsoTimestamp(snapshot.collectedAt)) errors.push("collectedAt must be an ISO timestamp");
    if (isRecord(snapshot.source)) {
      for (const field of ["provider", "apiVersion"]) {
        if (typeof snapshot.source[field] !== "string" || snapshot.source[field].length === 0) {
          errors.push(`source.${field} must be a non-empty string`);
        }
      }
    }
    if (errors.length > 0) return errors;

    for (const collectionName of collectionNames) {
      appendDuplicateIdErrors(errors, collectionName, snapshot[collectionName]);
    }
    if (errors.some((error) => error.endsWith("must be an object"))) return errors;
    appendDuplicateFieldErrors(errors, "tools", snapshot.tools, "sourceIdentifier");
    appendDuplicateFieldErrors(errors, "makers", snapshot.makers, "sourceIdentifier");
    makers = new Set(snapshot.makers.map(({ id }) => id));

    const tools = new Set(snapshot.tools.map(({ id }) => id));
    const toolById = new Map(snapshot.tools.map((tool) => [tool.id, tool]));
    const categories = new Set(snapshot.categories.map(({ id }) => id));
    const familyById = new Map(snapshot.productFamilies.map((family) => [family.id, family]));
    const families = new Set(familyById.keys());
    const canonicalOwnerByTool = new Map();
    const canonicalRepositoryByTool = new Map();
    const mentionById = new Map(snapshot.sourceMentions.map((mention) => [mention.id, mention]));
    const mentions = new Set(mentionById.keys());

    for (const [index, category] of snapshot.categories.entries()) {
      appendRequiredFieldErrors(errors, "categories", index, category, ["id", "name", "description"]);
      appendStringFieldErrors(errors, "categories", index, category, ["id", "name", "description"]);
    }

    for (const [index, family] of snapshot.productFamilies.entries()) {
      appendRequiredFieldErrors(errors, "productFamilies", index, family, [
        "id",
        "name",
        "makerId",
        "toolIds",
        "relationKind",
        "evidenceUrls",
        "observedAt",
      ]);
      appendStringFieldErrors(errors, "productFamilies", index, family, ["id", "name", "makerId", "relationKind", "observedAt"]);
      if (!makers.has(family.makerId)) {
        errors.push(`productFamilies[${index}].makerId references missing maker: ${family.makerId}`);
      }
      if (!Array.isArray(family.toolIds)) {
        errors.push(`productFamilies[${index}].toolIds must be an array`);
      } else {
        for (const [toolIndex, toolId] of family.toolIds.entries()) {
          if (!tools.has(toolId)) {
            errors.push(`productFamilies[${index}].toolIds[${toolIndex}] references missing tool: ${toolId}`);
          } else if (toolById.get(toolId).familyId !== family.id) {
            errors.push(`productFamilies[${index}].toolIds[${toolIndex}] familyId must match product family`);
          }
        }
      }
      if (!Array.isArray(family.evidenceUrls)) {
        errors.push(`productFamilies[${index}].evidenceUrls must be an array`);
      } else {
        for (const [urlIndex, evidenceUrl] of family.evidenceUrls.entries()) {
          if (!isSafeUrl(evidenceUrl, "github.evidence")) {
            errors.push(`productFamilies[${index}].evidenceUrls[${urlIndex}] must be a safe GitHub URL`);
          }
        }
      }
      if (!isCanonicalIsoTimestamp(family.observedAt)) {
        errors.push(`productFamilies[${index}].observedAt must be an ISO timestamp`);
      }
    }

    for (const [index, maker] of (snapshot.makers ?? []).entries()) {
      appendRequiredFieldErrors(errors, "makers", index, maker, [
        "id",
        "login",
        "displayName",
        "type",
        "avatarUrl",
        "profileUrl",
        "sourceId",
        "sourceIdentifier",
        "sourceUrl",
      ]);
      appendStringFieldErrors(errors, "makers", index, maker, [
        "id",
        "login",
        "displayName",
        "type",
        "avatarUrl",
        "profileUrl",
        "sourceIdentifier",
        "sourceUrl",
      ]);
      if (!Object.hasOwn(maker, "description") || (maker.description !== null && typeof maker.description !== "string")) {
        errors.push(`makers[${index}].description must be a string or null`);
      }
      if (!Number.isInteger(maker.sourceId) || maker.sourceId < 0) {
        errors.push(`makers[${index}].sourceId must be a non-negative integer`);
      }
      if (maker.sourceIdentifier !== `github:user:${maker.sourceId}`) {
        errors.push(`makers[${index}].sourceIdentifier must match sourceId`);
      }
      if (maker.id !== maker.login?.toLowerCase()) {
        errors.push(`makers[${index}].id must equal lowercase login`);
      }
      if (!isSafeUrl(maker.avatarUrl, "github.avatar")) {
        errors.push(`makers[${index}].avatarUrl must be a safe GitHub avatar URL`);
      }
      if (!isSafeUrl(maker.profileUrl, "github.profile")) {
        errors.push(`makers[${index}].profileUrl must be a safe GitHub profile URL`);
      } else if (new URL(maker.profileUrl).pathname.toLowerCase() !== `/${maker.login?.toLowerCase()}`) {
        errors.push(`makers[${index}].profileUrl must match login`);
      }
      if (!isSafeUrl(maker.sourceUrl, "github.userApi")) {
        errors.push(`makers[${index}].sourceUrl must be a safe GitHub user API URL`);
      } else if (new URL(maker.sourceUrl).pathname.toLowerCase() !== `/users/${maker.login?.toLowerCase()}`) {
        errors.push(`makers[${index}].sourceUrl must match login`);
      }
      if (Object.hasOwn(maker, "toolIds")) errors.push(`makers[${index}].toolIds must be absent in schema v2`);
    }

    for (const [index, tool] of (snapshot.tools ?? []).entries()) {
      appendRequiredFieldErrors(errors, "tools", index, tool, [
        "id",
        "name",
        "fullName",
        "description",
        "categoryId",
        "repositoryUrl",
        "createdAt",
        "sourceId",
        "sourceIdentifier",
        "sourceUrl",
      ]);
      appendStringFieldErrors(errors, "tools", index, tool, [
        "id",
        "name",
        "fullName",
        "description",
        "categoryId",
        "repositoryUrl",
        "createdAt",
        "sourceIdentifier",
        "sourceUrl",
      ]);
      if (!Object.hasOwn(tool, "familyId")) {
        errors.push(`tools[${index}].familyId is required`);
      }
      if (!categories.has(tool.categoryId)) {
        errors.push(`tools[${index}].categoryId references missing category: ${tool.categoryId}`);
      }
      if (tool.familyId !== null && tool.familyId !== undefined && !families.has(tool.familyId)) {
        errors.push(`tools[${index}].familyId references missing product family: ${tool.familyId}`);
      } else if (
        tool.familyId !== null
        && tool.familyId !== undefined
        && (
          !Array.isArray(familyById.get(tool.familyId).toolIds)
          || !familyById.get(tool.familyId).toolIds.includes(tool.id)
        )
      ) {
        errors.push(`tools[${index}].familyId product family must reference tool`);
      }
      if (!Number.isInteger(tool.sourceId) || tool.sourceId < 0) {
        errors.push(`tools[${index}].sourceId must be a non-negative integer`);
      }
      if (tool.sourceIdentifier !== `github:repository:${tool.sourceId}`) {
        errors.push(`tools[${index}].sourceIdentifier must match sourceId`);
      }
      if (!isIsoTimestamp(tool.createdAt)) {
        errors.push(`tools[${index}].createdAt must be an ISO timestamp`);
      }
      for (const field of ["makerId", "stars", "forks", "sourceMentions", "clicks"]) {
        if (Object.hasOwn(tool, field)) errors.push(`tools[${index}].${field} must be absent in schema v2`);
      }
      try {
        const canonical = canonicalizeGitHubRepositoryUrl(tool.repositoryUrl);
        canonicalOwnerByTool.set(tool.id, canonical.owner);
        canonicalRepositoryByTool.set(tool.id, canonical.repositoryUrl);
        if (tool.id !== canonical.id) {
          errors.push(`tools[${index}].id must equal canonical repository id: ${canonical.id}`);
        }
        if (tool.repositoryUrl !== canonical.repositoryUrl) {
          errors.push(`tools[${index}].repositoryUrl must equal canonical repository URL: ${canonical.repositoryUrl}`);
        }
        if (typeof tool.fullName === "string" && tool.fullName.toLowerCase() !== canonical.id) {
          errors.push(`tools[${index}].fullName must identify the canonical repository`);
        }
        if (!isSafeUrl(tool.sourceUrl, "github.repositoryApi")) {
          errors.push(`tools[${index}].sourceUrl must be a safe GitHub repository API URL`);
        } else if (new URL(tool.sourceUrl).pathname.toLowerCase() !== `/repos/${canonical.id}`) {
          errors.push(`tools[${index}].sourceUrl must match canonical repository`);
        }
      } catch {
        errors.push(`tools[${index}].repositoryUrl is an invalid repositoryUrl`);
      }
    }

    for (const [index, relation] of (snapshot.toolMakerRelations ?? []).entries()) {
      appendRequiredFieldErrors(errors, "toolMakerRelations", index, relation, [
        "id",
        "toolId",
        "makerId",
        "kind",
        "sourceNamespace",
        "evidenceUrl",
        "observedAt",
      ]);
      if (!tools.has(relation.toolId)) {
        errors.push(`toolMakerRelations[${index}].toolId references missing tool: ${relation.toolId}`);
      }
      if (!makers.has(relation.makerId)) {
        errors.push(`toolMakerRelations[${index}].makerId references missing maker: ${relation.makerId}`);
      }
      if (relation.kind === "owner" && relation.sourceNamespace !== "github") {
        errors.push(`toolMakerRelations[${index}] owner relation must use github sourceNamespace`);
      }
      if (relation.kind === "owner" && relation.makerId !== canonicalOwnerByTool.get(relation.toolId)) {
        errors.push(`toolMakerRelations[${index}].makerId must match canonical repository owner`);
      }
      if (relation.kind === "owner" && relation.evidenceUrl !== canonicalRepositoryByTool.get(relation.toolId)) {
        errors.push(`toolMakerRelations[${index}].evidenceUrl must match canonical tool repository URL`);
      }
      if (!isCanonicalIsoTimestamp(relation.observedAt)) {
        errors.push(`toolMakerRelations[${index}].observedAt must be an ISO timestamp`);
      }
    }

    for (const tool of snapshot.tools ?? []) {
      const ownerCount = (snapshot.toolMakerRelations ?? []).filter(
        ({ kind, toolId }) => kind === "owner" && toolId === tool.id,
      ).length;
      if (ownerCount !== 1) errors.push(`tool ${tool.id} requires exactly one owner relation`);
    }

    for (const [index, mention] of (snapshot.sourceMentions ?? []).entries()) {
      appendRequiredFieldErrors(errors, "sourceMentions", index, mention, [
        "id",
        "toolId",
        "sourceNamespace",
        "sourceItemId",
        "observedAt",
      ]);
      if (!tools.has(mention.toolId)) {
        errors.push(`sourceMentions[${index}].toolId references missing tool: ${mention.toolId}`);
      }
      if (!sourceMentionNamespaces.has(mention.sourceNamespace)) {
        errors.push(`sourceMentions[${index}].sourceNamespace is unsupported: ${mention.sourceNamespace}`);
      }
      const mentionUrlUsage = mention.sourceNamespace === "ohmyfeed.editorial"
        ? null
        : `${mention.sourceNamespace}.item`;
      if (mentionUrlUsage && !isSafeUrl(mention.url, mentionUrlUsage)) {
        errors.push(`sourceMentions[${index}].url must be a safe ${mention.sourceNamespace} item URL`);
      }
      if (!mentionUrlUsage && mention.url !== null) {
        errors.push(`sourceMentions[${index}].url must be null for editorial mentions`);
      }
      if (!isCanonicalIsoTimestamp(mention.observedAt)) {
        errors.push(`sourceMentions[${index}].observedAt must be an ISO timestamp`);
      }
    }

    for (const [index, metric] of (snapshot.metricSnapshots ?? []).entries()) {
      appendRequiredFieldErrors(errors, "metricSnapshots", index, metric, [
        "id",
        "entityType",
        "entityId",
        "namespace",
        "metrics",
        "fetchedAt",
        "sourceUrl",
      ]);

      const expectedEntityType = metricEntityTypeByNamespace.get(metric.namespace);
      if (!expectedEntityType) {
        errors.push(`metricSnapshots[${index}].namespace is an unsupported namespace: ${metric.namespace}`);
      }
      if (!["tool", "sourceMention"].includes(metric.entityType)) {
        errors.push(`metricSnapshots[${index}].entityType is an unsupported entityType: ${metric.entityType}`);
      } else {
        const ids = metric.entityType === "sourceMention" ? mentions : tools;
        if (!ids.has(metric.entityId)) {
          errors.push(`metricSnapshots[${index}].entityId references missing ${metric.entityType}: ${metric.entityId}`);
        }
      }
      if (expectedEntityType && metric.entityType !== expectedEntityType) {
        errors.push(`metricSnapshots[${index}] ${metric.namespace} metrics require ${expectedEntityType} entities`);
      }
      if (expectedEntityType === "sourceMention") {
        const mention = mentionById.get(metric.entityId);
        if (mention && mention.sourceNamespace !== metric.namespace) {
          errors.push(`metricSnapshots[${index}].namespace must match source mention namespace`);
        }
      }
      if (!isCanonicalIsoTimestamp(metric.fetchedAt)) {
        errors.push(`metricSnapshots[${index}].fetchedAt must be an ISO timestamp`);
      }
      const sourceUrlUsage = sourceUrlUsageByNamespace.get(metric.namespace);
      if (!sourceUrlUsage || !isSafeUrl(metric.sourceUrl, sourceUrlUsage)) {
        errors.push(`metricSnapshots[${index}].sourceUrl is invalid for namespace ${metric.namespace}`);
      } else if (
        metric.namespace === "github.repository"
        && new URL(metric.sourceUrl).pathname.toLowerCase() !== `/repos/${metric.entityId}`
      ) {
        errors.push(`metricSnapshots[${index}].sourceUrl must match repository entityId`);
      } else if (expectedEntityType === "sourceMention" && mentionById.get(metric.entityId)?.url !== metric.sourceUrl) {
        errors.push(`metricSnapshots[${index}].sourceUrl must match source mention URL`);
      }

      const allowedKeys = metricKeysByNamespace.get(metric.namespace) ?? [];
      const actualKeys = Object.keys(metric.metrics ?? {});
      const unexpectedKeys = actualKeys.filter((key) => !allowedKeys.includes(key));
      if (unexpectedKeys.length > 0 || allowedKeys.length === 0) {
        errors.push(`metricSnapshots[${index}] ${metric.namespace} metrics may only contain ${allowedKeys.join(", ")}`);
      }
      for (const requiredKey of allowedKeys) {
        if (!Object.hasOwn(metric.metrics ?? {}, requiredKey)) {
          errors.push(`metricSnapshots[${index}].metrics.${requiredKey} is required`);
        }
      }
      for (const [key, value] of Object.entries(metric.metrics ?? {})) {
        if (!Number.isInteger(value) || value < 0) {
          errors.push(`metricSnapshots[${index}].metrics.${key} must be a non-negative integer`);
        }
      }
    }

    for (const tool of snapshot.tools ?? []) {
      const githubMetricCount = (snapshot.metricSnapshots ?? []).filter(
        ({ entityId, entityType, namespace }) =>
          entityType === "tool" && entityId === tool.id && namespace === "github.repository",
      ).length;
      if (githubMetricCount === 0) errors.push(`tool ${tool.id} requires a github.repository metric snapshot`);
    }

    return errors;
  }

  if (!Array.isArray(snapshot.tools)) errors.push("tools must be an array in schema v1");
  if (!Array.isArray(snapshot.makers)) errors.push("makers must be an array in schema v1");
  if (errors.length > 0) return errors;
  appendDuplicateIdErrors(errors, "tools", toolEntries);
  appendDuplicateIdErrors(errors, "makers", makerEntries);
  if (errors.some((error) => error.endsWith("must be an object"))) return errors;
  makers = new Set(makerEntries.map(({ id }) => id));

  for (const [index, tool] of toolEntries.entries()) {
    if (!makers.has(tool.makerId)) {
      errors.push(`tools[${index}].makerId references missing maker: ${tool.makerId}`);
    }
    if (Object.hasOwn(tool, "clicks")) {
      errors.push(`tools[${index}].clicks must be absent until collection exists`);
    }
  }

  return errors;
}
