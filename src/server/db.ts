import { env } from "@/env.cloudflare";
import {
  getDbWriteConnection as _getDbWriteConnection,
  getDbReadConnection as _getDbReadConnection,
} from "@/db";

export function getDbWriteConnection() {
  return _getDbWriteConnection(env);
}

export function getDbReadConnection() {
  return _getDbReadConnection(env);
}
