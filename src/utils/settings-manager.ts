import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { OllamaClient } from '../ollama/ollama-client';

/**
 * User-level settings stored in ~/.ollama-agent/user-settings.json
 * These are global settings that apply across all projects
 */
export interface UserSettings {
  baseURL?: string;          // API base URL
  defaultModel?: string;     // User's preferred default model
  models?: string[];         // Available models list
}

/**
 * Project-level settings stored in .ollama-agent/settings.json
 * These are project-specific settings
 */
export interface ProjectSettings {
  model?: string;            // Current model for this project
  mcpServers?: Record<string, any>; // MCP server configurations
}

/**
 * Default values for user settings
 */
const DEFAULT_USER_SETTINGS: Partial<UserSettings> = {
  baseURL: "http://localhost:11434",
  defaultModel: undefined, // Will be set dynamically from Ollama
  models: [] // Will be populated from Ollama
};

/**
 * Default values for project settings
 */
const DEFAULT_PROJECT_SETTINGS: Partial<ProjectSettings> = {
  model: undefined // Will be set dynamically from Ollama
};

/**
 * Unified settings manager that handles both user-level and project-level settings
 */
export class SettingsManager {
  private static instance: SettingsManager;
  
  private userSettingsPath: string;
  private projectSettingsPath: string;
  
  private constructor() {
    // User settings path: ~/.ollama-agent/user-settings.json
    this.userSettingsPath = path.join(os.homedir(), '.ollama-agent', 'user-settings.json');
    
    // Project settings path: .ollama-agent/settings.json (in current working directory)
    this.projectSettingsPath = path.join(process.cwd(), '.ollama-agent', 'settings.json');
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }
  
  /**
   * Ensure directory exists for a given file path
   */
  private ensureDirectoryExists(filePath: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }
  
  /**
   * Load user settings from ~/.ollama-agent/user-settings.json
   */
  public loadUserSettings(): UserSettings {
    try {
      if (!fs.existsSync(this.userSettingsPath)) {
        // Create default user settings if file doesn't exist
        this.saveUserSettings(DEFAULT_USER_SETTINGS);
        return { ...DEFAULT_USER_SETTINGS };
      }
      
      const content = fs.readFileSync(this.userSettingsPath, 'utf-8');
      const settings = JSON.parse(content);
      
      // Merge with defaults to ensure all required fields exist
      return { ...DEFAULT_USER_SETTINGS, ...settings };
    } catch (error) {
      console.warn('Failed to load user settings:', error instanceof Error ? error.message : 'Unknown error');
      return { ...DEFAULT_USER_SETTINGS };
    }
  }
  
