import { diagAction } from "@/app/actions";

// ⚠️ Page de DIAGNOSTIC TEMPORAIRE — à supprimer après l'audit.
export default function DiagActionPage() {
  return (
    <main style={{ padding: 24, fontFamily: "monospace" }}>
      <h1>Diag action DB</h1>
      <form action={diagAction}>
        <button type="submit">Lancer le diagnostic (action)</button>
      </form>
    </main>
  );
}
