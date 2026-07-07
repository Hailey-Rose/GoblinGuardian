const fs = require("node:fs/promises");
async function getdata(file) {
    try { return JSON.parse(await fs.readFile(file, "utf8")); }
    catch (err) {
        if (err.code === "ENOENT") {
            console.log(`File ${file} not found.`); return {};
        } throw err;
    }
}
async function savedata(file, data) {
    try { await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8"); }
    catch (err) { console.error(`Error writing to file ${file}:`, err); }
}
module.exports = { getdata, savedata };
