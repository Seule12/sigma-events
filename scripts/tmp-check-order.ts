import { PrismaClient } from "../app/generated/prisma-pg/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const p = new PrismaClient({ adapter });

async function main() {
  const o = await p.order.findUnique({ where: { id: "cmswv2wzj000032fprq09rcub" } });
  console.log(
    "RESULT",
    o
      ? `${o.status}|amount=${o.amount}|deliveryFee=${o.deliveryFee ?? ""}|method=${o.deliveryMethod ?? ""}|ext=${o.externalStatus ?? ""}`
      : "NULL"
  );
  await p.$disconnect();
}

main().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
