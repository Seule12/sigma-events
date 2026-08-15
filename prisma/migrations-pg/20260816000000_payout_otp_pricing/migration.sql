-- OTP de retrait organisateur + seuil de double validation admin + commission par défaut 3 %
-- (brief sigma-events-commissions-brief-1.md)

-- Payout : date de confirmation OTP par l'organisateur (sécurisation du retrait)
ALTER TABLE "Payout" ADD COLUMN "otpVerifiedAt" TIMESTAMP(3);

-- OtpCode : but du code (inscription | recuperation | retrait)
ALTER TABLE "OtpCode" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'inscription';

-- Commission Sigma par défaut : 10 % → 3 % (modèle FedaPay du brief)
ALTER TABLE "User" ALTER COLUMN "commissionRate" SET DEFAULT 3;
