const express = require("express");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();

const PORT = Number(process.env.PORT || 3010);
const MONGO_URI = process.env.MONGO_URI || "mongodb://mongo:27017";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "mini_baas";
const JWT_SECRET = process.env.JWT_SECRET || "";

const COLLECTION_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

app.use(express.json({ limit: "256kb" }));

let db;

const ok = (res, status, data, meta) => {
  const payload = { success: true, data };
  if (meta) payload.meta = meta;
  return res.status(status).json(payload);
};

const fail = (res, status, code, message, details) => {
  const payload = {
    success: false,
    error: { code, message },
  };
  if (details) payload.error.details = details;
  return res.status(status).json(payload);
};

const parseBearerToken = (req) => {
  const value = req.headers.authorization || "";
  if (!value.startsWith("Bearer ")) {
    return null;
  }
  return value.slice(7).trim();
};

const requireUser = (req, res, next) => {
  if (!JWT_SECRET) {
    return fail(res, 500, "server_config_error", "JWT secret is not configured");
  }

  const token = parseBearerToken(req);
  if (!token) {
    return fail(res, 401, "missing_authorization", "Authorization bearer token is required");
  }

  try {
    const claims = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (!claims || typeof claims.sub !== "string" || claims.sub.length === 0) {
      return fail(res, 401, "invalid_token", "JWT token does not include a valid subject");
    }
    req.user = {
      id: claims.sub,
      email: claims.email || null,
      role: claims.role || null,
    };
    return next();
  } catch (error) {
    return fail(res, 401, "invalid_token", "JWT token is invalid");
  }
};

const parseCollectionName = (req, res) => {
  const { name } = req.params;
  if (!COLLECTION_NAME_PATTERN.test(name)) {
    fail(res, 400, "invalid_collection", "Collection name must match ^[a-zA-Z0-9_-]{1,64}$");
    return null;
  }
  return name;
};

const parseObjectId = (value) => {
  if (!ObjectId.isValid(value)) {
    return null;
  }
  return new ObjectId(value);
};

const parsePagination = (req) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
  const offset = Math.max(Number(req.query.offset || 0), 0);
  return { limit, offset };
};

const parseSort = (rawSort) => {
  if (!rawSort || typeof rawSort !== "string") {
    return { created_at: -1 };
  }

  const [field, direction] = rawSort.split(":");
  if (!field || !/^[a-zA-Z0-9_]{1,64}$/.test(field)) {
    return { created_at: -1 };
  }

  return {
    [field]: String(direction || "asc").toLowerCase() === "desc" ? -1 : 1,
  };
};

const parseFilter = (rawFilter) => {
  if (!rawFilter) return {};
  if (typeof rawFilter !== "string") return {};

  const parsed = JSON.parse(rawFilter);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("filter must be a JSON object");
  }

  const safeFilter = { ...parsed };
  delete safeFilter.owner_id;
  delete safeFilter._id;
  return safeFilter;
};

app.get("/health", async (req, res) => {
  try {
    await db.command({ ping: 1 });
    return ok(res, 200, { mongo: "ok" });
  } catch (error) {
    return fail(res, 503, "mongo_unavailable", "MongoDB is unavailable");
  }
});

app.post("/collections/:name/documents", requireUser, async (req, res) => {
  const collectionName = parseCollectionName(req, res);
  if (!collectionName) return;

  const input = req.body && req.body.document;
  if (!input || Array.isArray(input) || typeof input !== "object") {
    return fail(res, 400, "invalid_payload", "Body must include a document object");
  }

  const document = { ...input };
  if (Object.prototype.hasOwnProperty.call(document, "_id") || Object.prototype.hasOwnProperty.call(document, "owner_id")) {
    return fail(res, 400, "forbidden_fields", "document must not include _id or owner_id");
  }

  const now = new Date();
  document.owner_id = req.user.id;
  document.created_at = now;
  document.updated_at = now;

  const result = await db.collection(collectionName).insertOne(document);
  return ok(res, 201, { id: String(result.insertedId), ...document });
});

