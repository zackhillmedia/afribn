const { requireUser } = require("../auth");

function requirePermission(store, req, permission) {
  const user = requireUser(store, req);
  if (!hasPermission(user, permission)) {
    const error = new Error(`Missing permission: ${permission}`);
    error.statusCode = 403;
    error.code = "FORBIDDEN";
    throw error;
  }
  return user;
}

function hasPermission(user, permission) {
  const permissions = user.role?.permissions || [];
  return permissions.includes("*") || permissions.includes(permission);
}

function filterByOrganization(records, user, ownerField = "organizationId") {
  if (!user?.organizationId || hasPermission(user, "*")) return records;
  return records.filter((record) => !record[ownerField] || record[ownerField] === user.organizationId);
}

function assertSameOrganization(user, record, ownerField = "organizationId") {
  if (!record || hasPermission(user, "*")) return;
  if (record[ownerField] && record[ownerField] !== user.organizationId) {
    const error = new Error("Resource belongs to another organization");
    error.statusCode = 403;
    error.code = "ORG_FORBIDDEN";
    throw error;
  }
}

module.exports = { requirePermission, hasPermission, filterByOrganization, assertSameOrganization };
