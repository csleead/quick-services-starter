import { ChildProcess, spawn } from 'child_process';
import { writeFile } from 'fs/promises';
import { createWriteStream, WriteStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Config } from './config';
import { Logger } from 'winston';
import { notify } from 'node-notifier';
import { fromEvent, map, merge } from 'rxjs';

interface ChildProcessContext {
  process: ChildProcess;
  loggingStream: WriteStream;
  isReady: boolean;
  exited: boolean;
}

export class ChildProcessManager {
  private readonly _childProcessesContexts: ChildProcessContext[] = [];
  private _stopRequested = false;

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
        isReady: value.readyText === undefined,
        exited: false,
      };

      const stdout$ = fromEvent(childProcess.stdout, 'data', (data) => (data as Buffer).toString().trimEnd());
      const stderr$ = fromEvent(childProcess.stderr, 'data', (data) => (data as Buffer).toString().trimEnd());
      const exit$ = fromEvent(childProcess, 'exit', (code) => code as number);

      merge(
        stdout$.pipe(map(s => `[${new Date().toISOString()}][STDOUT] ${s}\n`)),
        stderr$.pipe(map(s => `[${new Date().toISOString()}][STDERR] ${s}\n`)),
        exit$.pipe(map(code => `[${new Date().toISOString()}][QSS] Service exited with code ${code}\n`)),
      )
        .subscribe(s => logStream.write(s));

      stdout$.subscribe(s => {
        if(!context.isReady && value.readyText && s.includes(value.readyText)) {
          context.isReady = true;
          this._logger.info(`Service ${key} is now ready`);

          if(this._childProcessesContexts.every(ctx => ctx.isReady)) {
            notify({
              title: 'QSS: All service are ready',
              message: 'QSS: All service are ready'
            });
          }
        }
      });

      exit$.subscribe(code => {
        this._logger.info(`Service ${key} exited with code ${code}`);
        context.exited = true;

        if(!this._stopRequested) {
          // When a service is exited before requesting it to stop,
          // it is very likely the service crashed, therefore we send a notification.
          notify({
            title: 'QSS: Service exited',
            message: `Service ${key} exited with code ${code}`,
          });
        }
      });

      this._childProcessesContexts.push(context);
    }
  }

  public async stop(): Promise<void> {
    this._stopRequested = true;
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
