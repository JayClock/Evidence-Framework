CREATE TABLE app_users (
    id VARCHAR(36) PRIMARY KEY,
    display_name VARCHAR(100) NOT NULL,
    constraint APP_USERS_DISPLAY_NAME_NOT_EMPTY CHECK (
        CHAR_LENGTH(TRIM(display_name)) > 0
    )
);
