/**
 * Tests for Resource Discovery
 *
 * Uses mocked child_process to test discovery without requiring Docker or tmux.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock child_process module
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

// Mock fs module
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock os module
vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/test'),
}));

// Import after mocking
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import {
  discoverAgentQAContainers,
  discoverAgentQATmuxSessions,
  discoverAgentQAComposeProjects,
  discoverAgentQAFrpProcesses,
  discoverAgentQAStateFiles,
  discoverAllResources,
  hasRunningResources,
  summarizeResources,
} from '../../infrastructure/discovery.js';

const mockExecFileSync = vi.mocked(execFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);

describe('discoverAgentQAContainers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return empty array when docker command fails', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('docker not found');
    });

    const containers = await discoverAgentQAContainers();

    expect(containers).toEqual([]);
  });

  it('should parse docker ps output', async () => {
    mockExecFileSync.mockReturnValueOnce(
      Buffer.from('agentqa-0-db\tabc123\trunning\tpostgres:15\nagentqa-1-milvus\tdef456\texited\tmilvusdb:latest\n')
    ).mockReturnValueOnce(Buffer.from('')); // Legacy output empty

    const containers = await discoverAgentQAContainers();

    expect(containers).toHaveLength(2);
    expect(containers[0]).toEqual({
      name: 'agentqa-0-db',
      id: 'abc123',
      state: 'running',
      image: 'postgres:15',
    });
    expect(containers[1]).toEqual({
      name: 'agentqa-1-milvus',
      id: 'def456',
      state: 'exited',
      image: 'milvusdb:latest',
    });
  });

  it('should deduplicate containers found by both patterns', async () => {
    // When the same container is returned by both queries, it should only appear once
    const containerData = 'agentqa-0-db\tabc123\trunning\tpostgres:15\n';
    mockExecFileSync.mockReturnValue(Buffer.from(containerData));

    const containers = await discoverAgentQAContainers();

    // Should not have duplicates
    expect(containers).toHaveLength(1);
    expect(containers[0].name).toBe('agentqa-0-db');
  });

  it('should filter out non-matching containers', async () => {
    mockExecFileSync.mockReturnValueOnce(
      Buffer.from('agentqa-0-db\tabc123\trunning\tpostgres:15\nsome-other\tzzz000\trunning\tnginx\n')
    ).mockReturnValueOnce(Buffer.from(''));

    const containers = await discoverAgentQAContainers();

    // Only agentqa-0-db should match (isAgentQAContainer filter)
    expect(containers).toHaveLength(1);
    expect(containers[0].name).toBe('agentqa-0-db');
  });
});

describe('discoverAgentQATmuxSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when tmux fails', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('tmux not running');
    });

    const sessions = await discoverAgentQATmuxSessions();

    expect(sessions).toEqual([]);
  });

  it('should parse tmux ls output', async () => {
    mockExecFileSync.mockReturnValue(
      Buffer.from('agentqa-0-api: 1 windows (created Mon Jan 1 12:00:00 2024)\nagentqa-1-api: 2 windows (created Tue Jan 2 13:00:00 2024)\n')
    );

    const sessions = await discoverAgentQATmuxSessions();

    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toEqual({
      name: 'agentqa-0-api',
      windows: 1,
      created: expect.any(Date),
    });
    expect(sessions[1]).toEqual({
      name: 'agentqa-1-api',
      windows: 2,
      created: expect.any(Date),
    });
  });

  it('should include legacy pattern sessions', async () => {
    mockExecFileSync.mockReturnValue(
      Buffer.from('pocketcoach-agentqa-api: 1 windows\n')
    );

    const sessions = await discoverAgentQATmuxSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe('pocketcoach-agentqa-api');
  });

  it('should handle sessions without created time', async () => {
    mockExecFileSync.mockReturnValue(
      Buffer.from('agentqa-0-api: 3 windows\n')
    );

    const sessions = await discoverAgentQATmuxSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].created).toBeNull();
  });

  it('should ignore non-matching sessions', async () => {
    mockExecFileSync.mockReturnValue(
      Buffer.from('agentqa-0-api: 1 windows\nmy-session: 2 windows\n')
    );

    const sessions = await discoverAgentQATmuxSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].name).toBe('agentqa-0-api');
  });
});

describe('discoverAgentQAComposeProjects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when docker compose fails', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('docker compose not found');
    });

    const projects = await discoverAgentQAComposeProjects();

    expect(projects).toEqual([]);
  });

  it('should parse docker compose ls JSON output', async () => {
    mockExecFileSync.mockReturnValue(
      Buffer.from(JSON.stringify([
        { Name: 'agentqa-0-milvus', ConfigFiles: '/path/to/compose.yml', Status: 'running(3)' },
        { Name: 'agentqa-1-milvus', ConfigFiles: '/path/to/other.yml', Status: 'exited(0)' },
      ]))
    );

    const projects = await discoverAgentQAComposeProjects();

    expect(projects).toHaveLength(2);
    expect(projects[0]).toEqual({
      name: 'agentqa-0-milvus',
      configFiles: ['/path/to/compose.yml'],
      status: 'running(3)',
    });
  });

  it('should include legacy pattern projects', async () => {
    mockExecFileSync.mockReturnValue(
      Buffer.from(JSON.stringify([
        { Name: 'pocketcoach-milvus-agentqa', ConfigFiles: '/path/to/compose.yml', Status: 'running' },
      ]))
    );

    const projects = await discoverAgentQAComposeProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('pocketcoach-milvus-agentqa');
  });

  it('should ignore non-matching projects', async () => {
    mockExecFileSync.mockReturnValue(
      Buffer.from(JSON.stringify([
        { Name: 'agentqa-0-milvus', ConfigFiles: '/path/compose.yml', Status: 'running' },
        { Name: 'my-app', ConfigFiles: '/path/other.yml', Status: 'running' },
      ]))
    );

    const projects = await discoverAgentQAComposeProjects();

    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('agentqa-0-milvus');
  });
});

describe('discoverAgentQAFrpProcesses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when pgrep fails', async () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('pgrep: no matching processes');
    });

    const processes = await discoverAgentQAFrpProcesses();

    expect(processes).toEqual([]);
  });

  it('should parse pgrep output', async () => {
    mockExecFileSync.mockReturnValue(
      Buffer.from('12345 frpc -c /path/to/agentqa-0.ini\n67890 frpc -c /path/to/agentqa-1.ini\n')
    );

    const processes = await discoverAgentQAFrpProcesses();

    expect(processes).toHaveLength(2);
    expect(processes[0]).toEqual({
      pid: 12345,
      command: 'frpc -c /path/to/agentqa-0.ini',
      configPath: '/path/to/agentqa-0.ini',
    });
  });

  it('should handle processes without config path', async () => {
    mockExecFileSync.mockReturnValue(
      Buffer.from('12345 frpc agentqa\n')
    );

    const processes = await discoverAgentQAFrpProcesses();

    expect(processes).toHaveLength(1);
    expect(processes[0].configPath).toBeUndefined();
  });
});

describe('discoverAgentQAStateFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty array when state dir does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    const files = await discoverAgentQAStateFiles();

    expect(files).toEqual([]);
  });

  it('should list files in state directory', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockImplementation((path: string) => {
      if (path.endsWith('.agent-qa')) {
        return [
          { name: 'instances.json', isFile: () => true, isDirectory: () => false },
        ] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });

    const files = await discoverAgentQAStateFiles();

    expect(files).toHaveLength(1);
    expect(files[0]).toContain('instances.json');
  });

  it('should include files in instance subdirectories', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockImplementation((path: string) => {
      if (path.endsWith('.agent-qa')) {
        return [
          { name: 'instances.json', isFile: () => true, isDirectory: () => false },
          { name: 'instance-0', isFile: () => false, isDirectory: () => true },
        ] as unknown as ReturnType<typeof readdirSync>;
      }
      if (path.includes('instance-0')) {
        return [
          { name: 'compose.yml', isFile: () => true, isDirectory: () => false },
        ] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });

    const files = await discoverAgentQAStateFiles();

    // instances.json, compose.yml, and the instance-0 directory
    expect(files).toHaveLength(3);
    expect(files.some(f => f.includes('instances.json'))).toBe(true);
    expect(files.some(f => f.includes('compose.yml'))).toBe(true);
    expect(files.some(f => f.includes('instance-0'))).toBe(true);
  });
});

describe('discoverAllResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should aggregate all discovered resources', async () => {
    mockExecFileSync.mockImplementation((cmd: string) => {
      if (cmd === 'docker') {
        return Buffer.from('');
      }
      if (cmd === 'tmux') {
        return Buffer.from('agentqa-0-api: 1 windows\n');
      }
      if (cmd === 'pgrep') {
        throw new Error('no match');
      }
      return Buffer.from('');
    });
    mockExistsSync.mockReturnValue(false);

    const resources = await discoverAllResources();

    expect(resources.containers).toEqual([]);
    expect(resources.tmuxSessions).toHaveLength(1);
    expect(resources.composeProjects).toEqual([]);
    expect(resources.frpProcesses).toEqual([]);
    expect(resources.stateFiles).toEqual([]);
  });
});

describe('hasRunningResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when running containers exist', async () => {
    mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === 'docker' && args?.[0] === 'ps') {
        return Buffer.from('agentqa-0-db\tabc123\trunning\tpostgres\n');
      }
      if (cmd === 'docker' && args?.[0] === 'compose') {
        return Buffer.from('[]');
      }
      return Buffer.from('');
    });
    mockExistsSync.mockReturnValue(false);

    const hasResources = await hasRunningResources();

    expect(hasResources).toBe(true);
  });

  it('should return true when tmux sessions exist', async () => {
    mockExecFileSync.mockImplementation((cmd: string) => {
      if (cmd === 'tmux') {
        return Buffer.from('agentqa-0-api: 1 windows\n');
      }
      if (cmd === 'docker') {
        return Buffer.from('[]'); // Empty compose projects
      }
      return Buffer.from('');
    });
    mockExistsSync.mockReturnValue(false);

    const hasResources = await hasRunningResources();

    expect(hasResources).toBe(true);
  });

  it('should return false when no running resources', async () => {
    mockExecFileSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      if (cmd === 'docker' && args?.[0] === 'compose') {
        return Buffer.from('[]');
      }
      throw new Error('no resources');
    });
    mockExistsSync.mockReturnValue(false);

    const hasResources = await hasRunningResources();

    expect(hasResources).toBe(false);
  });
});

describe('summarizeResources', () => {
  it('should summarize containers', () => {
    const lines = summarizeResources({
      containers: [
        { name: 'agentqa-0-db', id: 'abc', state: 'running', image: 'postgres' },
      ],
      tmuxSessions: [],
      composeProjects: [],
      frpProcesses: [],
      stateFiles: [],
    });

    expect(lines).toContain('Docker containers: 1');
    expect(lines.some(l => l.includes('agentqa-0-db'))).toBe(true);
  });

  it('should summarize tmux sessions', () => {
    const lines = summarizeResources({
      containers: [],
      tmuxSessions: [
        { name: 'agentqa-0-api', windows: 2, created: null },
      ],
      composeProjects: [],
      frpProcesses: [],
      stateFiles: [],
    });

    expect(lines).toContain('Tmux sessions: 1');
    expect(lines.some(l => l.includes('agentqa-0-api'))).toBe(true);
  });

  it('should summarize compose projects', () => {
    const lines = summarizeResources({
      containers: [],
      tmuxSessions: [],
      composeProjects: [
        { name: 'agentqa-0-milvus', configFiles: [], status: 'running(3)' },
      ],
      frpProcesses: [],
      stateFiles: [],
    });

    expect(lines).toContain('Docker Compose projects: 1');
  });

  it('should summarize FRP processes', () => {
    const lines = summarizeResources({
      containers: [],
      tmuxSessions: [],
      composeProjects: [],
      frpProcesses: [
        { pid: 12345, command: 'frpc' },
      ],
      stateFiles: [],
    });

    expect(lines).toContain('FRP processes: 1');
    expect(lines.some(l => l.includes('PID 12345'))).toBe(true);
  });

  it('should report no resources when empty', () => {
    const lines = summarizeResources({
      containers: [],
      tmuxSessions: [],
      composeProjects: [],
      frpProcesses: [],
      stateFiles: [],
    });

    expect(lines).toContain('No AgentQA resources found');
  });
});
