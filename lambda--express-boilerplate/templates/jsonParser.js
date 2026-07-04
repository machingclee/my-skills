const fs = require("fs");

// Custom parser for serverless-dotenv-plugin. Reads env values from JSON files
// (NOT KEY=VALUE .env): scalars become strings, arrays join with commas, objects
// are ignored. Multiple `path` entries are merged in order (later wins), so a
// shared base file can be overridden by a stage-specific one.
module.exports = function ({ paths }) {
  const envVarsArray = paths.map((path) => {
    try {
      const jsonData = JSON.parse(fs.readFileSync(path, "utf8"));
      const stringifiedData = {};
      for (const key in jsonData) {
        const value = jsonData[key];
        if (["string", "boolean", "number"].includes(typeof value)) {
          stringifiedData[key] = jsonData[key];
        } else if (Array.isArray(jsonData[key])) {
          stringifiedData[key] = jsonData[key].map((v) => String(v)).join(",");
        }
        // objects are ignored
      }
      return stringifiedData;
    } catch (error) {
      console.error(`Error reading/parsing ${path}:`, error.message);
      return {};
    }
  });
  return envVarsArray.reduce((acc, curr) => ({ ...acc, ...curr }), {});
};
