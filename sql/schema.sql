CREATE TABLE IF NOT EXISTS admins (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 email VARCHAR(254) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL,
 role ENUM('owner','general_admin','payments_admin','analyst','moderator') NOT NULL,
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS users (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 telegram_id BIGINT UNIQUE NULL,
 email VARCHAR(254) UNIQUE NULL,
 display_name VARCHAR(120) NULL,
 account_status ENUM('active','blacklisted') NOT NULL DEFAULT 'active',
 blacklist_reason VARCHAR(350) NULL,
 blacklisted_at DATETIME NULL,
 blacklisted_by BIGINT UNSIGNED NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS plans (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 name VARCHAR(100) NOT NULL,
 duration_days INT UNSIGNED NOT NULL,
 price_pen DECIMAL(10,2) NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS memberships (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 plan_id BIGINT UNSIGNED NOT NULL,
 status ENUM('pending','active','expired','cancelled') NOT NULL DEFAULT 'pending',
 starts_at DATETIME NULL,
 ends_at DATETIME NULL,
 source ENUM('payment','manual') NOT NULL DEFAULT 'payment',
 granted_by BIGINT UNSIGNED NULL,
 grant_reason VARCHAR(350) NULL,
 revoked_at DATETIME NULL,
 revoked_by BIGINT UNSIGNED NULL,
 revoke_reason VARCHAR(350) NULL,
 archived_at DATETIME NULL,
 archived_by BIGINT UNSIGNED NULL,
 archive_reason VARCHAR(350) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (user_id) REFERENCES users(id),
 FOREIGN KEY (plan_id) REFERENCES plans(id),
 INDEX idx_memberships_expiry(status,ends_at)
);
CREATE TABLE IF NOT EXISTS payments (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 membership_id BIGINT UNSIGNED NULL,
 method ENUM('yape','plin','card','direct','telegram_stars') NOT NULL,
 amount_pen DECIMAL(10,2) NOT NULL,
 status ENUM('pending','verified','rejected','refunded') NOT NULL DEFAULT 'pending',
 external_reference VARCHAR(190) NULL,
 verified_by BIGINT UNSIGNED NULL,
 verified_at DATETIME NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (user_id) REFERENCES users(id),
 FOREIGN KEY (membership_id) REFERENCES memberships(id),
 FOREIGN KEY (verified_by) REFERENCES admins(id)
);
CREATE TABLE IF NOT EXISTS predictions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 title VARCHAR(200) NOT NULL,
 analysis TEXT NOT NULL,
 visibility ENUM('free','vip') NOT NULL DEFAULT 'free',
 outcome ENUM('pending','won','lost','void') NOT NULL DEFAULT 'pending',
 settlement_source VARCHAR(60) NULL,
 settlement_score VARCHAR(9) NULL,
 settled_at DATETIME NULL,
 published_at DATETIME NULL,
 author_id BIGINT UNSIGNED NOT NULL,
 FOREIGN KEY (author_id) REFERENCES admins(id)
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 actor_admin_id BIGINT UNSIGNED NULL,
 action VARCHAR(100) NOT NULL,
 entity_type VARCHAR(100) NOT NULL,
 entity_id VARCHAR(100) NULL,
 details JSON NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (actor_admin_id) REFERENCES admins(id)
);

-- v1.9.0: verified PayPal events, incident review and internal client alerts.
CREATE TABLE IF NOT EXISTS paypal_webhook_events (
 environment ENUM('sandbox','live') NOT NULL,
 event_id VARCHAR(100) NOT NULL,
 event_type VARCHAR(100) NOT NULL,
 outcome ENUM('processed','unmatched','ignored') NOT NULL DEFAULT 'processed',
 received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (environment,event_id)
);
CREATE TABLE IF NOT EXISTS paypal_incidents (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 payment_id BIGINT UNSIGNED NOT NULL,
 event_id VARCHAR(100) NOT NULL,
 resource_id VARCHAR(100) NULL,
 kind ENUM('refund','dispute','reversal') NOT NULL,
 amount_usd DECIMAL(10,2) NULL,
 notes VARCHAR(250) NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_paypal_incident_event (event_id),
 UNIQUE KEY uq_paypal_refund_resource (payment_id,kind,resource_id),
 FOREIGN KEY (payment_id) REFERENCES payments(id)
);
CREATE TABLE IF NOT EXISTS customer_notifications (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 user_id BIGINT UNSIGNED NOT NULL,
 payment_id BIGINT UNSIGNED NULL,
 kind VARCHAR(40) NOT NULL,
 message VARCHAR(300) NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_client_notification (payment_id,kind),
 FOREIGN KEY (user_id) REFERENCES users(id),
 FOREIGN KEY (payment_id) REFERENCES payments(id)
);
