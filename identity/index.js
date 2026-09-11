/*
* SPDX-License-Identifier: Apache-2.0
* Unless explicitly stated otherwise all files in this repository are licensed under the Apache License Version 2.0.
* Copyright 2026-present Datadog, Inc.
*/

'use strict';

const { run } = require('../src/index.js');

run({
    path: '/api/v2/delegated-token',
    credentialField: 'access_token',
    outputName: 'access_token',
    label: 'Datadog access token',
});
