import fs from "node:fs";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

function loadDotEnv(path = ".env") {
  if (!fs.existsSync(path)) return {};

  return Object.fromEntries(
    fs
      .readFileSync(path, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => !line.trim().startsWith("#"))
      .map((line) => line.split(/=(.+)/)),
  );
}

function getArg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}

function requireEnv(env, key) {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

function generatePassword() {
  return `Adm${crypto.randomBytes(6).toString("base64url")}@7`;
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 12);
}

async function main() {
  const fileEnv = loadDotEnv();
  const env = { ...fileEnv, ...process.env };

  const supabaseUrl =
    env.SUPABASE_URL || env.VITE_SUPABASE_URL || requireEnv(env, "SUPABASE_URL");
  const serviceRoleKey = requireEnv(env, "SUPABASE_SERVICE_ROLE_KEY");

  const username = getArg("username") || "admin";
  const password = getArg("password") || generatePassword();
  const passwordHash = hashPassword(password);

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: existing, error: selectError } = await supabase
    .from("lms_admin")
    .select("id, username")
    .eq("username", username)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to query lms_admin: ${JSON.stringify(selectError)}`);
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from("lms_admin")
      .update({ password_hash: passwordHash })
      .eq("id", existing.id);

    if (updateError) {
      throw new Error(
        `Failed to update existing admin: ${JSON.stringify(updateError)}`,
      );
    }

    console.log(`Updated admin credentials`);
  } else {
    const { error: insertError } = await supabase
      .from("lms_admin")
      .insert({ username, password_hash: passwordHash });

    if (insertError) {
      throw new Error(
        `Failed to create admin user: ${JSON.stringify(insertError)}`,
      );
    }

    console.log(`Created admin credentials`);
  }

  console.log(`Username: ${username}`);
  console.log(`Password: ${password}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
