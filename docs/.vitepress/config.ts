import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Zapper",
  description: "A lightweight dev environment runner for local multi-service projects",
  cleanUrls: true,
  lastUpdated: true,
  // VitePress compiles every Markdown file under the docs/ source dir into a
  // published page. This folder also holds doctrine-synced working material
  // (standards/rules, value docs, drafts) that must NOT ship on the public
  // site, so exclude those directories and stray drafts here. Only the curated
  // product docs (index, commands, configuration, services, tasks,
  // project-metadata, instances, resource-management, global-registry,
  // env-var-mgmt, local-runtime, healthchecks, output, profiles, project-roots,
  // cli-development, macos-development) remain published.
  srcExclude: [
    // Internal/never-publish single pages
    "development.md",
    "releases.md",
    "orphaned-processes.md",
    "tech-debt.md",
    // Doctrine-synced working material — keep in repo, never publish
    "standards/**",
    "value/**",
    "extensions/**",
    "skills/**",
    "x-posts/**",
    "x-posts.md",
    // Drafts / studies
    "compose-study.md",
    "taskfile-study.md",
    "landing-page-v2-copy.md",
  ],
  themeConfig: {
    logoLink: {
      link: "https://zapper.mp-lb.dev",
      target: "_self",
    },
    nav: [
      { text: "Quick Start", link: "/" },
      { text: "Commands", link: "/commands" },
      { text: "Raw", link: "/llms-full.txt" },
    ],
    sidebar: [
      {
        text: "Using Zapper",
        items: [
          { text: "Quick Start", link: "/" },
          { text: "Commands", link: "/commands" },
          { text: "Configuration", link: "/configuration" },
          { text: "Services", link: "/services" },
          { text: "Tasks", link: "/tasks" },
          { text: "Project Metadata", link: "/project-metadata" },
          { text: "Instances", link: "/instances" },
          { text: "Resource Management", link: "/resource-management" },
          { text: "Global Registry Design", link: "/global-registry" },
          { text: "Environment Variables", link: "/env-var-mgmt" },
          { text: "Local Runtime", link: "/local-runtime" },
        ],
      },
    ],
    search: {
      provider: "local",
    },
    socialLinks: [
      {
        icon: "github",
        link: "https://github.com/mp-lb/zapper",
      },
    ],
  },
});
