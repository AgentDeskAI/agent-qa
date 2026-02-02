/**
 * Compose Generator
 *
 * Generates Docker Compose files for instance-specific Milvus deployments.
 */

import { join } from 'node:path';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';

import { INFRASTRUCTURE_CONFIG } from './config.js';

/**
 * Options for generating a Milvus compose file.
 */
export interface MilvusComposeOptions {
  /** Instance ID */
  instanceId: number;
  /** Milvus port to expose */
  milvusPort: number;
  /** Output directory for the compose file */
  outputDir: string;
  /** Container name prefix */
  containerPrefix?: string;
  /** Volume name prefix */
  volumePrefix?: string;
}

/**
 * Generate a Milvus Docker Compose file for an instance.
 *
 * The generated file uses instance-specific:
 * - Container names (agentqa-{instanceId}-milvus)
 * - Ports (19532 + instanceId)
 * - Volume names (agentqa-{instanceId}-milvus-data)
 * - Network (agentqa-{instanceId}-network)
 */
export function generateMilvusCompose(options: MilvusComposeOptions): string {
  const {
    instanceId,
    milvusPort,
    outputDir,
    containerPrefix = INFRASTRUCTURE_CONFIG.containerPrefix,
    volumePrefix = INFRASTRUCTURE_CONFIG.containerPrefix,
  } = options;

  const containerName = `${containerPrefix}-${instanceId}-milvus`;
  const etcdContainerName = `${containerPrefix}-${instanceId}-milvus-etcd`;
  const minioContainerName = `${containerPrefix}-${instanceId}-milvus-minio`;
  const volumeName = `${volumePrefix}-${instanceId}-milvus`;
  const networkName = `${containerPrefix}-${instanceId}-network`;

  // Generate the compose file content
  // This is a standalone Milvus deployment optimized for testing
  const composeContent = `# AgentQA Milvus Instance ${instanceId}
# Auto-generated - do not edit manually
# Port: ${milvusPort}

services:
  etcd:
    container_name: ${etcdContainerName}
    image: quay.io/coreos/etcd:v3.5.5
    environment:
      - ETCD_AUTO_COMPACTION_MODE=revision
      - ETCD_AUTO_COMPACTION_RETENTION=1000
      - ETCD_QUOTA_BACKEND_BYTES=4294967296
      - ETCD_SNAPSHOT_COUNT=50000
    volumes:
      - ${volumeName}-etcd:/etcd
    command: etcd -advertise-client-urls=http://127.0.0.1:2379 -listen-client-urls http://0.0.0.0:2379 --data-dir /etcd
    healthcheck:
      test: ["CMD", "etcdctl", "endpoint", "health"]
      interval: 30s
      timeout: 20s
      retries: 3
    networks:
      - ${networkName}

  minio:
    container_name: ${minioContainerName}
    image: minio/minio:RELEASE.2023-03-20T20-16-18Z
    environment:
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
    volumes:
      - ${volumeName}-minio:/minio_data
    command: minio server /minio_data --console-address ":9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 30s
      timeout: 20s
      retries: 3
    networks:
      - ${networkName}

  standalone:
    container_name: ${containerName}
    image: milvusdb/milvus:v2.3.4
    command: ["milvus", "run", "standalone"]
    security_opt:
      - seccomp:unconfined
    environment:
      ETCD_ENDPOINTS: etcd:2379
      MINIO_ADDRESS: minio:9000
    volumes:
      - ${volumeName}-data:/var/lib/milvus
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9091/healthz"]
      interval: 30s
      start_period: 90s
      timeout: 20s
      retries: 3
    ports:
      - "${milvusPort}:19530"
      - "9091:9091"
    depends_on:
      - "etcd"
      - "minio"
    networks:
      - ${networkName}

networks:
  ${networkName}:
    driver: bridge

volumes:
  ${volumeName}-etcd:
  ${volumeName}-minio:
  ${volumeName}-data:
`;

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Write the compose file
  const composePath = join(outputDir, `docker-compose.milvus.${instanceId}.yml`);
  writeFileSync(composePath, composeContent, 'utf-8');

  return composePath;
}

/**
 * Generate a minimal compose file path for referencing an existing Milvus setup.
 * This is useful when you want to use an existing Milvus compose file but with
 * instance-specific project naming.
 */
export function getComposeProjectName(instanceId: number): string {
  return `${INFRASTRUCTURE_CONFIG.composePrefix}-${instanceId}-milvus`;
}

/**
 * Template for a simple PostgreSQL-only compose file (if needed).
 */
export function generatePostgresCompose(options: {
  instanceId: number;
  postgresPort: number;
  outputDir: string;
  containerPrefix?: string;
}): string {
  const {
    instanceId,
    postgresPort,
    outputDir,
    containerPrefix = INFRASTRUCTURE_CONFIG.containerPrefix,
  } = options;

  const containerName = `${containerPrefix}-${instanceId}-db`;
  const volumeName = `${containerPrefix}-${instanceId}-postgres`;

  const composeContent = `# AgentQA PostgreSQL Instance ${instanceId}
# Auto-generated - do not edit manually
# Port: ${postgresPort}

services:
  postgres:
    container_name: ${containerName}
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: pocketcoach_dev
    ports:
      - "${postgresPort}:5432"
    volumes:
      - ${volumeName}:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d pocketcoach_dev"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  ${volumeName}:
`;

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Write the compose file
  const composePath = join(outputDir, `docker-compose.postgres.${instanceId}.yml`);
  writeFileSync(composePath, composeContent, 'utf-8');

  return composePath;
}
