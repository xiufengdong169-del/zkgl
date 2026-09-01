const defaultTokenMap = {
  "local-admin-token-0001": "cb-admin-001",
  "local-ceo-token-0001": "cb-ceo-001",
  "local-biz-token-0001": "cb-biz-001",
  "local-pm-token-0001": "cb-pm-001",
  "local-bid-token-0001": "cb-bid-001",
  "local-fin-token-0001": "cb-fin-001",
  "local-member-token-0001": "cb-member-001",
  "local-none-token-0001": "cb-none-001",
};

function tokenMap() {
  const configured = process.env.LOCAL_AUTH_TOKEN_MAP_JSON?.trim();
  if (configured) return JSON.parse(configured);
  if (String(process.env.LOCAL_AUTH_ALLOW_EXAMPLE_TOKENS).toLowerCase() === "true") {
    return defaultTokenMap;
  }
  throw new Error("LOCAL_AUTH_TOKEN_MAP_JSON is required");
}

export async function verifyAccessToken(accessToken) {
  if (
    String(process.env.LOCAL_AUTH_ALLOW_EXAMPLE_TOKENS).toLowerCase() === "true" &&
    accessToken.startsWith("local-username:")
  ) {
    const username = accessToken.slice("local-username:".length).trim();
    if (username) return { uid: `local-username:${username}` };
  }
  const uid = tokenMap()[accessToken];
  if (!uid) throw new Error("Unknown local access token");
  return { uid };
}
