import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import {
  LocalFilesystem,
  type CopyOptions,
  type FileContent,
  type FileEntry,
  type ListOptions,
  type ReadOptions,
  type RemoveOptions,
  type WriteOptions,
} from "@mastra/core/workspace";

const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export type WriteCapability = { level: "none" | "plan" | "build" };

function digest(content: Buffer) {
  return createHash("sha256").update(content).digest("hex");
}

export class SecureProjectFilesystem extends LocalFilesystem {
  private static readonly operationQueues = new Map<string, Promise<void>>();
  private readonly capability: WriteCapability;
  private readonly observedHashes = new Map<string, string>();

  constructor(basePath: string, capability: WriteCapability) {
    super({ basePath, contained: true, allowedPaths: [] });
    this.capability = capability;
  }

  private normalize(input: string) {
    if (!input || input.includes("\0") || input.length > 1024) throw new Error("Caminho inválido.");
    const unix = input.replaceAll("\\", "/");
    if (/^(?:[a-z]:|\/\/|\\\\|\\\?\\|\\\.\\)/i.test(input) || unix.includes(":")) {
      throw new Error("Caminhos absolutos, UNC, dispositivos e ADS não são permitidos.");
    }
    const parts = unix.split("/").filter((part) => part && part !== ".");
    if (
      parts.some(
        (part) =>
          part === ".." || WINDOWS_DEVICE.test(part) || part.endsWith(".") || part.endsWith(" "),
      )
    ) {
      throw new Error("O caminho contém um segmento não permitido.");
    }
    return parts.join("/");
  }

  private absolute(input: string) {
    return path.join(this.basePath, ...this.normalize(input).split("/").filter(Boolean));
  }

