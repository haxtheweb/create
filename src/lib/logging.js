import { homedir } from "node:os";
import * as path from "node:path";
import * as winston from "winston";
import { camelToDash } from "./utils.js";

// check for vercel running which is not allowed to write to home in logs
let baseLogPath = homedir();
if (process.env.VERCEL_ENV) {
  baseLogPath = "/tmp/";
}
const logFileName = path.join(baseLogPath, ".haxtheweb", "create.log");
export const consoleTransport = new winston.transports.Console({
  format: winston.format.simple(),
});
export const logFile = new winston.transports.File({
  filename: logFileName,
  level: "info", // so we don't store everything else
  format: winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
  ),
  maxsize: 100000,
  maxFiles: 10,
  tailable: true,
});

export const logger = winston.createLogger({
  transports: [consoleTransport, logFile],
});

export function haxCliEnvOptions() {
  return [
    "skip",
    "npmClient",
    "i",
    "extras",
    "root",
    "path",
    "org",
    "author",
    "y",
    "auto",
    "domain",
  ];
}

// wrapper so we can silence all log messages at the same time
export function log(msg, level = "info", extra = null) {
  logger.log(level, msg, extra);
}

// --format json|yaml: stdout carries only the requested data so it can be
// piped straight into a parser. Everything else (clack banners, spinners,
// winston console logging) is sent to stderr instead.
const realStdoutWrite = process.stdout.write.bind(process.stdout);
let structuredOutput = false;

export function isStructuredFormat(format) {
  return format === "json" || format === "yaml";
}

export function enableStructuredOutput() {
  if (structuredOutput) {
    return;
  }
  structuredOutput = true;
  process.stdout.write = process.stderr.write.bind(process.stderr);
}

export function structuredOutputEnabled() {
  return structuredOutput;
}

// write the data payload for a command to the real stdout
export function writeData(data) {
  let str = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  if (!str.endsWith("\n")) {
    str += "\n";
  }
  if (structuredOutput) {
    realStdoutWrite(str);
  } else {
    process.stdout.write(str);
  }
}

export function commandString(commandRun) {
  let comStr = `hax ${commandRun.command} ${commandRun.arguments.action}`;
  for (const key of Object.keys(commandRun.options)) {
    // ignore environment centric calls
    if (!haxCliEnvOptions().includes(key)) {
      if (key === true) {
        comStr += ` --${camelToDash(key)}`;
      } else if (key === false) {
        comStr += ` --no-${camelToDash(key)}`;
      } else {
        comStr += ` --${camelToDash(key)} "${commandRun.options[key]}"`;
      }
    }
  }
  return comStr;
}
