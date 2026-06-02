import { docs } from 'collections/server';
import { createDocsSource } from '@mp-lb/tools-fumadocs-preset';
import { docsContentRoute, docsRoute } from './shared';

export const { source, getPageMarkdownUrl, getLLMText } = createDocsSource(
  docs.toFumadocsSource(),
  { docsRoute, docsContentRoute },
);
