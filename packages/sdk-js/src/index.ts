export interface MiniBaasClientOptions {
  url: string;
  anonKey: string;
  fetch?: typeof fetch;
  accessToken?: string;
}

export interface SignInWithPasswordInput {
  email: string;
  password: string;
}

export interface QueryInput {
  database_id: string;
  action: string;
  resource: string;
  payload?: Record<string, unknown>;
}

export interface PresignInput {
  bucket: string;
  key: string;
  method?: 'GET' | 'PUT';
  contentType?: string;
}

export class MiniBaasError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'MiniBaasError';
  }
}

export class MiniBaasClient {
  private readonly baseUrl: string;
  private readonly anonKey: string;
  private readonly fetchImpl: typeof fetch;
  private accessToken?: string;

  constructor(options: MiniBaasClientOptions) {
    this.baseUrl = options.url.replace(/\/+$/, '');
    this.anonKey = options.anonKey;
    this.fetchImpl = options.fetch ?? fetch;
    this.accessToken = options.accessToken;
  }

  setSession(accessToken: string): void {
    this.accessToken = accessToken;
  }

  clearSession(): void {
    this.accessToken = undefined;
  }

  readonly auth = {
    signInWithPassword: (input: SignInWithPasswordInput) =>
      this.request('/auth/v1/token?grant_type=password', {
        method: 'POST',
        body: input,
      }),
    signOut: () => this.request('/auth/v1/logout', { method: 'POST' }),
    user: () => this.request('/auth/v1/user'),
  };

  readonly query = {
    execute: (input: QueryInput) =>
      this.request('/query/v1/execute', {
        method: 'POST',
        body: input,
      }),
  };

  readonly storage = {
    presign: (input: PresignInput) => {
      const path = `/storage/v1/sign/${encodeURIComponent(input.bucket)}/${input.key}`;
      return this.request(path, {
        method: 'POST',
        body: {
          method: input.method ?? 'PUT',
          contentType: input.contentType,
        },
      });
    },
  };

  readonly analytics = {
    track: (eventType: string, data: Record<string, unknown> = {}) =>
      this.request('/analytics/v1/events', {
        method: 'POST',
        body: { eventType, data },
      }),
  };

  realtimeUrl(path = '/realtime/v1/ws'): string {
    const url = new URL(path, this.baseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('apikey', this.anonKey);
    if (this.accessToken) url.searchParams.set('access_token', this.accessToken);
    return url.toString();
  }

  private async request<T = unknown>(
    path: string,
    init: { method?: string; body?: unknown; headers?: HeadersInit } = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('apikey', this.anonKey);
    headers.set('Authorization', `Bearer ${this.accessToken ?? this.anonKey}`);
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    const text = await response.text();
    const body = text ? safeJsonParse(text) : undefined;

    if (!response.ok) {
      throw new MiniBaasError(
        extractErrorMessage(body) ?? response.statusText,
        response.status,
        body,
      );
    }

    return body as T;
  }
}

export function createClient(options: MiniBaasClientOptions): MiniBaasClient {
  return new MiniBaasClient(options);
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const value = (body as { message?: unknown; error?: unknown }).message ??
    (body as { error?: unknown }).error;
  return typeof value === 'string' ? value : undefined;
}
