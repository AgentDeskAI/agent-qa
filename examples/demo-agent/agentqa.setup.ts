/**
 * Global Setup for Demo Agent
 *
 * Starts the demo agent server before tests and tears it down after.
 */

import { createDemoServer } from './src/server.js';
import { entityStore } from './src/store.js';

export async function setup() {
  console.log('🚀 Starting Demo Agent on port 4099...');

  const server = await createDemoServer(4099);

  console.log('✓ Demo Agent ready!');

  // Return teardown function
  return async () => {
    console.log('🧹 Stopping Demo Agent...');
    await server.close();
    entityStore.clear();
    console.log('✓ Demo Agent stopped');
  };
}
