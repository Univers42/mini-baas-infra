
# Kubernetes Local Quickstart (Minikube)

## Purpose

This document provides a professional, repeatable workflow to run a local Kubernetes cluster with Minikube, deploy a sample application, and perform basic cluster lifecycle operations.

## Prerequisites

- Linux host with virtualization support enabled.
- `kubectl` installed and available in `PATH`.
- `minikube` installed and available in `PATH`.

Verify tools:

```bash
kubectl version --client
minikube version
```

## 1) Start a Local Cluster

Start Minikube with default profile and settings:

```bash
minikube start
```

Optional: Start a dedicated profile with a pinned Kubernetes version:

```bash
minikube start -p aged --kubernetes-version=v1.34.0
```

Optional: Increase memory for future starts:

```bash
minikube config set memory 9001
```

## 2) Open the Kubernetes Dashboard

Launch the Minikube dashboard:

```bash
minikube dashboard
```

This command opens the cluster dashboard and keeps running while the dashboard session is active.

## 3) Deploy a Sample Application

Create a sample deployment:

```bash
kubectl create deployment hello-minikube --image=kicbase/echo-server:1.0
```

Expose it as a service:

```bash
kubectl expose deployment hello-minikube --type=NodePort --port=8080
```

Confirm service creation:

```bash
kubectl get services hello-minikube
```

Access methods:

- Open service directly through Minikube:

```bash
minikube service hello-minikube
```

- Or use local port-forwarding:

```bash
kubectl port-forward service/hello-minikube 7080:8080
```

Then access `http://localhost:7080`.

## 4) Day-to-Day Cluster Operations

Pause cluster (save CPU/RAM without deleting state):

```bash
minikube pause
```

Resume paused cluster:

```bash
minikube unpause
```

Stop cluster:

```bash
minikube stop
```

List available Minikube add-ons:

```bash
minikube addons list
```

Delete all Minikube clusters and profiles:

```bash
minikube delete --all
```

## 5) Recommended Validation Commands

Use these commands after startup or deployments:

```bash
kubectl get nodes
kubectl get pods -A
kubectl get svc -A
```

## 6) Safety Notes

- `minikube delete --all` is destructive and removes local cluster state.
- Prefer profile-based usage (for example, `-p aged`) when testing multiple setups.
- Use explicit port-forward or service URLs to avoid confusion when switching clusters.

## Resources

Official documentation:

- https://kubernetes.io/docs/setup/
- https://kubernetes.io/docs/tasks/tools/install-kubectl-linux/
- https://minikube.sigs.k8s.io/docs/start/?arch=%2Flinux%2Fx86-64%2Fstable%2Fbinary+download#Ingress

Community guides:

- https://dev.to/digitalpollution/kubernetes-for-everyone-a-step-by-step-guide-for-beginners-1p3c#chapter-2-setting-up-your-environment
- https://medium.com/codex/kubernetes-for-beginners-deploying-your-first-application-6e3fbd746df2

Related troubleshooting reference:

- https://askubuntu.com/questions/908800/what-does-this-apt-error-message-download-is-performed-unsandboxed-as-root