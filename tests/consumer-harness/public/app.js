const output = document.querySelector('[data-test="harness-output"]');

function csrfToken() {
  const entry = document.cookie
    .split('; ')
    .find((candidate) => candidate.startsWith('aisenhub-harness-csrf='));
  return entry ? decodeURIComponent(entry.split('=').slice(1).join('=')) : '';
}

async function request(path, init = {}) {
  const method = init.method ?? 'GET';
  const headers = new Headers(init.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()))
    headers.set('X-CSRF-Token', csrfToken());
  const response = await fetch(path, {
    ...init,
    method,
    headers,
    cache: 'no-store',
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  output.textContent = JSON.stringify(
    { status: response.status, payload },
    null,
    2,
  );
  return response;
}

document
  .querySelector('[data-test="harness-login-form"]')
  .addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: data.get('email'),
        password: data.get('password'),
      }),
    });
  });

const actions = {
  plans: () => request('/api/v1/plans'),
  principal: () => request('/api/v1/account/principal'),
  subscription: () => request('/api/v1/subscription'),
  refresh: () => request('/api/auth/refresh', { method: 'POST' }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
};

for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('click', () => actions[button.dataset.action]?.());
}
