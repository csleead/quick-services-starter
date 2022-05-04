import { rejects } from 'assert';
import { readFile, mkdir } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { createLogger, transports, format } from 'winston';
import { parse } from 'yaml';
import { ChildProcessManager } from './child-process-manager';
import { ConfigSchema } from './config';

(async () => {
  const loggingDir = join(process.cwd(), 'logs', new Date().toISOString());
  await mkdir(loggingDir, { recursive: true });

  const logger = createLogger({
    format: format.combine(
      format.timestamp({ format: 'YYYY-MM-dd HH:mm:ss' }),
      format.printf(info => `[${info.timestamp}] ${info.level}: ${info.message}`),
    ),
    transports: [
      new transports.Console(),
      new transports.File({
        filename: join(loggingDir, 'qss.log'),
      }),
    ]
  });

  const configFilePath = process.argv.slice(2)[0] ?? join(homedir(), '.qss.yaml');
  logger.info(`Loading config from ${configFilePath}`);

  const configFile = await readFile(configFilePath, 'utf8');
  const config = ConfigSchema.parse(parse(configFile));

  const childProcessManager = new ChildProcessManager(config, logger, loggingDir);
  await childProcessManager.start();

  await new Promise<void>((resolve) => process.on('SIGINT', () => resolve()));

  logger.info('Received SIGINT, stopping services');
  await childProcessManager.stop();
  logger.info('All services stopped');
  logger.end();
})();
