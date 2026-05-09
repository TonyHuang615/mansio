#!/usr/bin/env bash
set -euo pipefail

OS="$(uname -s)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

echo ""
echo "  Uninstalling Loci Terminal..."
echo ""

case "$OS" in
    Linux)
        if [[ $EUID -ne 0 ]]; then
            error "Run as root: sudo bash uninstall.sh"
        fi

        USER="${SUDO_USER:-$(whoami)}"

        if systemctl is-active --quiet "lociterm@${USER}" 2>/dev/null; then
            info "Stopping service..."
            systemctl stop "lociterm@${USER}"
        fi

        if systemctl is-enabled --quiet "lociterm@${USER}" 2>/dev/null; then
            info "Disabling service..."
            systemctl disable "lociterm@${USER}"
        fi

        if [[ -f /etc/systemd/system/lociterm@.service ]]; then
            info "Removing systemd unit..."
            rm -f /etc/systemd/system/lociterm@.service
            systemctl daemon-reload
        fi

        if [[ -f /usr/local/bin/lociterm ]]; then
            info "Removing binary..."
            rm -f /usr/local/bin/lociterm
        fi

        warn "Data directory /var/lib/lociterm was NOT removed."
        warn "To delete all data: sudo rm -rf /var/lib/lociterm"
        ;;

    Darwin)
        PLIST="${HOME}/Library/LaunchAgents/com.loci-terminal.lociterm.plist"

        if [[ -f "$PLIST" ]]; then
            info "Unloading launchd service..."
            launchctl unload "$PLIST" 2>/dev/null || true
            rm -f "$PLIST"
            info "Removed launchd plist"
        fi

        if [[ -f /usr/local/bin/lociterm ]]; then
            info "Removing binary (requires sudo)..."
            sudo rm -f /usr/local/bin/lociterm
        fi

        warn "Data directory ~/.local/share/lociterm was NOT removed."
        warn "To delete all data: rm -rf ~/.local/share/lociterm"
        warn "To delete logs: rm -rf ~/Library/Logs/lociterm"
        ;;

    *)
        warn "Unknown OS: ${OS}"
        warn "Manually remove /usr/local/bin/lociterm"
        ;;
esac

echo ""
info "Uninstall complete."
