const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, 'database.sqlite'))

const settings = db.prepare('SELECT * FROM settings').all()
console.log('All settings in DB:')
console.log(settings)

process.exit(0)
