const gatewayInput = document.getElementById('gatewayUrl');
const apiKeyInput = document.getElementById('publicApiKey');

const routeButtons = document.querySelectorAll('.route-btn');
const viewButtons = document.querySelectorAll('.view-btn');
const moduleViews = document.querySelectorAll('.module-view');

const outputRefs = {
  auth: document.getElementById('authOutput'),
  rest: document.getElementById('restOutput'),
  realtime: document.getElementById('realtimeOutput'),
  kong: document.getElementById('kongOutput'),
  studio: document.getElementById('studioOutput'),
  trino: document.getElementById('trinoOutput'),
  pgmeta: document.getElementById('pgmetaOutput'),
  postgres: document.getElementById('postgresOutput'),
  dbbootstrap: document.getElementById('dbbootstrapOutput'),
  mongo: document.getElementById('mongoOutput'),
  minio: document.getElementById('minioOutput'),
  redis: document.getElementById('redisOutput'),
  supavisor: document.getElementById('supavisorOutput'),
  tests: document.getElementById('testsOutput'),
  pgDual: document.getElementById('pgOutput'),
  mongoDual: document.getElementById('mongoOutput'),
  dualPlanesMain: document.getElementById('dualPlanesOutput'),
};

let realtimeSocket = null;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFrom(values) {
  return values[randomInt(0, values.length - 1)];
}

function randomString(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars.charAt(randomInt(0, chars.length - 1));
  }
  return out;
}

function randomHex(length = 16) {
  const chars = 'abcdef0123456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars.charAt(randomInt(0, chars.length - 1));
  }
  return out;
}

function randomUuid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `${randomHex(8)}-${randomHex(4)}-${randomHex(4)}-${randomHex(4)}-${randomHex(12)}`;
}

function randomEmail() {
  const domain = randomFrom(['example.com', 'test.dev', 'mail.local']);
  return `user_${randomString(6)}@${domain}`;
}

function randomPassword() {
  return `P@ss-${randomString(5)}-${randomInt(100, 999)}`;
}

function randomTableName() {
  return randomFrom(['profiles', 'projects', 'events', 'audit_logs', 'feature_flags']);
}

function randomSchemaName() {
  return randomFrom(['public', 'analytics', 'tenant_data', 'private_data']);
}

function randomHttpMethod() {
  return randomFrom(['GET', 'POST', 'PATCH', 'DELETE']);
}

function randomStatusSet(ok = true) {
  return ok ? randomFrom([[200], [200, 201], [200, 202]]) : randomFrom([[400], [401], [403], [404], [429]]);
}

async function runGeneratedRequest(outputEl, label, path, needsApiKey, options = {}) {
  try {
    const result = await probe(path, needsApiKey, options);
    writeTo(outputEl, `${label} (executed)`, result);
    return result;
  } catch (error) {
    writeTo(outputEl, `${label} (executed)`, { error: error.message });
    return null;
  }
}

function getGateway() {
  const raw = gatewayInput?.value?.trim() || '';
  return raw ? raw.replace(/\/$/, '') : '/api';
}

function getApiKey() {
  return apiKeyInput?.value?.trim() || '';
}

function writeTo(outputEl, label, payload) {
  if (!outputEl) {
    return;
  }

  const stamp = new Date().toISOString();
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  const next = `[${stamp}] ${label}\n${body}\n\n`;
  outputEl.textContent = `${next}${outputEl.textContent}`.trim();
}

function clearOutput(outputEl, fallbackText) {
  if (outputEl) {
    outputEl.textContent = fallbackText;
  }
}

function buildRouteUrl(path, needsKey = false) {
  const gateway = getGateway();
  const url = new URL(`${gateway}${path}`, window.location.origin);

  if (needsKey && getApiKey()) {
    url.searchParams.set('apikey', getApiKey());
  }

  return url.toString();
}

function openUrl(url) {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    window.location.href = url;
  }
}

function activeView(view) {
  viewButtons.forEach((button) => {
    button.classList.toggle('view-btn--active', button.dataset.view === view);
  });

  moduleViews.forEach((viewEl) => {
    viewEl.classList.toggle('module-view--active', viewEl.id === `view-${view}`);
  });
}

function isNoRouteMatch(result) {
  return result?.status === 404 && typeof result?.body?.message === 'string' && result.body.message.includes('no Route matched');
}

