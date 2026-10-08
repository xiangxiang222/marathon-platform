const { getDb } = require("./db");
const db = getDb();
const n = db.prepare("SELECT COUNT(*) AS n FROM races").get().n;
console.log(`赛历 ${n} 场`);
