CREATE TABLE sales_performance_agreements (
    agreement_id VARCHAR(64) PRIMARY KEY,
    signed_at TIMESTAMP NOT NULL
);

CREATE TABLE monthly_customer_contact_targets (
    request_id VARCHAR(64) PRIMARY KEY,
    agreement_id VARCHAR(64) NOT NULL,
    period_id VARCHAR(32) NOT NULL,
    started_at TIMESTAMP NOT NULL,
    expired_at TIMESTAMP NOT NULL,
    target_contact_count INT NOT NULL,
    target_phone_count INT NOT NULL,
    target_email_count INT NOT NULL,
    CONSTRAINT mcct_agreement_fk FOREIGN KEY (agreement_id)
    REFERENCES sales_performance_agreements (agreement_id),
    constraint MCCT_TARGETS_NON_NEGATIVE CHECK (
        target_contact_count >= 0
        AND target_phone_count >= 0
        AND target_email_count >= 0
    ),
    constraint MCCT_PERIOD_ORDER CHECK (started_at <= expired_at)
);

CREATE TABLE customer_contact_records (
    record_id VARCHAR(64) PRIMARY KEY,
    request_id VARCHAR(64) NOT NULL,
    agreement_id VARCHAR(64) NOT NULL,
    period_id VARCHAR(32) NOT NULL,
    customer_profile_id VARCHAR(64) NOT NULL,
    channel VARCHAR(16) NOT NULL,
    confirmed_at TIMESTAMP NOT NULL,
    CONSTRAINT ccr_target_fk FOREIGN KEY (request_id)
    REFERENCES monthly_customer_contact_targets (request_id),
    constraint CCR_CHANNEL CHECK (channel IN ('PHONE', 'EMAIL'))
);

CREATE TABLE sales_performance_idempotency (
    capability VARCHAR(128) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    request_digest VARCHAR(128) NOT NULL,
    resource_id VARCHAR(64) NOT NULL,
    PRIMARY KEY (capability, idempotency_key)
);
