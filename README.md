# datadog-workload-identity-federation-github-action

A GitHub Action to authenticate to Datadog from a GitHub workflow using
Datadog's native **Workload Identity Federation** (WIF).

The action exchanges the workflow's GitHub OIDC identity token for Datadog
credentials, without requiring long-lived API or application keys to be stored
as GitHub secrets. The trust is established on the Datadog side through a
mapping configured on the target Datadog organization.

This repository ships **two actions**, one for each WIF mapping type:

| Action path | Mapping type | Returns | Use case |
| --- | --- | --- | --- |
| `DataDog/datadog-workload-identity-federation-github-action/intake@main` | Intake mapping | Datadog API key | Sending telemetry (logs, metrics, …) to Datadog |
| `DataDog/datadog-workload-identity-federation-github-action/identity@main` | Identity mapping | Datadog access token | Calling Datadog public API endpoints on behalf of an identity |

Both actions require the `id-token: write` permission so that GitHub can issue
an OIDC token for the workflow.

## How it works

1. The action requests a GitHub OIDC token for the audience
   `datadog/<org_uuid>`.
2. It posts that OIDC token to the Datadog Workload Identity Federation
   endpoint with an `Authorization: Delegated <oidc_token>` header.
3. Datadog validates the token against the mapping configured on the
   organization and returns the federated credential.
4. The credential is masked in logs and exposed as a step output.

## Usage

### Intake mapping — Datadog API key

```yaml
name: Send a log to Datadog

on:
  workflow_dispatch:

permissions: {}

jobs:
  send-log:
    runs-on: ubuntu-latest
    permissions:
      id-token: write # Needed to federate the OIDC token.
    steps:
      - name: Get Datadog API key
        id: wif
        uses: DataDog/datadog-workload-identity-federation-github-action/intake@main
        with:
          org_uuid: <your-org-uuid>
          site: datadoghq.com

      - name: Send a test log
        env:
          DD_API_KEY: ${{ steps.wif.outputs.api_key }}
          DD_SITE: datadoghq.com
        run: |
          set -euo pipefail
          curl -fsS -X POST \
            -H "Accept: application/json" \
            -H "Content-Type: application/json" \
            -H "DD-API-KEY: ${DD_API_KEY}" \
            "https://http-intake.logs.${DD_SITE}/api/v2/logs" \
            -d '{"ddsource":"github-actions","ddtags":"env:test,source:github-actions","hostname":"github-actions","message":"Hello from GitHub Actions","service":"github-actions-datadog-wif-test"}'
          echo "Test log sent ✅"
```

### Identity mapping — Datadog access token

```yaml
name: Call the Datadog API

on:
  workflow_dispatch:

permissions: {}

jobs:
  call-api:
    runs-on: ubuntu-latest
    permissions:
      id-token: write # Needed to federate the OIDC token.
    steps:
      - name: Get Datadog access token
        id: wif
        uses: DataDog/datadog-workload-identity-federation-github-action/identity@main
        with:
          org_uuid: <your-org-uuid>
          site: datadoghq.com

      - name: Fetch the current user profile
        env:
          DD_ACCESS_TOKEN: ${{ steps.wif.outputs.access_token }}
          DD_SITE: datadoghq.com
        run: |
          set -euo pipefail
          curl -fsS \
            -H "Accept: application/json" \
            -H "Authorization: Bearer ${DD_ACCESS_TOKEN}" \
            "https://api.${DD_SITE}/api/v2/current_user"
          echo "Current user profile fetched ✅"
```

## Inputs

Both actions share the same inputs.

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `org_uuid` | yes | — | The UUID of the Datadog organization to authenticate to. |
| `site` | no | `datadoghq.com` | The site where the Datadog organization is located. |

## Outputs

| Action | Output | Description |
| --- | --- | --- |
| Intake mapping | `api_key` | A Datadog API key scoped to the configured intake mapping. |
| Identity mapping | `access_token` | A Datadog access token scoped to the configured identity mapping. |

## Prerequisites

Before using this action, a Datadog organization administrator must configure a
Workload Identity Federation mapping that trusts the GitHub OIDC token's
audience (`datadog/<org_uuid>`) and the relevant repository / workflow / branch
claims. Refer to the Datadog documentation for how to create intake and identity
mappings.
