# File: Tiltfile
# Local Kubernetes development with Tilt (https://tilt.dev)
# Usage:
#   k3d cluster create mini-baas --port "8000:80@loadbalancer"
#   tilt up

# ── Settings ────────────────────────────────────────────────────
load('ext://helm_resource', 'helm_resource', 'helm_repo')
load('ext://namespace', 'namespace_create')

allow_k8s_contexts('k3d-mini-baas')
update_settings(max_parallel_updates=3, k8s_upsert_timeout_secs=120)

# ── Namespaces ──────────────────────────────────────────────────
namespace_create('mini-baas')

# ── Helm Repos ──────────────────────────────────────────────────
helm_repo('bitnami', 'https://charts.bitnami.com/bitnami')
helm_repo('kong', 'https://charts.konghq.com')

# ── Layer 0: Data Stores ───────────────────────────────────────
helm_resource(
    'postgresql',
    'bitnami/postgresql',
    namespace='mini-baas',
    flags=[
        '-f', 'k8s/third-party/postgresql/values.yaml',
        '-f', 'k8s/overlays/dev/values-postgresql.yaml',
    ],
    resource_deps=[],
    labels=['data-stores'],
)

helm_resource(
    'mongodb',
    'bitnami/mongodb',
    namespace='mini-baas',
    flags=[
        '-f', 'k8s/third-party/mongodb/values.yaml',
        '-f', 'k8s/overlays/dev/values-mongodb.yaml',
    ],
    resource_deps=[],
    labels=['data-stores'],
)

helm_resource(
    'redis',
    'bitnami/redis',
    namespace='mini-baas',
    flags=['-f', 'k8s/third-party/redis/values.yaml'],
    resource_deps=[],
    labels=['data-stores'],
)

# ── Layer 1: Object Storage ────────────────────────────────────
helm_resource(
    'minio',
    'bitnami/minio',
    namespace='mini-baas',
    flags=['-f', 'k8s/third-party/minio/values.yaml'],
    resource_deps=[],
    labels=['storage'],
)

# ── Layer 2: API Gateway ───────────────────────────────────────
helm_resource(
    'kong',
    'kong/kong',
    namespace='mini-baas',
    flags=['-f', 'k8s/third-party/kong/values.yaml'],
    resource_deps=['postgresql'],
    labels=['gateway'],
)

# ── Custom Images (live rebuild) ───────────────────────────────
REGISTRY = 'ghcr.io/univers42/mini-baas'
CUSTOM_SERVICES = ['mongo-api', 'adapter-registry', 'query-router']

for svc in CUSTOM_SERVICES:
    docker_build(
        '%s/%s' % (REGISTRY, svc),
        context='docker/services/%s' % svc,
        dockerfile='docker/services/%s/Dockerfile' % svc,
        live_update=[
            sync('docker/services/%s/src' % svc, '/app/src'),
            run('cd /app && npm install', trigger=['docker/services/%s/package.json' % svc]),
        ],
    )

# ── Layer 3: mini-BaaS Application ─────────────────────────────
helm_resource(
    'mini-baas',
    'k8s/charts/mini-baas',
    namespace='mini-baas',
    flags=[
        '-f', 'k8s/charts/mini-baas/values.yaml',
        '-f', 'k8s/overlays/dev/values-mini-baas.yaml',
    ],
    image_deps=[
        '%s/mongo-api' % REGISTRY,
        '%s/adapter-registry' % REGISTRY,
        '%s/query-router' % REGISTRY,
    ],
    resource_deps=['postgresql', 'mongodb', 'redis', 'kong'],
    labels=['application'],
)

# ── Port Forwards ──────────────────────────────────────────────
# Kong proxy → localhost:8000
k8s_resource('kong-kong', port_forwards=['8000:8000', '8001:8001'], labels=['gateway'])
# GoTrue → localhost:9999
k8s_resource('mini-baas-gotrue', port_forwards=['9999:9999'], labels=['application'])
# PostgREST → localhost:3000
k8s_resource('mini-baas-postgrest', port_forwards=['3000:3000'], labels=['application'])
# Realtime → localhost:4000
k8s_resource('mini-baas-realtime', port_forwards=['4000:4000'], labels=['application'])
# Mongo API → localhost:3010
k8s_resource('mini-baas-mongo-api', port_forwards=['3010:3010'], labels=['application'])
