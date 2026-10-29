# perAspera

RPG de stamina no navegador. Você é um cidadão de Robusto (2050): patrulha o mapa, segura a muralha à noite e reinveste o que a luta paga. O save fica no dispositivo.

Na tela o jogo se chama **Robusto**.

## Rodar

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`.

- `npm test` — Vitest
- `npm run build` — typecheck e build
- `npm run lint` — ESLint

React, TypeScript, Vite e Zustand. O combate vive em `src/domain/combat`: `simulateBattle` grava um log e a UI só reproduz.
