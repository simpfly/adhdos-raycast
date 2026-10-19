/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** ADHDOS API 密钥 - 在 ADHDOS 设置 → MCP / API → API 获取，需要 Pro 和云同步。 */
  "apiKey": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `board` command */
  export type Board = ExtensionPreferences & {}
  /** Preferences accessible in the `add-board` command */
  export type AddBoard = ExtensionPreferences & {}
  /** Preferences accessible in the `braindump` command */
  export type Braindump = ExtensionPreferences & {}
  /** Preferences accessible in the `add-braindump` command */
  export type AddBraindump = ExtensionPreferences & {}
  /** Preferences accessible in the `capture` command */
  export type Capture = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `board` command */
  export type Board = {}
  /** Arguments passed to the `add-board` command */
  export type AddBoard = {}
  /** Arguments passed to the `braindump` command */
  export type Braindump = {}
  /** Arguments passed to the `add-braindump` command */
  export type AddBraindump = {}
  /** Arguments passed to the `capture` command */
  export type Capture = {
  /** 文本或链接（可留空读取剪贴板） */
  "text": string
}
}
