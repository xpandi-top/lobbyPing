import { spawnSync } from 'node:child_process'

const FIREBASE_PROJECT = process.env.FIREBASE_PROJECT || 'lobbyping-5ae0f'
const VERCEL_PROJECT = process.env.VERCEL_PROJECT || 'lobby-ping'
const mode = process.argv[2] || 'all'

function run(command, args) {
  console.log(`\n$ ${[command, ...args].join(' ')}`)
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function deployRules() {
  run('firebase', ['deploy', '--only', 'firestore:rules', '--project', FIREBASE_PROJECT])
}

function deployApi() {
  run('npx', ['vercel', 'link', '--project', VERCEL_PROJECT, '--yes'])
  run('npx', ['vercel', 'deploy', '--prod', '--yes'])
}

function check() {
  run('firebase', ['--version'])
  run('npx', ['vercel', '--version'])
  run('npx', ['vercel', 'whoami'])
}

switch (mode) {
  case 'rules':
    deployRules()
    break
  case 'api':
    deployApi()
    break
  case 'all':
    deployRules()
    deployApi()
    break
  case 'check':
    check()
    break
  default:
    console.error(`Unknown deploy target: ${mode}`)
    console.error('Use one of: all, rules, api, check')
    process.exit(1)
}
