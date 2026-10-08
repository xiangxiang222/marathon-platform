const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), `marathon-ut-${process.pid}-`));
process.env.MARATHON_DB = path.join(dir, "app.sqlite");
process.env.BASE_PATH = "/marathon";
process.env.PORT = "0";
