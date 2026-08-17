import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, OrderStatus } from "@/app/generated/prisma/enums";
import AdminNav from "@/components/admin-nav";
import { formatFcfa, displayPhone } from "@/lib/format";
import { toggleUserActiveAction, updateCommissionAction } from "@/app/actions";

export const metadata = {
  title: "Organisateurs — Admin Sigma",
};

export default async function AdminOrganizersPage() {
  await requireUser(Role.SUPER_ADMIN);

  const organizers = await prisma.user.findMany({
    where: { role: Role.ORGANIZER },
    include: {
      organizedEvents: {
        include: {
          _count: { select: { tickets: true } },
          orders: { where: { status: OrderStatus.PAID }, select: { amount: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const rows = organizers.map((o) => {
    const revenue = o.organizedEvents.reduce((s, e) => s + e.orders.reduce((x, ord) => x + ord.amount, 0), 0);
    const tickets = o.organizedEvents.reduce((s, e) => s + e._count.tickets, 0);
    const commission = Math.round((revenue * o.commissionRate) / 100);
    return { user: o, revenue, tickets, commission };
  });

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <AdminNav active="/admin/organisateurs" />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Organisateurs</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {organizers.length} compte{organizers.length > 1 ? "s" : ""} · CA total :{" "}
            <b className="text-slate-700 dark:text-slate-200">{formatFcfa(totalRevenue)}</b> — bloquez un compte pour
            empêcher la connexion, ajustez la commission Sigma.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-400 dark:border-slate-800">
            Aucun organisateur inscrit pour le moment.
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map(({ user, revenue, tickets, commission }) => (
              <div
                key={user.id}
                className={`rounded-2xl border bg-white p-5 shadow-sm transition dark:bg-slate-900 ${
                  user.active ? "border-slate-200 dark:border-slate-800" : "border-red-200 bg-red-50/40 dark:border-red-900/60 dark:bg-red-950/20"
                }`}
              >
                <div className="flex flex-wrap items-center gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-extrabold text-white">
                    {user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-slate-900 dark:text-white">{user.name}</p>
                      {!user.active && (
                        <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                          Bloqué
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">
                      {user.phone ? displayPhone(user.phone) : user.email ?? "Compte social"} ·{" "}
                      {user.organizedEvents.length} événement
                      {user.organizedEvents.length > 1 ? "s" : ""} · {tickets} billet{tickets > 1 ? "s" : ""} · membre
                      depuis {user.createdAt.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-5 text-right">
                    <div>
                      <p className="text-sm font-extrabold text-slate-900 dark:text-white">{formatFcfa(revenue)}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">CA</p>
                    </div>
                    <div>
                      <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">{formatFcfa(commission)}</p>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Commission</p>
                    </div>
                  </div>

                  {/* Taux de commission */}
                  <form action={updateCommissionAction} className="flex shrink-0 items-center gap-2">
                    <input type="hidden" name="userId" value={user.id} />
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Taux
                      <input
                        type="number"
                        name="rate"
                        min={0}
                        max={100}
                        defaultValue={user.commissionRate}
                        className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm font-bold text-slate-800 outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                      %
                    </label>
                    <button
                      type="submit"
                      title="Enregistrer le taux"
                      className="rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-bold text-brand-600 transition hover:bg-brand-50 dark:border-brand-800 dark:text-brand-400 dark:hover:bg-brand-950"
                    >
                      OK
                    </button>
                  </form>

                  {/* Blocage / déblocage */}
                  <form action={toggleUserActiveAction.bind(null, user.id)}>
                    <button
                      type="submit"
                      className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition ${
                        user.active
                          ? "border border-red-200 bg-white text-red-600 hover:bg-red-50 dark:border-red-900 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950"
                          : "bg-emerald-600 text-white hover:bg-emerald-700"
                      }`}
                    >
                      {user.active ? "Bloquer" : "Débloquer"}
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
