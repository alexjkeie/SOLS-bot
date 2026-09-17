# SOLS 37th Digital Support Terminal

A dark, military-styled Discord bot for authorized SOCOM/SOLS environments.

## Setup

1. Install Node.js 22+.
2. Copy `.env.example` to `.env` and supply your values.
3. Install dependencies:

   npm install

4. Start the bot:

   npm start

## Required environment variables

- `DISCORD_TOKEN` – bot token
- `CLIENT_ID` – Discord application ID
- `ADMIN_ID` – primary SOLS admin user ID (`1332052367759114301`)
- `MAIN_SERVER_ID` – headquarters server ID (`1549377191446581270`)
- `MAIN_LOG_CHANNEL_ID` – central log channel (`1550149863038132314`)

## Notes

- The bot uses SQLite to persist authorization, tickets, reports, incidents, and audit data in `data/sols.db`.
- Restricted Security commands are enforced by Discord user ID checks on the primary administrator.
- Central logs are pushed to the configured main server log channel for all authorized server activity.