  /**
   * Save user settings to ~/.ollama-agent/user-settings.json
   */
  public saveUserSettings(settings: Partial<UserSettings>): void {
    try {
      this.ensureDirectoryExists(this.userSettingsPath);

      // Read existing settings directly to avoid recursion
      let existingSettings: UserSettings = { ...DEFAULT_USER_SETTINGS };
      if (fs.existsSync(this.userSettingsPath)) {
        try {
          const content = fs.readFileSync(this.userSettingsPath, 'utf-8');
          const parsed = JSON.parse(content);
          existingSettings = { ...DEFAULT_USER_SETTINGS, ...parsed };
        } catch (error) {
          // If file is corrupted, use defaults
          console.warn('Corrupted user settings file, using defaults');
        }
      }

      const mergedSettings = { ...existingSettings, ...settings };

      fs.writeFileSync(
        this.userSettingsPath,
        JSON.stringify(mergedSettings, null, 2),
        { mode: 0o600 } // Secure permissions for API key
      );
    } catch (error) {
      console.error('Failed to save user settings:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }
  
  /**
   * Update a specific user setting
   */
  public updateUserSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]): void {
    const settings = { [key]: value } as Partial<UserSettings>;
    this.saveUserSettings(settings);
  }
  
  /**
   * Get a specific user setting
   */
  public getUserSetting<K extends keyof UserSettings>(key: K): UserSettings[K] {
    const settings = this.loadUserSettings();
    return settings[key];
  }
  
  /**
   * Load project settings from .ollama-agent/settings.json
   */
  public loadProjectSettings(): ProjectSettings {
    try {
      if (!fs.existsSync(this.projectSettingsPath)) {
        // Create default project settings if file doesn't exist
        this.saveProjectSettings(DEFAULT_PROJECT_SETTINGS);
        return { ...DEFAULT_PROJECT_SETTINGS };
      }
      
      const content = fs.readFileSync(this.projectSettingsPath, 'utf-8');
      const settings = JSON.parse(content);
      
      // Merge with defaults
      return { ...DEFAULT_PROJECT_SETTINGS, ...settings };
    } catch (error) {
      console.warn('Failed to load project settings:', error instanceof Error ? error.message : 'Unknown error');
      return { ...DEFAULT_PROJECT_SETTINGS };
    }
  }
  
  /**
   * Save project settings to .ollama-agent/settings.json
   */
  public saveProjectSettings(settings: Partial<ProjectSettings>): void {
    try {
      this.ensureDirectoryExists(this.projectSettingsPath);

      // Read existing settings directly to avoid recursion
      let existingSettings: ProjectSettings = { ...DEFAULT_PROJECT_SETTINGS };
      if (fs.existsSync(this.projectSettingsPath)) {
        try {
          const content = fs.readFileSync(this.projectSettingsPath, 'utf-8');
          const parsed = JSON.parse(content);
          existingSettings = { ...DEFAULT_PROJECT_SETTINGS, ...parsed };
        } catch (error) {
          // If file is corrupted, use defaults
          console.warn('Corrupted project settings file, using defaults');
        }
      }

      const mergedSettings = { ...existingSettings, ...settings };

      fs.writeFileSync(
        this.projectSettingsPath,
        JSON.stringify(mergedSettings, null, 2)
      );
    } catch (error) {
      console.error('Failed to save project settings:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }
  
  /**
   * Update a specific project setting
   */
  public updateProjectSetting<K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]): void {
    const settings = { [key]: value } as Partial<ProjectSettings>;
    this.saveProjectSettings(settings);
  }
  
  /**
   * Get a specific project setting
   */
  public getProjectSetting<K extends keyof ProjectSettings>(key: K): ProjectSettings[K] {
    const settings = this.loadProjectSettings();
    return settings[key];
  }
  
  /**
   * Get the current model with proper fallback logic:
   * 1. Project-specific model setting
   * 2. User's default model
   * 3. First available model from Ollama
   * 4. Error if no models available
   */
  public async getCurrentModel(): Promise<string> {
    const projectModel = this.getProjectSetting('model');
    if (projectModel) {
      return projectModel;
    }
    
    const userDefaultModel = this.getUserSetting('defaultModel');
    if (userDefaultModel) {
      return userDefaultModel;
    }
    
    // Try to get first available model from Ollama
    try {
      const ollamaClient = new OllamaClient(undefined, this.getBaseURL());
      const availableModels = await ollamaClient.refreshAvailableModels();
      
      if (availableModels.length > 0) {
        const firstModel = availableModels[0];
        // Save as default for future use
        this.updateUserSetting('defaultModel', firstModel);
        return firstModel;
      }
    } catch (error) {
      console.warn('Failed to fetch models from Ollama:', error instanceof Error ? error.message : 'Unknown error');
    }
    
    throw new Error('No models available. Please install models in Ollama first using: ollama pull <model-name>');
  }
  
  /**
   * Set the current model for the project
   */
  public setCurrentModel(model: string): void {
    this.updateProjectSetting('model', model);
  }
  
  /**
   * Get available models list from Ollama server
   */
  public async getAvailableModels(): Promise<string[]> {
    try {
      const ollamaClient = new OllamaClient(undefined, this.getBaseURL());
      const models = await ollamaClient.refreshAvailableModels();
      
      // Update user settings with current models
      this.updateUserSetting('models', models);
      
      return models;
    } catch (error) {
      console.warn('Failed to fetch models from Ollama:', error instanceof Error ? error.message : 'Unknown error');
      
      // Fallback to cached models from user settings
      const cachedModels = this.getUserSetting('models');
      return cachedModels || [];
    }
  }
  
  /**
   * Get API key from user settings or environment (Ollama doesn't require API key)
   */
  public getApiKey(): string | undefined {
    // Ollama doesn't require API key
    return undefined;
  }

  /**
   * Synchronous version of getCurrentModel for compatibility
   * Returns cached model or throws error
   */
  public getCurrentModelSync(): string {
    const projectModel = this.getProjectSetting('model');
    if (projectModel) {
      return projectModel;
    }
    
    const userDefaultModel = this.getUserSetting('defaultModel');
    if (userDefaultModel) {
      return userDefaultModel;
    }
    
    throw new Error('No model configured. Please run the application first to auto-detect available models.');
  }
  
  /**
   * Get base URL from user settings or environment
   */
  public getBaseURL(): string {
    // First check environment variable
    const envBaseURL = process.env.OLLAMA_BASE_URL;
    if (envBaseURL) {
      return envBaseURL;
    }
    
    // Then check user settings
    const userBaseURL = this.getUserSetting('baseURL');
    return userBaseURL || DEFAULT_USER_SETTINGS.baseURL || 'http://localhost:11434';
  }
}

/**
 * Convenience function to get the singleton instance
 */
export function getSettingsManager(): SettingsManager {
  return SettingsManager.getInstance();
}
