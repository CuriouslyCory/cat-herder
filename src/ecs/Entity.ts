/** Entity is a simple numeric ID — no methods, no state. */
export type Entity = number & { readonly __brand: unique symbol };
