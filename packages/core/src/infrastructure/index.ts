/**
 * Infrastructure Module
 *
 * Exports for AgentQA parallel instance management.
 */

// Configuration
export {
  INFRASTRUCTURE_CONFIG,
  calculateInstancePorts,
  getInstanceContainerNames,
  getInstanceTmuxSession,
  getInstanceComposeProject,
  isAgentQAContainer,
  isAgentQATmuxSession,
  isAgentQAComposeProject,
  type InstancePorts,
  type InstanceContainerNames,
} from './config.js';

// Instance Registry
export {
  InstanceRegistry,
  getInstanceRegistry,
  getInstanceStateDir,
  type InstanceInfo,
  type AcquireResult,
} from './instance-registry.js';

// Instance Manager
export {
  InstanceManager,
  createInstanceManager,
  getInstancePorts,
  type InstanceConfig,
  type InstanceEnv,
  type InstanceManagerOptions,
  type InitializeResult,
} from './instance-manager.js';

// Compose Generator
export {
  generateMilvusCompose,
  generatePostgresCompose,
  getComposeProjectName,
  type MilvusComposeOptions,
} from './compose-generator.js';

// Resource Discovery
export {
  discoverAgentQAContainers,
  discoverAgentQATmuxSessions,
  discoverAgentQAComposeProjects,
  discoverAgentQAFrpProcesses,
  discoverAgentQAStateFiles,
  discoverAllResources,
  hasRunningResources,
  summarizeResources,
  type DiscoveredContainer,
  type DiscoveredTmuxSession,
  type DiscoveredComposeProject,
  type DiscoveredFrpProcess,
  type DiscoveredResources,
} from './discovery.js';

// Cleanup
export {
  cleanupAllResources,
  cleanupInstance,
  formatCleanupResult,
  needsCleanup,
  type CleanupOptions,
  type CleanupResult,
} from './cleanup.js';
