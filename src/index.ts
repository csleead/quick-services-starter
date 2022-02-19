import { readFile } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';
import { createLogger, transports, format } from 'winston';
import { parse } from 'yaml';
import { ChildProcessManager } from './child-process-manager';
import { ConfigSchema } from './config';

const logger = createLogger({
  format: format.printf(({ level, message, service }) => {
    return `[${new Date().toISOString()}][${(service ?? 'qss')}][${level}]: ${message}`;
  }),
  transports: [
    new transports.Console(),
    new transports.File({
      filename: join(process.cwd(), 'logs', `qss-${new Date().toISOString()}.log`),
    }),
  ]
});

(async () => {
  const configFilePath = process.argv.slice(2)[0] ?? join(homedir(), '.qss.yaml');
  logger.info(`Loading config from ${configFilePath}`);

  const configFile = await readFile(configFilePath, 'utf8');
  const config = ConfigSchema.parse(parse(configFile));

  const childProcessManager = new ChildProcessManager(config, logger);
  await childProcessManager.start();

  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, stopping services');
    await childProcessManager.stop();
    logger.info('All services stopped');

    logger.end();
  });
})();
