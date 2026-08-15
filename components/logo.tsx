import Image from "next/image";

type LogoProps = {
  /** Hauteur du logo en pixels (le ratio est préservé). */
  height?: number;
  /** Classes supplémentaires (ex : fond blanc sur bandeau coloré). */
  className?: string;
};

export default function Logo({ height = 36, className = "" }: LogoProps) {
  return (
    <Image
      src="/sigma-logo.png"
      alt="Sigma Security"
      width={677}
      height={369}
      priority
      className={`h-auto w-auto object-contain ${className}`}
      style={{ height }}
    />
  );
}
