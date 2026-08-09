#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root, for example: curl -fsSL https://raw.githubusercontent.com/xiufengdong169-del/zkgl/main/scripts/bootstrap-lighthouse-demo.sh | sudo bash" >&2
  exit 1
fi

ZKGL_REPO_URL="${ZKGL_REPO_URL:-https://github.com/xiufengdong169-del/zkgl.git}"
ZKGL_BRANCH="${ZKGL_BRANCH:-main}"
ZKGL_APP_ROOT="${ZKGL_APP_ROOT:-/opt/zkgl}"
ZKGL_CURRENT_DIR="${ZKGL_CURRENT_DIR:-${ZKGL_APP_ROOT}/current}"

echo "==> Installing bootstrap packages"
apt-get update
apt-get install -y ca-certificates curl git

echo "==> Fetching ${ZKGL_REPO_URL} ${ZKGL_BRANCH}"
mkdir -p "${ZKGL_APP_ROOT}"
if [ ! -d "${ZKGL_CURRENT_DIR}/.git" ]; then
  rm -rf "${ZKGL_CURRENT_DIR}"
  git clone --branch "${ZKGL_BRANCH}" --depth 1 "${ZKGL_REPO_URL}" "${ZKGL_CURRENT_DIR}"
else
  git -C "${ZKGL_CURRENT_DIR}" fetch --depth 1 origin "${ZKGL_BRANCH}"
  git -C "${ZKGL_CURRENT_DIR}" checkout "${ZKGL_BRANCH}"
  git -C "${ZKGL_CURRENT_DIR}" reset --hard "origin/${ZKGL_BRANCH}"
fi

echo "==> Running demo deployment"
bash "${ZKGL_CURRENT_DIR}/scripts/deploy-lighthouse-demo.sh"
