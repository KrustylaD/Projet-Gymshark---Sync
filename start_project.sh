#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1}"
OLLAMA_PORT="${OLLAMA_PORT:-11434}"
BACKEND_PORT="${BACKEND_PORT:-3000}"
FRONTEND_PORT="${FRONTEND_PORT:-8080}"

declare -a STARTED_PIDS=()
CLEANUP_DONE=0

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

is_port_open() {
    local host="$1"
    local port="$2"

    if command_exists nc; then
        nc -z "$host" "$port" >/dev/null 2>&1
        return $?
    fi

    if (echo >"/dev/tcp/$host/$port") >/dev/null 2>&1; then
        return 0
    fi

    return 1
}

is_ollama_ready() {
    if command_exists curl; then
        curl --silent --fail --max-time 2 "http://$OLLAMA_HOST:$OLLAMA_PORT/api/tags" >/dev/null 2>&1 && return 0
        return 1
    fi

    is_port_open "$OLLAMA_HOST" "$OLLAMA_PORT"
}

wait_for_port() {
    local host="$1"
    local port="$2"
    local label="$3"
    local timeout_seconds="$4"

    local attempts=$((timeout_seconds * 2))
    for ((i = 1; i <= attempts; i++)); do
        if is_port_open "$host" "$port"; then
            echo "[OK] $label disponible sur $host:$port"
            return 0
        fi
        sleep 0.5
    done

    echo "[ERREUR] Timeout: $label n'est pas disponible sur $host:$port"
    return 1
}

cleanup() {
    if [[ "$CLEANUP_DONE" -eq 1 ]]; then
        return
    fi
    CLEANUP_DONE=1

    if ((${#STARTED_PIDS[@]} > 0)); then
        echo
        echo "Arret des services lances par ce script..."
        for pid in "${STARTED_PIDS[@]}"; do
            if kill -0 "$pid" >/dev/null 2>&1; then
                kill "$pid" >/dev/null 2>&1 || true
            fi
        done
    fi
}

trap cleanup INT TERM EXIT

start_ollama_if_needed() {
    if is_ollama_ready; then
        echo "[INFO] Ollama est deja actif sur $OLLAMA_HOST:$OLLAMA_PORT"
        return
    fi

    if ! command_exists ollama; then
        echo "[ERREUR] La commande 'ollama' est introuvable. Installe Ollama puis reessaye."
        exit 1
    fi

    echo "[INFO] Demarrage de Ollama..."
    ollama serve >/tmp/gymshark-ollama.log 2>&1 &
    local ollama_pid=$!
    STARTED_PIDS+=("$ollama_pid")

    local attempts=20
    for ((i = 1; i <= attempts; i++)); do
        if is_ollama_ready; then
            echo "[OK] Ollama est pret"
            return
        fi
        sleep 0.5
    done

    echo "[ERREUR] Ollama ne repond pas. Consulte /tmp/gymshark-ollama.log"
    exit 1
}

start_backend_if_needed() {
    if is_port_open "127.0.0.1" "$BACKEND_PORT"; then
        echo "[INFO] Backend deja actif sur le port $BACKEND_PORT"
        return
    fi

    if ! command_exists npm; then
        echo "[ERREUR] La commande 'npm' est introuvable. Installe Node.js puis reessaye."
        exit 1
    fi

    if [[ ! -d "$BACKEND_DIR/node_modules" ]]; then
        echo "[INFO] Installation des dependances backend..."
        (
            cd "$BACKEND_DIR"
            npm install
        )
    fi

    echo "[INFO] Demarrage du backend..."
    (
        cd "$BACKEND_DIR"
        npm start
    ) &
    local backend_pid=$!
    STARTED_PIDS+=("$backend_pid")

    wait_for_port "127.0.0.1" "$BACKEND_PORT" "Backend" 20
}

start_frontend_if_needed() {
    if is_port_open "127.0.0.1" "$FRONTEND_PORT"; then
        echo "[INFO] Frontend deja servi sur le port $FRONTEND_PORT"
        return
    fi

    if ! command_exists python3; then
        echo "[ERREUR] La commande 'python3' est introuvable."
        echo "        Installe Python 3 ou sers le dossier frontend manuellement."
        exit 1
    fi

    echo "[INFO] Demarrage du serveur frontend..."
    (
        cd "$FRONTEND_DIR"
        python3 -m http.server "$FRONTEND_PORT"
    ) &
    local frontend_pid=$!
    STARTED_PIDS+=("$frontend_pid")

    wait_for_port "127.0.0.1" "$FRONTEND_PORT" "Frontend" 20
}

echo "--- Lancement automatique Gymshark Sync ---"
start_ollama_if_needed
start_backend_if_needed
start_frontend_if_needed

echo
echo "Projet lance."
echo "Backend :  http://localhost:$BACKEND_PORT"
echo "Frontend : http://localhost:$FRONTEND_PORT"
echo "Ctrl+C pour arreter les services demarres par ce script."

wait
