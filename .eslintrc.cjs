module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended", "prettier"],
  settings: {
    react: {
      version: "detect",
    },
  },
  env: {
    es2021: true,
  },
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        caughtErrors: "all",
        caughtErrorsIgnorePattern: "^_",
        // View projections omit private fields through object rest destructuring.
        ignoreRestSiblings: true,
      },
    ],
  },
  overrides: [
    {
      files: ["packages/rules/**/*.ts", "packages/server/**/*.ts"],
      env: { node: true },
    },
    {
      files: ["packages/web/**/*.{ts,tsx}"],
      env: { browser: true },
      plugins: ["react", "react-hooks"],
      extends: [
        "plugin:react/recommended",
        // tsconfig uses react-jsx; React imports are unnecessary for JSX.
        "plugin:react/jsx-runtime",
        "plugin:react-hooks/recommended",
        "prettier",
      ],
      rules: {
        // TypeScript checks component props; runtime PropTypes are redundant.
        "react/prop-types": "off",
        "react-hooks/exhaustive-deps": "error",
      },
    },
    {
      files: ["packages/web/**/*.test.{ts,tsx}", "packages/web/*.config.ts"],
      env: { node: true },
    },
  ],
  ignorePatterns: ["dist", "node_modules", "coverage"],
};
