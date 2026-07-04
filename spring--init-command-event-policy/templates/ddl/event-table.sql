-- Audit-event table backing {{Context}}Event (implements domain.util's AuditEvent).
--
-- Run this once the {{context}} schema is provisioned. Until it exists the app still
-- boots (with spring.jpa.hibernate.ddl-auto=none); only the first Command invoke that
-- tries to persist an audit row will fail.
--
-- MySQL syntax (matches the MEDIUMTEXT / catalog usage in web.sales).
-- Adjust types for Postgres (TEXT, BOOLEAN) etc. as needed.

CREATE DATABASE IF NOT EXISTS `{{context}}`;

USE `{{context}}`;

CREATE TABLE IF NOT EXISTS `event` (
    `id`                 INT          NOT NULL AUTO_INCREMENT,
    `created_at`         DOUBLE       DEFAULT NULL,
    `request_id`         VARCHAR(255) DEFAULT NULL,
    `event_type`         VARCHAR(255) DEFAULT NULL,
    `payload`            TEXT,
    `event_order`        INT          DEFAULT NULL,
    `request_user_email` VARCHAR(255) DEFAULT NULL,
    `success`            TINYINT(1)   DEFAULT NULL,
    `failure_reason`     MEDIUMTEXT,
    PRIMARY KEY (`id`),
    KEY `idx_event_request_id`  (`request_id`),
    KEY `idx_event_created_at`  (`created_at`),
    KEY `idx_event_event_order` (`event_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
