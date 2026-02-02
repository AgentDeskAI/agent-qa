/**
 * Tests for Infrastructure Configuration
 */
import { describe, it, expect } from 'vitest';

import {
  INFRASTRUCTURE_CONFIG,
  calculateInstancePorts,
  getInstanceContainerNames,
  getInstanceTmuxSession,
  getInstanceComposeProject,
  isAgentQAContainer,
  isAgentQATmuxSession,
  isAgentQAComposeProject,
} from '../../infrastructure/config.js';

describe('INFRASTRUCTURE_CONFIG', () => {
  it('should have expected default values', () => {
    expect(INFRASTRUCTURE_CONFIG.maxInstances).toBe(5);
    expect(INFRASTRUCTURE_CONFIG.maxWorkersPerInstance).toBe(8);
    expect(INFRASTRUCTURE_CONFIG.staleInstanceTimeout).toBe(3600000);
    expect(INFRASTRUCTURE_CONFIG.stateDir).toBe('.agent-qa');
    expect(INFRASTRUCTURE_CONFIG.containerPrefix).toBe('agentqa');
    expect(INFRASTRUCTURE_CONFIG.tmuxPrefix).toBe('agentqa');
    expect(INFRASTRUCTURE_CONFIG.composePrefix).toBe('agentqa');
  });

  it('should have port ranges starting at expected values', () => {
    expect(INFRASTRUCTURE_CONFIG.portRanges.db.start).toBe(5438);
    expect(INFRASTRUCTURE_CONFIG.portRanges.api.start).toBe(4002);
    expect(INFRASTRUCTURE_CONFIG.portRanges.milvus.start).toBe(19532);
    expect(INFRASTRUCTURE_CONFIG.portRanges.tunnel.start).toBe(6100);
  });
});

describe('calculateInstancePorts', () => {
  it('should return base ports for instance 0', () => {
    const ports = calculateInstancePorts(0);

    expect(ports.db).toBe(5438);
    expect(ports.api).toBe(4002);
    expect(ports.milvus).toBe(19532);
    expect(ports.tunnel).toBe(6100);
  });

  it('should increment ports for instance 1', () => {
    const ports = calculateInstancePorts(1);

    expect(ports.db).toBe(5439);
    expect(ports.api).toBe(4003);
    expect(ports.milvus).toBe(19533);
    expect(ports.tunnel).toBe(6101);
  });

  it('should increment ports for instance 5', () => {
    const ports = calculateInstancePorts(5);

    expect(ports.db).toBe(5443);
    expect(ports.api).toBe(4007);
    expect(ports.milvus).toBe(19537);
    expect(ports.tunnel).toBe(6105);
  });

  it('should throw for negative instance ID', () => {
    expect(() => calculateInstancePorts(-1)).toThrow('out of range');
  });

  it('should throw for instance ID exceeding max', () => {
    expect(() => calculateInstancePorts(10)).toThrow('out of range');
    expect(() => calculateInstancePorts(100)).toThrow('out of range');
  });

  it('should accept max valid instance ID', () => {
    const ports = calculateInstancePorts(9);

    expect(ports.db).toBe(5447);
    expect(ports.api).toBe(4011);
    expect(ports.milvus).toBe(19541);
    expect(ports.tunnel).toBe(6109);
  });
});

describe('getInstanceContainerNames', () => {
  it('should return correct names for instance 0', () => {
    const names = getInstanceContainerNames(0);

    expect(names.db).toBe('agentqa-0-db');
    expect(names.milvus).toBe('agentqa-0-milvus');
  });

  it('should return correct names for instance 3', () => {
    const names = getInstanceContainerNames(3);

    expect(names.db).toBe('agentqa-3-db');
    expect(names.milvus).toBe('agentqa-3-milvus');
  });
});

describe('getInstanceTmuxSession', () => {
  it('should return correct session name for instance 0', () => {
    expect(getInstanceTmuxSession(0)).toBe('agentqa-0-api');
  });

  it('should return correct session name for instance 5', () => {
    expect(getInstanceTmuxSession(5)).toBe('agentqa-5-api');
  });
});

describe('getInstanceComposeProject', () => {
  it('should return correct project name for instance 0', () => {
    expect(getInstanceComposeProject(0)).toBe('agentqa-0-milvus');
  });

  it('should return correct project name for instance 2', () => {
    expect(getInstanceComposeProject(2)).toBe('agentqa-2-milvus');
  });
});

describe('isAgentQAContainer', () => {
  it('should return true for valid AgentQA containers', () => {
    expect(isAgentQAContainer('agentqa-0-db')).toBe(true);
    expect(isAgentQAContainer('agentqa-1-milvus')).toBe(true);
    expect(isAgentQAContainer('agentqa-5-something')).toBe(true);
  });

  it('should return false for non-AgentQA containers', () => {
    expect(isAgentQAContainer('postgres')).toBe(false);
    expect(isAgentQAContainer('my-container')).toBe(false);
    expect(isAgentQAContainer('agentqa')).toBe(false); // Missing dash suffix
  });
});

describe('isAgentQATmuxSession', () => {
  it('should return true for valid AgentQA sessions', () => {
    expect(isAgentQATmuxSession('agentqa-0-api')).toBe(true);
    expect(isAgentQATmuxSession('agentqa-3-api')).toBe(true);
  });

  it('should return false for non-AgentQA sessions', () => {
    expect(isAgentQATmuxSession('my-session')).toBe(false);
    expect(isAgentQATmuxSession('dev')).toBe(false);
    expect(isAgentQATmuxSession('agentqa')).toBe(false);
  });
});

describe('isAgentQAComposeProject', () => {
  it('should return true for valid AgentQA projects', () => {
    expect(isAgentQAComposeProject('agentqa-0-milvus')).toBe(true);
    expect(isAgentQAComposeProject('agentqa-2-milvus')).toBe(true);
  });

  it('should return false for non-AgentQA projects', () => {
    expect(isAgentQAComposeProject('my-project')).toBe(false);
    expect(isAgentQAComposeProject('pocketcoach-milvus')).toBe(false);
    expect(isAgentQAComposeProject('agentqa')).toBe(false);
  });
});
