const ROLES = ["tenant", "landlord", "agent", "admin"];

const userRoles = (user) => {
  const roles = Array.isArray(user?.roles) && user.roles.length ? user.roles : [user?.role].filter(Boolean);
  return [...new Set(roles.filter((role) => ROLES.includes(role)))];
};

const activeRoleFor = (user, requestedRole) => {
  const roles = userRoles(user);
  const activeRole = requestedRole || user?.role;
  return roles.includes(activeRole) ? activeRole : roles[0];
};

const permissionsFor = (role) => ({
  tenant: ["listings:read:public", "viewings:read:own", "applications:read:own", "maintenance:read:own", "enquiries:read:own"],
  landlord: ["listings:read:own", "enquiries:read:own_properties", "enquiries:write:own_properties", "viewings:read:own_properties", "viewings:propose_reschedule:own_properties", "applications:read:own_properties", "maintenance:read:own_properties", "marketing:drafts:own_properties"],
  agent: ["listings:read:assigned", "enquiries:read:assigned", "viewings:read:assigned", "viewings:propose_reschedule:assigned", "maintenance:read:assigned"],
  admin: ["listings:read:platform", "enquiries:read:platform", "enquiries:write:platform", "viewings:read:platform", "viewings:propose_reschedule:platform", "applications:read:platform", "maintenance:read:platform", "marketing:drafts:platform"],
}[role] || []);

const verifiedContext = (user, requestedRole) => {
  const roles = userRoles(user);
  const active_role = activeRoleFor(user, requestedRole);
  return {
    user_id: user._id.toString(),
    roles,
    active_role,
    // Agencies are not implemented. Keeping this explicit prevents a client from inventing one.
    agency_id: null,
    permissions: permissionsFor(active_role),
  };
};

module.exports = { ROLES, userRoles, activeRoleFor, permissionsFor, verifiedContext };
