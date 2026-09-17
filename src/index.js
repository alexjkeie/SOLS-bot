const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ChannelType,
  REST,
  Routes,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const Database = require('better-sqlite3');

const DISCORD_TOKEN = 'PASTE_YOUR_BOT_TOKEN_HERE';
const CLIENT_ID = 'PASTE_YOUR_CLIENT_ID_HERE';
const ADMIN_ID = '1332052367759114301';
const MAIN_SERVER_ID = '1549377191446581270';
const MAIN_LOG_CHANNEL_ID = '1550149863038132314';
const THUMBNAIL_URL = 'https://cdn.discordapp.com/attachments/1549801658224087163/1550044648511377478/Untitled130_20260916115047.png?ex=6aace712&is=6aab9592&hm=a7e338efc67427f75b134ed021a408d7155189f79987789aaf9a1b80aa773596&';
const SYSTEM_NAME = '[SOLS] 37th Digital Support Terminal';

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'sols.db'));

const pendingReports = new Map();
const activeTicketUsers = new Map();
const ticketChannelToTicket = new Map();
const reportChannelToReport = new Map();

function nowIso() {
  return new Date().toISOString();
}

function formatTimestamp(date = new Date()) {
  return new Date(date).toISOString();
}

function createSystemEmbed(title, options = {}) {
  return new EmbedBuilder()
    .setColor(options.color || 0x000000)
    .setTitle(title)
    .setThumbnail(THUMBNAIL_URL)
    .setTimestamp(new Date())
    .setFooter({ text: SYSTEM_NAME, iconURL: THUMBNAIL_URL });
}

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      server_id TEXT PRIMARY KEY,
      server_name TEXT,
      authorization_status TEXT DEFAULT 'UNAUTHORIZED',
      authorization_date TEXT,
      authorized_by TEXT,
      server_owner TEXT,
      authorization_notes TEXT,
      current_configuration TEXT DEFAULT '{}',
      security_status TEXT DEFAULT 'NORMAL',
      reports_count INTEGER DEFAULT 0,
      tickets_count INTEGER DEFAULT 0,
      incidents_count INTEGER DEFAULT 0,
      last_activity TEXT,
      revocation_status TEXT DEFAULT 'ACTIVE',
      lockdown_status TEXT DEFAULT 'NORMAL',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS personnel (
      id TEXT PRIMARY KEY,
      server_id TEXT,
      username TEXT,
      discord_id TEXT,
      rank TEXT,
      division TEXT,
      clearance TEXT,
      service_status TEXT,
      join_date TEXT,
      notes TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      server_id TEXT,
      origin_server_name TEXT,
      description TEXT,
      status TEXT DEFAULT 'OPEN',
      created_at TEXT,
      closed_by TEXT,
      closed_at TEXT,
      transcript TEXT DEFAULT '[]',
      admin_channel_id TEXT,
      user_dm_channel_id TEXT,
      priority TEXT DEFAULT 'NORMAL',
      server_owner TEXT
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      username TEXT,
      server_id TEXT,
      origin_server_name TEXT,
      reason TEXT,
      additional_details TEXT,
      attachments TEXT DEFAULT '[]',
      status TEXT DEFAULT 'OPEN',
      created_at TEXT,
      channel_id TEXT,
      file_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      server_id TEXT,
      server_name TEXT,
      category TEXT,
      severity TEXT,
      description TEXT,
      reporter_user_id TEXT,
      reporter_name TEXT,
      assigned_investigator TEXT,
      status TEXT DEFAULT 'OPEN',
      created_at TEXT,
      last_update TEXT,
      resolution TEXT,
      evidence TEXT DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS missions (
      id TEXT PRIMARY KEY,
      name TEXT,
      objective TEXT,
      assigned_personnel TEXT,
      division TEXT,
      status TEXT,
      start_time TEXT,
      end_time TEXT,
      notes TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS deployments (
      id TEXT PRIMARY KEY,
      personnel TEXT,
      unit TEXT,
      mission TEXT,
      deployment_status TEXT,
      start_time TEXT,
      end_time TEXT,
      notes TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS briefings (
      id TEXT PRIMARY KEY,
      title TEXT,
      author TEXT,
      priority TEXT,
      content TEXT,
      division TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      issuer TEXT,
      division TEXT,
      order_text TEXT,
      priority TEXT,
      status TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      command TEXT,
      user_name TEXT,
      user_id TEXT,
      server_name TEXT,
      server_id TEXT,
      recorded_at TEXT,
      result TEXT,
      relevant_target TEXT,
      changes_made TEXT,
      details TEXT
    );
  `);

  const count = db.prepare('SELECT COUNT(*) AS total FROM personnel').get().total;
  if (count === 0) {
    const now = nowIso();
    db.prepare(`INSERT INTO personnel (id, server_id, username, discord_id, rank, division, clearance, service_status, join_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'PERSON-001', MAIN_SERVER_ID, 'SOLS Administrator', ADMIN_ID, 'SFC', 'SOLS', 'LEVEL 5', 'ACTIVE', now, 'Primary SOLS authority', now,
    );
    db.prepare(`INSERT INTO personnel (id, server_id, username, discord_id, rank, division, clearance, service_status, join_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'PERSON-002', MAIN_SERVER_ID, 'Rook', '100000000000000001', 'SGT', 'LOGISTICS', 'LEVEL 3', 'ACTIVE', now, 'Operations support', now,
    );
    db.prepare(`INSERT INTO personnel (id, server_id, username, discord_id, rank, division, clearance, service_status, join_date, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      'PERSON-003', MAIN_SERVER_ID, 'Frost', '100000000000000002', 'CPL', 'INTEL', 'LEVEL 4', 'ACTIVE', now, 'Counter-intel liaison', now,
    );
  }
}

function ensureServerRecord(guild) {
  const serverId = guild.id;
  const existing = db.prepare('SELECT * FROM servers WHERE server_id = ?').get(serverId);
  if (existing) {
    return existing;
  }

  const now = nowIso();
  db.prepare(`
    INSERT INTO servers (server_id, server_name, authorization_status, authorization_date, authorized_by, server_owner, authorization_notes, current_configuration, security_status, reports_count, tickets_count, incidents_count, last_activity, revocation_status, lockdown_status, created_at)
    VALUES (?, ?, 'UNAUTHORIZED', NULL, NULL, ?, NULL, '{}', 'NORMAL', 0, 0, 0, ?, 'ACTIVE', 'NORMAL', ?)
  `).run(guild.id, guild.ownerId || 'UNKNOWN', now, now);

  return db.prepare('SELECT * FROM servers WHERE server_id = ?').get(serverId);
}

function getServerRecord(serverId) {
  if (!serverId) return null;
  return db.prepare('SELECT * FROM servers WHERE server_id = ?').get(serverId);
}

function isAuthorizedServer(serverId) {
  const record = getServerRecord(serverId);
  if (!record) return false;
  return record.authorization_status === 'AUTHORIZED' && record.revocation_status !== 'REVOKED';
}

function isSolsAdmin(userId) {
  return String(userId) === String(ADMIN_ID);
}

function nextSequenceId(prefix, tableName, fieldName) {
  const latest = db.prepare(`SELECT ${fieldName} FROM ${tableName} WHERE ${fieldName} LIKE ? ORDER BY ${fieldName} DESC LIMIT 1`).get(`${prefix}-%`);
  let current = 0;
  if (latest && latest[fieldName]) {
    const value = latest[fieldName].split('-').pop();
    current = Number.parseInt(value, 10) || 0;
  }
  const next = current + 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

function recordAudit({ command, userName, userId, serverName, serverId, result, target, changesMade, details }) {
  db.prepare(`
    INSERT INTO audit_logs (command, user_name, user_id, server_name, server_id, recorded_at, result, relevant_target, changes_made, details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    command || 'SYSTEM',
    userName || 'UNKNOWN',
    userId || 'UNKNOWN',
    serverName || 'N/A',
    serverId || 'N/A',
    nowIso(),
    result || 'SUCCESS',
    target || 'N/A',
    changesMade || 'NONE',
    details || 'No further details.',
  );
}

async function sendCentralLog({ action, command, user, userId, server, serverId, result, details }) {
  const client = global.client;
  if (!client) return;

  const channel = client.channels.cache.get(MAIN_LOG_CHANNEL_ID) || await client.channels.fetch(MAIN_LOG_CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.error(`Unable to locate SOLS logging channel ${MAIN_LOG_CHANNEL_ID}`);
    return;
  }

  const embed = createSystemEmbed('SOLS SYSTEM LOG', { color: 0x000000 });
  embed.addFields(
    { name: 'Action', value: String(action || 'SYSTEM'), inline: true },
    { name: 'Command', value: String(command || 'N/A'), inline: true },
    { name: 'User', value: String(user || 'UNKNOWN'), inline: true },
    { name: 'User ID', value: String(userId || 'UNKNOWN'), inline: true },
    { name: 'Origin Server', value: String(server || 'UNKNOWN'), inline: true },
    { name: 'Server ID', value: String(serverId || 'UNKNOWN'), inline: true },
    { name: 'Timestamp', value: formatTimestamp(), inline: true },
    { name: 'Result', value: String(result || 'SUCCESS'), inline: true },
    { name: 'Details', value: String(details || 'No details supplied.'), inline: false },
  );

  await channel.send({ embeds: [embed] }).catch((error) => console.error('Central log failed:', error));
}

async function denyInteraction(interaction, reason = 'SOLS authorization required.') {
  const embed = createSystemEmbed('ACCESS DENIED', { color: 0x8b0000 });
  embed.addFields(
    { name: 'Status', value: 'DENIED' },
    { name: 'Reason', value: reason },
  );

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ embeds: [embed], ephemeral: true }).catch(() => {});
  } else {
    await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
  }

  await sendCentralLog({
    action: 'UNAUTHORIZED COMMAND ATTEMPT',
    command: interaction.commandName || 'UNKNOWN',
    user: interaction.user?.username || 'UNKNOWN',
    userId: interaction.user?.id || 'UNKNOWN',
    server: interaction.guild?.name || 'UNKNOWN',
    serverId: interaction.guildId || 'UNKNOWN',
    result: 'DENIED',
    details: reason,
  });

  recordAudit({
    command: interaction.commandName || 'UNKNOWN',
    userName: interaction.user?.username || 'UNKNOWN',
    userId: interaction.user?.id || 'UNKNOWN',
    serverName: interaction.guild?.name || 'UNKNOWN',
    serverId: interaction.guildId || 'UNKNOWN',
    result: 'DENIED',
    target: 'COMMAND',
    details: reason,
  });
}

async function denyServerAccess(interaction, reason = 'This terminal is restricted to authorized SOCOM installations.') {
  const embed = createSystemEmbed('SYSTEM ACCESS DENIED', { color: 0x8b0000 });
  embed.addFields(
    { name: 'Status', value: 'SERVER NOT AUTHORIZED' },
    { name: 'Notice', value: reason },
  );

  if (interaction.deferred || interaction.replied) {
    await interaction.followUp({ embeds: [embed], ephemeral: true }).catch(() => {});
  } else {
    await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => {});
  }

  await sendCentralLog({
    action: 'UNAUTHORIZED SERVER ACCESS',
    command: interaction.commandName || 'UNKNOWN',
    user: interaction.user?.username || 'UNKNOWN',
    userId: interaction.user?.id || 'UNKNOWN',
    server: interaction.guild?.name || 'UNKNOWN',
    serverId: interaction.guildId || 'UNKNOWN',
    result: 'DENIED',
    details: `Server access denied for ${interaction.guild?.name || 'unknown server'}. ${reason}`,
  });
}

async function createAdminOnlyChannel(guild, channelName, userId) {
  return guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: ['ViewChannel'] },
      { id: userId, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'AttachFiles', 'EmbedLinks'] },
    ],
  });
}

async function createTicketForInteraction(interaction, description) {
  const user = interaction.user;
  const guild = interaction.guild;

  if (!guild || !isAuthorizedServer(guild.id)) {
    await denyServerAccess(interaction);
    return;
  }

  const ticketId = nextSequenceId('TICKET', 'tickets', 'id');
  const mainGuild = client.guilds.cache.get(MAIN_SERVER_ID) || await client.guilds.fetch(MAIN_SERVER_ID).catch(() => null);
  if (!mainGuild) {
    await interaction.reply({ embeds: [createSystemEmbed('SYSTEM ERROR', { color: 0x8b0000 })], ephemeral: true });
    return;
  }

  const channelName = `ticket-${ticketId.replace('TICKET-', '')}`;
  const ticketChannel = await createAdminOnlyChannel(mainGuild, channelName, ADMIN_ID);

  const ticketEmbed = createSystemEmbed('SOLS SUPPORT TICKET');
  ticketEmbed.addFields(
    { name: 'Ticket', value: ticketId, inline: true },
    { name: 'User', value: user.tag || user.username, inline: true },
    { name: 'User ID', value: user.id, inline: true },
    { name: 'Origin Server', value: guild.name, inline: true },
    { name: 'Server ID', value: guild.id, inline: true },
    { name: 'Description', value: description.substring(0, 1024), inline: false },
    { name: 'Status', value: 'OPEN', inline: true },
    { name: 'Created', value: formatTimestamp(), inline: true },
  );
  await ticketChannel.send({ embeds: [ticketEmbed] });

  await user.send({
    embeds: [createSystemEmbed('SOLS SUPPORT TICKET OPENED').addFields(
      { name: 'Ticket', value: ticketId, inline: true },
      { name: 'Status', value: 'OPEN', inline: true },
      { name: 'Message', value: 'The SOLS administrator can respond through this DM channel.' },
    )],
  }).catch(() => {});

  const now = nowIso();
  db.prepare(`
    INSERT INTO tickets (id, user_id, username, server_id, origin_server_name, description, status, created_at, transcript, admin_channel_id, user_dm_channel_id, priority, server_owner)
    VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, '[]', ?, ?, 'NORMAL', ?)
  `).run(ticketId, user.id, user.tag || user.username, guild.id, guild.name, description, now, ticketChannel.id, null, guild.ownerId || 'UNKNOWN');

  ticketChannelToTicket.set(ticketChannel.id, ticketId);
  activeTicketUsers.set(user.id, ticketId);

  await sendCentralLog({
    action: 'TICKET CREATED',
    command: '/ticket',
    user: user.username,
    userId: user.id,
    server: guild.name,
    serverId: guild.id,
    result: 'SUCCESS',
    details: `Ticket ${ticketId} created for ${user.tag}.`,
  });

  recordAudit({
    command: '/ticket',
    userName: user.username,
    userId: user.id,
    serverName: guild.name,
    serverId: guild.id,
    result: 'SUCCESS',
    target: ticketId,
    changesMade: 'Created ticket',
    details: `Description: ${description}`,
  });

  await interaction.reply({ content: `Ticket ${ticketId} has been created and routed to SOLS.`, ephemeral: true });
}

async function handleTicketAdminReply(message, ticketId) {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket) return;

  const user = await client.users.fetch(ticket.user_id).catch(() => null);
  if (!user) return;

  const content = message.content.trim();
  if (!content) return;

  const transcript = JSON.parse(ticket.transcript || '[]');
  transcript.push({ type: 'admin', sender: 'SOLS ADMIN', content, timestamp: nowIso() });
  db.prepare('UPDATE tickets SET transcript = ? WHERE id = ?').run(JSON.stringify(transcript), ticketId);

  await user.send({
    embeds: [createSystemEmbed('SOLS ADMIN RESPONSE').addFields(
      { name: 'Ticket', value: ticketId },
      { name: 'Message', value: content.substring(0, 2000) },
    )],
  }).catch(() => {});

  await sendCentralLog({
    action: 'TICKET MESSAGE',
    command: 'ADMIN_REPLY',
    user: 'SOLS Administrator',
    userId: ADMIN_ID,
    server: ticket.origin_server_name,
    serverId: ticket.server_id,
    result: 'SUCCESS',
    details: `Ticket ${ticketId} message forwarded to user.`,
  });
}

async function closeTicket(ticketId, closingAdminId = ADMIN_ID) {
  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
  if (!ticket) return;

  db.prepare('UPDATE tickets SET status = ?, closed_by = ?, closed_at = ? WHERE id = ?').run('CLOSED', closingAdminId, nowIso(), ticketId);

  const channel = client.channels.cache.get(ticket.admin_channel_id) || await client.channels.fetch(ticket.admin_channel_id).catch(() => null);
  if (channel) {
    await channel.send({ embeds: [createSystemEmbed('TICKET CLOSED', { color: 0x8b0000 }).addFields(
      { name: 'Ticket', value: ticketId },
      { name: 'Closed By', value: 'SOLS Administrator' },
      { name: 'Timestamp', value: formatTimestamp() },
    )] });
  }

  const user = await client.users.fetch(ticket.user_id).catch(() => null);
  if (user) {
    await user.send({ embeds: [createSystemEmbed('SOLS SUPPORT TICKET CLOSED', { color: 0x8b0000 }).addFields(
      { name: 'Ticket', value: ticketId },
      { name: 'Status', value: 'CLOSED' },
      { name: 'Timestamp', value: formatTimestamp() },
    )] }).catch(() => {});
  }

  activeTicketUsers.delete(ticket.user_id);

  await sendCentralLog({
    action: 'TICKET CLOSED',
    command: '/ticket',
    user: 'SOLS Administrator',
    userId: ADMIN_ID,
    server: ticket.origin_server_name,
    serverId: ticket.server_id,
    result: 'SUCCESS',
    details: `Ticket ${ticketId} closed and transcript archived.`,
  });
}

function formatAttachments(attachments) {
  if (!attachments || attachments.length === 0) return 'None';
  return attachments.map((attachment) => attachment.name || attachment.url || 'Attachment').join('\n');
}

async function createReportFromDm(message) {
  const pending = pendingReports.get(message.author.id);
  if (!pending) return;

  const guild = await client.guilds.fetch(pending.serverId).catch(() => null);
  const guildName = guild ? guild.name : pending.serverName;
  const reportId = nextSequenceId('REPORT', 'reports', 'id');
  const attachments = message.attachments.map((attachment) => ({
    name: attachment.name,
    id: attachment.id,
    url: attachment.url,
    contentType: attachment.contentType || 'unknown',
    size: attachment.size,
  }));
  const details = (message.content || '').trim() || 'No additional details were provided.';

  const mainGuild = client.guilds.cache.get(MAIN_SERVER_ID) || await client.guilds.fetch(MAIN_SERVER_ID).catch(() => null);
  if (!mainGuild) return;

  const reportChannelName = `report-${reportId.replace('REPORT-', '')}`;
  const reportChannel = await createAdminOnlyChannel(mainGuild, reportChannelName, ADMIN_ID);

  const reportEmbed = createSystemEmbed('SOLS SECURITY REPORT');
  reportEmbed.addFields(
    { name: 'Report', value: reportId, inline: true },
    { name: 'Reporter', value: message.author.tag || message.author.username, inline: true },
    { name: 'User ID', value: message.author.id, inline: true },
    { name: 'Origin Server', value: guildName, inline: true },
    { name: 'Server ID', value: pending.serverId, inline: true },
    { name: 'Reason', value: String(pending.reason || 'No reason supplied.'), inline: false },
    { name: 'Additional Details', value: details.substring(0, 1100), inline: false },
    { name: 'Attachments', value: formatAttachments(attachments), inline: false },
    { name: 'Timestamp', value: formatTimestamp(), inline: true },
    { name: 'Status', value: 'OPEN', inline: true },
  );

  await reportChannel.send({ embeds: [reportEmbed] });

  db.prepare(`
    INSERT INTO reports (id, user_id, username, server_id, origin_server_name, reason, additional_details, attachments, status, created_at, channel_id, file_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)
  `).run(
    reportId,
    message.author.id,
    message.author.tag || message.author.username,
    pending.serverId,
    guildName,
    pending.reason,
    details,
    JSON.stringify(attachments),
    nowIso(),
    reportChannel.id,
    attachments.length,
  );

  pendingReports.delete(message.author.id);

  await sendCentralLog({
    action: 'REPORT CREATED',
    command: '/report',
    user: message.author.username,
    userId: message.author.id,
    server: guildName,
    serverId: pending.serverId,
    result: 'SUCCESS',
    details: `Report ${reportId} submitted with ${attachments.length} attachment(s).`,
  });

  recordAudit({
    command: '/report',
    userName: message.author.username,
    userId: message.author.id,
    serverName: guildName,
    serverId: pending.serverId,
    result: 'SUCCESS',
    target: reportId,
    changesMade: 'Report opened',
    details: `Report reason: ${pending.reason}`,
  });

  await message.author.send({ embeds: [createSystemEmbed('SOLS SECURITY REPORT SUBMITTED').addFields(
    { name: 'Report', value: reportId },
    { name: 'Status', value: 'OPEN' },
  )] }).catch(() => {});
}

async function processReportSubmission(interaction, reason, details) {
  const guild = interaction.guild;
  const user = interaction.user;

  if (!guild || !isAuthorizedServer(guild.id)) {
    await denyServerAccess(interaction);
    return;
  }

  pendingReports.set(user.id, {
    serverId: guild.id,
    serverName: guild.name,
    reason,
    details,
    createdAt: nowIso(),
  });

  await user.send({
    embeds: [createSystemEmbed('SOLS SECURITY REPORT').addFields(
      { name: 'Notice', value: 'State the reason for this report and provide any relevant details.' },
      { name: 'Attachments', value: 'You may include screenshots, files, or additional evidence in your reply.' },
    )],
  }).catch(() => {});

  await interaction.reply({ content: 'Report intake has been initiated. Please check your DMs.', ephemeral: true });
}

async function getCommandListEmbed() {
  return createSystemEmbed('37TH DIGITAL SUPPORT TERMINAL').addFields(
    { name: 'PERSONNEL', value: '/personnel\n/clearance\n/roster', inline: true },
    { name: 'OPERATIONS', value: '/mission\n/deployment\n/briefing\n/orders', inline: true },
    { name: 'SECURITY', value: '/security\n/incident\n/report', inline: true },
    { name: 'SUPPORT', value: '/ticket\n/help', inline: true },
  );
}

async function registerSlashCommands() {
  const clientId = CLIENT_ID;
  if (!clientId || clientId === 'PASTE_YOUR_CLIENT_ID_HERE') {
    console.warn('CLIENT_ID is not configured. Slash commands were not registered.');
    return;
  }

  const commands = [
    { name: 'help', description: 'Display the SOLS command matrix.', type: 1 },
    { name: 'personnel', description: 'Search a SOCOM member profile.', options: [{ name: 'member', description: 'Member name or ID', type: 3, required: false }] },
    { name: 'roster', description: 'Display personnel associated with a division.', options: [{ name: 'division', description: 'Division name', type: 3, required: false }, { name: 'page', description: 'Roster page number', type: 4, required: false }] },
    { name: 'clearance', description: 'Display a user clearance level.', options: [{ name: 'member', description: 'Member name or ID', type: 3, required: false }] },
    { name: 'mission', description: 'Create or review a mission record.', options: [{ name: 'name', description: 'Mission name', type: 3, required: false }, { name: 'objective', description: 'Mission objective', type: 3, required: false }, { name: 'division', description: 'Division name', type: 3, required: false }, { name: 'status', description: 'Mission status', type: 3, required: false, choices: [{ name: 'PLANNED', value: 'PLANNED' }, { name: 'ACTIVE', value: 'ACTIVE' }, { name: 'COMPLETE', value: 'COMPLETE' }, { name: 'ABORTED', value: 'ABORTED' }] }] },
    { name: 'deployment', description: 'Track a personnel deployment.', options: [{ name: 'personnel', description: 'Personnel name', type: 3, required: false }, { name: 'unit', description: 'Unit name', type: 3, required: false }, { name: 'mission', description: 'Mission name', type: 3, required: false }, { name: 'status', description: 'Deployment status', type: 3, required: false }] },
    { name: 'briefing', description: 'Create an official briefing.', options: [{ name: 'title', description: 'Briefing title', type: 3, required: false }, { name: 'content', description: 'Briefing content', type: 3, required: false }, { name: 'division', description: 'Division', type: 3, required: false }, { name: 'priority', description: 'Priority', type: 3, required: false, choices: [{ name: 'ROUTINE', value: 'ROUTINE' }, { name: 'PRIORITY', value: 'PRIORITY' }, { name: 'URGENT', value: 'URGENT' }] }] },
    { name: 'orders', description: 'Create a roleplay order.', options: [{ name: 'order', description: 'Order details', type: 3, required: false }, { name: 'division', description: 'Division', type: 3, required: false }, { name: 'priority', description: 'Priority', type: 3, required: false, choices: [{ name: 'ROUTINE', value: 'ROUTINE' }, { name: 'PRIORITY', value: 'PRIORITY' }, { name: 'URGENT', value: 'URGENT' }] }] },
    { name: 'security', description: 'Display the security state of an authorized server.', options: [{ name: 'server_id', description: 'Target server ID', type: 3, required: false }] },
    { name: 'audit', description: 'Display recent administrative actions.', options: [{ name: 'limit', description: 'Maximum entries', type: 4, required: false }] },
    { name: 'authorize', description: 'Authorize a Discord server for SOLS access.', options: [{ name: 'server_id', description: 'Target server ID', type: 3, required: true }] },
    { name: 'revoke', description: 'Revoke SOCOM authorization from a server.', options: [{ name: 'server_id', description: 'Target server ID', type: 3, required: true }, { name: 'reason', description: 'Revocation reason', type: 3, required: false }] },
    { name: 'lockdown', description: 'Toggle server lockdown mode.', options: [{ name: 'server_id', description: 'Target server ID', type: 3, required: true }, { name: 'action', description: 'enable or disable', type: 3, required: true, choices: [{ name: 'ENABLE', value: 'enable' }, { name: 'DISABLE', value: 'disable' }] }, { name: 'reason', description: 'Reason for lockdown', type: 3, required: false }] },
    { name: 'incident', description: 'Create or review a security incident.', options: [{ name: 'server_id', description: 'Target server ID', type: 3, required: false }, { name: 'category', description: 'Incident category', type: 3, required: true, choices: [{ name: 'Unauthorized Access', value: 'Unauthorized Access' }, { name: 'Server Compromise', value: 'Server Compromise' }, { name: 'Bot Abuse', value: 'Bot Abuse' }, { name: 'Data Security', value: 'Data Security' }, { name: 'Personnel Issue', value: 'Personnel Issue' }, { name: 'Infrastructure Issue', value: 'Infrastructure Issue' }, { name: 'Suspicious Activity', value: 'Suspicious Activity' }, { name: 'Other', value: 'Other' }] }, { name: 'severity', description: 'Severity', type: 3, required: true, choices: [{ name: 'LOW', value: 'LOW' }, { name: 'MEDIUM', value: 'MEDIUM' }, { name: 'HIGH', value: 'HIGH' }, { name: 'CRITICAL', value: 'CRITICAL' }] }, { name: 'description', description: 'Incident summary', type: 3, required: true }] },
    { name: 'ticket', description: 'Open a SOLS support ticket.', type: 1 },
    { name: 'report', description: 'Submit a security report to SOLS.', type: 1 },
  ];

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log('Slash commands registered.');
}

async function handleCommand(interaction) {
  const commandName = interaction.commandName;
  const guild = interaction.guild;

  if (commandName === 'authorize' || commandName === 'revoke' || commandName === 'incident' || commandName === 'security' || commandName === 'lockdown') {
    if (!isSolsAdmin(interaction.user.id)) {
      await denyInteraction(interaction, 'SOLS authorization required.');
      return;
    }
  }

  if (commandName === 'authorize' && interaction.guildId === MAIN_SERVER_ID) {
    await interaction.reply({ content: 'This command is intended for a target server, not the headquarters.', ephemeral: true });
    return;
  }

  if (commandName !== 'authorize' && commandName !== 'revoke' && commandName !== 'security' && commandName !== 'lockdown' && commandName !== 'incident') {
    if (!guild || !isAuthorizedServer(guild.id)) {
      await denyServerAccess(interaction, 'This terminal is restricted to authorized SOCOM installations.');
      return;
    }
  }

  if (commandName === 'lockdown') {
    const action = interaction.options.getString('action');
    const targetServerId = interaction.options.getString('server_id');
    const targetGuild = targetServerId ? (client.guilds.cache.get(targetServerId) || await client.guilds.fetch(targetServerId).catch(() => null)) : guild;
    if (!targetGuild) {
      await interaction.reply({ embeds: [createSystemEmbed('SYSTEM ERROR', { color: 0x8b0000 }).addFields({ name: 'Status', value: 'The requested operation could not be completed.' })], ephemeral: true });
      return;
    }

    const reason = interaction.options.getString('reason') || 'SOLS lockdown directive';
    const enabled = action === 'enable';
    db.prepare('UPDATE servers SET lockdown_status = ?, security_status = ?, last_activity = ? WHERE server_id = ?').run(enabled ? 'LOCKDOWN' : 'NORMAL', enabled ? 'LOCKDOWN' : 'NORMAL', nowIso(), targetGuild.id);

    const embed = createSystemEmbed('SYSTEM LOCKDOWN', enabled ? { color: 0x8b0000 } : { color: 0x000000 });
    embed.addFields(
      { name: 'Server', value: targetGuild.name },
      { name: 'Lockdown Status', value: enabled ? 'LOCKDOWN' : 'NORMAL' },
      { name: 'Initiated By', value: 'SOLS Administrator' },
      { name: 'Timestamp', value: formatTimestamp() },
      { name: 'Reason', value: reason },
    );
    await interaction.reply({ embeds: [embed] });

    await sendCentralLog({
      action: 'SYSTEM LOCKDOWN',
      command: '/lockdown',
      user: interaction.user.username,
      userId: interaction.user.id,
      server: targetGuild.name,
      serverId: targetGuild.id,
      result: enabled ? 'LOCKDOWN' : 'REMOVED',
      details: reason,
    });

    recordAudit({
      command: '/lockdown',
      userName: interaction.user.username,
      userId: interaction.user.id,
      serverName: targetGuild.name,
      serverId: targetGuild.id,
      result: enabled ? 'LOCKDOWN' : 'NORMAL',
      target: targetGuild.id,
      changesMade: enabled ? 'Enabled lockdown' : 'Disabled lockdown',
      details: reason,
    });
    return;
  }

  if (commandName === 'authorize') {
    const targetServerId = interaction.options.getString('server_id');
    const guild = client.guilds.cache.get(targetServerId) || await client.guilds.fetch(targetServerId).catch(() => null);
    if (!guild) {
      await interaction.reply({ embeds: [createSystemEmbed('SYSTEM ERROR', { color: 0x8b0000 }).addFields({ name: 'Status', value: 'The requested operation could not be completed.' })], ephemeral: true });
      return;
    }

    db.prepare(`UPDATE servers SET authorization_status = 'AUTHORIZED', authorization_date = ?, authorized_by = 'SOLS Administrator', server_owner = ?, authorization_notes = 'Authorized by SOLS administrator', security_status = 'NORMAL', revocation_status = 'ACTIVE', lockdown_status = 'NORMAL', last_activity = ? WHERE server_id = ?`).run(nowIso(), guild.ownerId || 'UNKNOWN', nowIso(), guild.id);

    const embed = createSystemEmbed('AUTHORIZATION GRANTED');
    embed.addFields(
      { name: 'Server', value: guild.name },
      { name: 'Server ID', value: guild.id },
      { name: 'Status', value: 'AUTHORIZED' },
      { name: 'Authorized by', value: 'SOLS Administrator' },
      { name: 'Date', value: formatTimestamp() },
    );
    await interaction.reply({ embeds: [embed] });

    await sendCentralLog({
      action: 'SERVER AUTHORIZATION',
      command: '/authorize',
      user: interaction.user.username,
      userId: interaction.user.id,
      server: guild.name,
      serverId: guild.id,
      result: 'SUCCESS',
      details: `Authorized server ${guild.name} by SOLS Administrator.`,
    });

    recordAudit({
      command: '/authorize',
      userName: interaction.user.username,
      userId: interaction.user.id,
      serverName: guild.name,
      serverId: guild.id,
      result: 'SUCCESS',
      target: guild.id,
      changesMade: 'Authorized server',
      details: 'Authorization status set to AUTHORIZED.',
    });
    return;
  }

  if (commandName === 'revoke') {
    const targetServerId = interaction.options.getString('server_id');
    const reason = interaction.options.getString('reason') || 'Administrative revocation';
    const guild = client.guilds.cache.get(targetServerId) || await client.guilds.fetch(targetServerId).catch(() => null);
    if (!guild) {
      await interaction.reply({ embeds: [createSystemEmbed('SYSTEM ERROR', { color: 0x8b0000 }).addFields({ name: 'Status', value: 'The requested operation could not be completed.' })], ephemeral: true });
      return;
    }

    db.prepare(`UPDATE servers SET authorization_status = 'REVOKED', security_status = 'REVOKED', revocation_status = 'REVOKED', lockdown_status = 'NORMAL', last_activity = ? WHERE server_id = ?`).run(nowIso(), guild.id);

    const embed = createSystemEmbed('AUTHORIZATION REVOKED', { color: 0x8b0000 });
    embed.addFields(
      { name: 'Server', value: guild.name },
      { name: 'Status', value: 'REVOKED' },
      { name: 'Reason', value: reason },
    );
    await interaction.reply({ embeds: [embed] });

    await sendCentralLog({
      action: 'SERVER REVOCATION',
      command: '/revoke',
      user: interaction.user.username,
      userId: interaction.user.id,
      server: guild.name,
      serverId: guild.id,
      result: 'SUCCESS',
      details: `Authorization revoked. Reason: ${reason}`,
    });

    recordAudit({
      command: '/revoke',
      userName: interaction.user.username,
      userId: interaction.user.id,
      serverName: guild.name,
      serverId: guild.id,
      result: 'SUCCESS',
      target: guild.id,
      changesMade: 'Revoked authorization',
      details: reason,
    });
    return;
  }

  if (commandName === 'security') {
    const targetServerId = interaction.options.getString('server_id') || guild.id;
    const server = getServerRecord(targetServerId) || ensureServerRecord(guild);
    const recentIncidents = db.prepare('SELECT * FROM incidents WHERE server_id = ? ORDER BY created_at DESC LIMIT 5').all(targetServerId);
    const recentReports = db.prepare('SELECT * FROM reports WHERE server_id = ? ORDER BY created_at DESC LIMIT 5').all(targetServerId);
    const recentTickets = db.prepare('SELECT * FROM tickets WHERE server_id = ? ORDER BY created_at DESC LIMIT 5').all(targetServerId);

    const embed = createSystemEmbed('SOLS SECURITY DASHBOARD');
    embed.addFields(
      { name: 'Authorization Status', value: String(server.authorization_status || 'UNAUTHORIZED') },
      { name: 'Security Status', value: String(server.security_status || 'NORMAL') },
      { name: 'Bot Status', value: 'ONLINE' },
      { name: 'Configuration Status', value: String(server.current_configuration || '{}') },
      { name: 'Recent Incidents', value: recentIncidents.length ? recentIncidents.map((item) => `${item.id} (${item.status})`).join('\n') : 'None' },
      { name: 'Recent Reports', value: recentReports.length ? recentReports.map((item) => `${item.id} (${item.status})`).join('\n') : 'None' },
      { name: 'Recent Tickets', value: recentTickets.length ? recentTickets.map((item) => `${item.id} (${item.status})`).join('\n') : 'None' },
      { name: 'Last Activity', value: String(server.last_activity || 'Unknown') },
      { name: 'Security Alerts', value: server.lockdown_status === 'LOCKDOWN' ? 'LOCKDOWN ACTIVE' : 'No active alerts' },
      { name: 'Current Lockdown State', value: String(server.lockdown_status || 'NORMAL') },
    );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (commandName === 'incident') {
    const serverId = interaction.options.getString('server_id') || guild.id;
    const targetGuild = client.guilds.cache.get(serverId) || await client.guilds.fetch(serverId).catch(() => null);
    if (!targetGuild) {
      await interaction.reply({ embeds: [createSystemEmbed('SYSTEM ERROR', { color: 0x8b0000 }).addFields({ name: 'Status', value: 'The requested operation could not be completed.' })], ephemeral: true });
      return;
    }

    const incidentId = nextSequenceId('INC', 'incidents', 'id');
    const category = interaction.options.getString('category');
    const severity = interaction.options.getString('severity');
    const description = interaction.options.getString('description');
    const now = nowIso();

    db.prepare(`INSERT INTO incidents (id, server_id, server_name, category, severity, description, reporter_user_id, reporter_name, assigned_investigator, status, created_at, last_update, resolution, evidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SOLS Administrator', 'OPEN', ?, ?, 'Pending', '[]')`).run(incidentId, targetGuild.id, targetGuild.name, category, severity, description, interaction.user.id, interaction.user.username, now, now);

    const embed = createSystemEmbed('INCIDENT REGISTERED');
    embed.addFields(
      { name: 'Incident ID', value: incidentId },
      { name: 'Server', value: targetGuild.name },
      { name: 'Category', value: category },
      { name: 'Severity', value: severity },
      { name: 'Reporter', value: interaction.user.username },
      { name: 'Status', value: 'OPEN' },
      { name: 'Created', value: formatTimestamp() },
      { name: 'Description', value: description.substring(0, 1024) },
    );
    await interaction.reply({ embeds: [embed] });

    await sendCentralLog({
      action: 'INCIDENT OPENED',
      command: '/incident',
      user: interaction.user.username,
      userId: interaction.user.id,
      server: targetGuild.name,
      serverId: targetGuild.id,
      result: 'SUCCESS',
      details: `Incident ${incidentId} created (${category}/${severity}).`,
    });
    return;
  }

  if (commandName === 'ticket') {
    const modal = new ModalBuilder().setCustomId('ticket-modal').setTitle('SOLS SUPPORT TICKET');
    const descriptionInput = new TextInputBuilder()
      .setCustomId('ticket-description')
      .setLabel('Provide a brief description of your request.')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setPlaceholder('Brief description of issue or request.');
    modal.addComponents(new ActionRowBuilder().addComponents(descriptionInput));
    await interaction.showModal(modal);
    return;
  }

  if (commandName === 'report') {
    const reasonPrompt = new ModalBuilder().setCustomId('report-modal').setTitle('SOLS SECURITY REPORT');
    const reasonInput = new TextInputBuilder().setCustomId('report-reason').setLabel('State the reason for this report.').setStyle(TextInputStyle.Short).setRequired(true);
    const detailsInput = new TextInputBuilder().setCustomId('report-details').setLabel('Provide relevant details.').setStyle(TextInputStyle.Paragraph).setRequired(false);
    reasonPrompt.addComponents(new ActionRowBuilder().addComponents(reasonInput), new ActionRowBuilder().addComponents(detailsInput));
    await interaction.showModal(reasonPrompt);
    return;
  }

  if (commandName === 'help') {
    await interaction.reply({ embeds: [await getCommandListEmbed()] });
    return;
  }

  if (commandName === 'personnel') {
    const search = interaction.options.getString('member') || interaction.user.username;
    const row = db.prepare('SELECT * FROM personnel WHERE LOWER(username) LIKE ? OR LOWER(discord_id) LIKE ? ORDER BY created_at DESC LIMIT 1').get(`%${search.toLowerCase()}%`, `%${search.toLowerCase()}%`);
    if (!row) {
      await interaction.reply({ embeds: [createSystemEmbed('PERSONNEL RECORD').addFields({ name: 'Status', value: 'No matching personnel record found.' })] });
      return;
    }

    const embed = createSystemEmbed('PERSONNEL RECORD');
    embed.addFields(
      { name: 'Username', value: row.username },
      { name: 'Discord ID', value: row.discord_id },
      { name: 'SOCOM Rank', value: row.rank },
      { name: 'Division', value: row.division },
      { name: 'Clearance', value: row.clearance },
      { name: 'Service Status', value: row.service_status },
      { name: 'Join Date', value: row.join_date },
      { name: 'Notes', value: row.notes || 'No notes on file.' },
    );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (commandName === 'roster') {
    const division = interaction.options.getString('division') || 'ALL';
    const page = interaction.options.getInteger('page') || 1;
    const rows = division === 'ALL' ? db.prepare('SELECT * FROM personnel ORDER BY username ASC').all() : db.prepare('SELECT * FROM personnel WHERE division = ? ORDER BY username ASC').all(division);
    const perPage = 5;
    const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
    const pageRows = rows.slice((page - 1) * perPage, page * perPage);

    const embed = createSystemEmbed(`ROSTER // PAGE ${page}/${totalPages}`);
    embed.addFields({ name: 'Entries', value: pageRows.length ? pageRows.map((entry) => `${entry.rank} | ${entry.username} | ${entry.division} | ${entry.clearance} | ${entry.service_status}`).join('\n') : 'No personnel records found.' });
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (commandName === 'clearance') {
    const member = interaction.options.getString('member') || interaction.user.username;
    const row = db.prepare('SELECT * FROM personnel WHERE LOWER(username) LIKE ? OR LOWER(discord_id) LIKE ? ORDER BY created_at DESC LIMIT 1').get(`%${member.toLowerCase()}%`, `%${member.toLowerCase()}%`);
    if (!row) {
      await interaction.reply({ embeds: [createSystemEmbed('CLEARANCE').addFields({ name: 'Status', value: 'No clearance record found.' })] });
      return;
    }
    const embed = createSystemEmbed('CLEARANCE');
    embed.addFields(
      { name: 'User', value: row.username },
      { name: 'Clearance', value: row.clearance || 'LEVEL 1' },
    );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (commandName === 'mission') {
    const name = interaction.options.getString('name') || 'Mission Unknown';
    const objective = interaction.options.getString('objective') || 'Objective pending';
    const division = interaction.options.getString('division') || 'SOLS';
    const status = interaction.options.getString('status') || 'PLANNED';
    const missionId = nextSequenceId('MISSION', 'missions', 'id');
    db.prepare(`INSERT INTO missions (id, name, objective, assigned_personnel, division, status, start_time, end_time, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'No notes', ?)`).run(missionId, name, objective, interaction.user.username, division, status, nowIso(), nowIso(), nowIso());
    const embed = createSystemEmbed('MISSION REGISTERED');
    embed.addFields(
      { name: 'Mission ID', value: missionId },
      { name: 'Mission Name', value: name },
      { name: 'Objective', value: objective },
      { name: 'Assigned Personnel', value: interaction.user.username },
      { name: 'Division', value: division },
      { name: 'Status', value: status },
      { name: 'Start Time', value: formatTimestamp() },
    );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (commandName === 'deployment') {
    const personnel = interaction.options.getString('personnel') || interaction.user.username;
    const unit = interaction.options.getString('unit') || 'Unassigned';
    const mission = interaction.options.getString('mission') || 'No mission';
    const status = interaction.options.getString('status') || 'ACTIVE';
    const deploymentId = nextSequenceId('DEPLOY', 'deployments', 'id');
    db.prepare(`INSERT INTO deployments (id, personnel, unit, mission, deployment_status, start_time, end_time, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'No notes', ?)`).run(deploymentId, personnel, unit, mission, status, nowIso(), nowIso(), nowIso());
    const embed = createSystemEmbed('DEPLOYMENT RECORDED');
    embed.addFields(
      { name: 'Personnel', value: personnel },
      { name: 'Unit', value: unit },
      { name: 'Mission', value: mission },
      { name: 'Status', value: status },
      { name: 'Deployment ID', value: deploymentId },
    );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (commandName === 'briefing') {
    const title = interaction.options.getString('title') || 'Untitled Briefing';
    const content = interaction.options.getString('content') || 'No content.';
    const division = interaction.options.getString('division') || 'SOLS';
    const priority = interaction.options.getString('priority') || 'ROUTINE';
    const id = nextSequenceId('BRIEF', 'briefings', 'id');
    db.prepare(`INSERT INTO briefings (id, title, author, priority, content, division, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, title, interaction.user.username, priority, content, division, nowIso());
    const embed = createSystemEmbed('BRIEFING CREATED');
    embed.addFields(
      { name: 'Title', value: title },
      { name: 'Author', value: interaction.user.username },
      { name: 'Priority', value: priority },
      { name: 'Division', value: division },
      { name: 'Content', value: content.substring(0, 1000) },
    );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (commandName === 'orders') {
    const orderText = interaction.options.getString('order') || 'No order details provided.';
    const division = interaction.options.getString('division') || 'SOLS';
    const priority = interaction.options.getString('priority') || 'ROUTINE';
    const orderId = nextSequenceId('ORD', 'orders', 'id');
    db.prepare(`INSERT INTO orders (id, issuer, division, order_text, priority, status, created_at) VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?)`).run(orderId, interaction.user.username, division, orderText, priority, nowIso());
    const embed = createSystemEmbed('ORDER ISSUED');
    embed.addFields(
      { name: 'Order ID', value: orderId },
      { name: 'Issuer', value: interaction.user.username },
      { name: 'Division', value: division },
      { name: 'Priority', value: priority },
      { name: 'Order', value: orderText.substring(0, 1000) },
    );
    await interaction.reply({ embeds: [embed] });
    return;
  }

  if (commandName === 'audit') {
    const limit = interaction.options.getInteger('limit') || 10;
    const logs = db.prepare('SELECT * FROM audit_logs WHERE server_id = ? OR server_id = ? ORDER BY recorded_at DESC LIMIT ?').all(guild.id, 'N/A', limit);
    const embed = createSystemEmbed('AUDIT LOG');
    embed.addFields({ name: 'Entries', value: logs.length ? logs.map((entry) => `${entry.command} | ${entry.user_name} | ${entry.result} | ${entry.recorded_at}`).join('\n') : 'No audit entries found.' });
    await interaction.reply({ embeds: [embed] });
    return;
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.GuildMember],
});

global.client = client;

client.on('ready', async () => {
  console.log(`${SYSTEM_NAME} online.`);
  await registerSlashCommands();
  await sendCentralLog({
    action: 'BOT STARTUP',
    command: 'SYSTEM',
    user: 'SYSTEM',
    userId: 'SYSTEM',
    server: 'MAIN SERVER',
    serverId: MAIN_SERVER_ID,
    result: 'SUCCESS',
    details: 'Bot restarted and operational.',
  });
});

client.on('guildCreate', async (guild) => {
  ensureServerRecord(guild);

  if (guild.id === MAIN_SERVER_ID) {
    await sendCentralLog({ action: 'MAIN SERVER ONLINE', command: 'SYSTEM', user: 'SYSTEM', userId: 'SYSTEM', server: guild.name, serverId: guild.id, result: 'SUCCESS', details: 'SOLS headquarters connected.' });
    return;
  }

  if (!isAuthorizedServer(guild.id)) {
    await sendCentralLog({
      action: 'UNAUTHORIZED INSTALLATION',
      command: 'GUILD_CREATE',
      user: 'SYSTEM',
      userId: 'SYSTEM',
      server: guild.name,
      serverId: guild.id,
      result: 'DENIED',
      details: `Guild added without authorization. Owner: ${guild.ownerId || 'Unknown'}.`,
    });

    const systemChannel = guild.systemChannel || guild.channels.cache.find((channel) => channel.type === ChannelType.GuildText);
    if (systemChannel) {
      await systemChannel.send({ embeds: [createSystemEmbed('SYSTEM ACCESS DENIED', { color: 0x8b0000 }).addFields({ name: 'Notice', value: 'This terminal is restricted to authorized SOCOM installations.' })] }).catch(() => {});
    }
  }
});

client.on('guildDelete', async (guild) => {
  if (guild.id === MAIN_SERVER_ID) return;
  await sendCentralLog({
    action: 'SERVER DISCONNECT',
    command: 'GUILD_DELETE',
    user: 'SYSTEM',
    userId: 'SYSTEM',
    server: guild.name,
    serverId: guild.id,
    result: 'SUCCESS',
    details: 'The bot was removed or disconnected from the server.',
  });
});

client.on('guildMemberAdd', async (member) => {
  if (!isAuthorizedServer(member.guild.id)) return;
  await sendCentralLog({
    action: 'SERVER MEMBER JOIN',
    command: 'USER_JOIN',
    user: member.user.username,
    userId: member.user.id,
    server: member.guild.name,
    serverId: member.guild.id,
    result: 'SUCCESS',
    details: 'New member joined an authorized server.',
  });
});

client.on('guildMemberRemove', async (member) => {
  if (!isAuthorizedServer(member.guild.id)) return;
  await sendCentralLog({
    action: 'SERVER MEMBER LEAVE',
    command: 'USER_LEAVE',
    user: member.user.username,
    userId: member.user.id,
    server: member.guild.name,
    serverId: member.guild.id,
    result: 'SUCCESS',
    details: 'Member left an authorized server.',
  });
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() && !interaction.isModalSubmit()) return;

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'ticket-modal') {
      const description = interaction.fields.getTextInputValue('ticket-description');
      await createTicketForInteraction(interaction, description);
      return;
    }

    if (interaction.customId === 'report-modal') {
      const reason = interaction.fields.getTextInputValue('report-reason');
      const details = interaction.fields.getTextInputValue('report-details');
      await processReportSubmission(interaction, reason, details);
      return;
    }
  }

  if (interaction.isChatInputCommand()) {
    await handleCommand(interaction);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.channel.type === ChannelType.DM) {
    const pending = pendingReports.get(message.author.id);
    if (pending) {
      await createReportFromDm(message);
      return;
    }

    const ticketId = activeTicketUsers.get(message.author.id);
    if (ticketId) {
      const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
      if (ticket && ticket.status !== 'CLOSED') {
        const channel = client.channels.cache.get(ticket.admin_channel_id) || await client.channels.fetch(ticket.admin_channel_id).catch(() => null);
        if (channel) {
          const transcript = JSON.parse(ticket.transcript || '[]');
          const content = (message.content || '').trim() || 'Attachment message.';
          transcript.push({ type: 'user', sender: message.author.username, content, timestamp: nowIso() });
          db.prepare('UPDATE tickets SET transcript = ? WHERE id = ?').run(JSON.stringify(transcript), ticketId);
          await channel.send({ embeds: [createSystemEmbed('USER DM FORWARD').addFields(
            { name: 'Ticket', value: ticketId },
            { name: 'User', value: message.author.tag || message.author.username },
            { name: 'Message', value: content.substring(0, 2000) },
          )] });
        }
      }
      return;
    }
  }

  if (message.channel.type === ChannelType.GuildText && message.guildId === MAIN_SERVER_ID && ticketChannelToTicket.has(message.channel.id) && message.author.id === ADMIN_ID) {
    const ticketId = ticketChannelToTicket.get(message.channel.id);
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketId);
    if (!ticket || ticket.status === 'CLOSED') return;

    const text = message.content.trim();
    if (text.toLowerCase() === 'close' || text.toLowerCase().startsWith('!close')) {
      await closeTicket(ticketId, ADMIN_ID);
      return;
    }

    if (text.toLowerCase() === 'transcript' || text.toLowerCase().startsWith('!transcript')) {
      const transcript = JSON.parse(ticket.transcript || '[]');
      await message.channel.send({ embeds: [createSystemEmbed('TICKET TRANSCRIPT').addFields(
        { name: 'Ticket', value: ticketId },
        { name: 'Entries', value: transcript.length ? transcript.map((entry) => `${entry.sender}: ${entry.content}`).join('\n') : 'No transcript entries.' },
      )] });
      return;
    }

    if (text.toLowerCase() === 'userinfo' || text.toLowerCase().startsWith('!userinfo')) {
      const user = await client.users.fetch(ticket.user_id).catch(() => null);
      await message.channel.send({ embeds: [createSystemEmbed('USER INFORMATION').addFields(
        { name: 'User', value: user ? user.tag : ticket.username },
        { name: 'User ID', value: ticket.user_id },
        { name: 'Origin Server', value: ticket.origin_server_name },
        { name: 'Origin Server ID', value: ticket.server_id },
      )] });
      return;
    }

    if (text.toLowerCase() === 'serverinfo' || text.toLowerCase().startsWith('!serverinfo')) {
      await message.channel.send({ embeds: [createSystemEmbed('SERVER INFORMATION').addFields(
        { name: 'Server', value: ticket.origin_server_name },
        { name: 'Server ID', value: ticket.server_id },
        { name: 'Status', value: ticket.status },
      )] });
      return;
    }

    if (text.toLowerCase().startsWith('priority ')) {
      const priority = text.split(' ').slice(1).join(' ').toUpperCase();
      db.prepare('UPDATE tickets SET priority = ? WHERE id = ?').run(priority, ticketId);
      await message.channel.send({ embeds: [createSystemEmbed('PRIORITY UPDATED').addFields(
        { name: 'Ticket', value: ticketId },
        { name: 'Priority', value: priority },
      )] });
      return;
    }

    if (text) {
      await handleTicketAdminReply(message, ticketId);
    }
  }
});

initializeDatabase();

const token = DISCORD_TOKEN;
if (!token || token === 'PASTE_YOUR_BOT_TOKEN_HERE') {
  console.error('DISCORD_TOKEN is missing. Replace the placeholder token in src/index.js before starting the bot.');
  process.exit(1);
}

client.login(token).catch((error) => {
  console.error('Bot login failed:', error);
  process.exit(1);
});
