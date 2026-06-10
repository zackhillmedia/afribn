function resolveEntitiesForStory(store, storyId) {
  const story = store.get("stories", storyId);
  if (!story) return { merged: [], entities: [] };

  const names = [
    story.country,
    ...(story.organizations || []),
    ...(story.people || []),
    ...(story.projects || [])
  ].filter(Boolean);

  const entities = [];
  const merged = [];

  for (const name of names) {
    const type = name === story.country ? "Country" : inferEntityType(name);
    const canonicalName = canonicalize(name);
    let entity = store.list("entities", (item) => item.type === type && canonicalize(item.canonicalName || item.name) === canonicalName)[0];
    if (!entity) {
      entity = store.insert("entities", { name, canonicalName: name, type, metadata: {} });
      store.insert("graphNodes", { nodeType: type, refType: "entity", refId: entity.id, label: name, metadata: {} });
    } else if (entity.name !== name) {
      merged.push({ alias: name, entityId: entity.id });
      if (!store.list("entityAliases", (alias) => alias.entityId === entity.id && alias.alias === name).length) {
        store.insert("entityAliases", { entityId: entity.id, alias: name });
      }
    }
    entities.push(entity);
    if (!store.list("entityMentions", (mention) => mention.entityId === entity.id && mention.storyId === story.id).length) {
      store.insert("entityMentions", { entityId: entity.id, storyId: story.id, mentionText: name, confidence: 82 });
    }
    if (!store.list("graphEdges", (edge) => edge.fromId === entity.id && edge.toId === story.id && edge.relationship === "mentioned_in").length) {
      store.insert("graphEdges", {
        fromType: "entity",
        fromId: entity.id,
        relationship: "mentioned_in",
        toType: "story",
        toId: story.id,
        confidence: 82,
        evidence: { storyId: story.id }
      });
    }
  }

  return { merged, entities };
}

function canonicalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(ltd|limited|inc|corp|corporation|group|plc|llc)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function inferEntityType(name) {
  if (/\b(ministry|government|commission|authority|secretariat|bank)\b/i.test(name)) return "Organization";
  if (/\b(project|pipeline|railway|refinery|highway)\b/i.test(name)) return "Project";
  return "Organization";
}

module.exports = { resolveEntitiesForStory, canonicalize };
