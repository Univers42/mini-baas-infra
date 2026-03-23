from fastapi import FastAPI

app = FastAPI(
    title="auth-service",
    version="0.1.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "auth-service"}


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "auth-service running"}
