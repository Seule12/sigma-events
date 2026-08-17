import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Role } from "@/app/generated/prisma/enums";

export const metadata = {
  title: "Espace agence — Sigma Security",
};

// Les profils de compte ont été uniformisés (plus de type Pro / Organisation) :
// l'espace agence n'existe plus, tout passe par le tableau de bord.
export default async function AgencyPage() {
  await requireUser(Role.ORGANIZER);
  redirect("/dashboard");
}
