import type { Store } from "../reactive.js";
import {
  createResource as createReactiveResource,
  type Resource,
  type ResourceFetcher,
  type ResourceOptions,
  type ResourceState,
  type ResourceStatus,
} from "../reactive.js";
import { engine } from "./bindings.js";

export type { Resource, ResourceFetcher, ResourceOptions, ResourceState, ResourceStatus };

export function resource<T>(
  fetcher: ResourceFetcher<T, void>,
  options?: ResourceOptions<T, void>
): Resource<T, void>;
export function resource<T, S>(
  source: Store<S> | (() => S),
  fetcher: ResourceFetcher<T, S>,
  options?: ResourceOptions<T, S>
): Resource<T, S>;
export function resource<T, S>(
  arg1: (Store<S> | (() => S)) | ResourceFetcher<T, void>,
  arg2?: ResourceFetcher<T, S> | ResourceOptions<T, void>,
  arg3?: ResourceOptions<T, S>
): Resource<T, S> {
  return (createReactiveResource as any)(engine, arg1, arg2, arg3);
}

export const createResource = resource;