async function probe(path, needsApiKey = false, options = {}) {
  const headers = { Accept: 'application/json', ...(options.headers || {}) };

  if (needsApiKey && getApiKey()) {
    headers.apikey = getApiKey();
  }

  const response = await fetch(`${getGateway()}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body,
  });

  let body;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    body = await response.json();
  } else {
    body = await response.text();
  }

  return {
    ok: response.ok,
    status: response.status,
    url: `${getGateway()}${path}`,
    body,
  };
}

function bindClick(id, handler) {
  const element = document.getElementById(id);
  if (element) {
    element.addEventListener('click', handler);
  }
}

function bindSubmit(id, handler) {
  const element = document.getElementById(id);
  if (element) {
    element.addEventListener('submit', handler);
  }
}

function getRealtimeWsUrl() {
  const wsPathInput = document.getElementById('wsPath');
  const wsTokenInput = document.getElementById('wsToken');

  const path = wsPathInput?.value?.trim() || '/realtime/v1/websocket';
  const httpUrl = new URL(`${getGateway()}${path}`, window.location.origin);
  httpUrl.protocol = httpUrl.protocol === 'https:' ? 'wss:' : 'ws:';

  if (getApiKey()) {
    httpUrl.searchParams.set('apikey', getApiKey());
  }

  if (wsTokenInput?.value?.trim()) {
    httpUrl.searchParams.set('token', wsTokenInput.value.trim());
  }

  httpUrl.searchParams.set('vsn', '1.0.0');
  return httpUrl.toString();
}

function setupBaseListeners() {
  viewButtons.forEach((button) => {
    button.addEventListener('click', () => {
      activeView(button.dataset.view);
    });
  });

  routeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const path = button.dataset.route;
      const needsKey = button.dataset.needsKey === 'true';
      if (!path) {
        return;
      }
      openUrl(buildRouteUrl(path, needsKey));
    });
  });
}

function setupAuthView() {
  bindClick('authGenerateData', async () => {
    const generated = {
      scenarioId: `auth-${randomString(6)}`,
      signup: {
        endpoint: '/auth/v1/signup',
        method: 'POST',
        headers: { apikey: getApiKey() || '<ANON_KEY>', 'Content-Type': 'application/json' },
        body: { email: randomEmail(), password: randomPassword(), data: { tenant: randomString(4) } },
        expectedStatus: randomStatusSet(true),
      },
      login: {
        endpoint: '/auth/v1/token?grant_type=password',
        method: 'POST',
        expectedStatus: [200],
      },
      negativeTest: {
        description: 'Invalid password should fail',
        expectedStatus: randomStatusSet(false),
      },
    };

    writeTo(outputRefs.auth, 'RANDOM AUTH TEST DATA', generated);

    await runGeneratedRequest(outputRefs.auth, 'POST /auth/v1/signup', '/auth/v1/signup', true, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(generated.signup.body),
    });

    await runGeneratedRequest(outputRefs.auth, 'GET /auth/v1/health', '/auth/v1/health', true);
  });

  bindClick('checkAuthHealth', async () => {
    try {
      const result = await probe('/auth/v1/health', true);
      writeTo(outputRefs.auth, 'GET /auth/v1/health', result);
    } catch (error) {
      writeTo(outputRefs.auth, 'GET /auth/v1/health', { error: error.message });
    }
  });

  bindSubmit('signupForm', async (event) => {
    event.preventDefault();

    const email = document.getElementById('signupEmail')?.value?.trim() || '';
    const password = document.getElementById('signupPassword')?.value || '';

    if (!email || !password) {
      writeTo(outputRefs.auth, 'POST /auth/v1/signup', { error: 'email and password are required' });
      return;
    }

    try {
      const result = await probe('/auth/v1/signup', true, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      writeTo(outputRefs.auth, 'POST /auth/v1/signup', result);
    } catch (error) {
      writeTo(outputRefs.auth, 'POST /auth/v1/signup', { error: error.message });
    }
  });

  bindSubmit('loginForm', async (event) => {
    event.preventDefault();

    const email = document.getElementById('loginEmail')?.value?.trim() || '';
    const password = document.getElementById('loginPassword')?.value || '';

    if (!email || !password) {
      writeTo(outputRefs.auth, 'POST /auth/v1/token?grant_type=password', { error: 'email and password are required' });
      return;
    }

    try {
      const result = await probe('/auth/v1/token?grant_type=password', true, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      writeTo(outputRefs.auth, 'POST /auth/v1/token?grant_type=password', result);
    } catch (error) {
      writeTo(outputRefs.auth, 'POST /auth/v1/token?grant_type=password', { error: error.message });
    }
  });

  bindClick('clearAuthOutput', () => {
    clearOutput(outputRefs.auth, 'No auth requests yet.');
  });
}

function setupRestView() {
  bindClick('restGenerateData', async () => {
    const method = randomHttpMethod();
    const table = randomTableName();
    const rowId = randomUuid();
    const path = method === 'GET' ? `/rest/v1/${table}?select=*` : `/rest/v1/${table}`;

    const generated = {
      scenarioId: `rest-${randomString(6)}`,
      request: {
        method,
        path,
        headers: {
          apikey: getApiKey() || '<ANON_KEY>',
          Authorization: 'Bearer <JWT_TOKEN>',
          Prefer: randomFrom(['return=minimal', 'return=representation']),
        },
        body: method === 'GET' || method === 'DELETE' ? null : {
          id: rowId,
          name: `name_${randomString(5)}`,
          enabled: randomFrom([true, false]),
          count: randomInt(1, 500),
        },
      },
      expectedStatus: method === 'POST' ? [201] : method === 'DELETE' ? [204] : [200],
    };

    writeTo(outputRefs.rest, 'RANDOM REST TEST DATA', generated);

    const requestOptions = {
      method: generated.request.method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (generated.request.body) {
      requestOptions.body = JSON.stringify(generated.request.body);
    }

    await runGeneratedRequest(
      outputRefs.rest,
      `${generated.request.method} ${generated.request.path}`,
      generated.request.path,
      true,
      requestOptions,
    );
  });

  bindSubmit('restRequestForm', async (event) => {
    event.preventDefault();

    const method = document.getElementById('restMethod')?.value || 'GET';
    const path = document.getElementById('restPath')?.value?.trim() || '/rest/v1/';
    const rawBody = document.getElementById('restBody')?.value?.trim() || '';
    const options = { method };

    if (rawBody) {
      options.body = rawBody;
      options.headers = { 'Content-Type': 'application/json' };
    }

    try {
      const result = await probe(path, true, options);
      writeTo(outputRefs.rest, `${method} ${path}`, result);
    } catch (error) {
      writeTo(outputRefs.rest, `${method} ${path}`, { error: error.message });
    }
  });

  bindClick('clearRestOutput', () => {
    clearOutput(outputRefs.rest, 'No REST requests yet.');
  });
}

function setupRealtimeView() {
  bindClick('realtimeGenerateData', () => {
    const channel = `realtime:${randomSchemaName()}:${randomTableName()}`;
    const joinRef = Date.now().toString();
    const generated = {
      scenarioId: `realtime-${randomString(6)}`,
      websocket: {
        url: getRealtimeWsUrl(),
        joinMessage: {
          topic: channel,
          event: 'phx_join',
          payload: {
            config: { broadcast: { ack: false, self: false }, presence: { key: randomString(6) } },
          },
          ref: joinRef,
        },
        heartbeat: {
          topic: 'phoenix',
          event: 'heartbeat',
          payload: {},
          ref: (Date.now() + 1).toString(),
        },
      },
      expectedStatus: ['OPEN', 'MESSAGE phx_reply'],
    };

    writeTo(outputRefs.realtime, 'RANDOM REALTIME TEST DATA', generated);

    if (!realtimeSocket || realtimeSocket.readyState !== WebSocket.OPEN) {
      writeTo(outputRefs.realtime, 'RANDOM REALTIME TEST DATA (executed)', 'Socket not open. Click Connect or wait for OPEN event.');
      return;
    }

    realtimeSocket.send(JSON.stringify(generated.websocket.joinMessage));
    realtimeSocket.send(JSON.stringify(generated.websocket.heartbeat));
    writeTo(outputRefs.realtime, 'RANDOM REALTIME TEST DATA (executed)', {
      sent: [generated.websocket.joinMessage, generated.websocket.heartbeat],
    });
  });

  bindClick('connectRealtime', () => {
    try {
      if (realtimeSocket && realtimeSocket.readyState <= 1) {
        writeTo(outputRefs.realtime, 'CONNECT', 'WebSocket is already connected or connecting.');
        return;
      }

      const wsUrl = getRealtimeWsUrl();
      realtimeSocket = new WebSocket(wsUrl);
      writeTo(outputRefs.realtime, 'CONNECT', `Connecting to ${wsUrl}`);

      realtimeSocket.onopen = () => {
        writeTo(outputRefs.realtime, 'OPEN', 'WebSocket connection established.');
      };

      realtimeSocket.onmessage = (event) => {
        writeTo(outputRefs.realtime, 'MESSAGE', event.data);
      };

      realtimeSocket.onerror = () => {
        writeTo(outputRefs.realtime, 'ERROR', 'WebSocket error occurred.');
      };

      realtimeSocket.onclose = (event) => {
        writeTo(outputRefs.realtime, 'CLOSE', { code: event.code, reason: event.reason || 'No reason' });
      };
    } catch (error) {
      writeTo(outputRefs.realtime, 'CONNECT', { error: error.message });
    }
  });

  bindClick('disconnectRealtime', () => {
    if (realtimeSocket && realtimeSocket.readyState <= 1) {
      realtimeSocket.close(1000, 'Manual disconnect');
      return;
    }
    writeTo(outputRefs.realtime, 'DISCONNECT', 'No active WebSocket connection to close.');
  });

  bindClick('sendRealtimePing', () => {
    if (!realtimeSocket || realtimeSocket.readyState !== WebSocket.OPEN) {
      writeTo(outputRefs.realtime, 'PING', 'WebSocket is not open.');
      return;
    }

    const pingMessage = JSON.stringify({
      topic: 'realtime:public:*',
      event: 'phx_join',
      payload: {},
      ref: Date.now().toString(),
    });

    realtimeSocket.send(pingMessage);
    writeTo(outputRefs.realtime, 'PING', pingMessage);
  });

  bindClick('clearRealtimeOutput', () => {
    clearOutput(outputRefs.realtime, 'No realtime activity yet.');
  });
}

function setupContainerViews() {
  bindClick('kongGenerateData', async () => {
    const generated = {
      scenarioId: `kong-${randomString(6)}`,
      route: {
        name: `route_${randomString(5)}`,
        service: randomFrom(['auth-v1', 'rest-v1', 'realtime-v1', 'storage-v1']),
        methods: randomFrom([['GET'], ['GET', 'POST'], ['GET', 'POST', 'OPTIONS']]),
        paths: [`/${randomString(4)}/v1`],
      },
      expectedGatewayCodes: [200, 401, 404],
      adminEndpoint: 'http://localhost:8001/routes',
    };

    writeTo(outputRefs.kong, 'RANDOM KONG TEST DATA', generated);

    await runGeneratedRequest(outputRefs.kong, 'GET /auth/v1/health', '/auth/v1/health', true, {
      headers: { 'x-route-test': generated.route.name },
    });
  });

  bindClick('kongCheckAuth', async () => {
    try {
      writeTo(outputRefs.kong, 'GET /auth/v1/health', await probe('/auth/v1/health', true));
    } catch (error) {
      writeTo(outputRefs.kong, 'GET /auth/v1/health', { error: error.message });
    }
  });

  bindClick('kongCheckRest', async () => {
    try {
      writeTo(outputRefs.kong, 'GET /rest/v1/', await probe('/rest/v1/', true));
    } catch (error) {
      writeTo(outputRefs.kong, 'GET /rest/v1/', { error: error.message });
    }
  });

  bindClick('kongOpenAdmin', () => {
    openUrl('http://localhost:8001/');
    writeTo(outputRefs.kong, 'OPEN', 'Opened Kong Admin on http://localhost:8001/');
  });

  bindClick('clearKongOutput', () => clearOutput(outputRefs.kong, 'No Kong checks yet.'));

  bindClick('studioOpenDirect', () => {
    openUrl('http://localhost:3001/');
    writeTo(outputRefs.studio, 'OPEN', 'Opened Studio direct URL http://localhost:3001/');
  });

  bindClick('studioOpenGateway', () => {
    openUrl(buildRouteUrl('/studio'));
    writeTo(outputRefs.studio, 'OPEN', `Opened Studio via gateway ${buildRouteUrl('/studio')}`);
  });

  bindClick('studioProbeGateway', async () => {
    try {
      writeTo(outputRefs.studio, 'GET /studio', await probe('/studio'));
    } catch (error) {
      writeTo(outputRefs.studio, 'GET /studio', { error: error.message });
    }
  });

  bindClick('clearStudioOutput', () => clearOutput(outputRefs.studio, 'No Studio checks yet.'));

  bindClick('studioGenerateData', async () => {
    const generated = {
      scenarioId: `studio-${randomString(6)}`,
      loginHint: { email: randomEmail(), projectRef: randomString(20), role: randomFrom(['owner', 'developer', 'viewer']) },
      linksToValidate: ['http://localhost:3001', buildRouteUrl('/studio')],
      expected: ['UI loads', 'API calls proxied via Kong'],
    };

    writeTo(outputRefs.studio, 'RANDOM STUDIO TEST DATA', generated);
    await runGeneratedRequest(outputRefs.studio, 'GET /studio', '/studio', false);
  });

  bindClick('trinoOpenUi', () => {
    openUrl('http://localhost:8080/');
    writeTo(outputRefs.trino, 'OPEN', 'Opened Trino UI on http://localhost:8080/');
  });

  bindClick('trinoShowInfo', () => {
    writeTo(outputRefs.trino, 'INFO', {
      container: 'mini-baas-trino',
      hostPort: '8080',
      expectedConfig: '/deployments/base/trino/config.properties',
      checks: ['Open http://localhost:8080', 'Run direct Trino queries from SQL clients'],
    });
  });

  bindClick('clearTrinoOutput', () => clearOutput(outputRefs.trino, 'No Trino checks yet.'));

  bindClick('trinoGenerateData', async () => {
    const schema = randomSchemaName();
    const table = randomTableName();
    const generated = {
      scenarioId: `trino-${randomString(6)}`,
      querySet: [
        `SHOW CATALOGS`,
        `SHOW SCHEMAS FROM postgresql`,
        `SELECT * FROM postgresql.${schema}.${table} LIMIT ${randomInt(1, 25)}`,
      ],
      expectedStatus: [200],
      target: 'direct-trino:8080',
    };

    writeTo(outputRefs.trino, 'RANDOM TRINO TEST DATA', generated);
    writeTo(outputRefs.trino, 'TRINO NOTE', 'Gateway probing is intentionally out of near-term scope. Use direct Trino endpoint on port 8080.');
  });

  bindClick('pgmetaProbeRoute', async () => {
    try {
      writeTo(outputRefs.pgmeta, 'GET /meta/v1/', await probe('/meta/v1/', true));
    } catch (error) {
      writeTo(outputRefs.pgmeta, 'GET /meta/v1/', { error: error.message });
    }
  });

  bindClick('pgmetaShowInfo', () => {
    writeTo(outputRefs.pgmeta, 'INFO', {
      container: 'mini-baas-pg-meta',
      internalPort: '8080',
      env: ['PG_META_DB_HOST', 'PG_META_DB_PORT', 'PG_META_DB_NAME', 'PG_META_DB_USER', 'PG_META_DB_PASSWORD'],
    });
  });

  bindClick('clearPgmetaOutput', () => clearOutput(outputRefs.pgmeta, 'No pg-meta checks yet.'));

  bindClick('pgmetaGenerateData', async () => {
    const generated = {
      scenarioId: `pgmeta-${randomString(6)}`,
      requests: [
        { method: 'GET', path: '/meta/v1/tables', query: `schema=${randomSchemaName()}` },
        { method: 'GET', path: '/meta/v1/roles' },
      ],
      expectedStatus: [200],
    };

    writeTo(outputRefs.pgmeta, 'RANDOM PG-META TEST DATA', generated);
    const firstPath = `${generated.requests[0].path}?${generated.requests[0].query}`;
    await runGeneratedRequest(outputRefs.pgmeta, `GET ${firstPath}`, firstPath, true);
  });

  bindClick('postgresProbeRest', async () => {
    try {
      writeTo(outputRefs.postgres, 'GET /rest/v1/', await probe('/rest/v1/', true));
    } catch (error) {
      writeTo(outputRefs.postgres, 'GET /rest/v1/', { error: error.message });
    }
  });

  bindClick('postgresShowInfo', () => {
    writeTo(outputRefs.postgres, 'INFO', {
      container: 'mini-baas-postgres',
      hostPort: '5432',
      requiredEnv: ['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DB'],
      dbBootstrapDependency: 'mini-baas-db-bootstrap must complete successfully',
    });
  });

  bindClick('postgresShowMvpFlow', () => {
    writeTo(outputRefs.postgres, 'POSTGRES MVP FLOW', {
      command: 'make flow-postgres-mvp',
      script: './scripts/postgres-mvp-flow.sh',
      purpose: 'Runs signup/login, CRUD on public.posts, JWT rejection check, and user isolation verification.',
      preconditions: [
        'docker compose stack is running',
        'Kong is available on http://localhost:8000',
      ],
      quickStart: ['make compose-up', 'make flow-postgres-mvp'],
    });
  });

  bindClick('clearPostgresOutput', () => clearOutput(outputRefs.postgres, 'No Postgres checks yet.'));

  bindClick('postgresGenerateData', async () => {
    const db = randomFrom(['postgres', 'app', 'analytics']);
    const user = `user_${randomString(5)}`;
    const generated = {
      scenarioId: `postgres-${randomString(6)}`,
      connection: `postgresql://${user}:<PASSWORD>@localhost:5432/${db}`,
      sqlChecks: ['select version();', 'select now();', `select count(*) from ${randomSchemaName()}.${randomTableName()};`],
      expectedStatus: ['connected', 'query_ok'],
    };

    writeTo(outputRefs.postgres, 'RANDOM POSTGRES TEST DATA', generated);
    await runGeneratedRequest(outputRefs.postgres, 'GET /rest/v1/', '/rest/v1/', true);
  });

  bindClick('dbbootstrapProbeAuth', async () => {
    try {
      writeTo(outputRefs.dbbootstrap, 'GET /auth/v1/health', await probe('/auth/v1/health', true));
    } catch (error) {
      writeTo(outputRefs.dbbootstrap, 'GET /auth/v1/health', { error: error.message });
    }
  });

  bindClick('dbbootstrapProbeRest', async () => {
    try {
      writeTo(outputRefs.dbbootstrap, 'GET /rest/v1/', await probe('/rest/v1/', true));
    } catch (error) {
      writeTo(outputRefs.dbbootstrap, 'GET /rest/v1/', { error: error.message });
    }
  });

  bindClick('dbbootstrapShowInfo', () => {
    writeTo(outputRefs.dbbootstrap, 'INFO', {
      container: 'mini-baas-db-bootstrap',
      role: 'Initialize roles, schemas, RLS policies, and seed test tables',
      expectedLifecycle: 'exited (0)',
      script: '/scripts/db-bootstrap.sql',
    });
  });

  bindClick('clearDbbootstrapOutput', () => clearOutput(outputRefs.dbbootstrap, 'No bootstrap checks yet.'));

  bindClick('dbbootstrapGenerateData', async () => {
    const generated = {
      scenarioId: `bootstrap-${randomString(6)}`,
      migrationRun: {
        migrationId: `V${randomInt(10, 99)}__${randomFrom(['seed_users', 'init_rls', 'create_storage'])}`,
        schema: randomSchemaName(),
        sampleSql: `insert into ${randomSchemaName()}.${randomTableName()} (id, name) values ('${randomUuid()}', 'seed_${randomString(5)}');`,
      },
      expectedExitCode: 0,
    };

    writeTo(outputRefs.dbbootstrap, 'RANDOM DB-BOOTSTRAP TEST DATA', generated);
    await runGeneratedRequest(outputRefs.dbbootstrap, 'GET /auth/v1/health', '/auth/v1/health', true);
  });

  bindClick('mongoOpenPort', () => {
    openUrl('http://localhost:27017/');
    writeTo(outputRefs.mongo, 'OPEN', 'Opened Mongo host port http://localhost:27017/ (non-HTTP protocol expected).');
  });

  bindClick('mongoShowInfo', () => {
    writeTo(outputRefs.mongo, 'INFO', {
      container: 'mini-baas-mongo',
      hostPort: '27017',
      healthCommand: "mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok'",
      example: 'docker exec mini-baas-mongo mongosh --quiet --eval "db.runCommand({ ping: 1 }).ok"',
    });
  });

  bindClick('clearMongoOutput', () => clearOutput(outputRefs.mongo, 'No Mongo checks yet.'));

  bindClick('mongoGenerateData', () => {
    const collection = randomFrom(['users', 'sessions', 'events', 'audit']);
    writeTo(outputRefs.mongo, 'RANDOM MONGO TEST DATA', {
      scenarioId: `mongo-${randomString(6)}`,
      database: randomFrom(['admin', 'appdb', 'logs']),
      collection,
      document: {
        _id: randomUuid(),
        kind: collection,
        created_at: new Date().toISOString(),
        metadata: { source: 'playground', trace: randomHex(12) },
      },
      expectedStatus: ['inserted', 'find_ok'],
    });

    writeTo(outputRefs.mongo, 'RANDOM MONGO TEST DATA (executed)', {
      note: 'Mongo uses the Mongo wire protocol on port 27017. Browser cannot dispatch native Mongo requests directly.',
      nextStep: 'Run generated command with mongosh in container/terminal.',
    });
  });

  bindClick('minioOpenApi', () => {
    openUrl('http://localhost:9000/');
    writeTo(outputRefs.minio, 'OPEN', 'Opened MinIO API endpoint http://localhost:9000/');
  });

  bindClick('minioOpenConsole', () => {
    openUrl('http://localhost:9001/');
    writeTo(outputRefs.minio, 'OPEN', 'Opened MinIO Console endpoint http://localhost:9001/');
  });

  bindClick('minioProbeStorageRoute', async () => {
    try {
      writeTo(outputRefs.minio, 'GET /storage/v1/', await probe('/storage/v1/', true));
    } catch (error) {
      writeTo(outputRefs.minio, 'GET /storage/v1/', { error: error.message });
    }
  });

  bindClick('clearMinioOutput', () => clearOutput(outputRefs.minio, 'No MinIO checks yet.'));

  bindClick('minioGenerateData', async () => {
    const bucket = `bucket-${randomString(6)}`;
    const objectName = `folder_${randomString(4)}/file_${randomString(5)}.json`;
    const generated = {
      scenarioId: `minio-${randomString(6)}`,
      bucket,
      object: objectName,
      contentType: randomFrom(['application/json', 'text/plain', 'image/png']),
      preSignedHint: `http://localhost:9000/${bucket}/${objectName}`,
      expectedStatus: [200, 204],
    };

    writeTo(outputRefs.minio, 'RANDOM MINIO TEST DATA', generated);
    await runGeneratedRequest(outputRefs.minio, 'GET /storage/v1/', '/storage/v1/', true);
  });

  bindClick('redisShowInfo', () => {
    writeTo(outputRefs.redis, 'INFO', {
      container: 'mini-baas-redis',
      hostPort: '6379',
      healthCommand: 'docker exec mini-baas-redis redis-cli ping',
      expected: 'PONG',
    });
  });

  bindClick('clearRedisOutput', () => clearOutput(outputRefs.redis, 'No Redis checks yet.'));

  bindClick('redisGenerateData', () => {
    writeTo(outputRefs.redis, 'RANDOM REDIS TEST DATA', {
      scenarioId: `redis-${randomString(6)}`,
      commands: [
        `SET key:${randomString(5)} value:${randomString(8)} EX ${randomInt(30, 3600)}`,
        `GET key:${randomString(5)}`,
        `HSET hash:${randomString(5)} field:${randomString(4)} value:${randomString(6)}`,
      ],
      expected: ['OK', 'bulk string or nil', 'integer reply'],
    });

    writeTo(outputRefs.redis, 'RANDOM REDIS TEST DATA (executed)', {
      note: 'Redis uses RESP over TCP on port 6379. Browser cannot dispatch native Redis commands directly.',
      nextStep: 'Run generated command with redis-cli in container/terminal.',
    });
  });

  bindClick('supavisorOpenPort', () => {
    openUrl('http://localhost:6543/');
    writeTo(outputRefs.supavisor, 'OPEN', 'Opened Supavisor host port http://localhost:6543/ (non-HTTP protocol expected).');
  });

  bindClick('supavisorShowInfo', () => {
    writeTo(outputRefs.supavisor, 'INFO', {
      container: 'mini-baas-supavisor',
      hostPort: '6543',
      protocol: 'PostgreSQL wire protocol',
      testCommand: 'psql "postgres://postgres:<password>@localhost:6543/postgres" -c "select 1"',
    });
  });

  bindClick('clearSupavisorOutput', () => clearOutput(outputRefs.supavisor, 'No Supavisor checks yet.'));

  bindClick('supavisorGenerateData', () => {
    const db = randomFrom(['postgres', 'app', 'tenant']);
    const user = `pool_${randomString(5)}`;
    writeTo(outputRefs.supavisor, 'RANDOM SUPAVISOR TEST DATA', {
      scenarioId: `supavisor-${randomString(6)}`,
      pooledDsn: `postgresql://${user}:<PASSWORD>@localhost:6543/${db}`,
      poolSettings: {
        poolMode: randomFrom(['transaction', 'session']),
        maxClients: randomInt(5, 100),
        idleTimeoutSec: randomInt(10, 120),
      },
      expectedStatus: ['connected', 'pooled_query_ok'],
    });

    writeTo(outputRefs.supavisor, 'RANDOM SUPAVISOR TEST DATA (executed)', {
      note: 'Supavisor speaks PostgreSQL wire protocol on port 6543. Browser cannot open native Postgres sessions.',
      nextStep: 'Run generated DSN with psql in terminal.',
    });
  });
}

