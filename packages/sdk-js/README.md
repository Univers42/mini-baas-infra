# @mini-baas/js

Minimal JavaScript SDK for consuming mini-BaaS through the public gateway.

## Usage

```ts
import { createClient } from "@mini-baas/js";

const baas = createClient({
  url: "https://api.example.com",
  anonKey: "public-anon-key",
});

const session = await baas.auth.signInWithPassword({
  email: "user@example.com",
  password: "secret",
});

baas.setSession(session.access_token);

const result = await baas.query.execute({
  database_id: "default",
  action: "find",
  resource: "documents",
  payload: { filter: {} },
});
```

This SDK intentionally talks only to gateway routes. It never connects directly to internal services or databases.
