import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    rules: {
      // We intentionally render curated external and uploaded images directly.
      "@next/next/no-img-element": "off",
      // Hydration/bootstrap patterns in this app intentionally initialize state in effects.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "backup/**"],
  },
];

export default config;
