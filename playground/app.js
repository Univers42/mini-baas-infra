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

function getGateway() {
  return gatewayInput.value.replace(/\/$/, '');
}

function writeOutput(label, payload) {
  const stamp = new Date().toISOString();
  const next = `[${stamp}] ${label}\n${JSON.stringify(payload, null, 2)}\n\n`;
  output.textContent = `${next}${output.textContent}`.trim();
}

function setStatus(el, ok, text) {
  el.classList.remove('status--idle', 'status--ok', 'status--error');
  el.classList.add(ok ? 'status--ok' : 'status--error');
  el.textContent = text;
}

async function probe(path, needsApiKey = false) {
  const headers = { Accept: 'application/json' };

  if (needsApiKey && apiKeyInput.value.trim()) {
    headers.apikey = apiKeyInput.value.trim();
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
    const result = await probe('/auth/health');
    setStatus(authHealthStatus, result.ok, `${result.status} ${result.ok ? 'healthy' : 'error'}`);
    writeOutput('GET /auth/health', result);
  } catch (error) {
    setStatus(authHealthStatus, false, 'request failed');
    writeOutput('GET /auth/health', { error: error.message });
  }
});

checkSqlInfoBtn.addEventListener('click', async () => {
  try {
    sqlInfoStatus.textContent = 'Checking...';
    const result = await probe('/sql/v1/info');
    setStatus(sqlInfoStatus, result.ok, `${result.status} ${result.ok ? 'ok' : 'error'}`);
    writeOutput('GET /sql/v1/info', result);
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
