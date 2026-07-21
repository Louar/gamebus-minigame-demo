# GeoQuest minigame

## Game query parameters

The game can be configured with query parameters on the home page URL.

| Parameter | Type | Default | Description |
| --- | --- | --- | --- |
| `goal` | number | all countries in the selected regions | Number of countries that must be found correctly. The actual goal is capped at the number of countries available in the selected regions. |
| `regions` | string array | `World` | Regions to include in the game. Values are case-insensitive and can be supplied as repeated parameters or comma-separated values. Unknown regions are ignored. |
| `countdown` | number | `0` | Countdown duration in seconds. `0` means no countdown. When set, the top bar shows remaining time and the game ends automatically when time runs out. |
| `lives` | number | unlimited | Number of mistakes allowed before the game ends automatically. When set, the top bar shows mistakes as `{mistakes} / {lives}`. |
| `allowedSkips` | number | `0` | Number of times the user can skip the current country. Skipped countries are not found and may be asked again later. When set above `0`, the top bar shows skips remaining as `💡 {skipsLeft}`. |
| `showFlags` | boolean | `true` | Whether to show the target country's flag. |
| `showCountryNames` | boolean | `true` | Whether to show the target country's name. |
| `canRestart` | boolean | `true` | Whether the end user can restart the game with the restart buttons. |
| `doHover` | boolean | `false` | Whether to show country names when the user hovers over countries on the map. |

Boolean parameters accept `true`, `1`, or `yes` for true and `false`, `0`, or `no` for false.

Example:

```text
/?regions=europe,africa&goal=20&countdown=120&lives=3&allowedSkips=2&showFlags=false&showCountryNames=true&canRestart=false&doHover=true
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open

# or start the server on a specific port
npm run dev -- --port=5193
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