  private async rejectLinks(input: string, allowMissingLeaf = false) {
    const relative = this.normalize(input);
    const parts = relative.split("/").filter(Boolean);
    let current = this.basePath;
    for (let index = 0; index < parts.length; index += 1) {
      current = path.join(current, parts[index]);
      try {
        const stats = await fs.lstat(current);
        if (stats.isSymbolicLink()) throw new Error("Links simbólicos não são permitidos.");
        if (stats.isFile() && stats.nlink > 1) throw new Error("Hard links não são permitidos.");
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code === "ENOENT" &&
          (allowMissingLeaf || index < parts.length)
        )
          continue;
        throw error;
      }
    }
    return relative;
  }

  private assertWrite(input?: string) {
    if (this.capability.level === "build") return;
    const normalized = input ? this.normalize(input) : "";
    if (
      this.capability.level === "plan" &&
      (normalized === ".mastracode" ||
        normalized === ".mastracode/plans" ||
        (normalized.startsWith(".mastracode/plans/") && normalized.endsWith(".md")))
    ) {
      return;
    }
    throw new Error("Escrita bloqueada: aprove o plano desta execução primeiro.");
  }

  private async serialized<T>(key: string, operation: () => Promise<T>) {
    const lockKey = this.absolute(key).toLowerCase();
    const previous = SecureProjectFilesystem.operationQueues.get(lockKey) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => (release = resolve));
    const tail = previous.then(() => next);
    SecureProjectFilesystem.operationQueues.set(lockKey, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (SecureProjectFilesystem.operationQueues.get(lockKey) === tail) {
        SecureProjectFilesystem.operationQueues.delete(lockKey);
      }
    }
  }

  override async readFile(input: string, options?: ReadOptions) {
    const relative = await this.rejectLinks(input);
    const result = await super.readFile(relative, options);
    const bytes = Buffer.isBuffer(result) ? result : Buffer.from(result);
    this.observedHashes.set(relative, digest(bytes));
    return result;
  }

  override async writeFile(input: string, content: FileContent, options?: WriteOptions) {
    this.assertWrite(input);
    const relative = await this.rejectLinks(input, true);
    return this.serialized(relative, async () => {
      const destination = this.absolute(relative);
      const parent = path.dirname(destination);
      if (options?.recursive) await fs.mkdir(parent, { recursive: true });
      await this.rejectLinks(path.dirname(relative), true);
      try {
        const stats = await fs.lstat(destination);
        if (stats.isSymbolicLink() || stats.nlink > 1)
          throw new Error("Destino vinculado não permitido.");
        if (options?.overwrite === false) throw new Error("O arquivo já existe.");
        if (options?.expectedMtime && stats.mtimeMs !== options.expectedMtime.getTime()) {
          throw new Error("O arquivo mudou desde a leitura.");
        }
        const observed = this.observedHashes.get(relative);
        if (!observed && !options?.expectedMtime) {
          throw new Error("Releia o arquivo existente antes de sobrescrevê-lo.");
        }
        if (observed && digest(await fs.readFile(destination)) !== observed) {
          throw new Error("Conflito de conteúdo: releia o arquivo antes de gravar.");
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content);
      const temporary = path.join(parent, `.${path.basename(destination)}.${randomUUID()}.tmp`);
      try {
        await fs.writeFile(temporary, bytes, { flag: "wx" });
        await fs.rename(temporary, destination);
      } finally {
        await fs.rm(temporary, { force: true }).catch(() => undefined);
      }
      this.observedHashes.set(relative, digest(bytes));
    });
  }

  override async appendFile(input: string, content: FileContent) {
    this.assertWrite(input);
    const relative = await this.rejectLinks(input, true);
    const current = (await this.exists(relative))
      ? await fs.readFile(this.absolute(relative))
      : Buffer.alloc(0);
    if (current.length) this.observedHashes.set(relative, digest(current));
    await this.writeFile(relative, Buffer.concat([current, Buffer.from(content)]));
  }

  override async deleteFile(input: string, options?: RemoveOptions) {
    this.assertWrite(input);
    return super.deleteFile(await this.rejectLinks(input), options);
  }

  override async copyFile(source: string, destination: string, options?: CopyOptions) {
    this.assertWrite(destination);
    return super.copyFile(
      await this.rejectLinks(source),
      await this.rejectLinks(destination, true),
      options,
    );
  }

  override async moveFile(source: string, destination: string, options?: CopyOptions) {
    this.assertWrite(destination);
    return super.moveFile(
      await this.rejectLinks(source),
      await this.rejectLinks(destination, true),
      options,
    );
  }

  override async mkdir(input: string, options?: { recursive?: boolean }) {
    this.assertWrite(input);
    return super.mkdir(await this.rejectLinks(input, true), options);
  }

  override async rmdir(input: string, options?: RemoveOptions) {
    this.assertWrite(input);
    return super.rmdir(await this.rejectLinks(input), options);
  }

  override async readdir(input: string, options?: ListOptions): Promise<FileEntry[]> {
    const relative = await this.rejectLinks(input);
    const entries = await super.readdir(relative, { ...options, recursive: false });
    if (!options?.recursive) return entries;
    const output: FileEntry[] = [];
    const maximum = options.maxDepth ?? 20;
    const visit = async (directory: string, depth: number) => {
      if (depth > maximum) return;
      const children = await super.readdir(directory, {
        extension: options.extension,
        recursive: false,
      });
      for (const child of children) {
        const childPath = [directory, child.name].filter(Boolean).join("/");
        output.push({ ...child, name: childPath });
        if (child.type === "directory" && !child.isSymlink) {
          await this.rejectLinks(childPath);
          await visit(childPath, depth + 1);
        }
      }
    };
    await visit(relative, 0);
    return output;
  }

  override async exists(input: string) {
    const relative = this.normalize(input);
    try {
      await this.rejectLinks(relative);
      return super.exists(relative);
    } catch {
      return false;
    }
  }

  override async stat(input: string) {
    return super.stat(await this.rejectLinks(input));
  }

  override async realpath(input: string) {
    return super.realpath(await this.rejectLinks(input));
  }

  override resolveAbsolutePath(input: string) {
    try {
      return this.absolute(input);
    } catch {
      return undefined;
    }
  }
}
