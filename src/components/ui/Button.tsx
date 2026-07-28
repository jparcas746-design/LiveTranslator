"use client";

import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
};

function getVariantClass(variant: ButtonVariant) {
  switch (variant) {
    case "secondary":
      return "btn-secondary";
    case "ghost":
      return "btn-ghost";
    case "danger":
      return "btn-danger";
    default:
      return "btn-primary";
  }
}

function getSizeClass(size: ButtonSize) {
  switch (size) {
    case "sm":
      return "btn-sm";
    case "lg":
      return "btn-lg";
    default:
      return "btn-md";
  }
}

export function Button({
  variant = "primary",
  size = "md",
  leftIcon,
  rightIcon,
  loading = false,
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      className={`btn ${getVariantClass(variant)} ${getSizeClass(size)} ${className}`.trim()}
      disabled={isDisabled}
      {...props}
    >
      {loading ? <Loader2 size={16} className="spin" aria-hidden="true" /> : leftIcon}
      <span>{children}</span>
      {rightIcon}
    </button>
  );
}
