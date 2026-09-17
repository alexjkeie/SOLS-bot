# SOLS 37th Digital Support Terminal

A dark, military-styled Discord bot for authorized SOCOM/SOLS environments.

## Setup

This repo includes a few helper files to make setup simpler without changing the bot logic.

1. Install Node.js 22+.
2. Copy one of the sample configuration files:
   - `cp .env.example .env`
   - or `cp config.example.js config.js`
   - or use the WispByte template: `cp wispbyte.env.example .env`
3. Replace placeholder values with your real Discord credentials and IDs.
4. Install dependencies:

   npm install

5. Start the bot:

   npm start

### Quick helper

Run:

```bash
chmod +x setup.sh
./setup.sh
```

This creates a `config.js` copy from `config.example.js` so you can fill in the values without editing the main bot file.

## Required values

- `DISCORD_TOKEN` – bot token
- `CLIENT_ID` – Discord application ID
- `ADMIN_ID` – primary SOLS admin user ID (`1332052367759114301`)
- `MAIN_SERVER_ID` – headquarters server ID (`1549377191446581270`)
- `MAIN_LOG_CHANNEL_ID` – central log channel (`1550149863038132314`)

## Notes

- The bot uses SQLite to persist authorization, tickets, reports, incidents, and audit data in `data/sols.db`.
- Restricted Security commands are enforced by Discord user ID checks on the primary administrator.
- Central logs are pushed to the configured main server log channel for all authorized server activity.
- For a quick test setup, the main code may be left as-is and the values can be filled in the sample files listed above.
