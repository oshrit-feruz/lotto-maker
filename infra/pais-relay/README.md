# pais.co.il relay (Tel Aviv)

`pais.co.il` does not answer requests from outside Israel, and Vercel has no Israeli region, so the
backend's draw sync (`draws-sync`, `draws-results`) times out there. This tiny service runs on
Google Cloud Run in `me-west1` (Tel Aviv) and forwards only the read-only Pais paths the backend uses (next draw, a draw's
results page, and the results archive fragment). Not part of the npm workspaces; no dependencies.

## Deploy (Cloud Shell, once)

```sh
git clone https://github.com/oshrit-feruz/lotto-maker.git && cd lotto-maker/infra/pais-relay
TOKEN=$(openssl rand -hex 24)
gcloud run deploy pais-relay --source . --region me-west1 --allow-unauthenticated \
  --set-env-vars RELAY_TOKEN=$TOKEN --min-instances 0 --max-instances 1 --memory 256Mi
echo "PAIS_BASE_URL=$(gcloud run services describe pais-relay --region me-west1 --format='value(status.url)')/$TOKEN"
```

Set the printed `PAIS_BASE_URL` in the Vercel project (Production and Preview, type Secret: it
contains the token), redeploy, and run the **Staging cron** workflow with job `draws-sync`.

The token is part of the URL path, so the backend needs no code change. Unknown paths and a wrong
token answer 404. A few requests per hour stay well inside the Cloud Run free tier.

## Check

`curl https://<service-url>/<token>/include/getNextLotteryDate.ashx?type=1` returns Pais JSON.
