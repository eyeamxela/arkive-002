// Fictional values for isolated tests only. Never imported by production entry.
export const FIXTURE_ENV = Object.freeze({
  CLERK_JWT_ISSUER_DOMAIN: 'https://arkive-fixture.invalid',
  ARKIVE_OWNER_SUBJECT: 'user_synthetic_owner',
  ARKIVE_WORKSPACE_ID: 'synthetic-workspace',
});
export const FIXTURE_IDENTITY = Object.freeze({ issuer: FIXTURE_ENV.CLERK_JWT_ISSUER_DOMAIN, subject: FIXTURE_ENV.ARKIVE_OWNER_SUBJECT });
export const FIXTURE_SCOPE = Object.freeze({ workspaceId: FIXTURE_ENV.ARKIVE_WORKSPACE_ID, ownerIdentity: JSON.stringify([FIXTURE_IDENTITY.issuer, FIXTURE_IDENTITY.subject]) });
export function filterRows(rows, predicate) {
  const expr = {
    field: key => row => row[key],
    eq: (a, b) => row => (typeof a === 'function' ? a(row) : a) === (typeof b === 'function' ? b(row) : b),
    and: (...checks) => row => checks.every(check => check(row)),
  };
  return rows.filter(predicate(expr));
}
