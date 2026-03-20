package main

import (
    "fmt"
    "net/http"
    "os"
)

func main() {
    mux := http.NewServeMux()

    mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        w.WriteHeader(http.StatusOK)
        _, _ = w.Write([]byte(`{"status":"ok","service":"dynamic-api"}`))
    })

    mux.HandleFunc("/", func(w http.ResponseWriter, _ *http.Request) {
        _, _ = w.Write([]byte("dynamic-api running"))
    })

    port := os.Getenv("PORT")
    if port == "" {
        port = "8080"
    }

    addr := ":" + port
    fmt.Printf("dynamic-api listening on %s\n", addr)
    if err := http.ListenAndServe(addr, mux); err != nil {
        panic(err)
    }
}
