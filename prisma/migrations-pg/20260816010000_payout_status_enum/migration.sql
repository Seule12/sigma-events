-- Enum PayoutStatus manquant : la table Payout a été créée avec `status TEXT`
-- alors que le schéma déclare `status PayoutStatus @default(PENDING)`.
-- Le client Prisma généré attend le type enum → erreur 42704 (type does not exist).
-- Cette migration crée l'enum et convertit la colonne (les valeurs existantes
-- 'PENDING' etc. sont compatibles avec l'enum).

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PENDING_ADMIN', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED');

-- AlterColumn : TEXT → "PayoutStatus" (cast des valeurs existantes)
ALTER TABLE "Payout" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Payout" ALTER COLUMN "status" TYPE "PayoutStatus" USING "status"::"PayoutStatus";
ALTER TABLE "Payout" ALTER COLUMN "status" SET DEFAULT 'PENDING';
