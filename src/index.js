/*
* SPDX-License-Identifier: Apache-2.0
* Unless explicitly stated otherwise all files in this repository are licensed under the Apache License Version 2.0.
* Copyright 2026-present Datadog, Inc.
*/

'use strict';

const fs = require('fs');

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);

    if (!response.ok) {
        const errorBody = await response.text();
        const error = new Error(`HTTP error! status: ${response.status}, ${errorBody}`);
        error.status = response.status;
        throw error;
    }

    return response.json();
}

async function getOidcToken(actionsUrl, audience, actionsToken) {
    console.log(`Requesting GitHub OIDC token...`);
    const json = await fetchJson(`${actionsUrl}&audience=${audience}`, { headers: { 'Authorization': `Bearer ${actionsToken}` } });

    if (!json.value) {
        throw new Error('GitHub OIDC token response did not include a token value.');
    }

    // The OIDC token is a short-lived credential that can be replayed within its
    // validity window. Mask it immediately so it can never appear in logs, even
    // if an error message or response body later includes it.
    console.log(`::add-mask::${json.value}`);

    console.log('Successfully retrieved GitHub OIDC token.');
    return json.value;
}

async function exchangeOidcForCredential(site, exchange, oidcToken) {
    const exchangeUrl = `https://api.${site}${exchange.path}`;
    console.log(`Exchanging OIDC token for ${exchange.label}...`);
    const json = await fetchJson(
        exchangeUrl,
        {
            method: 'POST',
            headers: {
                'Authorization': `Delegated ${oidcToken}`,
            },
        }
    );

    const credential = json && json.data && json.data.attributes && json.data.attributes[exchange.credentialField];
    if (!credential) {
        throw new Error(json && json.errors ? JSON.stringify(json.errors) : `Missing ${exchange.credentialField} in response`);
    }

    console.log(`Received ${exchange.label}.`);
    return credential;
}

async function run(exchange) {
    const actionsToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    const actionsUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;

    if (!actionsToken || !actionsUrl) {
        console.log(`::error::Missing required environment variables; have you set 'id-token: write' in your workflow permissions?`);
        process.exit(1);
    }

    // Defense-in-depth: mask the GitHub-internal token used to request OIDC tokens
    // so it can never appear in logs, even if a future change surfaces it.
    console.log(`::add-mask::${actionsToken}`);

    const org_uuid = process.env.INPUT_ORG_UUID;
    const site = process.env.INPUT_SITE;

    if (!org_uuid) {
        console.log(`::error::Missing required input 'org_uuid'`);
        process.exit(1);
    }

    if (!site) {
        console.log(`::error::Missing required input 'site'`);
        process.exit(1);
    }

    try {
        console.log(`Starting datadog-workload-identity-federation-github-action with site='${site}'.`);

        const audience = `datadog/${org_uuid}`;
        const oidcToken = await getOidcToken(actionsUrl, audience, actionsToken);

        let credential;

        try {
            credential = await exchangeOidcForCredential(site, exchange, oidcToken);
        } catch (error) {
            console.log(`::error::Failed to exchange OIDC token for ${exchange.label}: ${error.message}`);
            throw error;
        }

        // Mask the sensitive credential in logs.
        console.log(`::add-mask::${credential}`);

        fs.appendFileSync(process.env.GITHUB_OUTPUT, `${exchange.outputName}=${credential}\n`);

        console.log('datadog-workload-identity-federation-github-action completed successfully.');
    } catch (err) {
        console.log(`::error::${err.stack}`);
        process.exit(1);
    }
}

module.exports = { run };