app.get("/collections/:name/documents", requireUser, async (req, res) => {
  const collectionName = parseCollectionName(req, res);
  if (!collectionName) return;

  try {
    const { limit, offset } = parsePagination(req);
    const sort = parseSort(req.query.sort);
    const extraFilter = parseFilter(req.query.filter);

    const query = {
      owner_id: req.user.id,
      ...extraFilter,
    };

    const collection = db.collection(collectionName);
    const [items, total] = await Promise.all([
      collection.find(query).sort(sort).skip(offset).limit(limit).toArray(),
      collection.countDocuments(query),
    ]);

    const normalized = items.map((item) => ({
      ...item,
      id: String(item._id),
      _id: undefined,
    }));

    return ok(res, 200, normalized, { total, limit, offset });
  } catch (error) {
    return fail(res, 400, "invalid_filter", "Invalid filter query parameter", error.message);
  }
});

app.get("/collections/:name/documents/:id", requireUser, async (req, res) => {
  const collectionName = parseCollectionName(req, res);
  if (!collectionName) return;

  const objectId = parseObjectId(req.params.id);
  if (!objectId) {
    return fail(res, 400, "invalid_id", "Document id is not a valid ObjectId");
  }

  const item = await db.collection(collectionName).findOne({ _id: objectId, owner_id: req.user.id });
  if (!item) {
    return fail(res, 404, "not_found", "Document not found");
  }

  return ok(res, 200, { ...item, id: String(item._id), _id: undefined });
});

app.patch("/collections/:name/documents/:id", requireUser, async (req, res) => {
  const collectionName = parseCollectionName(req, res);
  if (!collectionName) return;

  const objectId = parseObjectId(req.params.id);
  if (!objectId) {
    return fail(res, 400, "invalid_id", "Document id is not a valid ObjectId");
  }

  const patch = req.body && req.body.patch;
  if (!patch || Array.isArray(patch) || typeof patch !== "object") {
    return fail(res, 400, "invalid_payload", "Body must include a patch object");
  }

  if (Object.prototype.hasOwnProperty.call(patch, "_id") || Object.prototype.hasOwnProperty.call(patch, "owner_id")) {
    return fail(res, 400, "forbidden_fields", "patch must not include _id or owner_id");
  }

  const update = {
    ...patch,
    updated_at: new Date(),
  };

  const result = await db.collection(collectionName).findOneAndUpdate(
    { _id: objectId, owner_id: req.user.id },
    { $set: update },
    { returnDocument: "after", includeResultMetadata: false }
  );

  if (!result) {
    return fail(res, 404, "not_found", "Document not found");
  }

  return ok(res, 200, { ...result, id: String(result._id), _id: undefined });
});

app.delete("/collections/:name/documents/:id", requireUser, async (req, res) => {
  const collectionName = parseCollectionName(req, res);
  if (!collectionName) return;

  const objectId = parseObjectId(req.params.id);
  if (!objectId) {
    return fail(res, 400, "invalid_id", "Document id is not a valid ObjectId");
  }

  const result = await db.collection(collectionName).deleteOne({ _id: objectId, owner_id: req.user.id });
  if (result.deletedCount !== 1) {
    return fail(res, 404, "not_found", "Document not found");
  }

  return ok(res, 200, { deleted: true });
});

app.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") {
    return fail(res, 413, "payload_too_large", "Payload exceeds 256KB limit");
  }
  if (err && err instanceof SyntaxError && "body" in err) {
    return fail(res, 400, "invalid_json", "Malformed JSON payload");
  }
  console.error(err);
  return fail(res, 500, "internal_error", "Unexpected server error");
});

const start = async () => {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  db = client.db(MONGO_DB_NAME);

  app.listen(PORT, () => {
    console.log(`mongo-api listening on ${PORT}`);
  });
};

start().catch((error) => {
  console.error("Failed to start mongo-api", error);
  process.exit(1);
});
