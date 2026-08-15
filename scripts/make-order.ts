import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import "dotenv/config";
import { createOrder, simulatePayment } from "../lib/shop";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || "file:./dev.db" }),
});

async function main() {
  const pay = process.argv.includes("--pay");
  const event = await prisma.event.findFirst({ where: { salesSlug: "gbediga-vodoun-night" } });
  if (!event) {
    console.log("❌ événement démo introuvable");
    process.exit(1);
  }
  const cat = await prisma.ticketCategory.findFirst({ where: { eventId: event.id, name: "VIP" } });
  if (!cat) {
    console.log("❌ catégorie VIP introuvable");
    process.exit(1);
  }

  const result = await createOrder({
    eventId: event.id,
    categoryId: cat.id,
    customerName: "Test Browser",
    customerPhone: "90123456",
    customerEmail: "test@exemple.com",
  });
  if (!result.ok) {
    console.log(`❌ commande refusée : ${result.error}`);
    process.exit(1);
  }
  console.log(`ORDER_ID=${result.orderId}`);
  console.log(`PAY_URL=http://localhost:3000/acheter/payer/${result.orderId}`);
  console.log(`REFERENCE=${result.reference}`);

  if (pay) {
    const paid = await simulatePayment(result.orderId);
    if (!paid.ok) {
      console.log(`❌ paiement refusé : ${paid.error}`);
      process.exit(1);
    }
    console.log(`CONFIRM_URL=http://localhost:3000/acheter/confirmation/${result.orderId}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
