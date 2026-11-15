#!/usr/bin/env bash
# Publish an over-the-air update to the preview channel (the installed APKs).
# `eas update --environment` turns off .env loading and the EAS "preview" environment has no
# variables, so without this the Supabase address is missing, the app crashes on start, and
# Android rolls the update back and blocks it. Load .env into the shell so it's built in.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
: "${EXPO_PUBLIC_SUPABASE_URL:?missing from .env}"
npx eas-cli update --channel preview --environment preview --platform android --message "${1:?usage: scripts/ota.sh \"message\"}" --non-interactive
