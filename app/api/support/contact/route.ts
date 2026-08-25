import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/support/contact
 * Reçoit un formulaire de contact et le journalise.
 * En production : envoyer un email au support ou stocker en DB.
 * Pour l'instant : log serveur + confirmation au client.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, email, subject, message } = body;

    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
    }

    // Validation email basique
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Adresse email invalide" }, { status: 400 });
    }

    if (message.length < 10) {
      return NextResponse.json({ error: "Le message doit contenir au moins 10 caractères" }, { status: 400 });
    }

    // Journaliser le message (en prod, on enverrait un email ou on stockerait en DB)
    console.log(`[support:contact] Nouveau message de ${name} <${email}>`);
    console.log(`  Sujet : ${subject}`);
    console.log(`  Message : ${message.substring(0, 200)}`);

    // TODO: envoyer un email au support via Resend
    // TODO: stocker en DB pour le tableau de bord admin
    // await resend.emails.send({
    //   from: "Sigma Events <noreply@sigma-events.com>",
    //   to: "support@sigma-events.com",
    //   subject: `[Support] ${subject}`,
    //   html: `<p><strong>${name}</strong> (${email})</p><p>${message}</p>`,
    // });

    return NextResponse.json({ ok: true, message: "Message reçu. Nous vous répondrons rapidement." });
  } catch {
    return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
  }
}
