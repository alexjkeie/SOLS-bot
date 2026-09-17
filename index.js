const fs = require('fs');
const path = require('path');
const os = require('os');

// Try several data directory locations and pick the first writable one.
const candidates = [
  path.join(__dirname, 'data'),                // project data folder
  path.join(__dirname, 'src', 'data'),         // project src data
  path.join(process.cwd(), 'data'),            // cwd data
  '/home/data',                                 // common host path
  path.join(os.homedir(), 'sols-data'),        // user home
  path.join(os.tmpdir(), 'sols-data'),         // temp dir fallback
];

let chosen = null;
for (const d of candidates) {
  try {
    fs.mkdirSync(d, { recursive: true });
    // verify we can read/write
    fs.accessSync(d, fs.constants.R_OK | fs.constants.W_OK);
    chosen = d;
    break;
  } catch (e) {
    // try next
  }
}

if (!chosen) {
  // as a final fallback use an in-memory temp dir under os.tmpdir()
  chosen = path.join(os.tmpdir(), 'sols-data-fallback');
  try {
    fs.mkdirSync(chosen, { recursive: true });
  } catch (e) {
    console.error('Failed to create any writable data directory. Exiting.');
    console.error(e);
    process.exit(1);
  }
}

process.env.SOLS_DATA_DIR = chosen;
console.log('Using data directory:', chosen);

// Run the main bot
require('./src/index.js');
