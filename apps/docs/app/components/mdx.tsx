import { getMDXComponents, useMDXComponents } from '@mp-lb/tools-fumadocs-preset';

export { getMDXComponents, useMDXComponents };

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
