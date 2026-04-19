import { motion } from "framer-motion";
import { ReactNode } from "react";

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: string;
  onClick?: () => void;
}

export function GlowCard({
  children,
  className = "",
  glowColor = "rgba(6,182,212,0.08)",
  onClick,
}: GlowCardProps) {
  return (
    <motion.div
      className={`bg-white/[0.035] backdrop-blur-lg border border-white/[0.08] rounded-xl transition-shadow duration-300 ${className}`}
      whileHover={{
        boxShadow: `0 0 18px ${glowColor}`,
      }}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}
