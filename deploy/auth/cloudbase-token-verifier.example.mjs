/**
 * ZKGL trusted auth adapter verifier template.
 *
 * Copy this file to a server-only path such as:
 *   /etc/zkgl/cloudbase-token-verifier.mjs
 *
 * Then replace the implementation with Tencent CloudBase access-token
 * verification using server-side credentials or an internal verification
 * endpoint. Do not commit the edited file or any secret values.
 *
 * The template intentionally fails closed so it cannot authenticate users if
 * referenced directly by AUTH_TOKEN_VERIFIER_MODULE.
 */
export async function verifyAccessToken() {
  throw new Error(
    "Replace deploy/auth/cloudbase-token-verifier.example.mjs with a server-local verifier before production use",
  );
}
