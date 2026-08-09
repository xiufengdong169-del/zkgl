#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run as root, for example: sudo bash scripts/deploy-lighthouse-production.sh" >&2
  exit 1
fi

ZKGL_REPO_URL="${ZKGL_REPO_URL:-https://github.com/xiufengdong169-del/zkgl.git}"
ZKGL_BRANCH="${ZKGL_BRANCH:-main}"
ZKGL_APP_ROOT="${ZKGL_APP_ROOT:-/opt/zkgl}"
ZKGL_CURRENT_DIR="${ZKGL_CURRENT_DIR:-${ZKGL_APP_ROOT}/current}"
ZKGL_ENV_FILE="${ZKGL_ENV_FILE:-/etc/zkgl/zkgl-api.env}"
ZKGL_NGINX_SITE="${ZKGL_NGINX_SITE:-/etc/nginx/sites-available/zkgl.conf}"
ZKGL_PUBLIC_HOST="${ZKGL_PUBLIC_HOST:-193.112.79.220}"
ZKGL_PUBLIC_ORIGIN="${ZKGL_PUBLIC_ORIGIN:-https://${ZKGL_PUBLIC_HOST}}"
ZKGL_API_BASE_URL="${ZKGL_API_BASE_URL:-${ZKGL_PUBLIC_ORIGIN}/api}"
ZKGL_TLS_CERT="${ZKGL_TLS_CERT:-/etc/letsencrypt/live/zkgl/fullchain.pem}"
ZKGL_TLS_KEY="${ZKGL_TLS_KEY:-/etc/letsencrypt/live/zkgl/privkey.pem}"
ZKGL_CLOUDBASE_REGION="${ZKGL_CLOUDBASE_REGION:-ap-guangzhou}"
ZKGL_REQUIRE_ENV="${ZKGL_REQUIRE_ENV:-true}"

required_env_keys=(
  DEPLOY_TARGET_HOST
  DEPLOY_TARGET_OS
  DEPLOY_TARGET_MYSQL
  API_HOST
  API_PORT
  API_ALLOWED_ORIGINS
  AUTH_ADAPTER_HOST
  AUTH_ADAPTER_PORT
  AUTH_TOKEN_VERIFIER_MODULE
  AUTH_TRUSTED_PROXY
  DB_HOST
  DB_PORT
  DB_NAME
  DB_USER
  DB_PASSWORD
)

env_value() {
  grep -E "^$1=" "${ZKGL_ENV_FILE}" | tail -n 1 | cut -d= -f2-
}

echo "==> Installing base packages"
apt-get update
apt-get install -y ca-certificates curl git nginx mysql-client

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'Number(process.versions.node.split(`.`)[0])')" -lt 22 ]; then
  echo "==> Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

echo "==> Preparing system user and directories"
id -u zkgl >/dev/null 2>&1 || useradd --system --home "${ZKGL_APP_ROOT}" --shell /usr/sbin/nologin --create-home zkgl
mkdir -p "${ZKGL_APP_ROOT}" /etc/zkgl /var/backups/zkgl/mysql
chown -R zkgl:zkgl "${ZKGL_APP_ROOT}" /var/backups/zkgl

if [ ! -f "${ZKGL_ENV_FILE}" ]; then
  cat > "${ZKGL_ENV_FILE}" <<'ENVEOF'
DEPLOY_TARGET_HOST=193.112.79.220
DEPLOY_TARGET_REGION=guangzhou
DEPLOY_TARGET_OS=Ubuntu 24.04
DEPLOY_TARGET_MYSQL=8.0
API_HOST=127.0.0.1
API_PORT=3000
API_ALLOWED_ORIGINS=https://正式域名
AUTH_ADAPTER_HOST=127.0.0.1
AUTH_ADAPTER_PORT=3010
AUTH_TOKEN_VERIFIER_MODULE=
AUTH_TRUSTED_PROXY=false
BACKUP_MYSQL_DIR=/var/backups/zkgl/mysql
BACKUP_RETENTION_DAYS=30
RESTORE_BACKUP_FILE=
RESTORE_DB_NAME=
RESTORE_CONFIRM=
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=zkgl
DB_USER=zkgl_app
DB_PASSWORD=
CLOUDBASE_ENV_ID=cloudbase-d7gc2b32cd4196059
ENVEOF
  chmod 600 "${ZKGL_ENV_FILE}"
  echo "Created ${ZKGL_ENV_FILE}; fill DB_PASSWORD, API_ALLOWED_ORIGINS, and AUTH_TOKEN_VERIFIER_MODULE, then rerun." >&2
