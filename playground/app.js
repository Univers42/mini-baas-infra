const gatewayInput = document.getElementById('gatewayUrl');
const apiKeyInput = document.getElementById('publicApiKey');
const output = document.getElementById('responseOutput');

const authHealthStatus = document.getElementById('authHealthStatus');
const sqlInfoStatus = document.getElementById('sqlInfoStatus');
const restStatus = document.getElementById('restStatus');

const checkAuthHealthBtn = document.getElementById('checkAuthHealth');
const checkSqlInfoBtn = document.getElementById('checkSqlInfo');
const checkRestBtn = document.getElementById('checkRest');
const clearConsoleBtn = document.getElementById('clearConsole');
const signupForm = document.getElementById('signupForm');
const routeButtons = document.querySelectorAll('.route-btn');

function getGateway() {
  const raw = gatewayInput.value.trim();
  if (!raw) {
    return '/api';
  }

  return raw.replace(/\/$/, '');
}

function writeOutput(label, payload) {
  const stamp = new Date().toISOString();
  const next = `[${stamp}] ${label}\n${JSON.stringify(payload, null, 2)}\n\n`;
  output.textContent = `${next}${output.textContent}`.trim();
}

function buildRouteUrl(path, needsKey = false) {
  const gateway = getGateway();
  const apiKey = apiKeyInput.value.trim();
  const url = new URL(`${gateway}${path}`, window.location.origin);

  if (needsKey && apiKey) {
    url.searchParams.set('apikey', apiKey);
  }

  return url.toString();
}

function setStatus(el, ok, text) {
  el.classList.remove('status--idle', 'status--ok', 'status--error');
  el.classList.add(ok ? 'status--ok' : 'status--error');
  el.textContent = text;
}

function isNoRouteMatch(result) {
  return result?.status === 404 && typeof result?.body?.message === 'string' && result.body.message.includes('no Route matched');
}

async function probe(path, needsApiKey = false) {
  const headers = { Accept: 'application/json' };
  const apiKey = apiKeyInput.value.trim();

  if (needsApiKey && apiKey) {
    headers.apikey = apiKey;
  }

  const url = `${getGateway()}${path}`;
  const response = await fetch(url, { headers });

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
    url,
    body,
  };
}

checkAuthHealthBtn.addEventListener('click', async () => {
  try {
    authHealthStatus.textContent = 'Checking...';

    let result = await probe('/auth/health');
    let routeLabel = 'GET /auth/health';

    if (isNoRouteMatch(result)) {
      result = await probe('/auth/v1/health', true);
      routeLabel = 'GET /auth/v1/health (fallback)';
    }

    setStatus(authHealthStatus, result.ok, `${result.status} ${result.ok ? 'healthy' : 'error'}`);
    writeOutput(routeLabel, result);
  } catch (error) {
    setStatus(authHealthStatus, false, 'request failed');
    writeOutput('GET /auth/health', { error: error.message });
  }
});

checkSqlInfoBtn.addEventListener('click', async () => {
  try {
    sqlInfoStatus.textContent = 'Checking...';

    let result = await probe('/sql/v1/info');
    let routeLabel = 'GET /sql/v1/info';

    if (isNoRouteMatch(result)) {
      result = await probe('/rest/v1/', true);
      routeLabel = 'GET /rest/v1/ (fallback: schema info)';
    }

    setStatus(sqlInfoStatus, result.ok, `${result.status} ${result.ok ? 'ok' : 'error'}`);
    writeOutput(routeLabel, result);
  } catch (error) {
    setStatus(sqlInfoStatus, false, 'request failed');
    writeOutput('GET /sql/v1/info', { error: error.message });
  }
});

checkRestBtn.addEventListener('click', async () => {
  try {
    restStatus.textContent = 'Checking...';
    const result = await probe('/rest/v1/', true);
    setStatus(restStatus, result.ok, `${result.status} ${result.ok ? 'ok' : 'error'}`);
    writeOutput('GET /rest/v1/', result);
  } catch (error) {
    setStatus(restStatus, false, 'request failed');
    writeOutput('GET /rest/v1/', { error: error.message });
  }
});

signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;

  if (!email || !password) {
    writeOutput('POST /auth/v1/signup', { error: 'email and password are required' });
    return;
  }

  try {
    const response = await fetch(`${getGateway()}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKeyInput.value.trim(),
      },
      body: JSON.stringify({ email, password }),
    });

    const body = await response.json().catch(() => ({}));
    writeOutput('POST /auth/v1/signup', {
      ok: response.ok,
      status: response.status,
      body,
    });
  } catch (error) {
    writeOutput('POST /auth/v1/signup', { error: error.message });
  }
});

clearConsoleBtn.addEventListener('click', () => {
  output.textContent = 'No requests yet.';
});

routeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const path = button.dataset.route;
    const needsKey = button.dataset.needsKey === 'true';

    if (!path) {
      return;
    }

    const url = buildRouteUrl(path, needsKey);
    window.open(url, '_blank', 'noopener,noreferrer');
  });
});
