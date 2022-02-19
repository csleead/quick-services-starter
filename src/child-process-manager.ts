import { ChildProcess, spawn } from 'child_process';
import { writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Logger } from 'winston';
import { Config } from './config';

export class ChildProcessManager {
  private readonly _childProcesses: ChildProcess[] = [];

  public constructor(private readonly _config: Config, private readonly _logger: Logger) {
  }

  public async start(): Promise<void> {
    for(const [key, value] of Object.entries(this._config)) {
      this._logger.info(`Starting service ${key}`);
      
      const tempScriptFile = randFilePath(key);
      await writeFile(tempScriptFile, value.script);

      const childProcess = spawn('bash', [tempScriptFile], {
        cwd: value.cwd,
        shell: true,
      });
      childProcess.stdout.on('data', (data: Buffer) => {
        const s = data.toString().trimEnd();
        this._logger.info(s, { service: key });
      });
      childProcess.stderr.on('data', (data: Buffer) => {
        const s = data.toString().trimEnd();
        this._logger.error(s, { service: key });
      });
      childProcess.on('close', (code) => {
        this._logger.info(`Exited with code ${code}`, { service: key });
      });

      this._childProcesses.push(childProcess);
    }
  }

  public async stop(): Promise<void> {
    const exitPromises = [];
    for (const childProcess of this._childProcesses.filter(cp => !cp.exitCode)) {
      exitPromises.push(new Promise<void>((resolve) => {
        childProcess.on('close', () => resolve());
      }));

      childProcess.kill('SIGINT');
    }

    await Promise.all(exitPromises);
  }
}


function randFilePath(serviceName: string) : string {
  return join(tmpdir(), `${serviceName}-${Math.random().toString(36)}.sh`);
}
