import process from "node:process";
import path from "node:path";
import { existsSync } from "node:fs";
import { hashPassword } from "better-auth/crypto";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { getNullainConfig } from "../lib/server/nullain-config";
import {
  assertNullainDatabaseReady,
  migrateNullainDatabase,
  openNullainDatabase,
} from "../lib/server/nullain-db";

const localEnvironment = path.resolve(process.cwd(), ".env.local");
if (existsSync(localEnvironment)) process.loadEnvFile(localEnvironment);

function argument(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((item) => item.startsWith(prefix))?.slice(prefix.length);
}

async function hiddenPrompt(label: string) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Este comando exige um terminal interativo para ler a senha com segurança.");
  }
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise<string>((resolve, reject) => {
    let value = "";
    const finish = (error?: Error) => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: string | Buffer) => {
      for (const character of chunk.toString()) {
        if (character === "\r" || character === "\n") {
          process.stdout.write("\n");
          finish();
          return;
        }
        if (character === "\u0003") {
          finish(new Error("Operação cancelada."));
          return;
        }
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else value += character;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function confirmedPassword() {
  const password = await hiddenPrompt("Senha: ");
  const confirmation = await hiddenPrompt("Confirme a senha: ");
  if (password !== confirmation) throw new Error("As senhas não conferem.");
  if (password.length < 12 || password.length > 128) {
    throw new Error("A senha deve ter entre 12 e 128 caracteres.");
  }
  return password;
}

async function main() {
  const command = process.argv[2];
  const config = getNullainConfig();
  const database = openNullainDatabase(config.databasePath);
  try {
    if (command === "migrate") {
      migrateNullainDatabase(database);
      console.log(`Migrações aplicadas em ${config.databasePath}`);
      return;
    }
    assertNullainDatabaseReady(database);
    const email = argument("email")?.trim().toLowerCase();
    if (!email)
      throw new Error(
        "Informe --email=usuario@exemplo.com (a senha nunca vai na linha de comando).\n",
      );
    const password = await confirmedPassword();

    if (command === "create-user") {
      const name = argument("name")?.trim() || email.split("@")[0];
      const auth = betterAuth({
        secret: config.secret,
        baseURL: config.baseURL,
        database,
        emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
        plugins: [admin()],
      });
      const existing = database.prepare('SELECT id FROM "user" WHERE email = ?').get(email);
      if (existing) throw new Error("Já existe um usuário com esse e-mail.");
      const result = await auth.api.createUser({ body: { email, password, name, role: "admin" } });
      console.log(`Usuário local criado: ${result.user.email}`);
      return;
    }

    if (command === "reset-password") {
      const user = database.prepare('SELECT id FROM "user" WHERE email = ?').get(email) as
        | { id: string }
        | undefined;
      if (!user) throw new Error("Usuário não encontrado.");
      const passwordHash = await hashPassword(password);
      const reset = database.transaction(() => {
        const updated = database
          .prepare(
            'UPDATE "account" SET password = ?, updatedAt = ? WHERE userId = ? AND providerId = ?',
          )
          .run(passwordHash, Date.now(), user.id, "credential");
        if (updated.changes !== 1) throw new Error("Conta de credencial não encontrada.");
        database.prepare('DELETE FROM "session" WHERE userId = ?').run(user.id);
      });
      reset();
      console.log(`Senha redefinida e sessões revogadas: ${email}`);
      return;
    }
    throw new Error(
      "Uso: npm run db:migrate | npm run auth:create-user -- --email=... --name=... | npm run auth:reset-password -- --email=...",
    );
  } finally {
    database.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Falha inesperada.");
  process.exitCode = 1;
});
