import { exec } from 'child_process';
import { promisify } from 'util';
import { ToolResult } from '../types';
import { ConfirmationService } from '../utils/confirmation-service';

const execAsync = promisify(exec);

export class BashTool {
  private currentDirectory: string = process.cwd();
  private confirmationService = ConfirmationService.getInstance();

  private isDangerousCommand(command: string): boolean {
    const dangerousPatterns = [
      /^rm\s+.*-r/i,           // rm -r (recursive delete)
      /^rm\s+.*-f/i,           // rm -f (force delete)
      /^sudo\s/i,              // sudo commands
      /^chmod\s+.*777/i,       // chmod 777 (dangerous permissions)
      /^dd\s+/i,               // dd command (can wipe disks)
      /^mkfs\./i,              // filesystem creation
      /^fdisk\s/i,             // disk partitioning
      /^format\s/i,            // format command
      /^del\s+.*\/s/i,         // Windows recursive delete
      /^rmdir\s+.*\/s/i,       // Windows recursive rmdir
      />\s*\/dev\/(null|zero|random)/i, // Redirecting to system devices
      /curl.*\|\s*sh/i,        // curl | sh (dangerous downloads)
      /wget.*\|\s*sh/i,        // wget | sh (dangerous downloads)
      /^killall\s/i,           // killall command
      /^pkill\s/i,             // pkill command
      /^systemctl\s/i,         // systemctl commands
      /^service\s/i,           // service commands
      /^mount\s/i,             // mount commands
      /^umount\s/i,            // umount commands
    ];

    return dangerousPatterns.some(pattern => pattern.test(command.trim()));
  }

  async execute(command: string, timeout: number = 30000): Promise<ToolResult> {
    try {
      // Check if this is a dangerous command
      const isDangerous = this.isDangerousCommand(command);
      const sessionFlags = this.confirmationService.getSessionFlags();
      
      // Always require confirmation for dangerous commands, even in headless mode
      if (isDangerous && !sessionFlags.allOperations) {
        return {
          success: false,
          error: `Dangerous command detected: "${command}". This command requires interactive mode for safety. Please use the interactive mode (without --prompt) to execute potentially harmful commands.`
        };
      }
      
      // For safe commands, check session flags
      if (!isDangerous && !sessionFlags.bashCommands && !sessionFlags.allOperations) {
        // Request confirmation showing the command
        const confirmationResult = await this.confirmationService.requestConfirmation({
          operation: 'Run bash command',
          filename: command,
          showVSCodeOpen: false,
          content: `Command: ${command}\nWorking directory: ${this.currentDirectory}`
        }, 'bash');

        if (!confirmationResult.confirmed) {
          return {
            success: false,
            error: confirmationResult.feedback || 'Command execution cancelled by user'
          };
        }
      }

      if (command.startsWith('cd ')) {
        const newDir = command.substring(3).trim();
        try {
          process.chdir(newDir);
          this.currentDirectory = process.cwd();
          return {
            success: true,
            output: `Changed directory to: ${this.currentDirectory}`
          };
        } catch (error: any) {
          return {
            success: false,
            error: `Cannot change directory: ${error.message}`
          };
        }
      }

      const { stdout, stderr } = await execAsync(command, {
        cwd: this.currentDirectory,
        timeout,
        maxBuffer: 1024 * 1024
      });

      const output = stdout + (stderr ? `\nSTDERR: ${stderr}` : '');
      
      return {
        success: true,
        output: output.trim() || 'Command executed successfully (no output)'
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Command failed: ${error.message}`
      };
    }
  }

  getCurrentDirectory(): string {
    return this.currentDirectory;
  }

  async listFiles(directory: string = '.'): Promise<ToolResult> {
    return this.execute(`ls -la ${directory}`);
  }

  async findFiles(pattern: string, directory: string = '.'): Promise<ToolResult> {
    return this.execute(`find ${directory} -name "${pattern}" -type f`);
  }

  async grep(pattern: string, files: string = '.'): Promise<ToolResult> {
    return this.execute(`grep -r "${pattern}" ${files}`);
  }
}
