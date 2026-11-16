/*
 * Runs against the staging URL only. It creates a short-lived Agent key and
 * revokes it before exit. Passwords, connection strings, and long-lived keys
 * are read from environment variables and never printed.
 */
const crypto = require("crypto");

const baseUrl = String(process.env.STAGING_API_URL || "").replace(/\/$/, "");
const password = process.env.STAGING_TEST_PASSWORD;
if (!baseUrl || !password) {
  console.error("Set STAGING_API_URL and STAGING_TEST_PASSWORD before running this test.");
  process.exit(1);
}

const accounts = {
  tenantA: "ada.tenant@haven-staging.test",
  tenantB: "bola.tenant@haven-staging.test",
  landlordA: "chidi.landlord@haven-staging.test",
  landlordB: "dami.landlord@haven-staging.test",
  admin: "admin@haven-staging.test",
  staff: "seyi.staff@haven-staging.test",
};
const allScopes = ["properties:read", "enquiries:read", "enquiries:write", "viewings:read", "viewings:propose_reschedule", "applications:read", "maintenance:read", "marketing:drafts"];
let passed = 0;
let failed = 0;

const call = async (path, { method = "GET", token, headers = {}, body } = {}) => {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};
const check = (condition, description) => {
  if (condition) { passed += 1; console.log(`PASS  ${description}`); }
  else { failed += 1; console.error(`FAIL  ${description}`); }
};
const idOf = (value) => String(value?._id || value || "");

const login = async (email) => {
  const result = await call("/api/v1/auth/login", { method: "POST", body: { email, password } });
  check(result.status === 200 && result.body.data?.access_token, `login: ${email}`);
  return result.body.data;
};
const delegation = async (token, active_role, agent_key_id) => {
  const result = await call("/api/v1/auth/agent-delegation", { method: "POST", token, body: { active_role, agent_key_id, conversation_id: `staging-test-${crypto.randomUUID()}` } });
  check(result.status === 201 && result.body.data?.delegation_token, `delegation: ${active_role}`);
  return result.body.data?.delegation_token;
};

(async () => {
  let agentKey;
  let admin;
  try {
    const sessions = {};
    for (const [name, email] of Object.entries(accounts)) sessions[name] = await login(email);
    admin = sessions.admin;
    if (!Object.values(sessions).every(Boolean)) throw new Error("A staging login failed.");

    const createdKey = await call("/api/v1/agent/access-keys", { method: "POST", token: admin.access_token, body: { name: `Staging authorization test ${new Date().toISOString()}`, scopes: allScopes } });
    check(createdKey.status === 201 && createdKey.body.data?.key, "create temporary Agent API key");
    agentKey = createdKey.body.data;
    if (!agentKey) throw new Error("Unable to create temporary Agent API key.");

    const publicListings = await call("/api/v1/agent/properties?listing_intent=rent", { headers: { "X-Agent-API-Key": agentKey.key } });
    check(publicListings.status === 200 && publicListings.body.data?.every((item) => item.status === "available" && item.listing_intent !== "sale"), "guest Agent search exposes only available rental listings");
    const noDelegation = await call("/api/v1/agent/enquiries", { headers: { "X-Agent-API-Key": agentKey.key } });
    check(noDelegation.status === 401, "private Agent data rejects a missing user delegation");

    const delegated = {};
    for (const [name, session] of Object.entries(sessions)) delegated[name] = await delegation(session.access_token, session.user.role, agentKey.id);
    const agentHeaders = (name, extra = {}) => ({ "X-Agent-API-Key": agentKey.key, "X-Haven-Delegation": delegated[name], ...extra });

    const tenantAApps = await call("/api/v1/agent/applications", { headers: agentHeaders("tenantA") });
    check(tenantAApps.status === 200 && tenantAApps.body.data.every((item) => idOf(item.tenant_id) === String(sessions.tenantA.user.id)), "Tenant A reads only Tenant A applications");
    const tenantBApps = await call("/api/v1/agent/applications", { headers: agentHeaders("tenantB") });
    check(tenantBApps.status === 200 && tenantBApps.body.data.every((item) => idOf(item.tenant_id) === String(sessions.tenantB.user.id)), "Tenant B cannot read Tenant A applications");

    const landlordAEnquiries = await call("/api/v1/agent/enquiries", { headers: agentHeaders("landlordA") });
    const landlordBEnquiries = await call("/api/v1/agent/enquiries", { headers: agentHeaders("landlordB") });
    const cedarEnquiry = landlordAEnquiries.body.data?.[0];
    check(landlordAEnquiries.status === 200 && landlordAEnquiries.body.data?.every((item) => item.property_id?.name === "Cedar Court"), "Landlord A sees own-property enquiries only");
    check(landlordBEnquiries.status === 200 && landlordBEnquiries.body.data?.every((item) => item.property_id?.name === "Lagoon View"), "Landlord B cannot read Landlord A enquiries");

    const forbiddenUpdate = await call(`/api/v1/agent/enquiries/${cedarEnquiry?._id}`, { method: "PATCH", headers: agentHeaders("landlordB", { "Idempotency-Key": crypto.randomUUID() }), body: { status: "contacted" } });
    check(forbiddenUpdate.status === 404, "Landlord B cannot update Landlord A enquiry by guessed ID");

    const staffApplications = await call("/api/v1/agent/applications", { headers: agentHeaders("staff") });
    check(staffApplications.status === 403, "Restricted staff cannot read applications without a role permission");
    const staffViewings = await call("/api/v1/agent/viewings", { headers: agentHeaders("staff") });
    check(staffViewings.status === 200 && staffViewings.body.data?.every((item) => item.agent_id && idOf(item.agent_id) === String(sessions.staff.user.id)), "Restricted staff reads assigned viewings only");

    const draftKey = crypto.randomUUID();
    const draftBody = { type: "customer_care_reply", enquiry_id: cedarEnquiry?._id, subject: "Staging review draft", message: "This is a fictional draft generated by the staging authorization test." };
    const firstDraft = await call("/api/v1/agent/drafts", { method: "POST", headers: agentHeaders("landlordA", { "Idempotency-Key": draftKey }), body: draftBody });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const retriedDraft = await call("/api/v1/agent/drafts", { method: "POST", headers: agentHeaders("landlordA", { "Idempotency-Key": draftKey }), body: draftBody });
    check(firstDraft.status === 201 && retriedDraft.status === 201 && String(firstDraft.body.data?._id) === String(retriedDraft.body.data?._id), "idempotent draft retry returns the original result");

    const oldDelegation = delegated.tenantA;
    const loggedOut = await call("/api/v1/auth/logout", { method: "POST", token: sessions.tenantA.access_token });
    const revokedDelegation = await call("/api/v1/agent/applications", { headers: { "X-Agent-API-Key": agentKey.key, "X-Haven-Delegation": oldDelegation } });
    check(loggedOut.status === 200 && revokedDelegation.status === 401, "logout revokes an existing delegation token");
  } catch (error) {
    failed += 1;
    console.error(`FAIL  test runner error: ${error.message}`);
  } finally {
    if (agentKey && admin?.access_token) {
      const revoked = await call(`/api/v1/agent/access-keys/${agentKey.id}`, { method: "DELETE", token: admin.access_token });
      check(revoked.status === 200, "temporary Agent API key revoked");
    }
    console.log(`\nAuthorization tests: ${passed} passed, ${failed} failed.`);
    process.exitCode = failed ? 1 : 0;
  }
})();
