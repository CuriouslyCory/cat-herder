// @ts-check
import { createRequire } from "module";
const require = createRequire(import.meta.url);

/** @type {import('eslint').Linter.FlatConfig[]} */
const nextCoreWebVitals = require("eslint-config-next/core-web-vitals");

/** @type {import('eslint').Linter.FlatConfig[]} */
const config = [
  ...nextCoreWebVitals,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "three",
              message:
                "Import 'three' only from src/game/engine/SceneManager.ts or src/game/engine/CameraController.ts",
            },
          ],
        },
      ],
    },
    ignores: [
      "src/game/engine/SceneManager.ts",
      "src/game/engine/CameraController.ts",
    ],
  },
];

export default config;
