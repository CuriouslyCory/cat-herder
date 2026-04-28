/**
 * All components must carry a static `type` string tag so the World can
 * identify them without relying on `instanceof` or class names.
 *
 * Convention: declare components as plain objects that conform to this type.
 * Each component module also exports a `TYPE` constant for use in World queries.
 */
export interface Component {
  readonly type: string;
}

/** Helper: extract the type string from a component constructor-like object. */
export type ComponentType<T extends Component = Component> = string & { __phantom?: T };
