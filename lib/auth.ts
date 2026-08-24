import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/csv";
import bcrypt from "bcryptjs";
import { Role } from "@/app/generated/prisma/enums";


export const SESSION_COOKIE = "sigma_session";
const SESSION_DURATION_DAYS = 30;

function hashPin(pin: string): string {
  return bcrypt.hashSync(pin, 10);
}

export async function createSession(userId: string) {
  const token = crypto.randomUUID().replace(/-/g, "");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 86400_000);
  await prisma.session.create({ data: { token, userId, expiresAt } });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  // Compte bloqué par l'admin suprême → la session est détruite même si elle existe encore.
  if (session.user.active === false) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.user;
}

// Espace d'accueil par rôle : organisateur → /dashboard, agent → /scan, super admin → /admin.
function roleHome(role: Role): string {
  if (role === Role.SUPER_ADMIN) return "/admin";
  if (role === Role.AGENT) return "/scan";
  return "/dashboard";
}

export async function requireUser(role?: Role) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (role && user.role !== role) {
    redirect(roleHome(user.role));
  }
  return user;
}

export async function loginWithPhone(phone: string, pin: string) {
  const normalized = normalizePhone(phone);
  const user = await prisma.user.findUnique({ where: { phone: normalized } });
  // Compte introuvable, bloqué par l'admin suprême, ou compte social (sans PIN,
  // connexion uniquement via le fournisseur) → refus.
  if (!user || user.active === false || !user.pin) return null;
  if (!(await bcrypt.compare(pin, user.pin))) return null;
  await createSession(user.id);
  return user;
}

export async function logout() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { token } });
  store.delete(SESSION_COOKIE);
}

export { hashPin, roleHome };
