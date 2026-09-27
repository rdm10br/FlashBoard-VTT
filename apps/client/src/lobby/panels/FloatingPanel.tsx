import { useState, useRef, useEffect } from "react";

type FloatingPanelProps = {
  title: string | null;
  onClose: () => void;
  children: React.ReactNode;
};

export function FloatingPanel({ title, onClose, children }: FloatingPanelProps) {
  const [pos, setPos] = useState({ x: 100, y: 100 });

  // useRef garante que o objeto persiste entre renders sem recriar referências.
  const drag = useRef({ active: false, startX: 0, startY: 0, sx: 0, sy: 0 });

  // Mantemos referências estáveis para os handlers para que removeEventListener funcione.
  const handleMouseMove = useRef((e: MouseEvent) => {
    if (!drag.current.active) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    setPos({ x: drag.current.sx + dx, y: drag.current.sy + dy });
  });

  const handleMouseUp = useRef(() => {
    drag.current.active = false;
    document.removeEventListener("mousemove", handleMouseMove.current);
    document.removeEventListener("mouseup", handleMouseUp.current);
  });

  // Cleanup de segurança: remove listeners se o painel desmontar durante um drag.
  useEffect(() => {
    const move = handleMouseMove.current;
    const up = handleMouseUp.current;
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
  }, []);

  function onMouseDown(e: React.MouseEvent) {
    drag.current.active = true;
    drag.current.startX = e.clientX;
    drag.current.startY = e.clientY;
    drag.current.sx = pos.x;
    drag.current.sy = pos.y;
    document.addEventListener("mousemove", handleMouseMove.current);
    document.addEventListener("mouseup", handleMouseUp.current);
  }

  return (
    <div style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 1000, width: 360, background: "#0f1720", border: "1px solid #2e303a", borderRadius: 8, padding: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "move" }} onMouseDown={onMouseDown}>
        <strong style={{ color: "#f3f4f6" }}>{title}</strong>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid transparent", color: "#9ca3af" }}>✕</button>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}