function setupDualPlanesView() {
  let dualUserToken = null;
  let dualUserId = null;

  const appendDualPlanesLog = (section, label, data) => {
    const output = outputRefs.dualPlanesMain;
    const timestamp = new Date().toLocaleTimeString();
    const message = `[${timestamp}] ${section}: ${label}\n${JSON.stringify(data, null, 2)}\n`;
    output.textContent = message + output.textContent;
  };

  bindClick('pgCreateOrder', async () => {
    if (!dualUserToken) {
      writeTo(outputRefs.pgDual, 'INFO', 'Run full demo first to authenticate.');
      return;
    }
    const orderNum = `ORD-${Date.now()}`;
    const body = JSON.stringify({
      order_number: orderNum,
      currency: 'USD',
      total_cents: randomInt(1000, 50000),
      status: randomFrom(['pending', 'paid']),
      owner_id: dualUserId,
    });
    try {
      const result = await probe('/rest/v1/mock_orders', true, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dualUserToken}` },
        body,
      });
      writeTo(outputRefs.pgDual, 'Order Created', result);
      appendDualPlanesLog('PostgreSQL', 'Created order ' + orderNum, result);
    } catch (e) {
      writeTo(outputRefs.pgDual, 'Error', { error: e.message });
    }
  });

  bindClick('pgListOrders', async () => {
    if (!dualUserToken) {
      writeTo(outputRefs.pgDual, 'INFO', 'Run full demo first to authenticate.');
      return;
    }
    try {
      const result = await probe('/rest/v1/mock_orders?select=id,order_number,total_cents,status,created_at', true, {
        headers: { Authorization: `Bearer ${dualUserToken}` },
      });
      writeTo(outputRefs.pgDual, 'My Orders', result);
      appendDualPlanesLog('PostgreSQL', 'Listed orders', result);
    } catch (e) {
      writeTo(outputRefs.pgDual, 'Error', { error: e.message });
    }
  });

  bindClick('pgFetchOrderSchema', () => {
    writeTo(outputRefs.pgDual, 'PostgreSQL mock_orders Schema', {
      table: 'public.mock_orders',
      engine: 'PostgreSQL 16',
      constraints: ['id UUID PRIMARY KEY', 'order_number UNIQUE', 'status ENUM CHECK', 'total_cents >= 0'],
      rls: 'ENABLED - Strict owner-based row-level security',
      fields: [
        { name: 'id', type: 'UUID', constraint: 'PRIMARY KEY' },
        { name: 'owner_id', type: 'TEXT', constraint: 'RLS enforced' },
        { name: 'order_number', type: 'TEXT', constraint: 'UNIQUE' },
        { name: 'currency', type: 'TEXT', default: 'USD' },
        { name: 'total_cents', type: 'INTEGER', constraint: 'CHECK >= 0' },
        { name: 'status', type: 'TEXT', constraint: "ENUM: 'pending', 'paid', 'cancelled'" },
        { name: 'created_at', type: 'TIMESTAMP WITH TIME ZONE', default: 'now()' },
        { name: 'updated_at', type: 'TIMESTAMP WITH TIME ZONE', default: 'now()' },
      ],
    });
  });

  bindClick('mongoCreateItem', async () => {
    if (!dualUserToken) {
      writeTo(outputRefs.mongo, 'INFO', 'Run full demo first to authenticate.');
      return;
    }
    const sku = `SKU-${randomInt(1000, 9999)}`;
    const body = JSON.stringify({
      document: {
        sku,
        name: randomFrom(['Widget Pro', 'Gadget Plus', 'Tool Master', 'Device Elite']),
        category: randomFrom(['Electronics', 'Tools', 'Accessories']),
        price_cents: randomInt(500, 100000),
        tags: [randomFrom(['new', 'popular', 'limited']), randomFrom(['sale', 'featured'])],
        in_stock: true,
      },
    });
    try {
      const result = await probe('/mongo/v1/collections/mock_catalog/documents', true, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dualUserToken}` },
        body,
      });
      writeTo(outputRefs.mongo, 'Item Created', result);
      appendDualPlanesLog('MongoDB', 'Created item ' + sku, result);
    } catch (e) {
      writeTo(outputRefs.mongo, 'Error', { error: e.message });
    }
  });

  bindClick('mongoListItems', async () => {
    if (!dualUserToken) {
      writeTo(outputRefs.mongo, 'INFO', 'Run full demo first to authenticate.');
      return;
    }
    try {
      const result = await probe('/mongo/v1/collections/mock_catalog/documents?limit=10', true, {
        headers: { Authorization: `Bearer ${dualUserToken}` },
      });
      writeTo(outputRefs.mongo, 'My Catalog Items', result);
      appendDualPlanesLog('MongoDB', 'Listed catalog items', result);
    } catch (e) {
      writeTo(outputRefs.mongo, 'Error', { error: e.message });
    }
  });

  bindClick('mongoFetchSchema', () => {
    writeTo(outputRefs.mongo, 'MongoDB mock_catalog Schema', {
      collection: 'mock_catalog',
      engine: 'MongoDB 7',
      validation: 'JSON Schema Validator enforced',
      rls: 'ENABLED - owner_id filtering on all queries',
      required_fields: ['owner_id', 'sku', 'name', 'price_cents', 'category', 'created_at', 'updated_at'],
      optional_fields: ['tags (array)', 'in_stock (boolean)'],
      schema: {
        owner_id: 'string (minLength: 1)',
        sku: 'string (2-64 chars)',
        name: 'string (2-120 chars)',
        category: 'string',
        price_cents: 'int (minimum: 0)',
        tags: 'array of strings',
        in_stock: 'boolean',
        created_at: 'date',
        updated_at: 'date',
      },
      indexes: ['owner_id + created_at'],
    });
  });

  bindClick('dualPlanesDemo', async () => {
    outputRefs.dualPlanesMain.textContent = '';
    writeTo(outputRefs.dualPlanesMain, 'DEMO START', 'Running full dual-planes demo...\n');

    // Step 1: Signup and login
    appendDualPlanesLog('System', 'Step 1: Authenticate user', { step: 'Signing up new user' });
    const email = randomEmail();
    const password = randomPassword();
    try {
      const signupResult = await probe('/auth/v1/signup', true, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      
      if (!signupResult.ok) {
        appendDualPlanesLog('Auth', 'Signup failed', { status: signupResult.status, error: signupResult.body });
        return;
      }
      
      const signupData = typeof signupResult.body === 'string' ? JSON.parse(signupResult.body) : signupResult.body;
      dualUserId = signupData.user?.id || signupData.user?.sub;
      
      const loginResult = await probe('/auth/v1/token?grant_type=password', true, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      
      if (!loginResult.ok) {
        appendDualPlanesLog('Auth', 'Login failed', { status: loginResult.status, error: loginResult.body });
        return;
      }
      
      const loginData = typeof loginResult.body === 'string' ? JSON.parse(loginResult.body) : loginResult.body;
      dualUserToken = loginData.access_token;
      appendDualPlanesLog('Auth', 'User authenticated', { email, userId: dualUserId, tokenLength: dualUserToken?.length });
    } catch (e) {
      appendDualPlanesLog('Auth', 'Signup/Login failed', { error: e.message });
      return;
    }

    // Step 2: Create PostgreSQL order
    appendDualPlanesLog('System', 'Step 2: Create PostgreSQL relational data', { step: 'Insert into mock_orders table' });
    const pgOrderNum = `ORD-${Date.now()}`;
    try {
      const pgResult = await probe('/rest/v1/mock_orders', true, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dualUserToken}` },
        body: JSON.stringify({
          order_number: pgOrderNum,
          currency: 'USD',
          total_cents: 24999,
          status: 'pending',
          owner_id: dualUserId,
        }),
      });
      const pgData = typeof pgResult.body === 'string' ? JSON.parse(pgResult.body) : pgResult.body;
      appendDualPlanesLog('PostgreSQL', 'Relational insert successful', pgData[0] || pgData);
      writeTo(outputRefs.pgDual, 'Demo Order Created', pgData[0] || pgData);
    } catch (e) {
      appendDualPlanesLog('PostgreSQL', 'Insert failed', { error: e.message });
    }

    // Step 3: Create MongoDB document
    appendDualPlanesLog('System', 'Step 3: Create MongoDB document data', { step: 'Insert into mock_catalog collection' });
    try {
      const mongoResult = await probe('/mongo/v1/collections/mock_catalog/documents', true, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${dualUserToken}` },
        body: JSON.stringify({
          document: {
            sku: 'DEMO-SKU-001',
            name: 'Demo Product - Premium Edition',
            category: 'Electronics',
            price_cents: 34999,
            tags: ['new', 'featured'],
            in_stock: true,
          },
        }),
      });
      const mongoData = typeof mongoResult.body === 'string' ? JSON.parse(mongoResult.body) : mongoResult.body;
      appendDualPlanesLog('MongoDB', 'Document insert successful', mongoData.data || mongoData);
      writeTo(outputRefs.mongo, 'Demo Catalog Item Created', mongoData.data || mongoData);
    } catch (e) {
      appendDualPlanesLog('MongoDB', 'Insert failed', { error: e.message });
    }

    // Step 4: Query both
    appendDualPlanesLog('System', 'Step 4: Query both data planes', { step: 'Fetch all user data from both schemas' });
    try {
      const pgList = await probe('/rest/v1/mock_orders?select=id,order_number,total_cents,status', true, {
        headers: { Authorization: `Bearer ${dualUserToken}` },
      });
      const mongoList = await probe('/mongo/v1/collections/mock_catalog/documents?limit=5', true, {
        headers: { Authorization: `Bearer ${dualUserToken}` },
      });
      const pgData = typeof pgList.body === 'string' ? JSON.parse(pgList.body) : pgList.body;
      const mongoData = typeof mongoList.body === 'string' ? JSON.parse(mongoList.body) : mongoList.body;
      appendDualPlanesLog('PostgreSQL', 'Queried all orders', { count: Array.isArray(pgData) ? pgData.length : 0 });
      appendDualPlanesLog('MongoDB', 'Queried all items', mongoData.meta || { message: 'Query successful' });
      appendDualPlanesLog('System', 'DEMO COMPLETE', { status: 'Both data planes operational', message: 'Check schema views for structure details' });
    } catch (e) {
      appendDualPlanesLog('System', 'Query failed', { error: e.message });
    }
  });

  bindClick('clearDualPlanesOutput', () => {
    outputRefs.pgDual.textContent = 'Ready to create orders...';
    outputRefs.mongo.textContent = 'Ready to create catalog items...';
    outputRefs.dualPlanesMain.textContent = 'Select demo operations above...';
  });
}

