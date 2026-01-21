import { spawn, spawnSync } from "child_process";
import { ToolResult } from "../types";
import { ConfirmationService } from "../utils/confirmation-service";
import * as fs from "fs-extra";
import * as path from "path";

export interface SearchResult {
  file: string;
  line: number;
  column: number;
  text: string;
  match: string;
}

export interface FileSearchResult {
  path: string;
  name: string;
  score: number;
}

export interface UnifiedSearchResult {
  type: "text" | "file";
  file: string;
  line?: number;
  column?: number;
  text?: string;
  match?: string;
  score?: number;
}

export class SearchTool {
  private confirmationService = ConfirmationService.getInstance();
  private currentDirectory: string = process.cwd();
  private ripgrepAvailable: boolean | null = null;

  /**
   * Unified search method that can search for text content or find files
   */
  async search(
    query: string,
    options: {
      searchType?: "text" | "files" | "both";
      includePattern?: string;
      excludePattern?: string;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      regex?: boolean;
      maxResults?: number;
      fileTypes?: string[];
      excludeFiles?: string[];
      includeHidden?: boolean;
    } = {}
  ): Promise<ToolResult> {
    try {
      // Handle empty query - use "*" as fallback to list files
      let searchQuery = query;
      if (!searchQuery || typeof searchQuery !== "string" || searchQuery.trim() === "") {
        searchQuery = "*";
      }

      const searchType = options.searchType || "files";
      const results: UnifiedSearchResult[] = [];

      // Search for text content if requested
      if (searchType === "text" || searchType === "both") {
        const textResults = await this.executeTextSearch(searchQuery, options);
        results.push(
          ...textResults.map((r) => ({
            type: "text" as const,
            file: r.file,
            line: r.line,
            column: r.column,
            text: r.text,
            match: r.match,
          }))
        );
      }

      // Search for files if requested
      if (searchType === "files" || searchType === "both") {
        const fileResults = await this.findFilesByPattern(searchQuery, options);
        results.push(
          ...fileResults.map((r) => ({
            type: "file" as const,
            file: r.path,
            score: r.score,
          }))
        );
      }

      if (results.length === 0) {
        return {
          success: true,
          output: `No results found for "${searchQuery}"`,
        };
      }

      const formattedOutput = this.formatUnifiedResults(
        results,
        searchQuery,
        searchType
      );

      return {
        success: true,
        output: formattedOutput,
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Search error: ${error.message}`,
      };
    }
  }

  /**
   * Check if ripgrep is available in the system
   */
  private isRipgrepAvailable(): boolean {
    if (this.ripgrepAvailable !== null) {
      return this.ripgrepAvailable;
    }

    try {
      const result = spawnSync("rg", ["--version"], { timeout: 5000 });
      this.ripgrepAvailable = result.status === 0;
    } catch {
      this.ripgrepAvailable = false;
    }

    return this.ripgrepAvailable;
  }

  /**
   * Execute text search - uses ripgrep if available, otherwise falls back to Node.js implementation
   */
  private async executeTextSearch(
    query: string,
    options: {
      includePattern?: string;
      excludePattern?: string;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      regex?: boolean;
      maxResults?: number;
      fileTypes?: string[];
      excludeFiles?: string[];
    }
  ): Promise<SearchResult[]> {
    if (this.isRipgrepAvailable()) {
      return this.executeRipgrep(query, options);
    } else {
      return this.executeNodeSearch(query, options);
    }
  }

  /**
   * Fallback search implementation using pure Node.js (no external dependencies)
   */
  private async executeNodeSearch(
    query: string,
    options: {
      includePattern?: string;
      excludePattern?: string;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      regex?: boolean;
      maxResults?: number;
      fileTypes?: string[];
      excludeFiles?: string[];
    }
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const maxResults = options.maxResults || 100;
    const caseSensitive = options.caseSensitive ?? false;

    // Build regex pattern
    let pattern: RegExp;
    try {
      let regexStr = options.regex ? query : this.escapeRegex(query);
      if (options.wholeWord) {
        regexStr = `\\b${regexStr}\\b`;
      }
      pattern = new RegExp(regexStr, caseSensitive ? "g" : "gi");
    } catch {
      // If regex is invalid, fall back to literal search
      pattern = new RegExp(this.escapeRegex(query), caseSensitive ? "g" : "gi");
    }

    // Common binary file extensions to skip
    const binaryExtensions = new Set([
      ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".svg",
      ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
      ".zip", ".tar", ".gz", ".rar", ".7z",
      ".exe", ".dll", ".so", ".dylib",
      ".mp3", ".mp4", ".avi", ".mov", ".wav", ".flac",
      ".ttf", ".woff", ".woff2", ".eot", ".otf",
      ".pyc", ".class", ".o", ".obj",
      ".lock", ".lockb"
    ]);

    // Directories to skip
    const skipDirs = new Set([
      "node_modules", ".git", ".svn", ".hg", "dist", "build",
      ".next", ".cache", "__pycache__", ".venv", "venv",
      "coverage", ".nyc_output", ".turbo"
    ]);

    const walkAndSearch = async (dir: string, depth: number = 0): Promise<void> => {
      if (depth > 15 || results.length >= maxResults) return;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (results.length >= maxResults) break;

          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(this.currentDirectory, fullPath);

          // Skip hidden files/directories
          if (entry.name.startsWith(".") && entry.name !== ".env.example") {
            continue;
          }

          // Skip common directories
          if (entry.isDirectory() && skipDirs.has(entry.name)) {
            continue;
          }

          // Apply exclude pattern
          if (options.excludePattern && relativePath.includes(options.excludePattern)) {
            continue;
          }

          // Apply exclude files
          if (options.excludeFiles?.some(f => relativePath.includes(f))) {
            continue;
          }

          if (entry.isDirectory()) {
            await walkAndSearch(fullPath, depth + 1);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();

            // Skip binary files
            if (binaryExtensions.has(ext)) {
              continue;
            }

            // Apply include pattern
            if (options.includePattern) {
              const globPattern = options.includePattern.replace(/\*/g, ".*");
              if (!new RegExp(globPattern).test(entry.name)) {
                continue;
              }
            }

            // Apply file type filter
            if (options.fileTypes && options.fileTypes.length > 0) {
              const fileExt = ext.slice(1); // Remove the dot
              if (!options.fileTypes.includes(fileExt)) {
                continue;
              }
            }

            // Search in file
            try {
              const stats = await fs.stat(fullPath);
              // Skip files larger than 1MB
              if (stats.size > 1024 * 1024) {
                continue;
              }

              const content = await fs.readFile(fullPath, "utf-8");
              const lines = content.split("\n");

              for (let i = 0; i < lines.length && results.length < maxResults; i++) {
                const line = lines[i];
                pattern.lastIndex = 0; // Reset regex state

                const match = pattern.exec(line);
                if (match) {
                  results.push({
                    file: relativePath,
                    line: i + 1,
                    column: match.index + 1,
                    text: line.trim().substring(0, 200),
                    match: match[0],
                  });
                }
              }
            } catch {
              // Skip files that can't be read (binary, permission issues, etc.)
            }
          }
        }
      } catch {
        // Skip directories we can't read
      }
    };

    await walkAndSearch(this.currentDirectory);
    return results;
  }

  /**
   * Escape special regex characters
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Execute ripgrep command with specified options
   */
  private async executeRipgrep(
    query: string,
    options: {
      includePattern?: string;
      excludePattern?: string;
      caseSensitive?: boolean;
      wholeWord?: boolean;
      regex?: boolean;
      maxResults?: number;
      fileTypes?: string[];
      excludeFiles?: string[];
    }
  ): Promise<SearchResult[]> {
    return new Promise((resolve, reject) => {
      const args = [
        "--json",
        "--with-filename",
        "--line-number",
        "--column",
        "--no-heading",
        "--color=never",
      ];

      // Add case sensitivity
      if (!options.caseSensitive) {
        args.push("--ignore-case");
      }

      // Add whole word matching
      if (options.wholeWord) {
        args.push("--word-regexp");
      }

      // Add regex mode
      if (!options.regex) {
        args.push("--fixed-strings");
      }

      // Add max results limit
      if (options.maxResults) {
        args.push("--max-count", options.maxResults.toString());
      }

      // Add file type filters
      if (options.fileTypes) {
        options.fileTypes.forEach((type) => {
          args.push("--type", type);
        });
      }

      // Add include pattern
      if (options.includePattern) {
        args.push("--glob", options.includePattern);
      }

      // Add exclude pattern
      if (options.excludePattern) {
        args.push("--glob", `!${options.excludePattern}`);
      }

      // Add exclude files
      if (options.excludeFiles) {
        options.excludeFiles.forEach((file) => {
          args.push("--glob", `!${file}`);
        });
      }

      // Respect gitignore and common ignore patterns
      args.push(
        "--no-require-git",
        "--follow",
        "--glob",
        "!.git/**",
        "--glob",
        "!node_modules/**",
        "--glob",
        "!.DS_Store",
        "--glob",
        "!*.log"
      );

      // Add query and search directory
      args.push(query, this.currentDirectory);

      const rg = spawn("rg", args);
      let output = "";
      let errorOutput = "";

      rg.stdout.on("data", (data) => {
        output += data.toString();
      });

      rg.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });

      rg.on("close", (code) => {
        if (code === 0 || code === 1) {
          // 0 = found, 1 = not found
          const results = this.parseRipgrepOutput(output);
          resolve(results);
        } else {
          reject(new Error(`Ripgrep failed with code ${code}: ${errorOutput}`));
        }
      });

      rg.on("error", (error) => {
        reject(error);
      });
    });
  }

  /**
   * Parse ripgrep JSON output into SearchResult objects
   */
  private parseRipgrepOutput(output: string): SearchResult[] {
    const results: SearchResult[] = [];
    const lines = output
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "match") {
          const data = parsed.data;
          results.push({
            file: data.path.text,
            line: data.line_number,
            column: data.submatches[0]?.start || 0,
            text: data.lines.text.trim(),
            match: data.submatches[0]?.match?.text || "",
          });
        }
      } catch (e) {
        // Skip invalid JSON lines
        continue;
      }
    }

    return results;
  }

  /**
   * Find files by pattern using a simple file walking approach
   */
  private async findFilesByPattern(
    pattern: string,
    options: {
      maxResults?: number;
      includeHidden?: boolean;
      excludePattern?: string;
    }
  ): Promise<FileSearchResult[]> {
    const files: FileSearchResult[] = [];
    const maxResults = options.maxResults || 50;
    const searchPattern = pattern.toLowerCase();

    const walkDir = async (dir: string, depth: number = 0): Promise<void> => {
      if (depth > 10 || files.length >= maxResults) return; // Prevent infinite recursion and limit results

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          if (files.length >= maxResults) break;

          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(this.currentDirectory, fullPath);

          // Skip hidden files unless explicitly included
          if (!options.includeHidden && entry.name.startsWith(".")) {
            continue;
          }

          // Skip common directories
          if (
            entry.isDirectory() &&
            [
              "node_modules",
              ".git",
              ".svn",
              ".hg",
              "dist",
              "build",
              ".next",
              ".cache",
            ].includes(entry.name)
          ) {
            continue;
          }

          // Apply exclude pattern
          if (
            options.excludePattern &&
            relativePath.includes(options.excludePattern)
          ) {
            continue;
          }

          if (entry.isFile()) {
            const score = this.calculateFileScore(
              entry.name,
              relativePath,
              searchPattern
            );
            if (score > 0) {
              files.push({
                path: relativePath,
                name: entry.name,
                score,
              });
            }
          } else if (entry.isDirectory()) {
            await walkDir(fullPath, depth + 1);
          }
        }
      } catch (error) {
        // Skip directories we can't read
      }
    };

    await walkDir(this.currentDirectory);

    // Sort by score (descending) and return top results
    return files.sort((a, b) => b.score - a.score).slice(0, maxResults);
  }

  /**
   * Calculate fuzzy match score for file names
   */
  private calculateFileScore(
    fileName: string,
    filePath: string,
    pattern: string
  ): number {
    const lowerFileName = fileName.toLowerCase();
    const lowerFilePath = filePath.toLowerCase();

    // Exact matches get highest score
    if (lowerFileName === pattern) return 100;
    if (lowerFileName.includes(pattern)) return 80;

    // Path matches get medium score
    if (lowerFilePath.includes(pattern)) return 60;

    // Fuzzy matching - check if all characters of pattern exist in order
    let patternIndex = 0;
    for (
      let i = 0;
      i < lowerFileName.length && patternIndex < pattern.length;
      i++
    ) {
      if (lowerFileName[i] === pattern[patternIndex]) {
        patternIndex++;
      }
    }

    if (patternIndex === pattern.length) {
      // All characters found in order - score based on how close they are
      return Math.max(10, 40 - (fileName.length - pattern.length));
    }

    return 0;
  }

  /**
   * Format unified search results for display
   */
  private formatUnifiedResults(
    results: UnifiedSearchResult[],
    query: string,
    searchType: string
  ): string {
    if (results.length === 0) {
      return `No results found for "${query}"`;
    }

    let output = `Search results for "${query}":\n`;

    // Separate text and file results
    const textResults = results.filter((r) => r.type === "text");
    const fileResults = results.filter((r) => r.type === "file");

    // Show all unique files (from both text matches and file matches)
    const allFiles = new Set<string>();

    // Add files from text results
    textResults.forEach((result) => {
      allFiles.add(result.file);
    });

    // Add files from file search results
    fileResults.forEach((result) => {
      allFiles.add(result.file);
    });

    const fileList = Array.from(allFiles);
    const displayLimit = 8;

    // Show files in compact format
    fileList.slice(0, displayLimit).forEach((file) => {
      // Count matches in this file for text results
      const matchCount = textResults.filter((r) => r.file === file).length;
      const matchIndicator = matchCount > 0 ? ` (${matchCount} matches)` : "";
      output += `  ${file}${matchIndicator}\n`;
    });

    // Show "+X more" if there are additional results
    if (fileList.length > displayLimit) {
      const remaining = fileList.length - displayLimit;
      output += `  ... +${remaining} more\n`;
    }

    return output.trim();
  }

  /**
   * Update current working directory
   */
  setCurrentDirectory(directory: string): void {
    this.currentDirectory = directory;
  }

  /**
   * Get current working directory
   */
  getCurrentDirectory(): string {
    return this.currentDirectory;
  }
}
