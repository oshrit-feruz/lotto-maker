#!/bin/sh
# Deploy pais-relay to Cloud Run in Tel Aviv. Run in Cloud Shell from this directory:
#   sh deploy.sh <gcp-project-id>
# Writes the value for Vercel's PAIS_BASE_URL to ~/pais_base_url.txt (it contains the token, so it
# is not printed). Re-running keeps the existing token.
set -e
PROJECT="$1"
[ -n "$PROJECT" ] || { echo "usage: sh deploy.sh <gcp-project-id>" >&2; exit 1; }
REGION=me-west1
gcloud config set project "$PROJECT" >/dev/null

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

# New projects: the default compute service account builds `--source` deploys and needs this role.
PN=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:${PN}-compute@developer.gserviceaccount.com" \
  --role=roles/run.builder --condition=None --quiet >/dev/null
echo "[deploy] IAM ok"

umask 077
[ -s ~/.pais_token ] || openssl rand -hex 24 > ~/.pais_token
TOKEN=$(cat ~/.pais_token)

for attempt in 1 2 3; do
  if gcloud run deploy pais-relay --source . --region "$REGION" --allow-unauthenticated \
      --set-env-vars "RELAY_TOKEN=$TOKEN" --min-instances 0 --max-instances 1 --memory 256Mi --quiet; then
    break
  fi
  [ "$attempt" = 3 ] && exit 1
  echo "[deploy] retrying in 60 s (IAM changes can take a minute to apply)"; sleep 60
done

URL=$(gcloud run services describe pais-relay --region "$REGION" --format='value(status.url)')
printf '%s/%s' "$URL" "$TOKEN" > ~/pais_base_url.txt
code=$(curl -s -o /tmp/pais.json -w '%{http_code}' "$URL/$TOKEN/include/getNextLotteryDate.ashx?type=1")
echo "[deploy] test request to pais.co.il through the relay: HTTP $code, $(head -c 120 /tmp/pais.json)"
echo "[deploy] PAIS_BASE_URL written to ~/pais_base_url.txt"
