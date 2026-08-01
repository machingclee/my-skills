-- Audit-event table for {{Context}}Event (implements AuditEvent).
-- MySQL-oriented; for Postgres use SCHEMA instead of DATABASE and adjust types.

CREATE DATABASE IF NOT EXISTS `{{catalogOrSchema}}`;
USE `{{catalogOrSchema}}`;

CREATE TABLE IF NOT EXISTS `event` (
    `id`                 INT          NOT NULL AUTO_INCREMENT,
    `created_at`         DOUBLE       DEFAULT NULL,
    `request_id`         VARCHAR(255) DEFAULT NULL,
    `event_type`         VARCHAR(255) DEFAULT NULL,
    `payload`            TEXT,
    `event_order`        INT          DEFAULT NULL,
    `request_user_email` VARCHAR(255) DEFAULT NULL,
    `success`            TINYINT(1)   DEFAULT NULL,
    `failure_reason`     TEXT,
    PRIMARY KEY (`id`),
    KEY `idx_event_request_id`  (`request_id`),
    KEY `idx_event_created_at`  (`created_at`),
    KEY `idx_event_event_order` (`event_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
