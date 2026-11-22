// Just enough of Claude Code's plugin API types for the plugin's shared files
// (plugin/hooks/listing.ts and plugin/types) to type-check in the client.
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export type Shaped<T> = { shape: string; value: T }

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PluginState {}
