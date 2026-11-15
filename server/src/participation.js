const STATUSES = ["想跑", "已报名", "待抽签", "中签", "未中签", "确认参赛", "已缴费", "已领物", "完赛", "未完赛", "弃赛"];

function installParticipation(db) {
  db.transaction(() => {
    if (!db.prepare('PRAGMA table_info(plans)').all().some(column => column.name === 'companion_note')) {
      db.exec("ALTER TABLE plans ADD COLUMN companion_note TEXT NOT NULL DEFAULT ''");
    }
    db.exec(`CREATE TABLE IF NOT EXISTS race_follows (
      user_id INTEGER NOT NULL, race_id TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(user_id, race_id)
    );
    CREATE TABLE IF NOT EXISTS plan_club_shares (
      user_id INTEGER NOT NULL, race_id TEXT NOT NULL, club_id INTEGER NOT NULL,
      PRIMARY KEY(user_id, race_id, club_id)
    );
    CREATE INDEX IF NOT EXISTS plan_shares_club ON plan_club_shares(club_id, race_id, user_id);
    CREATE TABLE IF NOT EXISTS participation_migrations (name TEXT PRIMARY KEY);
    CREATE TRIGGER IF NOT EXISTS participation_leave AFTER DELETE ON club_members BEGIN
      DELETE FROM plan_club_shares WHERE user_id=OLD.user_id AND club_id=OLD.club_id;
    END;
    CREATE TRIGGER IF NOT EXISTS participation_remove_plan AFTER DELETE ON plans BEGIN
      DELETE FROM plan_club_shares WHERE user_id=OLD.user_id AND race_id=OLD.race_id;
    END;
    CREATE TRIGGER IF NOT EXISTS participation_remove_user AFTER DELETE ON users BEGIN
      DELETE FROM plan_club_shares WHERE user_id=OLD.id;
      DELETE FROM race_follows WHERE user_id=OLD.id;
    END;
    CREATE TRIGGER IF NOT EXISTS participation_remove_club AFTER DELETE ON clubs BEGIN
      DELETE FROM plan_club_shares WHERE club_id=OLD.id;
    END;
    CREATE TRIGGER IF NOT EXISTS participation_remove_race AFTER DELETE ON races BEGIN
      DELETE FROM plan_club_shares WHERE race_id=OLD.id;
      DELETE FROM race_follows WHERE race_id=OLD.id;
    END;`);
    if (!db.prepare("SELECT 1 FROM participation_migrations WHERE name='explicit-sharing-v1'").get()) {
      // Preserve only relationships that already existed at upgrade time.
      // New plans and new memberships never inherit automatic visibility.
      db.exec(`INSERT OR IGNORE INTO plan_club_shares(user_id,race_id,club_id)
        SELECT p.user_id,p.race_id,m.club_id FROM plans p JOIN club_members m ON m.user_id=p.user_id;
        INSERT INTO participation_migrations(name) VALUES('explicit-sharing-v1');`);
    }
  }).immediate();
}

function sharedClubIds(db, userId, raceId) {
  return db.prepare(`SELECT s.club_id FROM plan_club_shares s
    JOIN club_members m ON m.user_id=s.user_id AND m.club_id=s.club_id
    WHERE s.user_id=? AND s.race_id=? ORDER BY s.club_id`).all(userId, raceId).map(row => row.club_id);
}

function validateClubIds(db, userId, value) {
  if (!Array.isArray(value) || value.length > 100 || value.some(id => !Number.isSafeInteger(id) || id < 1)) {
    return { error: '请选择有效的跑团', status: 400 };
  }
  const ids = [...new Set(value)];
  const member = db.prepare('SELECT 1 FROM club_members WHERE user_id=? AND club_id=?');
  if (ids.some(id => !member.get(userId, id))) return { error: '只能同步到已加入的跑团', status: 403 };
  return { ids };
}

function replaceShares(db, userId, raceId, ids) {
  db.prepare('DELETE FROM plan_club_shares WHERE user_id=? AND race_id=?').run(userId, raceId);
  const insert = db.prepare('INSERT INTO plan_club_shares(user_id,race_id,club_id) VALUES(?,?,?)');
  for (const id of ids) insert.run(userId, raceId, id);
}

module.exports = { STATUSES, installParticipation, sharedClubIds, validateClubIds, replaceShares };
