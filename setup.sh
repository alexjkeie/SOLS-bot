#!/usr/bin/env bash
set -eu

if [ -f config.js ]; then
  echo "config.js already exists. Nothing to do."
  exit 0
fi

cp config.example.js config.js
printf '\nCreated config.js from config.example.js\n'
printf 'Replace the placeholder values before testing.\n'
