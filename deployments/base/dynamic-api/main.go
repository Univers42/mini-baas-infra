package main

import (
    "context"
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "os"
    "strconv"
    "strings"
    "time"

    "github.com/jackc/pgx/v5/pgxpool"
    "go.mongodb.org/mongo-driver/bson"
    "go.mongodb.org/mongo-driver/bson/primitive"
    "go.mongodb.org/mongo-driver/mongo"
    "go.mongodb.org/mongo-driver/mongo/options"
)

type storage interface {
    Engine() string
    Ping(ctx context.Context) error
    EnsureSchema(ctx context.Context) error
    InsertRecord(ctx context.Context, payload map[string]any) (map[string]any, error)
    ListRecords(ctx context.Context, limit int) ([]map[string]any, error)
    Close(ctx context.Context) error
}

type postgresStorage struct {
    pool *pgxpool.Pool
}

func newPostgresStorage(ctx context.Context) (*postgresStorage, error) {
    dsn := os.Getenv("DB_DSN")
    if strings.TrimSpace(dsn) == "" {
        dsn = "postgres://postgres:postgres@postgres:5432/postgres"
    }

    cfg, err := pgxpool.ParseConfig(dsn)
    if err != nil {
        return nil, fmt.Errorf("parse postgres DSN: %w", err)
    }

    pool, err := pgxpool.NewWithConfig(ctx, cfg)
    if err != nil {
        return nil, fmt.Errorf("connect postgres: %w", err)
    }

    return &postgresStorage{pool: pool}, nil
}

func (p *postgresStorage) Engine() string {
    return "postgres"
}

func (p *postgresStorage) Ping(ctx context.Context) error {
    return p.pool.Ping(ctx)
}

func (p *postgresStorage) EnsureSchema(ctx context.Context) error {
    _, err := p.pool.Exec(ctx, `
CREATE TABLE IF NOT EXISTS dynamic_records (
    id BIGSERIAL PRIMARY KEY,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
`)
    return err
}

func (p *postgresStorage) InsertRecord(ctx context.Context, payload map[string]any) (map[string]any, error) {
    if err := p.EnsureSchema(ctx); err != nil {
        return nil, err
    }

    raw, err := json.Marshal(payload)
    if err != nil {
        return nil, err
    }

    var id int64
    var createdAt time.Time
    err = p.pool.QueryRow(ctx,
        `INSERT INTO dynamic_records (payload) VALUES ($1::jsonb) RETURNING id, created_at`,
        raw,
    ).Scan(&id, &createdAt)
    if err != nil {
        return nil, err
    }

    return map[string]any{
        "id":        id,
        "payload":   payload,
        "createdAt": createdAt.UTC().Format(time.RFC3339Nano),
    }, nil
}

func (p *postgresStorage) ListRecords(ctx context.Context, limit int) ([]map[string]any, error) {
    if err := p.EnsureSchema(ctx); err != nil {
        return nil, err
    }

    rows, err := p.pool.Query(ctx,
        `SELECT id, payload, created_at FROM dynamic_records ORDER BY created_at DESC LIMIT $1`,
        limit,
    )
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    result := make([]map[string]any, 0, limit)
    for rows.Next() {
        var (
            id        int64
            raw       []byte
            createdAt time.Time
            payload   map[string]any
        )

        if err := rows.Scan(&id, &raw, &createdAt); err != nil {
            return nil, err
        }

        if err := json.Unmarshal(raw, &payload); err != nil {
            return nil, err
        }

        result = append(result, map[string]any{
            "id":        id,
            "payload":   payload,
            "createdAt": createdAt.UTC().Format(time.RFC3339Nano),
        })
    }

    if err := rows.Err(); err != nil {
        return nil, err
    }

    return result, nil
}

func (p *postgresStorage) Close(context.Context) error {
    p.pool.Close()
    return nil
}

type mongoStorage struct {
    client     *mongo.Client
    collection *mongo.Collection
}

