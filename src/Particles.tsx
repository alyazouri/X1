import { useMemo } from "react";

export function Particles() {
  const particles = useMemo(() => {
    return Array.from({ length: 35 }, (_, i) => {
      const size = 2 + Math.random() * 4;
      const left = Math.random() * 100;
      const duration = 12 + Math.random() * 20;
      const delay = Math.random() * 15;
      const hue = Math.random() > 0.5 ? "rgba(255,122,0," : "rgba(255,60,0,";
      const opacity = 0.15 + Math.random() * 0.35;
      return (
        <div
          key={i}
          className="particle"
          style={{
            width: size,
            height: size,
            left: `${left}%`,
            background: `${hue}${opacity})`,
            boxShadow: `0 0 ${size * 3}px ${size}px ${hue}${opacity * 0.5})`,
            animationDuration: `${duration}s`,
            animationDelay: `${delay}s`,
          }}
        />
      );
    });
  }, []);

  return <div className="particles">{particles}</div>;
}
