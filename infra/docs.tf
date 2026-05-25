locals {
  docs_domain                = var.docs_domain != "" ? var.docs_domain : "docs.${local.landing_page_domain}"
  docs_cloudflare_record_name = trimsuffix(local.docs_domain, ".${var.domain}")
}

resource "vercel_project" "docs" {
  name             = "${var.project_name}-docs"
  framework        = "vitepress"
  build_command    = "npm run build"
  output_directory = ".vitepress/dist"

  vercel_authentication = {
    deployment_type = "none"
  }
}

resource "vercel_project_domain" "docs" {
  project_id = vercel_project.docs.id
  domain     = local.docs_domain
}