func newMongoStorage(ctx context.Context) (*mongoStorage, error) {
    uri := os.Getenv("MONGODB_URI")
    if strings.TrimSpace(uri) == "" {
        uri = "mongodb://mongo:27017"
    }

    dbName := os.Getenv("MONGODB_DATABASE")
    if strings.TrimSpace(dbName) == "" {
        dbName = "mini_baas"
    }

    collectionName := os.Getenv("MONGODB_COLLECTION")
    if strings.TrimSpace(collectionName) == "" {
        collectionName = "dynamic_records"
    }

    client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
    if err != nil {
        return nil, fmt.Errorf("connect mongodb: %w", err)
    }

    return &mongoStorage{
        client:     client,
        collection: client.Database(dbName).Collection(collectionName),
    }, nil
}

func (m *mongoStorage) Engine() string {
    return "mongodb"
}

func (m *mongoStorage) Ping(ctx context.Context) error {
    return m.client.Ping(ctx, nil)
}

func (m *mongoStorage) EnsureSchema(context.Context) error {
    return nil
}

func (m *mongoStorage) InsertRecord(ctx context.Context, payload map[string]any) (map[string]any, error) {
    doc := bson.M{
        "payload":   payload,
        "createdAt": time.Now().UTC(),
    }

    res, err := m.collection.InsertOne(ctx, doc)
    if err != nil {
        return nil, err
    }

    id, _ := res.InsertedID.(primitive.ObjectID)
    return map[string]any{
        "id":        id.Hex(),
        "payload":   payload,
        "createdAt": doc["createdAt"].(time.Time).Format(time.RFC3339Nano),
    }, nil
}

func (m *mongoStorage) ListRecords(ctx context.Context, limit int) ([]map[string]any, error) {
    opts := options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(int64(limit))
    cursor, err := m.collection.Find(ctx, bson.M{}, opts)
    if err != nil {
        return nil, err
    }
    defer cursor.Close(ctx)

    out := make([]map[string]any, 0, limit)
    for cursor.Next(ctx) {
        var raw struct {
            ID        primitive.ObjectID `bson:"_id"`
            Payload   map[string]any      `bson:"payload"`
            CreatedAt time.Time           `bson:"createdAt"`
        }

        if err := cursor.Decode(&raw); err != nil {
            return nil, err
        }

        out = append(out, map[string]any{
            "id":        raw.ID.Hex(),
            "payload":   raw.Payload,
            "createdAt": raw.CreatedAt.UTC().Format(time.RFC3339Nano),
        })
    }

    if err := cursor.Err(); err != nil {
        return nil, err
    }

    return out, nil
}

func (m *mongoStorage) Close(ctx context.Context) error {
    return m.client.Disconnect(ctx)
}

func buildStorage(ctx context.Context) (storage, error) {
    engine := strings.ToLower(strings.TrimSpace(os.Getenv("DB_ENGINE")))
    switch engine {
    case "", "postgres", "postgresql":
        return newPostgresStorage(ctx)
    case "mongo", "mongodb":
        return newMongoStorage(ctx)
    default:
        return nil, fmt.Errorf("unsupported DB_ENGINE %q (expected postgres or mongodb)", engine)
    }
}

func writeJSON(w http.ResponseWriter, status int, body any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    if err := json.NewEncoder(w).Encode(body); err != nil {
        log.Printf("encode response: %v", err)
    }
}

func parseLimit(r *http.Request) int {
    value := strings.TrimSpace(r.URL.Query().Get("limit"))
    if value == "" {
        return 20
    }

    parsed, err := strconv.Atoi(value)
    if err != nil || parsed < 1 {
        return 20
    }

    if parsed > 100 {
        return 100
    }

    return parsed
}

