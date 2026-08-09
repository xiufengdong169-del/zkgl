#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root, for example: sudo bash scripts/deploy-lighthouse-demo.sh" >&2
  exit 1
fi

ZKGL_REPO_URL="${ZKGL_REPO_URL:-https://github.com/xiufengdong169-del/zkgl.git}"
ZKGL_BRANCH="${ZKGL_BRANCH:-main}"
ZKGL_APP_ROOT="${ZKGL_APP_ROOT:-/opt/zkgl}"
ZKGL_CURRENT_DIR="${ZKGL_CURRENT_DIR:-${ZKGL_APP_ROOT}/current}"
ZKGL_DEMO_PUBLIC_URL="${ZKGL_DEMO_PUBLIC_URL:-http://193.112.79.220/}"
ZKGL_NGINX_SITE="${ZKGL_NGINX_SITE:-/etc/nginx/sites-available/zkgl-demo-http.conf}"

echo "==> Installing base packages"
apt-get update
apt-get install -y ca-certificates curl git nginx

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'Number(process.versions.node.split(`.`)[0])')" -lt 22 ]; then
  echo "==> Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "==> Preparing application directory ${ZKGL_CURRENT_DIR}"
mkdir -p "${ZKGL_APP_ROOT}"
if [ ! -d "${ZKGL_CURRENT_DIR}/.git" ]; then
  rm -rf "${ZKGL_CURRENT_DIR}"
  git clone --branch "${ZKGL_BRANCH}" --depth 1 "${ZKGL_REPO_URL}" "${ZKGL_CURRENT_DIR}"
else
  git -C "${ZKGL_CURRENT_DIR}" fetch --depth 1 origin "${ZKGL_BRANCH}"
  git -C "${ZKGL_CURRENT_DIR}" checkout "${ZKGL_BRANCH}"
  git -C "${ZKGL_CURRENT_DIR}" reset --hard "origin/${ZKGL_BRANCH}"
fi

cd "${ZKGL_CURRENT_DIR}"

echo "==> Installing dependencies"
npm ci

echo "==> Building web demo bundle"
VITE_DEMO_MODE=true VITE_API_BASE_URL= npm run build -w @zkgl/web
node scripts/verify-web-dist-security.mjs

echo "==> Installing Nginx demo site"
cp deploy/nginx/zkgl-demo-http.conf "${ZKGL_NGINX_SITE}"
ln -sfn "${ZKGL_NGINX_SITE}" /etc/nginx/sites-enabled/zkgl-demo-http.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "==> Demo is ready"
echo "${ZKGL_DEMO_PUBLIC_URL}"
