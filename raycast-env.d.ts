/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `open-current-track` command */
  export type OpenCurrentTrack = ExtensionPreferences & {
  /** Apple Music Storefront Country - Two-letter Apple Music storefront country code used for search and open links. */
  "countryCode": string
}
}

declare namespace Arguments {
  /** Arguments passed to the `open-current-track` command */
  export type OpenCurrentTrack = {}
}

