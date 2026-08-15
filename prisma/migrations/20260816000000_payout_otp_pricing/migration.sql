-- OTP de retrait organisateur + seuil de double validation admin + commission par défaut 3 %
-- (brief sigma-events-commissions-brief-1.md)

-- Payout : date de confirmation OTP par l'organisateur (sécurisation du retrait)
ALTER TABLE "Payout" ADD COLUMN "otpVerifiedAt" DATETIME;

-- OtpCode : but du code (inscription | recuperation | retrait) — un OTP de retrait
-- ne peut pas valider une inscription et inversement
ALTER TABLE "OtpCode" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'inscription';

-- Commission Sigma par défaut : 10 % → 3 % (modèle FedaPay du brief)
-- Les organisateurs existants gardent leur taux (ajustable par l'admin).
