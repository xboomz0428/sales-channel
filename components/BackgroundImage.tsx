"use client";

import { useEffect, useState } from "react";

export default function BackgroundImage() {
  const [src, setSrc] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.15);

  const reload = () => {
    const img = localStorage.getItem("bg_image") ?? null;
    const op = parseFloat(localStorage.getItem("bg_opacity") ?? "0.15");
    setSrc(img);
    setOpacity(op);
    document.body.style.background = img ? "transparent" : "";
  };

  useEffect(() => {
    reload();
    window.addEventListener("bg-update", reload);
    return () => window.removeEventListener("bg-update", reload);
  }, []);

  if (!src) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
        backgroundImage: `url(${src})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        opacity,
      }}
    />
  );
}
