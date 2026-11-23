#!/bin/sh
# Vercel build for a dashboard service (root vercel.json). Usage, from the package directory:
#   sh ../../scripts/vercel-build-spa.sh <package-dir-name> <public base path>
# e.g. `sh ../../scripts/vercel-build-spa.sh admin-dashboard /admin/`.
#
# A service receives the original request path (/admin/assets/x.js), so its static files must
# live under that path in the output: Vite builds with `base` = the path (BASE_PATH) and the
# result is copied to vercel-out/<path>, which is the service's outputDirectory.
# The API is the backend service on the same origin: VITE_API_URL defaults to /backend.
set -e

pkg="$1"
base="$2"
case "$base" in /*/) ;; *) echo "base path must start and end with /: $base" >&2; exit 1 ;; esac

cd ../..
npm run build -w @lotto-maker/shared
BASE_PATH="$base" VITE_API_URL="${VITE_API_URL:-/backend}" npm run build -w "packages/$pkg"

cd "packages/$pkg"
rm -rf vercel-out
mkdir -p "vercel-out$base"
cp -R dist/. "vercel-out$base"
echo "[vercel-build-spa] $pkg -> vercel-out$base"