func dynamicAPIOpenAPISpec() map[string]any {
    return map[string]any{
        "openapi": "3.0.3",
        "info": map[string]any{
            "title":       "dynamic-api",
            "version":     "0.1.0",
            "description": "Dynamic API service routes",
        },
        "servers": []map[string]any{{"url": "/"}},
        "paths": map[string]any{
            "/": map[string]any{
                "get": map[string]any{
                    "summary": "Root endpoint",
                    "responses": map[string]any{
                        "200": map[string]any{"description": "Service status message"},
                    },
                },
            },
            "/health": map[string]any{
                "get": map[string]any{
                    "summary": "Health check",
                    "responses": map[string]any{
                        "200": map[string]any{"description": "Healthy service"},
                        "503": map[string]any{"description": "Service degraded"},
                    },
                },
            },
            "/records": map[string]any{
                "get": map[string]any{
                    "summary": "List records",
                    "parameters": []map[string]any{
                        {
                            "name":     "limit",
                            "in":       "query",
                            "required": false,
                            "schema": map[string]any{
                                "type":    "integer",
                                "minimum": 1,
                                "maximum": 100,
                            },
                        },
                    },
                    "responses": map[string]any{
                        "200": map[string]any{"description": "Records listed"},
                    },
                },
                "post": map[string]any{
                    "summary": "Create record",
                    "requestBody": map[string]any{
                        "required": true,
                        "content": map[string]any{
                            "application/json": map[string]any{
                                "schema": map[string]any{
                                    "type":                 "object",
                                    "additionalProperties": true,
                                },
                            },
                        },
                    },
                    "responses": map[string]any{
                        "201": map[string]any{"description": "Record created"},
                        "400": map[string]any{"description": "Invalid payload"},
                    },
                },
            },
        },
    }
}

func main() {
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    db, err := buildStorage(ctx)
    if err != nil {
        panic(err)
    }
    defer func() {
        closeCtx, closeCancel := context.WithTimeout(context.Background(), 5*time.Second)
        defer closeCancel()
        _ = db.Close(closeCtx)
    }()

    if err := db.Ping(ctx); err != nil {
        log.Printf("startup warning: database ping failed: %v", err)
    } else if err := db.EnsureSchema(ctx); err != nil {
        log.Printf("startup warning: ensure schema failed: %v", err)
    }

    mux := http.NewServeMux()
	openapiSpec := dynamicAPIOpenAPISpec()

	mux.HandleFunc("/openapi.json", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, openapiSpec)
	})

	mux.HandleFunc("/docs", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(`<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>dynamic-api docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
        window.ui = SwaggerUIBundle({
            url: '/openapi.json',
            dom_id: '#swagger-ui'
        });
    </script>
</body>
</html>`))
	})

    mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
        pingCtx, pingCancel := context.WithTimeout(context.Background(), 2*time.Second)
        defer pingCancel()

        health := map[string]any{
            "status":  "ok",
            "service": "dynamic-api",
            "engine":  db.Engine(),
        }

        if err := db.Ping(pingCtx); err != nil {
            health["status"] = "degraded"
            health["dbError"] = err.Error()
            writeJSON(w, http.StatusServiceUnavailable, health)
            return
        }

        writeJSON(w, http.StatusOK, health)
    })

    mux.HandleFunc("/records", func(w http.ResponseWriter, r *http.Request) {
        switch r.Method {
        case http.MethodGet:
            readCtx, readCancel := context.WithTimeout(r.Context(), 5*time.Second)
            defer readCancel()

            items, err := db.ListRecords(readCtx, parseLimit(r))
            if err != nil {
                writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
                return
            }

            writeJSON(w, http.StatusOK, map[string]any{
                "engine":  db.Engine(),
                "records": items,
            })

        case http.MethodPost:
            var payload map[string]any
            if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
                writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON payload"})
                return
            }

            createCtx, createCancel := context.WithTimeout(r.Context(), 5*time.Second)
            defer createCancel()

            item, err := db.InsertRecord(createCtx, payload)
            if err != nil {
                writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
                return
            }

            writeJSON(w, http.StatusCreated, map[string]any{
                "engine": db.Engine(),
                "record": item,
            })

        default:
            writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
        }
    })

    mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
        writeJSON(w, http.StatusOK, map[string]string{
            "message": "dynamic-api running",
        })
    })

    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }

    addr := ":" + port
    fmt.Printf("dynamic-api listening on %s using engine %s\n", addr, db.Engine())
    if err := http.ListenAndServe(addr, mux); err != nil {
        panic(err)
    }
}
