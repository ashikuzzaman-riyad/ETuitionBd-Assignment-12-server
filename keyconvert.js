const fs = require("fs");
const path = require("path");

const keyPath = path.join(
  __dirname,
  "etuitionbd-7b3ea-firebase-adminsdk.json"
);

const key = fs.readFileSync(keyPath, "utf8");
const base64 = Buffer.from(key).toString("base64");

console.log(base64);
