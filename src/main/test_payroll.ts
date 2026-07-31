import Module from 'module'
const originalRequire = Module.prototype.require
Module.prototype.require = function (request: string) {
  if (request === 'electron') {
    return {
      app: { isPackaged: false, getPath: () => 'C:/rep/School/lms/out' },
      ipcMain: { handle: () => {} }
    }
  }
  return originalRequire.call(this, request)
}

import { PersonnelRepository } from './database/repositories/personnel.repository'

async function run() {
  console.log('Testing getPayrollSummary...')
  try {
    const summary = PersonnelRepository.getPayrollSummary('2026-06')
    console.log('Result:', summary)
  } catch (e) {
    console.error('Error:', e)
  }
}
run()
