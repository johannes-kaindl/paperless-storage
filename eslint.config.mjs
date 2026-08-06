// Obsidian-Guideline-Gate (PROF-OBS-08): type-checked gegen ECHTE obsidian-Typen.
// Diese Konfiguration IST die lokale Vorschau auf den Store-Review — der Scanner der
// Community-Einreichung ist dasselbe Plugin. Deshalb: KEIN Inline-`// eslint-disable`;
// genuin unvermeidbare Ausnahmen nur als file-scoped Override, mit Begruendung.
// Muster uebernommen aus ../3d-codeblocks/eslint.config.mjs.
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
  { ignores: ["main.js", "node_modules/", "tests/", "src/vendor/"] },
  ...tseslint.configs.recommendedTypeChecked,
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
);
