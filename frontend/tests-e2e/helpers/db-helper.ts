import { execSync } from "child_process";
import path from "path";

const projectRoot = path.resolve(__dirname, "../../../");
const pythonExe = path.join(projectRoot, "backend", ".venv", "Scripts", "python.exe");
const queryHelperPy = path.join(projectRoot, "backend", "query_helper.py");

export function queryDb<T = any>(sql: string): T[] {
  const env = { ...process.env, PYTHONPATH: path.join(projectRoot, "backend") };
  const escapedSql = sql.replace(/"/g, '\\"');
  const cmd = `"${pythonExe}" "${queryHelperPy}" "${escapedSql}"`;
  const output = execSync(cmd, { env, cwd: path.join(projectRoot, "backend"), encoding: "utf-8" });

  const startMarker = "###JSON_OUTPUT_START###";
  const endMarker = "###JSON_OUTPUT_END###";

  const startIndex = output.indexOf(startMarker);
  const endIndex = output.indexOf(endMarker);

  if (startIndex !== -1 && endIndex !== -1) {
    const jsonStr = output.substring(startIndex + startMarker.length, endIndex).trim();
    return JSON.parse(jsonStr);
  }

  // Fallback to array search
  const jsonStart = output.lastIndexOf("[");
  if (jsonStart !== -1) {
    return JSON.parse(output.slice(jsonStart));
  }
  return [];
}
