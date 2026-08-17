import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, CheckInStatus } from "@/app/generated/prisma/enums";
import { toE164 } from "@/lib/phone";

const STATUS_LABEL: Record<CheckInStatus, string> = {
  [CheckInStatus.VALID]: "Entrée validée",
  [CheckInStatus.ENTRY]: "Entrée partielle",
  [CheckInStatus.ALREADY_SCANNED]: "Déjà scanné",
  [CheckInStatus.INVALID]: "Billet invalide",
  [CheckInStatus.FULL]: "Capacité atteinte",
  [CheckInStatus.BLACKLISTED]: "Liste noire",
  [CheckInStatus.TOO_EARLY]: "Trop tôt",
  [CheckInStatus.EXPIRED]: "Événement terminé",
  [CheckInStatus.WRONG_ZONE]: "Mauvaise zone",
  [CheckInStatus.SUSPENDED]: "Entrées suspendues",
};

function csvEscape(value: string): string {
  // Neutralise les formules (injection CSV) : =, +, -, @ en début de cellule.
  let v = value;
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  if (/[;",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.ORGANIZER) {
    return new Response("Non autorisé", { status: 401 });
  }

  const { id } = await params;
  const event = await prisma.event.findFirst({
    where: { id, organizerId: user.id },
    include: {
      checkIns: {
        include: {
          ticket: { include: { category: true } },
          agent: { select: { name: true } },
        },
        orderBy: { scannedAt: "asc" },
      },
    },
  });
  if (!event) return new Response("Événement introuvable", { status: 404 });

  const header = ["Statut", "Participant", "Téléphone", "Catégorie", "Code billet", "Agent", "Date et heure", "Source"];
  const lines = [header.join(";")];

  for (const c of event.checkIns) {
    lines.push(
      [
        STATUS_LABEL[c.status],
        csvEscape(c.ticket?.guestName ?? ""),
        csvEscape(c.ticket?.guestPhone ? toE164(c.ticket.guestPhone) : ""),
        csvEscape(c.ticket?.category?.name ?? ""),
        csvEscape(c.ticket?.code ?? ""),
        csvEscape(c.agent?.name ?? ""),
        c.scannedAt.toLocaleString("fr-FR", {
          dateStyle: "short",
          timeStyle: "medium",
        }),
        c.source,
      ].join(";")
    );
  }

  // BOM UTF-8 : indispensable pour que Excel affiche les accents.
  const csv = "\uFEFF" + lines.join("\r\n");
  const filename = `sigma-journal-${event.name.replace(/[^a-z0-9]+/gi, "-")}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
