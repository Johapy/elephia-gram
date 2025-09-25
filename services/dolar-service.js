import { createClient } from "redis";

const redis = createClient();
await redis.connect();

export async function getBTC() {
  const value = await redis.get("btc:value");
  return value ? parseFloat(value) : "Dato no disponible";
}

console.log(typeof await getBTC());