function setupTestsView() {
  bindClick('clearTestsOutput', () => clearOutput(outputRefs.tests, 'No tests run yet. Click a button above to start.'));

  bindClick('runTestPhase15', async () => {
    writeTo(outputRefs.tests, 'PHASE 15: MongoDB MVP Integration Tests', {
      description: 'Comprehensive test of MongoDB HTTP API through Kong gateway with user isolation and validation.',
      testCases: 19,
      coverage: ['Auth flows', 'CRUD operations', 'Multi-tenant isolation', 'Error handling', 'Validation'],
      duration: '30-60 seconds',
      command: 'make test-phase15',
      howToRun: [
        '1. Open terminal',
        '2. cd /home/daniel/projects/mini-baas-infra',
        '3. make test-phase15',
      ],
      whyInPlayground: 'Tests use subprocess/shell execution. Run from terminal for full output.',
    });
  });

  bindClick('runTestPhase14', async () => {
    writeTo(outputRefs.tests, 'PHASE 14: Mongo API via Kong Gateway', {
      description: 'Integration test validating MongoDB service endpoints through Kong routing.',
      testCases: 8,
      coverage: ['Gateway key-auth', 'User isolation', 'CRUD validation'],
      duration: '20-30 seconds',
      command: 'make test-phase14',
      howToRun: [
        '1. Open terminal',
        '2. cd /home/daniel/projects/mini-baas-infra',
        '3. make test-phase14',
      ],
    });
  });

  bindClick('runTestPhase3', async () => {
    writeTo(outputRefs.tests, 'PHASE 3: Authenticated Database Access', {
      description: 'Tests signup, login, JWT token generation, and REST API authenticated access.',
      testCases: 12,
      coverage: ['Auth flows', 'JWT validation', 'REST access control'],
      duration: '10-15 seconds',
      command: 'make test-phase3',
      howToRun: [
        '1. Open terminal',
        '2. cd /home/daniel/projects/mini-baas-infra',
        '3. make test-phase3',
      ],
    });
  });

  bindClick('runAllTests', async () => {
    writeTo(outputRefs.tests, 'ALL TESTS: Complete Test Suite (15 Phases)', {
      description: 'Full integration test suite covering all services and features.',
      totalTests: 184,
      totalPhases: 15,
      coverage: [
        'Phase 1: Smoke tests',
        'Phase 2: Gateway security',
        'Phase 3: Auth + Database',
        'Phases 4-7: Data isolation, REST metadata, HTTP methods, errors',
        'Phases 8-13: Token lifecycle, Storage, WebSocket, Rate limiting, CORS',
        'Phases 14-15: MongoDB CRUD and isolationintegration',
      ],
      duration: '5-10 minutes (total)',
      command: 'make tests',
      howToRun: [
        '1. Open terminal ',
        '2. cd /home/daniel/projects/mini-baas-infra',
        '3. make tests',
        '',
        'Watch for the test summary at the end showing passed/failed counts.',
      ],
      requires: [
        '✓ Docker compose stack running (make compose-up)',
        '✓ All 11 services healthy',
        '✓ Gateway available on http://localhost:8000',
      ],
      note: 'Tests have rate-line delays to prevent GoTrue rate limits. Run from terminal for best experience.',
    });
  });
}

function setupListeners() {
  setupBaseListeners();
  setupAuthView();
  setupRestView();
  setupRealtimeView();
  setupContainerViews();
  setupDualPlanesView();
  setupTestsView();
}

try {
  setupListeners();
} catch (error) {
  console.error('Playground initialization failed:', error);
  writeTo(outputRefs.auth || document.body, 'INIT ERROR', { error: error.message });
}
