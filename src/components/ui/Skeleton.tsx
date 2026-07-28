"use client";

type SkeletonProps = {
  height?: number;
  width?: string;
};

export function Skeleton({ height = 16, width = "100%" }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{
        height: `${height}px`,
        width,
      }}
      aria-hidden="true"
    />
  );
}
