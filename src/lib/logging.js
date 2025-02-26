import { homedir } from 'node:os';
import * as path from 'node:path';
import * as winston from 'winston';
import { camelToDash } from "./utils.js";

// check for vercel running which is not allowed to write to home in logs
let baseLogPath = homedir();
if (process.env.VERCEL_ENV) {
  baseLogPath = "/tmp/";
}
const logFileName = path.join(baseLogPath, '.haxtheweb', 'create.log');
export const consoleTransport = new winston.transports.Console({
  format: winston.format.simple()
});
export const logFile = new winston.transports.File({
  filename: logFileName,
  level: 'info', // so we don't store everything else
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  maxsize: 100000,
  maxFiles: 10,
  tailable: true
});

export const logger = winston.createLogger({
  transports: [
    consoleTransport,
    logFile
  ]
});

export function haxCliEnvOptions() {
  return ['skip','npmClient','i','extras','root','path','org','author', 'y', 'auto', 'domain'];
}

// wrapper so we can silence all log messages at the same time
export function log(msg, level = 'info', extra = null) {
  logger.log(level, msg, extra);
}

export function commandString(commandRun) {
  let comStr = `hax ${commandRun.command} ${commandRun.arguments.action}`;
  for (const key of Object.keys(commandRun.options)) {
    // ignore environment centric calls
    if (!haxCliEnvOptions().includes(key)) {
      if (key === true) {
        comStr+= ` --${camelToDash(key)}`;
      }
      else if (key === false) {
        comStr+= ` --no-${camelToDash(key)}`;
      }
      else {
        comStr+= ` --${camelToDash(key)} "${commandRun.options[key]}"`;
      }
    }
  }
  return comStr;  
}