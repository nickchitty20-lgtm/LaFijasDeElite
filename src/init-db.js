import { readFile } from 'node:fs/promises';
import { db } from './db.js';

export async function initializeDatabase() {
  const schema = await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');
  const statements = schema.split(';').map(s => s.trim()).filter(Boolean);
  const connection = await db.getConnection();
  try {
    for (const statement of statements) {
      await connection.query(statement);
    }
    const [cols] = await connection.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='predictions'");
    const existing = new Set(cols.map(c=>c.COLUMN_NAME));
    const additions = {
      league:'VARCHAR(120) NULL', match_date:'DATETIME NULL', market:'VARCHAR(120) NULL',
      selection:'VARCHAR(160) NULL', odds:'DECIMAL(8,2) NULL',
      telegram_status:"ENUM('pending','sent','failed','not_configured') NOT NULL DEFAULT 'pending'",
      archived_at:'DATETIME NULL', archived_by:'BIGINT UNSIGNED NULL', archive_reason:'VARCHAR(350) NULL',
      settlement_source:'VARCHAR(60) NULL',settlement_score:'VARCHAR(9) NULL',settled_at:'DATETIME NULL'
    };
    for (const [name,definition] of Object.entries(additions)) {
      if (!existing.has(name)) await connection.query(`ALTER TABLE predictions ADD COLUMN ${name} ${definition}`);
    }
    const [userCols]=await connection.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users'");
    if(!userCols.some(c=>c.COLUMN_NAME==='password_hash')) await connection.query('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL');
    // Safe, additive migration: preserve all existing customers, payments and VIP periods.
    const accountColumns = {
      account_status: "ENUM('active','blacklisted') NOT NULL DEFAULT 'active'",
      blacklist_reason: 'VARCHAR(350) NULL',
      blacklisted_at: 'DATETIME NULL',
      blacklisted_by: 'BIGINT UNSIGNED NULL'
    };
    for(const [column,definition] of Object.entries(accountColumns)){
      if(!userCols.some(c=>c.COLUMN_NAME===column))
        await connection.query(`ALTER TABLE users ADD COLUMN ${column} ${definition}`);
    }

    // Additional fields for manual VIP grants and auditable revocations.
    // Existing memberships default to source=payment; no historical rows are deleted.
    const [membershipCols] = await connection.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='memberships'");
    const membershipNames = new Set(membershipCols.map(c=>c.COLUMN_NAME));
    const vipColumns = {
      source: "ENUM('payment','manual') NOT NULL DEFAULT 'payment'",
      granted_by: 'BIGINT UNSIGNED NULL',
      grant_reason: 'VARCHAR(350) NULL',
      revoked_at: 'DATETIME NULL',
      revoked_by: 'BIGINT UNSIGNED NULL',
      revoke_reason: 'VARCHAR(350) NULL',
      archived_at: 'DATETIME NULL',
      archived_by: 'BIGINT UNSIGNED NULL',
      archive_reason: 'VARCHAR(350) NULL'
    };
    for (const [column,definition] of Object.entries(vipColumns)) {
      if(!membershipNames.has(column)) await connection.query(`ALTER TABLE memberships ADD COLUMN ${column} ${definition}`);
    }

    // Payment provenance: old Sandbox records stay legacy. NEVER label them Live.
    const [paymentCols] = await connection.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='payments'");
    const paymentNames = new Set(paymentCols.map(c=>c.COLUMN_NAME));
    const financialColumns = {
      paypal_environment: "ENUM('legacy','sandbox','live') NOT NULL DEFAULT 'legacy'",
      paypal_amount_usd: 'DECIMAL(10,2) NULL',
      paypal_capture_id: 'VARCHAR(100) NULL',
      paypal_financial_state: "ENUM('none','captured','partially_refunded','refunded','disputed','reversed') NOT NULL DEFAULT 'none'",
      paypal_issue_at: 'DATETIME NULL'
    };
    for (const [column, definition] of Object.entries(financialColumns)) {
      if (!paymentNames.has(column)) await connection.query(`ALTER TABLE payments ADD COLUMN ${column} ${definition}`);
    }
    const [indices] = await connection.query("SHOW INDEX FROM payments WHERE Key_name = 'uq_paypal_capture_id'");
    if (!indices.length) await connection.query('CREATE UNIQUE INDEX uq_paypal_capture_id ON payments(paypal_capture_id)');

    // v2.1.0: evidence-backed football proposals, safe additive tables.
    await connection.query(`CREATE TABLE IF NOT EXISTS football_scans (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      status ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME NULL,
      examined INT UNSIGNED NOT NULL DEFAULT 0,
      drafts_created INT UNSIGNED NOT NULL DEFAULT 0,
      error_message VARCHAR(200) NULL
    ) ENGINE=InnoDB`);
    // v2.1.3: persistent manual-scan limits and last-scan reasons.
    const [scanColumns]=await connection.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='football_scans'");
    const scanNames=new Set(scanColumns.map(c=>c.COLUMN_NAME));
    const footballScanColumns={initiated_by:"ENUM('manual','scheduled') NOT NULL DEFAULT 'scheduled'",window_matches:'INT UNSIGNED NOT NULL DEFAULT 0',without_prediction:'INT UNSIGNED NOT NULL DEFAULT 0',below_filters:'INT UNSIGNED NOT NULL DEFAULT 0',provider_errors:'INT UNSIGNED NOT NULL DEFAULT 0',qualified:'INT UNSIGNED NOT NULL DEFAULT 0',already_present:'INT UNSIGNED NOT NULL DEFAULT 0',recently_skipped:'INT UNSIGNED NOT NULL DEFAULT 0'};
    for(const [name,definition] of Object.entries(footballScanColumns))if(!scanNames.has(name))
      await connection.query(`ALTER TABLE football_scans ADD COLUMN ${name} ${definition}`);
    // Release stale scans after an interrupted Railway deployment.
    await connection.query("UPDATE football_scans SET status='failed',finished_at=UTC_TIMESTAMP(),error_message='Escaneo interrumpido por reinicio' WHERE status='running' AND started_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 20 MINUTE)");
    await connection.query(`CREATE TABLE IF NOT EXISTS football_candidates (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      provider VARCHAR(40) NOT NULL,
      fixture_id BIGINT UNSIGNED NOT NULL,
      visibility ENUM('free','vip') NOT NULL,
      home_team VARCHAR(120) NOT NULL,
      away_team VARCHAR(120) NOT NULL,
      league VARCHAR(120) NOT NULL,
      kickoff DATETIME NOT NULL,
      market VARCHAR(120) NOT NULL,
      selection VARCHAR(160) NOT NULL,
      provider_probability DECIMAL(5,2) NOT NULL,
      odds DECIMAL(8,2) NULL,
      analysis TEXT NOT NULL,
      evidence_json JSON NOT NULL,
      status ENUM('draft','published','discarded') NOT NULL DEFAULT 'draft',
      prediction_id BIGINT UNSIGNED NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      published_at DATETIME NULL,
      UNIQUE KEY uq_football_fixture (provider,fixture_id),
      INDEX idx_football_pending (status,kickoff),
      FOREIGN KEY (prediction_id) REFERENCES predictions(id)
    ) ENGINE=InnoDB`);

    // v3.0.0: open-data local engine. Additive; NEVER deletes existing API-football
    // proposals, subscriptions, PayPal receipts or Telegram memberships.
    await connection.query(`CREATE TABLE IF NOT EXISTS nforce_matches (
      id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      source_key VARCHAR(350) NOT NULL UNIQUE,
      competition VARCHAR(20) NOT NULL,
      league VARCHAR(120) NOT NULL,
      season VARCHAR(12) NOT NULL,
      round_name VARCHAR(90) NULL,
      home_team VARCHAR(120) NOT NULL,
      away_team VARCHAR(120) NOT NULL,
      match_date DATE NOT NULL,
      kickoff DATETIME NULL,
      scheduled_time_known BOOLEAN NOT NULL DEFAULT FALSE,
      home_goals SMALLINT UNSIGNED NULL,
      away_goals SMALLINT UNSIGNED NULL,
      source_path VARCHAR(100) NOT NULL,
      source_checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_nforce_date (match_date),
      INDEX idx_nforce_kickoff (kickoff),
      INDEX idx_nforce_club (competition,home_team,match_date)
    ) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE IF NOT EXISTS nforce_import_runs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      status ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME NULL,
      sources INT UNSIGNED NOT NULL DEFAULT 0,
      records INT UNSIGNED NOT NULL DEFAULT 0,
      scheduled INT UNSIGNED NOT NULL DEFAULT 0,
      completed_results INT UNSIGNED NOT NULL DEFAULT 0,
      errors_json TEXT NULL
    ) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE IF NOT EXISTS nforce_scans (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      status ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
      initiated_by ENUM('manual','scheduled') NOT NULL DEFAULT 'scheduled',
      started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME NULL,
      upcoming INT UNSIGNED NOT NULL DEFAULT 0,
      modeled INT UNSIGNED NOT NULL DEFAULT 0,
      drafts INT UNSIGNED NOT NULL DEFAULT 0,
      insufficient INT UNSIGNED NOT NULL DEFAULT 0,
      filtered INT UNSIGNED NOT NULL DEFAULT 0,
      error_message VARCHAR(200) NULL
    ) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE IF NOT EXISTS nforce_backtests (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      model_version VARCHAR(80) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      evaluated INT UNSIGNED NOT NULL,
      accuracy DECIMAL(6,2) NULL,
      brier DECIMAL(7,5) NULL,
      logloss DECIMAL(7,5) NULL,
      metrics_json JSON NOT NULL
    ) ENGINE=InnoDB`);
    await connection.query("UPDATE nforce_scans SET status='failed',finished_at=UTC_TIMESTAMP(),error_message='Interrumpido por reinicio' WHERE status='running' AND started_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 20 MINUTE)");
    await connection.query("UPDATE nforce_import_runs SET status='failed',finished_at=UTC_TIMESTAMP(),errors_json='[\"Interrumpido por reinicio\"]' WHERE status='running' AND started_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 MINUTE)");

    // v2.2.1: avoid repeatedly spending Free calls on unsupported fixtures.
    // Missing predictions retry after 6h; filtered models after 8h.
    await connection.query(`CREATE TABLE IF NOT EXISTS football_fixture_checks (
      provider VARCHAR(40) NOT NULL DEFAULT 'api-football',
      fixture_id BIGINT UNSIGNED NOT NULL,
      reason ENUM('no_prediction','below_filters') NOT NULL,
      checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      next_retry_at DATETIME NOT NULL,
      PRIMARY KEY (provider,fixture_id),
      INDEX idx_football_fixture_retry (next_retry_at)
    ) ENGINE=InnoDB`);

    // Legacy v2.1.7 weekly VIP preview gate (preserved for compatibility).
    // v2.1.8 no longer uses this gate; per-publication records are below.
    await connection.query(`CREATE TABLE IF NOT EXISTS telegram_vip_teaser_gate (
      id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
      reserved_at DATETIME NULL,
      sent_at DATETIME NULL,
      prediction_id BIGINT UNSIGNED NULL,
      send_state ENUM('reserved','sent','failed') NULL
    ) ENGINE=InnoDB`);
    await connection.query('INSERT IGNORE INTO telegram_vip_teaser_gate (id) VALUES (1)');

    // v2.1.8: one public VIP preview per newly published VIP prediction.
    // The old weekly gate remains for compatibility but is no longer used.
    // INSERT IGNORE by prediction_id prevents repeated previews on reprocessing.
    await connection.query(`CREATE TABLE IF NOT EXISTS telegram_vip_public_announcements (
      prediction_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      state ENUM('reserved','sent','failed') NOT NULL DEFAULT 'reserved',
      reserved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME NULL,
      telegram_message_id BIGINT NULL,
      chat_id BIGINT NULL,
      FOREIGN KEY (prediction_id) REFERENCES predictions(id)
    ) ENGINE=InnoDB`);

    // v3.2.8.2: brief discussion-group announcements; never full predictions.
    // Unique prediction ID reserves one announcement even across Railway restarts.
    await connection.query(`CREATE TABLE IF NOT EXISTS telegram_community_announcements (
      prediction_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      visibility ENUM('free','vip') NOT NULL,
      chat_id BIGINT NOT NULL,
      state ENUM('reserved','sent','failed') NOT NULL DEFAULT 'reserved',
      reserved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME NULL,
      message_id BIGINT NULL,
      removed_at DATETIME NULL,
      removal_error VARCHAR(200) NULL,
      FOREIGN KEY (prediction_id) REFERENCES predictions(id)
    ) ENGINE=InnoDB`);

    // v2.1.9: durable IDs for Telegram messages. Never hard-delete predictions;
    // football candidates and notification events reference them.
    await connection.query(`CREATE TABLE IF NOT EXISTS telegram_prediction_messages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      prediction_id BIGINT UNSIGNED NOT NULL,
      kind ENUM('free','vip') NOT NULL,
      chat_id BIGINT NOT NULL,
      message_id BIGINT NOT NULL,
      removed_at DATETIME NULL,
      removal_error VARCHAR(200) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_prediction_telegram_kind (prediction_id,kind),
      FOREIGN KEY (prediction_id) REFERENCES predictions(id)
    ) ENGINE=InnoDB`);
    const [teaserColumns]=await connection.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='telegram_vip_public_announcements'");
    const teaserExisting=new Set(teaserColumns.map(c=>c.COLUMN_NAME));
    if(!teaserExisting.has('chat_id'))await connection.query('ALTER TABLE telegram_vip_public_announcements ADD COLUMN chat_id BIGINT NULL');
    if(!teaserExisting.has('removed_at'))await connection.query('ALTER TABLE telegram_vip_public_announcements ADD COLUMN removed_at DATETIME NULL');
    if(!teaserExisting.has('removal_error'))await connection.query('ALTER TABLE telegram_vip_public_announcements ADD COLUMN removal_error VARCHAR(200) NULL');

    // v1.9.1: Telegram identity linking and time-limited join requests.
    // Never stores bot credentials or plaintext one-time linking codes.
    await connection.query(`CREATE TABLE IF NOT EXISTS telegram_links (
      user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      telegram_user_id BIGINT NOT NULL UNIQUE,
      telegram_username VARCHAR(100) NULL,
      is_member BOOLEAN NOT NULL DEFAULT FALSE,
      linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_verified_at DATETIME NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    // v2.0.1: a detached link keeps the former Telegram ID reserved until it leaves
    // the VIP channel. This does NOT ban, expel or silently grant a second VIP seat.
    const [telegramLinkColumns]=await connection.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='telegram_links'");
    if(!telegramLinkColumns.some(c=>c.COLUMN_NAME==='link_status'))
      await connection.query("ALTER TABLE telegram_links ADD COLUMN link_status ENUM('active','detached') NOT NULL DEFAULT 'active'");
    await connection.query(`CREATE TABLE IF NOT EXISTS telegram_unlink_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      telegram_user_id BIGINT NOT NULL,
      performed_by ENUM('customer','owner') NOT NULL,
      actor_admin_id BIGINT UNSIGNED NULL,
      reason VARCHAR(250) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_telegram_unlink_user (user_id,created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);

    // v2.0.4: owner-authorized detach/relink without expelling the prior subscriber.
    // Each customer may retain at most ONE prior Telegram member; records survive restarts.
    // The old member is never allowed to use a new invitation without an active link.
    await connection.query(`CREATE TABLE IF NOT EXISTS telegram_owner_preserved (
      telegram_user_id BIGINT NOT NULL PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL UNIQUE,
      actor_admin_id BIGINT UNSIGNED NOT NULL,
      reason VARCHAR(250) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_telegram_owner_preserved_user (user_id)
    ) ENGINE=InnoDB`);

    await connection.query(`CREATE TABLE IF NOT EXISTS telegram_link_tokens (
      user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE IF NOT EXISTS telegram_vip_invites (
      user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      invite_hash CHAR(64) NOT NULL,
      invite_link VARCHAR(512) NULL,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);

    // v1.9.3: store the short-lived link only so Telegram can revoke it.
    // Never expose this value in logs or administrative responses.
    const [inviteCols]=await connection.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='telegram_vip_invites'");
    if(!inviteCols.some(c=>c.COLUMN_NAME==='invite_link'))
      await connection.query('ALTER TABLE telegram_vip_invites ADD COLUMN invite_link VARCHAR(512) NULL');

    // v1.9.2: one pending Telegram replacement per customer; cooldown and audit persist.
    // The old link remains reserved while a replacement is pending, but no longer grants channel access.
    await connection.query(`CREATE TABLE IF NOT EXISTS telegram_change_state (
      user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      status ENUM('idle','awaiting_new') NOT NULL DEFAULT 'idle',
      old_telegram_user_id BIGINT NULL,
      pending_token_hash CHAR(64) NULL UNIQUE,
      pending_expires_at DATETIME NULL,
      last_issue_at DATETIME NULL,
      last_changed_at DATETIME NULL,
      cooldown_until DATETIME NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE IF NOT EXISTS telegram_change_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      event_type ENUM('requested','reissued','completed','owner_exception') NOT NULL,
      old_telegram_user_id BIGINT NULL,
      new_telegram_user_id BIGINT NULL,
      actor_admin_id BIGINT UNSIGNED NULL,
      detail VARCHAR(250) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_telegram_change_user (user_id,created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);

    // v1.9.4: known-channel-member ledger. Telegram Bot API cannot list all subscribers.
    // Track updates and audit known IDs after each restart; never fabricate unknown IDs.
    await connection.query(`CREATE TABLE IF NOT EXISTS telegram_channel_members (
      telegram_user_id BIGINT NOT NULL PRIMARY KEY,
      state ENUM('member','left') NOT NULL DEFAULT 'member',
      last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_checked_at DATETIME NULL,
      last_error VARCHAR(250) NULL,
      INDEX idx_telegram_channel_audit(state,last_checked_at)
    ) ENGINE=InnoDB`);
    // Seed members tracked in previous releases without altering their VIP entitlements.
    await connection.query(`INSERT IGNORE INTO telegram_channel_members(telegram_user_id,state)
      SELECT telegram_user_id,'member' FROM telegram_links`);

    // v1.9.5: durable queue for Rank 0 bans and lifts. Retries after Railway restarts
    // and Telegram outages. A release is NOT an automatic VIP invitation.
    await connection.query(`CREATE TABLE IF NOT EXISTS telegram_rank0_actions (
      user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      telegram_user_id BIGINT NOT NULL,
      action ENUM('ban','unban') NOT NULL,
      attempts INT UNSIGNED NOT NULL DEFAULT 0,
      last_error VARCHAR(250) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_telegram_rank0_retry(updated_at)
    ) ENGINE=InnoDB`);

    // v2.0: Opt-in Telegram DM notification centre with durable, deduplicated outbox.
    await connection.query(`CREATE TABLE IF NOT EXISTS telegram_notice_prefs (
      user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
      vip_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      expiry_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      picks_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE IF NOT EXISTS telegram_notice_outbox (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT UNSIGNED NOT NULL,
      kind ENUM('vip_activated','vip_expiring','new_prediction') NOT NULL,
      reference_key VARCHAR(120) NOT NULL,
      message VARCHAR(650) NOT NULL,
      requires_vip BOOLEAN NOT NULL DEFAULT FALSE,
      status ENUM('pending','sending','sent','failed','disabled') NOT NULL DEFAULT 'pending',
      attempts INT UNSIGNED NOT NULL DEFAULT 0,
      retry_after DATETIME NULL,
      lease_id VARCHAR(36) NULL,
      leased_at DATETIME NULL,
      last_error VARCHAR(250) NULL,
      sent_at DATETIME NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_telegram_notification (user_id,kind,reference_key),
      INDEX idx_telegram_outbox_queue(status,retry_after,leased_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);
    await connection.query(`CREATE TABLE IF NOT EXISTS telegram_notice_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      prediction_id BIGINT UNSIGNED NOT NULL UNIQUE,
      visibility ENUM('free','vip') NOT NULL,
      last_user_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
      status ENUM('pending','done') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (prediction_id) REFERENCES predictions(id) ON DELETE CASCADE
    ) ENGINE=InnoDB`);

    // Planes iniciales: se insertan solo cuando no existe otro con el mismo nombre.
    // Nunca se modifican precios ni duraciones configurados por un administrador.
    const starterPlans = [
      ['VIP Semanal', 7, 15],
      ['VIP Mensual', 30, 45],
      ['VIP Trimestral', 90, 120]
    ];
    for (const [name, duration, price] of starterPlans) {
      const [rows] = await connection.execute('SELECT id FROM plans WHERE name = ? LIMIT 1', [name]);
      if (rows.length === 0) {
        await connection.execute('INSERT INTO plans (name, duration_days, price_pen, active) VALUES (?, ?, ?, 1)', [name, duration, price]);
        console.log(`Starter plan created: ${name}`);
      }
    }
    console.log('Customer columns ready');
    console.log('Prediction columns ready');
    console.log(`Database schema ready (${statements.length} tables checked)`);
  } finally {
    connection.release();
  }
}
