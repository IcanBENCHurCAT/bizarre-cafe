import { spawn } from 'child_process';
import fs from 'fs';

async function main() {
  console.log('Starting backend...');
  const backend = spawn(/^win/.test(process.platform) ? 'npm.cmd' : 'npm', ['run', 'dev'], { stdio: 'pipe', shell: true });

  backend.stdout.on('data', (data) => {
    process.stdout.write(`[BACKEND]: ${data}`);
  });
  backend.stderr.on('data', (data) => {
    process.stderr.write(`[BACKEND ERR]: ${data}`);
  });

  console.log('Waiting 10 seconds for backend to be ready...');
  await new Promise((resolve) => setTimeout(resolve, 10000));

  console.log('Starting test-agents...');
  const agents = spawn(/^win/.test(process.platform) ? 'npx.cmd' : 'npx', ['tsx', 'scripts/test-agents.ts'], { stdio: 'pipe', shell: true });

  let agentLogs = '';
  
  agents.stdout.on('data', (data) => {
    const str = data.toString();
    process.stdout.write(`[AGENTS]: ${str}`);
    agentLogs += str;
  });
  
  agents.stderr.on('data', (data) => {
    const str = data.toString();
    process.stderr.write(`[AGENTS ERR]: ${str}`);
    agentLogs += str;
  });

  agents.on('close', (code) => {
    console.log(`Test agents exited with code ${code}`);
    fs.writeFileSync('agent-logs.txt', agentLogs);
    backend.kill();
    process.exit(code);
  });
}

main().catch(console.error);
