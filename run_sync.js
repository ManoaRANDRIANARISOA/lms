const { syncWithCloud } = require('./out/main/services/sync.service.js')
async function run() {
  console.log('Starting sync...')
  const res = await syncWithCloud()
  console.log('Sync result:', res)
}
run()
