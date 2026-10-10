---
name: wslc-containers
description: Manage Linux containers on Windows using the built-in WSL container CLI (wslc.exe), without Docker Desktop. Use this when asked to build, run, list, inspect, stop, or otherwise operate containers via WSL/wslc from a Copilot CLI session running inside WSL.
allowed-tools: shell
---

# WSL Container (`wslc`) Operations

This skill lets Copilot operate Linux containers through the native WSL container
feature (`wslc.exe`), which ships with WSL version 2.9.3 or later and requires no
Docker Desktop installation. It works from a bash shell running inside a WSL
distribution by invoking the Windows-side `wslc.exe` binary through the `/mnt/c`
interop mount.

## Prerequisites

- Windows host has WSL >= 2.9.3 (check with `wsl.exe --version` from inside WSL,
  or `wsl --version` from PowerShell). Update with `wsl --update` if needed.
- The WSL container feature is installed (ships by default with recent WSL; if
  missing, instruct the user to run `wsl --install` or update WSL).
- This repo's bundled wrapper script resolves the `wslc.exe` path automatically.

## How to invoke `wslc`

Always use the bundled wrapper script instead of guessing paths directly, since
`wslc.exe` normally lives under a path containing spaces
(`/mnt/c/Program Files/WSL/wslc.exe`):

```bash
bash .github/skills/wslc-containers/scripts/wslc.sh <command> [args...]
```

The wrapper searches, in order:
1. The default install path (`/mnt/c/Program Files/WSL/wslc.exe`)
2. Common Program Files locations under `/mnt/c`
3. `cmd.exe /c "where wslc.exe"` as a last resort

If it cannot find `wslc.exe`, it prints guidance to run `wsl --update` and exits
non-zero — surface that message to the user rather than retrying blindly.

## Common operations

Run these through the wrapper script shown above (replace `wslc` with
`bash .github/skills/wslc-containers/scripts/wslc.sh`):

```bash
# Show version / general info
wslc version
wslc system info

# Images
wslc image ls
wslc pull <image>              # e.g. wslc pull docker.io/library/alpine:latest
wslc build -t <tag> <path>      # build from a Dockerfile
wslc rmi <image>

# Containers
wslc run --rm -it <image> <cmd...>
wslc run -d --name <name> -p <hostPort>:<containerPort> <image>
wslc container ps               # or: wslc list
wslc exec <container> <cmd...>
wslc logs <container>
wslc stop <container>
wslc restart <container>
wslc remove <container>

# Networks / volumes
wslc network ls
wslc volume ls
```

## Guidelines for Copilot

1. Always resolve the binary through the wrapper script; never hardcode
   `/mnt/c/Program Files/WSL/wslc.exe` directly in commands, since the install
   path can vary across machines.
2. Treat `wslc run`/`wslc exec` as capable of executing arbitrary code inside a
   container — confirm with the user before running unfamiliar images or
   commands, especially anything pulling from untrusted registries.
3. Quote image names/tags and paths carefully; container names and ports passed
   by the user should be validated before use in a command line.
4. If a command fails because `wslc.exe` is missing or outdated, report the
   exact error and suggest `wsl --update` rather than attempting workarounds.
5. Prefer `wslc container ps -a` / `wslc image ls` to confirm state before
   destructive operations like `wslc remove` or `wslc rmi`.
