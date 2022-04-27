import { ChildProcess, spawn } from 'child_process';
import { writeFile } from 'fs/promises';
import { createWriteStream, WriteStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Config } from './config';
import { Logger } from 'winston';

interface ChildProcessContext {
  process: ChildProcess;
  loggingStream: WriteStream;
  exited: boolean;
}

export class ChildProcessManager {
  private readonly _childProcessesContexts: ChildProcessContext[] = [];

  public constructor(private readonly _config: Config, private readonly _logger: Logger, private readonly _loggingDir: string) {
  }

  public async start(): Promise<void> {
    for (const [key, value] of Object.entries(this._config)) {
      const logFilePath = join(this._loggingDir, `${key}.log`);
      const logStream = createWriteStream(logFilePath, { flags: 'a' });

      this._logger.info(`Starting service ${key}`);

      const tempScriptFile = randFilePath(key);
      await writeFile(tempScriptFile, value.script);

      const childProcess = spawn('bash', [tempScriptFile], {
        cwd: value.cwd,
        shell: true,
      });

      const context: ChildProcessContext = {
        process: childProcess,
        loggingStream: logStream,
        exited: false,
      };

      childProcess.stdout.on('data', (data: Buffer) => {
        const s = data.toString().trimEnd();
        logStream.write(`[STDOUT] ${s}\n`);
      });
      childProcess.stderr.on('data', (data: Buffer) => {
        const s = data.toString().trimEnd();
        logStream.write(`[STDERR] ${s}\n`);
      });
      childProcess.on('exit', (code) => {
        this._logger.info(`Exited with code ${code}`, { service: key });
        logStream.write(`[QSS] Service exited with code ${code}\n`);
        context.exited = true;
      });

      this._childProcessesContexts.push(context);
    }
  }

  public async stop(): Promise<void> {
    for (const ctx of this._childProcessesContexts.filter(ctx => !ctx.exited)) {
      ctx.process.kill('SIGINT');
    }

    while (this._childProcessesContexts.some(ctx => !ctx.exited)) {
      await sleep(1000);
    }
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function randFilePath(serviceName: string): string {
  return join(tmpdir(), `${serviceName}-${Math.random().toString(36)}.sh`);
}
