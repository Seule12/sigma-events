// Faux QR décoratif (maquettes produit des pages d'authentification).
// Motif fixe déterministe rendu en SVG — aucun encodage réel, usage purement visuel.
const PATTERN = [
  "1110011100110",
  "1001001010010",
  "1011011011100",
  "1110001000111",
  "0001011010010",
  "1110110001100",
  "1011000110010",
  "0011101010100",
  "1101001100010",
  "0100110110110",
  "1010001011100",
  "0010111001001",
  "1101100110101",
];

export default function FakeQr({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${PATTERN[0].length} ${PATTERN.length}`}
      className={className}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {PATTERN.map((row, y) =>
        row.split("").map((cell, x) =>
          cell === "1" ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={0.96} height={0.96} fill="currentColor" />
          ) : null
        )
      )}
    </svg>
  );
}
