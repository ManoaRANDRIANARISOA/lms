const Database = require('better-sqlite3');
const db = new Database('database.sqlite');
try {
    const ghostId = '20823081-2187-4edb-8697-f48918a4cd37';
    
    db.transaction(() => {
        // Delete the ghost student
        db.prepare('DELETE FROM students WHERE id = ?').run(ghostId);
        // Put a delete action in sync_queue to remove it from the cloud too
        db.prepare(`INSERT INTO sync_queue (table_name, record_id, action, data, status) VALUES ('students', ?, 'delete', '{"deleted": true}', 'pending')`).run(ghostId);
    })();
    
    console.log("Ghost record deleted successfully!");
} catch (e) {
    console.error(e);
}