fi

echo "==> Fetching ${ZKGL_REPO_URL} ${ZKGL_BRANCH}"
if [ ! -d "${ZKGL_CURRENT_DIR}/.git" ]; then
  rm -rf "${ZKGL_CURRENT_DIR}"
  git clone --branch "${ZKGL_BRANCH}" --depth 1 "${ZKGL_REPO_URL}" "${ZKGL_CURRENT_DIR}"
else
  git -C "${ZKGL_CURRENT_DIR}" fetch --depth 1 origin "${ZKGL_BRANCH}"
  git -C "${ZKGL_CURRENT_DIR}" checkout "${ZKGL_BRANCH}"
  git -C "${ZKGL_CURRENT_DIR}" reset --hard "origin/${ZKGL_BRANCH}"
fi

cd "${ZKGL_CURRENT_DIR}"

if [ "${ZKGL_REQUIRE_ENV}" = "true" ]; then
  echo "==> Verifying server environment"
  ZKGL_ENV_FILE="${ZKGL_ENV_FILE}" ZKGL_TLS_CERT="${ZKGL_TLS_CERT}" ZKGL_TLS_KEY="${ZKGL_TLS_KEY}" \
    node scripts/verify-server-env.mjs
fi

echo "==> Installing dependencies and building"
npm ci
npm run verify:acceptance
npm run build -w @zkgl/api
VITE_CLOUDBASE_ENV_ID="$(env_value CLOUDBASE_ENV_ID)" \
  VITE_CLOUDBASE_REGION="${ZKGL_CLOUDBASE_REGION}" \
  VITE_API_BASE_URL="${ZKGL_API_BASE_URL}" \
  npm run build -w @zkgl/web
node scripts/verify-web-dist-security.mjs
node scripts/verify-server-deployment-assets.mjs
node scripts/verify-backup-assets.mjs
node scripts/verify-server-preflight.mjs

echo "==> Installing systemd units"
cp deploy/systemd/zkgl-api.service /etc/systemd/system/zkgl-api.service
cp deploy/systemd/zkgl-auth-adapter.service /etc/systemd/system/zkgl-auth-adapter.service
cp deploy/systemd/zkgl-reminder.service /etc/systemd/system/zkgl-reminder.service
cp deploy/systemd/zkgl-reminder.timer /etc/systemd/system/zkgl-reminder.timer
cp deploy/systemd/zkgl-export-worker.service /etc/systemd/system/zkgl-export-worker.service
cp deploy/systemd/zkgl-export-worker.timer /etc/systemd/system/zkgl-export-worker.timer
cp deploy/systemd/zkgl-mysql-backup.service /etc/systemd/system/zkgl-mysql-backup.service
cp deploy/systemd/zkgl-mysql-backup.timer /etc/systemd/system/zkgl-mysql-backup.timer
systemctl daemon-reload

echo "==> Installing Nginx production site"
cp deploy/nginx/zkgl.conf "${ZKGL_NGINX_SITE}"
sed -i "s/server_name _;/server_name ${ZKGL_PUBLIC_HOST};/" "${ZKGL_NGINX_SITE}"
sed -i "s|ssl_certificate /etc/letsencrypt/live/zkgl/fullchain.pem;|ssl_certificate ${ZKGL_TLS_CERT};|" "${ZKGL_NGINX_SITE}"
sed -i "s|ssl_certificate_key /etc/letsencrypt/live/zkgl/privkey.pem;|ssl_certificate_key ${ZKGL_TLS_KEY};|" "${ZKGL_NGINX_SITE}"
ln -sfn "${ZKGL_NGINX_SITE}" /etc/nginx/sites-enabled/zkgl.conf
rm -f /etc/nginx/sites-enabled/default /etc/nginx/sites-enabled/zkgl-demo-http.conf
nginx -t

echo "==> Starting services"
systemctl enable --now zkgl-auth-adapter
systemctl enable --now zkgl-api
systemctl enable --now zkgl-reminder.timer
systemctl enable --now zkgl-export-worker.timer
systemctl enable --now zkgl-mysql-backup.timer
systemctl enable --now nginx
systemctl reload nginx

echo "==> Health checks"
curl -fsS http://127.0.0.1:3010/healthz >/dev/null
curl -fsS http://127.0.0.1:3000/healthz >/dev/null
curl -fsS http://127.0.0.1:3000/readyz >/dev/null
systemctl --no-pager --full status zkgl-auth-adapter zkgl-api
systemctl list-timers 'zkgl-*'

echo "==> Production deployment completed"
