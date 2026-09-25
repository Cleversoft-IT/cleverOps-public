#!/usr/bin/env bash
# ai-dev-toolbelt — installa il toolbelt CLI per coding agent:
#   rg (ripgrep) · fd · tree · ast-grep · gh
# Rileva brew / apt / dnf / pacman / cargo / npm e installa solo i mancanti.
# Idempotente: rilanciabile senza danni.
set -uo pipefail

info() { printf '\033[0;34m›\033[0m %s\n' "$1"; }
ok()   { printf '\033[0;32m✓\033[0m %s\n' "$1"; }
warn() { printf '\033[0;33m!\033[0m %s\n' "$1"; }
err()  { printf '\033[0;31m✗\033[0m %s\n' "$1"; }

has() { command -v "$1" >/dev/null 2>&1; }

SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

# --- rileva package manager di sistema ---
PM=""
if   has brew;    then PM=brew
elif has apt-get; then PM=apt
elif has dnf;     then PM=dnf
elif has pacman;  then PM=pacman
fi
info "Package manager: ${PM:-(nessuno)} · cargo:$(has cargo && echo sì || echo no) · npm:$(has npm && echo sì || echo no)"
[ -z "$PM" ] && ! has cargo && ! has npm && { err "Nessun package manager trovato (brew/apt/dnf/pacman/cargo/npm)."; exit 1; }

# pm_install <brew> <apt> <dnf> <pacman>  → installa col PM rilevato
pm_install() {
  case "$PM" in
    brew)   brew install "$1" ;;
    apt)    $SUDO apt-get update -y >/dev/null 2>&1; $SUDO apt-get install -y "$2" ;;
    dnf)    $SUDO dnf install -y "$3" ;;
    pacman) $SUDO pacman -S --noconfirm "$4" ;;
    *)      return 1 ;;
  esac
}

# --- ripgrep ---
install_rg() {
  has rg && { ok "ripgrep già presente"; return; }
  info "Installo ripgrep…"
  pm_install ripgrep ripgrep ripgrep ripgrep || (has cargo && cargo install ripgrep) \
    && ok "ripgrep ok" || err "ripgrep: installa a mano (https://github.com/BurntSushi/ripgrep)"
}

# --- fd (su Debian/Ubuntu è fd-find, binario fdfind) ---
install_fd() {
  has fd && { ok "fd già presente"; return; }
  info "Installo fd…"
  pm_install fd fd-find fd-find fd || (has cargo && cargo install fd-find) || true
  if ! has fd && has fdfind; then
    mkdir -p "$HOME/.local/bin"
    ln -sf "$(command -v fdfind)" "$HOME/.local/bin/fd"
    ok "creato alias fd → fdfind in ~/.local/bin (assicurati sia nel PATH)"
  fi
  has fd && ok "fd ok" || err "fd: installa a mano (https://github.com/sharkdp/fd)"
}

# --- tree ---
install_tree() {
  has tree && { ok "tree già presente"; return; }
  info "Installo tree…"
  pm_install tree tree tree tree && ok "tree ok" || err "tree: installa a mano"
}

# --- ast-grep (binario: sg o ast-grep) ---
install_astgrep() {
  { has sg || has ast-grep; } && { ok "ast-grep già presente"; return; }
  info "Installo ast-grep…"
  if [ "$PM" = brew ]; then brew install ast-grep
  elif has npm; then npm install -g @ast-grep/cli
  elif has cargo; then cargo install ast-grep
  fi
  { has sg || has ast-grep; } && ok "ast-grep ok" || err "ast-grep: installa a mano (https://ast-grep.github.io)"
}

# --- gh (GitHub CLI) ---
install_gh() {
  has gh && { ok "gh già presente"; return; }
  info "Installo gh…"
  case "$PM" in
    brew)   brew install gh ;;
    dnf)    $SUDO dnf install -y gh ;;
    pacman) $SUDO pacman -S --noconfirm github-cli ;;
    apt)
      # repo ufficiale GitHub CLI
      $SUDO mkdir -p -m 755 /etc/apt/keyrings
      curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
        | $SUDO tee /etc/apt/keyrings/githubcli-archive-keyring.gpg >/dev/null
      $SUDO chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
        | $SUDO tee /etc/apt/sources.list.d/github-cli.list >/dev/null
      $SUDO apt-get update -y && $SUDO apt-get install -y gh ;;
    *) warn "gh: nessun PM di sistema; vedi https://cli.github.com" ;;
  esac
  has gh && ok "gh ok" || err "gh: installa a mano (https://cli.github.com)"
}

install_rg
install_fd
install_tree
install_astgrep
install_gh

echo
ok "Toolbelt completato. Verifica: rg --version; fd --version; tree --version; sg --version; gh --version"
info "Lato design: la dipendenza esterna impeccable si installa con  npx impeccable install"
