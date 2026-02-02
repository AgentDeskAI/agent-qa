/**
 * Constants
 *
 * Centralized configuration defaults for agent-qa.
 */

// =============================================================================
// HTTP Agent Defaults
// =============================================================================

/** Default timeout for HTTP requests in milliseconds */
export const DEFAULT_HTTP_TIMEOUT_MS = 60000;

/** Default number of retry attempts (0 = no retries) */
export const DEFAULT_RETRY_COUNT = 0;

/** Default delay between retries in milliseconds */
export const DEFAULT_RETRY_DELAY_MS = 1000;

/** Default HTTP status codes to retry on */
export const DEFAULT_RETRYABLE_STATUS_CODES = [502, 503, 504] as const;

// =============================================================================
// Health Check Defaults
// =============================================================================

/** Default health check interval in milliseconds */
export const DEFAULT_HEALTH_CHECK_INTERVAL_MS = 1000;

/** Default timeout for health check operations in milliseconds */
export const DEFAULT_HEALTH_TIMEOUT_MS = 30000;

/** Default interval for port availability checks in milliseconds */
export const DEFAULT_PORT_CHECK_INTERVAL_MS = 500;

/** Default socket connection timeout in milliseconds */
export const DEFAULT_SOCKET_TIMEOUT_MS = 2000;

// =============================================================================
// Infrastructure Defaults
// =============================================================================

/** Default timeout for startup operations in milliseconds */
export const DEFAULT_STARTUP_TIMEOUT_MS = 60000;

/** Default timeout for Docker Compose startup in milliseconds */
export const DEFAULT_COMPOSE_STARTUP_TIMEOUT_MS = 60000;

/** Default timeout for PostgreSQL startup in milliseconds */
export const DEFAULT_POSTGRES_STARTUP_TIMEOUT_MS = 30000;

/** Default timeout for tunnel ready check in milliseconds */
export const DEFAULT_TUNNEL_READY_TIMEOUT_MS = 10000;

// =============================================================================
// Docker Defaults
// =============================================================================

/** Default PostgreSQL port */
export const DEFAULT_POSTGRES_PORT = 5432;

/** Default PostgreSQL Docker image */
export const DEFAULT_POSTGRES_IMAGE = 'postgres:16';

/** Default PostgreSQL container name */
export const DEFAULT_CONTAINER_NAME = 'agent-qa-postgres';

/** Default database name */
export const DEFAULT_DATABASE_NAME = 'agent_qa';

/** Default PostgreSQL username */
export const DEFAULT_POSTGRES_USER = 'postgres';

/** Default PostgreSQL password */
export const DEFAULT_POSTGRES_PASSWORD = 'postgres';

/** Default Docker Compose project name */
export const DEFAULT_COMPOSE_PROJECT_NAME = 'agent-qa';

/** Length of Docker container ID to display */
export const CONTAINER_ID_LENGTH = 12;

// =============================================================================
// Tmux Defaults
// =============================================================================

/** Default health endpoint path */
export const DEFAULT_HEALTH_ENDPOINT = '/health';

/** Default number of log lines to capture */
export const DEFAULT_LOG_LINES = 100;

// =============================================================================
// FRP Tunnel Defaults
// =============================================================================

/** Default tunnel name */
export const DEFAULT_TUNNEL_NAME = 'agent-qa';

/** Default FRP server port */
export const DEFAULT_FRP_SERVER_PORT = '7000';

/** Default remote port for tunnels */
export const DEFAULT_REMOTE_PORT = 4001;

/** Grace period after tunnel reports ready in milliseconds */
export const TUNNEL_GRACE_PERIOD_MS = 1000;

/** Interval for checking tunnel status in milliseconds */
export const TUNNEL_CHECK_INTERVAL_MS = 500;

// =============================================================================
// Wait/Polling Defaults
// =============================================================================

/** Default timeout for wait operations in seconds */
export const DEFAULT_WAIT_TIMEOUT_SECONDS = 30;

/** Default interval between wait polls in seconds */
export const DEFAULT_WAIT_INTERVAL_SECONDS = 1;

/** Interval for checking Docker Compose readiness in milliseconds */
export const COMPOSE_READINESS_INTERVAL_MS = 2000;

// =============================================================================
// Display Defaults
// =============================================================================

/** Default text truncation length for display */
export const TEXT_TRUNCATE_LENGTH = 50;

/** Text truncation length for debug output */
export const DEBUG_TEXT_TRUNCATE_LENGTH = 100;

// =============================================================================
// Config Defaults
// =============================================================================

/** Default user ID for testing */
export const DEFAULT_USER_ID = 'test-user';

/** Default reporter type */
export const DEFAULT_REPORTER = 'console' as const;

/** Default reporters array */
export const DEFAULT_REPORTERS = ['console'] as const;

/** Default user ID column name in database */
export const DEFAULT_USER_ID_COLUMN = 'userId';

/** Default chat endpoint path */
export const DEFAULT_CHAT_ENDPOINT = '/v1/chat';
