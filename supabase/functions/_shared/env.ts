// 環境変数アクセスの共通ヘルパー
//
// Deno (本番 Edge Runtime) と Node (vitest) の両方で動くようにする。
// ここに集約することで auth.ts や cors.ts での型キャストを排除する。

interface DenoLike {
  env: { get: (key: string) => string | undefined };
}
interface NodeLike {
  env: Record<string, string | undefined>;
}

function readDenoEnv(name: string): string | undefined {
  const g = globalThis as { Deno?: DenoLike };
  return g.Deno?.env.get(name);
}

function readNodeEnv(name: string): string | undefined {
  const g = globalThis as { process?: NodeLike };
  return g.process?.env?.[name];
}

/** env を取得する。未設定なら undefined。 */
export function getEnv(name: string): string | undefined {
  return readDenoEnv(name) ?? readNodeEnv(name);
}

/** env を必須で取得。未設定なら明示的なエラーで停止。 */
export function mustEnv(name: string): string {
  const v = getEnv(name);
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}
